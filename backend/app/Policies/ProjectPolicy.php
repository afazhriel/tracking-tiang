<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;

/**
 * Otoritas tingkat project.
 *
 * `User::canAccessProject()` mengembalikan `null` untuk admin dan
 * supervisor, artinya "tanpa pembatasan". Nilai `null` itu diperlakukan
 * sebagai iya di sini supaya tidak perlu logika role berulang di
 * banyak tempat.
 */
class ProjectPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isActive();
    }

    public function view(User $user, Project $project): bool
    {
        return $user->canAccessProject((int) $project->id);
    }

    /**
     * Boleh membuat / mengubah / menghapus project? Hanya admin.
     */
    public function create(User $user): bool
    {
        return $user->isAdmin();
    }

    public function update(User $user, Project $project): bool
    {
        return $user->isAdmin();
    }

    public function delete(User $user, Project $project): bool
    {
        return $user->isAdmin();
    }
}
