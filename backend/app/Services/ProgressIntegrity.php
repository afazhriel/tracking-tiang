<?php

namespace App\Services;

use App\Models\Pole;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ProgressIntegrity
{
    public function assertUnambiguous(Project $project, ?Pole $pole = null, ?User $viewer = null): void
    {
        $duplicates = DB::table('pole_work_progress as progress')
            ->join('work_items as item', 'item.id', '=', 'progress.work_item_id')
            ->join('poles', 'poles.id', '=', 'progress.pole_id')
            ->where('poles.project_id', $project->id)
            ->when($pole, fn ($query) => $query->where('poles.id', $pole->id))
            ->when($viewer, function ($query) use ($viewer) {
                PoleVisibility::apply($query, $viewer);
            })
            ->selectRaw('1')
            ->groupByRaw('progress.pole_id, COALESCE(item.source_item_id, item.id)')
            ->havingRaw('COUNT(*) > 1')
            ->exists();

        abort_if($duplicates, 409, 'Ada progres lama dan salinan pekerjaan yang bertentangan. Total belum dapat dihitung sebelum rekonsiliasi; semua catatan dan foto tetap disimpan.');
    }
}
