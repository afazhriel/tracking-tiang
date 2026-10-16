<?php

namespace App\Policies;

use App\Models\User;

/**
 * Otorisasi manajemen user.
 *
 * `create()` dipakai sebagai gerbang "boleh kelola user" — ini
 * konvensi Laravel, bukan soal secara harfiah membuat user (user baru
 * hanya dibuat lewat undangan). Dipakai juga untuk user, tim, dan
 * undangan karena ketiganya sama-sama hak admin.
 */
class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isAdmin();
    }

    public function create(User $user): bool
    {
        return $user->isAdmin();
    }

    public function update(User $user, User $target): bool
    {
        return $user->isAdmin();
    }

    public function delete(User $user, User $target): bool
    {
        return $user->isAdmin();
    }
}
