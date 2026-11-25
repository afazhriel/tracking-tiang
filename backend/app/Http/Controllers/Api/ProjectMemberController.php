<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectActivity;
use App\Models\ProjectUser;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProjectMemberController extends Controller
{
    public function __construct(private NotificationService $notifications, private ActivityLogger $activity) {}
    public function index(Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $members = DB::table('project_user as pu')
            ->join('users as u', 'u.id', '=', 'pu.user_id')
            ->where('pu.project_id', $project->id)
            ->orderBy('u.id')
            ->get([
                'u.id',
                'u.name',
                'u.email',
                'u.role',
                'u.status',
                'pu.role as project_role',
            ]);

        return response()->json([
            'data' => $members,
            'owner_user_id' => $project->owner_user_id,
        ]);
    }

    public function store(
        Request $request,
        Project $project
    ): JsonResponse {
        $this->authorize('update', $project);

        $data = $request->validate([
            'user_id' => [
                'required',
                'integer',
                'exists:users,id',
            ],
            'role' => [
                'nullable',
                'string',
                Rule::in(ProjectUser::roles()),
            ],
        ]);

        $member = User::findOrFail($data['user_id']);
        $role = $data['role'] ?? ProjectUser::ROLE_PELAKSANA;

        abort_unless(
            $member->isActive(),
            422,
            'Hanya pengguna aktif yang dapat ditambahkan.'
        );

        return DB::transaction(function () use ($project, $member, $role, $request) {
            $lockedProject = Project::query()
                ->whereKey($project->id)
                ->lockForUpdate()
                ->firstOrFail();

            // Periksa ulang otorisasi sesudah project dikunci.
            $this->authorize('update', $lockedProject);

            $exists = DB::table('project_user')
                ->where('project_id', $lockedProject->id)
                ->where('user_id', $member->id)
                ->exists();

            if (! $exists) {
                DB::table('project_user')->insertOrIgnore([
                    'project_id' => $lockedProject->id,
                    'user_id' => $member->id,
                    'role' => $role,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $this->notifications->send(
                    $member->id,
                    $lockedProject->id,
                    'sistem',
                    "Anda ditambahkan ke proyek {$lockedProject->name}",
                    'Anda kini menjadi anggota proyek ini sebagai '.ProjectUser::roleLabel($role).'.',
                    '/proyek',
                    ['project_id' => $lockedProject->id]
                );
                $this->notifications->sendToProjectMembers(
                    $lockedProject,
                    'sistem',
                    "Anggota baru di {$lockedProject->name}",
                    "{$member->name} ditambahkan sebagai ".ProjectUser::roleLabel($role).'.',
                    '/tim',
                    ['project_id' => $lockedProject->id, 'user_id' => $member->id],
                    $request->user()?->id,
                    null,
                    [(int) $member->id]
                );
                $this->activity->log(
                    $lockedProject,
                    $request->user(),
                    ProjectActivity::ACTION_ANGGOTA_TAMBAH,
                    "Anggota baru: {$member->name}",
                    "{$member->name} ditambahkan sebagai ".ProjectUser::roleLabel($role).'.',
                    'user',
                    $member->id,
                    ['user_id' => $member->id, 'role' => $role]
                );
            }

            return response()->json([
                'message' => $exists
                    ? 'Pengguna sudah menjadi anggota proyek.'
                    : 'Anggota proyek berhasil ditambahkan.',
                'data' => [
                    'project_id' => $lockedProject->id,
                    'user_id' => $member->id,
                    'role' => $role,
                ],
            ], $exists ? 200 : 201);
        }, 3);
    }

    /**
     * Ubah peran proyek seorang anggota (pengelola/pelaksana/pelihat).
     */
    public function update(
        Request $request,
        Project $project,
        User $user
    ): JsonResponse {
        $this->authorize('update', $project);

        $data = $request->validate([
            'role' => ['required', 'string', Rule::in(ProjectUser::roles())],
        ]);

        $membership = DB::table('project_user')
            ->where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->first();

        abort_unless($membership, 404, 'Anggota proyek tidak ditemukan.');

        DB::table('project_user')
            ->where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->update(['role' => $data['role'], 'updated_at' => now()]);

        $this->activity->log(
            $project,
            $request->user(),
            ProjectActivity::ACTION_ANGGOTA_PERAN,
            "Peran {$user->name} diubah",
            "Peran {$user->name} di proyek ini menjadi ".ProjectUser::roleLabel($data['role']).'.',
            'user',
            $user->id,
            ['user_id' => $user->id, 'role' => $data['role']]
        );

        return response()->json([
            'message' => 'Peran anggota proyek diperbarui.',
            'data' => [
                'project_id' => $project->id,
                'user_id' => $user->id,
                'role' => $data['role'],
            ],
        ]);
    }

    public function destroy(Project $project, User $user): JsonResponse
    {
        $this->authorize('update', $project);

        return DB::transaction(function () use ($project, $user) {
            $lockedProject = Project::query()
                ->whereKey($project->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->authorize('update', $lockedProject);

            abort_if(
                (int) $lockedProject->owner_user_id === (int) $user->id,
                422,
                'Pemilik proyek tidak dapat dikeluarkan dari proyeknya sendiri.'
            );

            abort_if(
                $user->canAdminister(),
                409,
                'Admin platform memiliki akses global; aksesnya tidak dapat dicabut melalui keanggotaan proyek.'
            );

            $memberQuery = DB::table('project_user')
                ->where('project_id', $lockedProject->id)
                ->where('user_id', $user->id);

            $membership = (clone $memberQuery)->lockForUpdate()->first();

            abort_unless($membership, 404, 'Anggota proyek tidak ditemukan.');

            // Penugasan langsung harus dibereskan sebelum akses dicabut.
            $directAssignment = DB::table('pole_assignments as pa')
                ->join('poles as p', 'p.id', '=', 'pa.pole_id')
                ->where('p.project_id', $lockedProject->id)
                ->where('pa.user_id', $user->id)
                ->where('pa.status', 'active')
                ->exists();

            abort_if(
                $directAssignment,
                409,
                'Cabut penugasan tiang aktif pengguna terlebih dahulu.'
            );

            $memberQuery->delete();

            $this->notifications->send(
                $user->id,
                $lockedProject->id,
                'sistem',
                "Akses Anda ke proyek {$lockedProject->name} dicabut",
                'Anda tidak lagi menjadi anggota proyek ini.',
                '/proyek',
                ['project_id' => $lockedProject->id]
            );
            $this->notifications->sendToProjectMembers(
                $lockedProject,
                'sistem',
                "Anggota keluar dari {$lockedProject->name}",
                "Akses {$user->name} ke proyek ini dicabut.",
                '/tim',
                ['project_id' => $lockedProject->id, 'user_id' => $user->id],
                request()->user()?->id
            );
            $this->activity->log(
                $lockedProject,
                request()->user(),
                ProjectActivity::ACTION_ANGGOTA_HAPUS,
                "Anggota keluar: {$user->name}",
                "Akses {$user->name} ke proyek ini dicabut.",
                'user',
                $user->id,
                ['user_id' => $user->id]
            );

            return response()->json([
                'message' => 'Akses langsung dicabut. Akses melalui tim aktif tetap berlaku.',
                'access_remaining' => $user->canAccessProject((int) $lockedProject->id),
                'data' => [
                    'project_id' => $lockedProject->id,
                    'user_id' => $user->id,
                ],
            ]);
        }, 3);
    }
}
