<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;

class ProjectPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isActive();
    }

    public function view(User $user, Project $project): bool
    {
        return $user->isActive()
            && $user->canAccessProject((int) $project->id);
    }

    public function create(User $user): bool
    {
        return $user->canAdminister();
    }

    public function update(User $user, Project $project): bool
    {
        return $user->isActive()
            && (
                $user->canAdminister()
                || (int) $project->owner_user_id === (int) $user->id
                   && $project->owner_user_id !== null
            );
    }

    // Penghapusan hanya untuk pengelola aktif; controller tetap menjaga riwayat.
    public function delete(User $user, Project $project): bool
    {
        return $user->isActive() && $user->canAdminister();
    }
}
