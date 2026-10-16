<?php

namespace App\Policies;

use App\Models\Pole;
use App\Models\User;

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
     * Admin: project mana pun.
     * Supervisor: project yang punya akses.
     * PIC: provinsi yang ditugaskan, atau tiang yang ditugaskan
     *      langsung/lewat timnya. Kalau tidak, ini jadi celah IDOR.
     */
    public function view(User $user, Pole $pole): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        if (! $user->canAccessProject((int) $pole->project_id)) {
            return false;
        }

        if ($user->isSupervisor()) {
            return true;
        }

        return $user->canManageProvince($pole->province_id)
            || $user->isPoleAssignedTo((int) $pole->id);
    }

    /**
     * Boleh mengubah data master tiang? Hanya admin.
     *
     * PIC dan supervisor hanya boleh menulis progress, bukan mengubah
     * master data.
     */
    public function update(User $user, Pole $pole): bool
    {
        return $user->isAdmin();
    }

    /**
     * Boleh menulis progress?
     *
     * Admin: selalu.
     * Selain admin: harus punya akses project DAN tiang berada di
     * provinsi yang ditugaskan (atau ditugaskan langsung/lewat tim).
     */
    public function updateProgress(User $user, Pole $pole): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        if (! $user->canAccessProject((int) $pole->project_id)) {
            return false;
        }

        return $user->canManageProvince($pole->province_id)
            || $user->isPoleAssignedTo((int) $pole->id);
    }
}
