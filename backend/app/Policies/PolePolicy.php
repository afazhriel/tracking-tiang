<?php

namespace App\Policies;

use App\Models\Pole;
use App\Models\ProjectUser;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * Otorisasi tingkat tiang.
 *
 * Ini lapisan yang menutup celah "ganti ID di URL". Route `show` dan
 * `ProgressController` menerima `{pole}` dari route model binding,
 * jadi tanpa policy di sini, PIC bisa membaca dan menulis progress
 * tiang siapa saja asal tahu ID-nya.
 *
 * Laravel menemukan policy ini otomatis lewat konvensi
 * `App\Policies\{Model}Policy` — tidak perlu didaftarkan manual.
 */
class PolePolicy
{
    /**
     * Boleh membuat tiang baru?
     *
     * Semua user aktif boleh mencoba; pembatasan wilayah dilakukan di
     * `PoleController@store` karena policy ini tidak menerima tiang
     * (dan karenanya tidak tahu provinsinya). Non-admin wajib mengisi
     * provinsi yang ditugaskan ke mereka.
     */
    public function create(User $user): bool
    {
        return $user->isActive();
    }

    public function viewAny(User $user): bool
    {
        return $user->isActive();
    }

    /**
     * Boleh melihat satu tiang?
     *
     * Admin/Supervisor aktif: project mana pun.
     * PIC: provinsi yang ditugaskan, atau tiang yang ditugaskan
     *      langsung/lewat timnya. Kalau tidak, ini jadi celah IDOR.
     */
    public function view(User $user, Pole $pole): bool
    {
        if ($user->canAdminister()) {
            return true;
        }

        if (! $user->canAccessProject((int) $pole->project_id)) {
            return false;
        }

        if ($user->isSupervisor() || (int) $pole->project->owner_user_id === (int) $user->id) {
            return true;
        }

        return $user->canManageProvince($pole->province_id)
            || $user->isPoleAssignedTo((int) $pole->id);
    }

    /**
     * Data master tiang dikelola Admin dan Supervisor aktif.
     */
    public function update(User $user, Pole $pole): bool
    {
        return $user->canAdminister();
    }

    /**
     * Boleh menulis progress?
     *
     * Admin/Supervisor/pemilik proyek: selalu.
     * PIC: hanya di lokasi yang ditugaskan ke dia (langsung atau
     * lewat timnya). Akses wilayah saja tidak cukup untuk mencatat
     * — wilayah hanya mengatur apa yang bisa dilihat/dibuat.
     * Anggota dengan peran Pelihat tidak bisa mencatat, sekalipun
     * lokasi itu ditugaskan ke dia.
     */
    public function updateProgress(User $user, Pole $pole): bool|Response
    {
        if ($user->canAdminister()) {
            return true;
        }

        if ((int) $pole->project->owner_user_id === (int) $user->id
            && $pole->project->owner_user_id !== null) {
            return true;
        }

        if (! $user->canAccessProject((int) $pole->project_id)) {
            return Response::deny('Anda bukan anggota proyek ini.');
        }

        if ($user->projectRole((int) $pole->project_id) === ProjectUser::ROLE_PELIHAT) {
            return Response::deny('Peran Anda di proyek ini hanya melihat, tidak bisa mencatat progres.');
        }

        if (! $user->isPoleAssignedTo((int) $pole->id)) {
            return Response::deny('Lokasi ini belum ditugaskan ke Anda. Minta supervisor menugaskan lokasi ini ke Anda.');
        }

        return true;
    }
}
