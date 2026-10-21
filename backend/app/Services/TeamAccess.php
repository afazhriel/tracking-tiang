<?php

namespace App\Services;

use App\Models\PoleAssignment;
use App\Models\ProjectUser;
use App\Models\Team;
use App\Models\User;

class TeamAccess
{
    /** Call inside a transaction with the team locked, as assignment writers do. */
    public function grantProjects(Team $team, User $user): void
    {
        $projects = $team->poleAssignments()
            ->join('poles', 'poles.id', '=', 'pole_assignments.pole_id')
            ->where('pole_assignments.status', PoleAssignment::STATUS_ACTIVE)
            ->when($team->status !== 'active', fn ($query) => $query->whereRaw('1 = 0'))
            ->pluck('poles.project_id');
        if ($team->project_id !== null) {
            $projects->push($team->project_id);
        }
        foreach ($projects->unique() as $projectId) {
            ProjectUser::firstOrCreate(['project_id' => $projectId, 'user_id' => $user->id], ['role' => $user->role]);
        }
    }
}
