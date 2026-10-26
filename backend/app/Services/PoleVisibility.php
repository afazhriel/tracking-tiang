<?php

namespace App\Services;

use App\Models\Project;
use App\Models\User;

class PoleVisibility
{
    /** Apply the same province/assignment boundary as PolePolicy::view to list queries. */
    public static function apply($query, User $user, string $table = 'poles'): void
    {
        // Admin platform memiliki akses global.
        if ($user->isAdmin()) {
            return;
        }

        // Semua pengguna selain Admin wajib dibatasi ke proyek
        // yang dimiliki atau diikuti. Null diperlakukan tanpa akses
        // agar aman meskipun implementasi User belum diperbarui.
        $projectIds = $user->accessibleProjectIds() ?? [];
        $query->whereIn($table.'.project_id', $projectIds);

        // Supervisor dapat melihat semua tiang DI DALAM proyek
        // yang diizinkan, bukan seluruh proyek di aplikasi.
        if ($user->isSupervisor()) {
            return;
        }

        // PIC tetap dibatasi berdasarkan provinsi atau penugasan.
        $provinceIds = $user->managedProvinceIds() ?? [];
        $poleIds = $user->assignedPoleIds();
        $query->where(function ($inner) use ($provinceIds, $poleIds, $table, $user) {
            $inner->whereIn($table.'.project_id', Project::where('owner_user_id', $user->id)->select('id'))->orWhereIn($table.'.province_id', $provinceIds)->orWhereIn($table.'.id', $poleIds);
        });
    }
}
