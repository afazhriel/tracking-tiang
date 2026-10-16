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
     * Boleh membuat tiang baru? Hanya admin.
     */
    public function create(User $user): bool
    {
        return $user->isAdmin();
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
     * PIC: HANYA tiang yang ditugaskan — langsung ke dia atau lewat
     *      timnya. Kalau tidak, ini jadi celah IDOR.
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

        return $user->isPoleAssignedTo((int) $pole->id);
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
     * Sama dengan `view`: PIC hanya untuk tiang yang ditugaskan.
     */
    public function updateProgress(User $user, Pole $pole): bool
    {
        return $this->view($user, $pole);
    }
}
