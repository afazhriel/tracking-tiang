<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
    /**
     * Pengelola hanya melihat user organisasinya sendiri; admin
     * platform melihat semuanya.
     */
    private function guardSameOrganization(Request $request, User $target): void
    {
        $actor = $request->user();

        if ($actor->isPlatformAdmin()) {
            return;
        }

        if ($actor->org_id === null || $target->org_id !== $actor->org_id) {
            abort(403, 'User ini berada di organisasi lain.');
        }
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'role' => ['nullable', Rule::in(User::roles())],
            'status' => ['nullable', Rule::in(User::statuses())],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $actor = $request->user();

        $users = User::query()
            ->with([
                'organization',
                'teams:id,name,code',
                'projectMemberships.project:id,name',
                'provinces:id,name',
            ])
            ->when(! $actor->isPlatformAdmin(), fn ($q) => $q->where('org_id', $actor->org_id))
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
        $this->guardSameOrganization($request, $user);

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
        $this->guardSameOrganization($request, $user);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'role' => ['sometimes', 'required', Rule::in(User::roles())],
        ]);

        $user = $this->persistAccountChange($user, $validated);

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
        $this->guardSameOrganization($request, $user);

        $validated = $request->validate([
            'status' => ['required', Rule::in(User::statuses())],
        ]);

        $previousStatus = $user->status;

        $user = $this->persistAccountChange($user, $validated);

        return response()->json([
            'message' => match ($validated['status']) {
                User::STATUS_SUSPENDED => 'Akun dinonaktifkan.',
                User::STATUS_PENDING => 'Akun menunggu persetujuan.',
                default => $previousStatus === User::STATUS_PENDING
                    ? 'Akun diaktifkan.'
                    : 'Akun diaktifkan kembali.',
            },
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
        $this->guardSameOrganization($request, $user);

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

    private function persistAccountChange(User $target, array $values): User
    {
        return DB::transaction(function () use ($target, $values) {
            // Lock the shared admin set in a stable order before counting. Locking
            // only the target allows two different admins to disable themselves.
            // Kunci dibatasi pada organisasi yang sama: admin organisasi A
            // tidak boleh mengunci admin organisasi B.
            User::where('role', User::ROLE_ADMIN)
                ->when($target->org_id === null,
                    fn ($q) => $q->whereNull('org_id'),
                    fn ($q) => $q->where('org_id', $target->org_id))
                ->orderBy('id')->lockForUpdate()->get(['id']);
            $user = User::whereKey($target->id)->lockForUpdate()->firstOrFail();
            $this->guardSingleAdmin($user, $values['role'] ?? null);
            $this->guardLastAdmin($user, $values['role'] ?? null, $values['status'] ?? null);
            $user->fill($values)->save();

            return $user;
        });
    }

    /**
     * Satu organisasi satu admin.
     *
     * Menaikkan user menjadi admin ditolak bila organisasinya sudah
     * punya admin aktif lain. Admin platform (org_id NULL) dijaga
     * terpisah dari admin organisasi mana pun.
     */
    private function guardSingleAdmin(User $target, ?string $newRole): void
    {
        if ($newRole !== User::ROLE_ADMIN || $target->isAdmin()) {
            return;
        }

        $existing = User::where('role', User::ROLE_ADMIN)
            ->where('status', User::STATUS_ACTIVE)
            ->where('id', '!=', $target->getKey())
            ->when($target->org_id === null,
                fn ($q) => $q->whereNull('org_id'),
                fn ($q) => $q->where('org_id', $target->org_id))
            ->count();

        if ($existing > 0) {
            throw ValidationException::withMessages([
                'role' => ['Organisasi ini sudah memiliki satu admin.'],
            ]);
        }
    }

    /**
     * Cegah admin terakhir mengunci dirinya sendiri keluar.
     *
     * Kalau tidak dijaga, satu klik "suspend" dari satu-satunya admin
     * membuat seluruh aplikasi tanpa admin yang bisa memulihkan.
     * Penjaga ini dibatasi per organisasi (atau global untuk admin
     * platform).
     */
    private function guardLastAdmin(User $target, ?string $newRole, ?string $newStatus = null): void
    {
        if (! $target->isAdmin()) {
            return;
        }

        $losesAdmin = ($newRole !== null && $newRole !== User::ROLE_ADMIN)
            || ($newStatus !== null && $newStatus !== User::STATUS_ACTIVE);

        if (! $losesAdmin) {
            return;
        }

        $otherAdmins = User::where('role', User::ROLE_ADMIN)
            ->where('status', User::STATUS_ACTIVE)
            ->where('id', '!=', $target->getKey())
            ->when($target->org_id === null,
                fn ($q) => $q->whereNull('org_id'),
                fn ($q) => $q->where('org_id', $target->org_id))
            ->count();

        if ($otherAdmins === 0) {
            $message = $target->org_id === null
                ? 'Tidak bisa: ini satu-satunya admin yang masih aktif.'
                : 'Tidak bisa: ini satu-satunya admin organisasi yang masih aktif.';

            throw ValidationException::withMessages([
                $newStatus !== null ? 'status' : 'role' => [$message],
            ]);
        }
    }
}
