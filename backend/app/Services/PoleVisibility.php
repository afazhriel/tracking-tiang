<?php

namespace App\Services;

use App\Models\User;

class PoleVisibility
{
    /** Apply the same province/assignment boundary as PolePolicy::view to list queries. */
    public static function apply($query, User $user, string $table = 'poles'): void
    {
        if ($user->isAdmin() || $user->isSupervisor()) {
            return;
        }
        $provinceIds = $user->managedProvinceIds() ?? [];
        $poleIds = $user->assignedPoleIds();
        $query->where(function ($inner) use ($provinceIds, $poleIds, $table) {
            $inner->whereIn($table.'.province_id', $provinceIds)->orWhereIn($table.'.id', $poleIds);
        });
    }
}
