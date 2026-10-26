<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class TeamAccess
{
    /** Derived grants are queried, never copied into direct project_user membership. */
    public function projectIds(User $user): Collection
    {
        $teams = DB::table('teams as t')
            ->join('team_members as tm', 'tm.team_id', '=', 't.id')
            ->where('tm.user_id', $user->id)
            ->where('t.status', 'active');

        $scoped = (clone $teams)->whereNotNull('t.project_id')->pluck('t.project_id');
        $assigned = (clone $teams)
            ->join('pole_assignments as pa', 'pa.team_id', '=', 't.id')
            ->join('poles as p', 'p.id', '=', 'pa.pole_id')
            ->where('pa.status', 'active')
            ->where(function ($query) {
                $query->whereNull('t.project_id')->orWhereColumn('t.project_id', 'p.project_id');
            })
            ->pluck('p.project_id');

        return $scoped->merge($assigned)->unique()->values();
    }
}
