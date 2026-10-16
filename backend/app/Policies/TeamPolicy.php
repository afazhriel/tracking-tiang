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
        if (!$user->isActive()) {
            return false;
        }

        if ($user->isAdmin() || $user->isSupervisor()) {
            return true;
        }

        if ($team->project_id === null) {
            return false;
        }

        return $user->canAccessProject((int) $team->project_id);
    }

    public function create(User $user): bool
    {
        return $user->isActive() && $user->isAdmin();
    }

    public function update(User $user, Team $team): bool
    {
        return $user->isActive() && $user->isAdmin();
    }

    public function manageMembers(User $user, Team $team): bool
    {
        return $user->isActive() && $user->isAdmin();
    }
}
