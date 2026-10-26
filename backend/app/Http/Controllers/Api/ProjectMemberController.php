<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectMemberController extends Controller
{
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
        ]);

        $member = User::findOrFail($data['user_id']);

        abort_unless(
            $member->isActive(),
            422,
            'Hanya pengguna aktif yang dapat ditambahkan.'
        );

        return DB::transaction(function () use ($project, $member) {
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
                    'role' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return response()->json([
                'message' => $exists
                    ? 'Pengguna sudah menjadi anggota proyek.'
                    : 'Anggota proyek berhasil ditambahkan.',
                'data' => [
                    'project_id' => $lockedProject->id,
                    'user_id' => $member->id,
                ],
            ], $exists ? 200 : 201);
        }, 3);
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
                $user->isAdmin(),
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
