<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Manajemen user — seluruhnya hanya untuk admin.
 *
 * TIDAK ada `POST /api/users`. Membuat user hanya lewat
 * `POST /api/invitations`, jadi tidak ada jalur yang bisa membuat
 * akun tanpa password yang dibuat sendiri oleh pemiliknya.
 */
class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'role' => ['nullable', Rule::in(User::roles())],
            'status' => ['nullable', Rule::in(User::statuses())],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $users = User::query()
            ->with([
                'teams:id,name,code',
                'projectMemberships.project:id,name',
                'provinces:id,name',
            ])
            ->when($validated['role'] ?? null, fn ($q, $role) => $q->where('role', $role))
            ->when($validated['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($validated['search'] ?? null, fn ($q, $search) => $q
                ->where(fn ($inner) => $inner
                    ->where('name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%")
                )
            )
            ->orderBy('name')
            ->limit(200)
            ->get();

        return response()->json([
            'data' => $users->map(fn (User $user) => [
                ...$user->toAuthPayload(),
                'teams' => $user->teams->map(fn ($team) => [
                    'id' => $team->id,
                    'name' => $team->name,
                    'code' => $team->code,
                ]),
                'projects' => $user->projectMemberships->map(fn ($membership) => [
                    'id' => $membership->project?->id,
                    'name' => $membership->project?->name,
                ]),
            ]),
        ]);
    }

    public function show(Request $request, User $user): JsonResponse
    {
        $this->authorize('create', User::class);

        return response()->json([
            'data' => [
                ...$user->toAuthPayload(),
                'teams' => $user->teams()->get(['teams.id', 'teams.name', 'teams.code']),
                'projects' => $user->projects()->get(['projects.id', 'projects.name', 'projects.code']),
            ],
        ]);
    }

    /**
     * Ubah nama dan role.
     *
     * Email TIDAK bisa diubah lewat endpoint ini. Mengganti email
     * berarti membongkar ownership akun tanpa verifikasi, dan itu
     * jalur standar untuk mengambil alih akun orang.
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'role' => ['sometimes', 'required', Rule::in(User::roles())],
        ]);

        $this->guardLastAdmin($user, $validated['role'] ?? null);

        $user->fill($validated)->save();

        return response()->json([
            'message' => 'User berhasil diperbarui.',
            'data' => $user->fresh()->toAuthPayload(),
        ]);
    }

    /**
     * Suspend / aktifkan akun.
     *
     * Password tidak pernah disentuh — suspend-ITu bukan delete, dan
     * user harus bisa login lagi persis seperti sebelumnya kalau
     * diaktifkan kembali.
     */
    public function updateStatus(Request $request, User $user): JsonResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'status' => ['required', Rule::in(User::statuses())],
        ]);

        $this->guardLastAdmin($user, null, $validated['status']);

        $user->forceFill(['status' => $validated['status']])->save();

        return response()->json([
            'message' => $validated['status'] === User::STATUS_SUSPENDED
                ? 'Akun dinonaktifkan.'
                : 'Akun diaktifkan kembali.',
            'data' => $user->fresh()->toAuthPayload(),
        ]);
    }

    /**
     * Tetapkan provinsi yang boleh dikelola user.
     *
     * Admin tidak perlu penugasan (bisa semua provinsi); endpoint ini
     * dipakai untuk PIC/supervisor. `sync` mengganti seluruh daftar,
     * jadi mengirim `[]` mencabut semua penugasan.
     */
    public function updateProvinces(Request $request, User $user): JsonResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'province_ids' => ['present', 'array'],
            'province_ids.*' => ['string', 'exists:provinces,id'],
        ]);

        $user->provinces()->sync($validated['province_ids']);

        return response()->json([
            'message' => 'Wilayah user berhasil diperbarui.',
            'data' => $user->fresh(['provinces'])->toAuthPayload(),
        ]);
    }

    /**
     * Cegah admin terakhir mengunci dirinya sendiri keluar.
     *
     * Kalau tidak dijaga, satu klik "suspend" dari satu-satunya admin
     * membuat seluruh aplikasi tanpa admin yang bisa memulihkan.
     */
    private function guardLastAdmin(User $target, ?string $newRole, ?string $newStatus = null): void
    {
        if (! $target->isAdmin()) {
            return;
        }

        $losesAdmin = ($newRole !== null && $newRole !== User::ROLE_ADMIN)
            || ($newStatus === User::STATUS_SUSPENDED);

        if (! $losesAdmin) {
            return;
        }

        $otherAdmins = User::where('role', User::ROLE_ADMIN)
            ->where('status', User::STATUS_ACTIVE)
            ->where('id', '!=', $target->getKey())
            ->count();

        if ($otherAdmins === 0) {
            throw ValidationException::withMessages([
                'role' => ['Tidak bisa: ini satu-satunya admin yang masih aktif.'],
            ]);
        }
    }
}
