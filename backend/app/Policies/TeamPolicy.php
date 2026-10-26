<?php

namespace App\Policies;

use App\Models\Team;
use App\Models\User;

class TeamPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isActive();
    }

    public function view(User $user, Team $team): bool
    {
        if (! $user->isActive()) {
            return false;
        }

        // Hanya Admin platform yang memiliki akses tim global.
        // Supervisor dan PIC harus memiliki akses ke proyek tim.
        if ($user->isAdmin()) {
            return true;
        }

        if ($team->project_id === null) {
            return false;
        }

        return $user->canAccessProject((int) $team->project_id);
    }

    public function create(User $user): bool
    {
        return $user->isActive();
    }

    public function update(User $user, Team $team): bool
    {
        return $user->isActive() && ($user->isAdmin()
            || ($team->project_id !== null && $user->can('update', $team->project)));
    }

    public function manageMembers(User $user, Team $team): bool
    {
        return $this->update($user, $team);
    }
}
