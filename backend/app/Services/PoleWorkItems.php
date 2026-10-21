<?php

namespace App\Services;

use App\Models\Pole;
use App\Models\Project;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class PoleWorkItems
{
    public function lock(Pole $pole): Pole
    {
        Project::whereKey($pole->project_id)->lockForUpdate()->firstOrFail();

        return Pole::whereKey($pole->id)->lockForUpdate()->firstOrFail();
    }

    public function visible(Pole $pole): Collection
    {
        $items = $pole->workItems()->orderBy('sequence')->orderBy('id')->get();

        return $items->isNotEmpty() || $pole->work_items_customized_at !== null ? $items : $pole->project->workItems()->whereNull('pole_id')->orderBy('sequence')->orderBy('id')->get();
    }

    /** Called only during explicit writes, inside a transaction with the pole locked. */
    public function materialize(Pole $pole): Collection
    {
        $items = $pole->workItems()->orderBy('sequence')->orderBy('id')->get();
        $inherit = $items->isEmpty() && $pole->work_items_customized_at === null;
        $templatesQuery = $pole->project->workItems()->whereNull('pole_id');
        if (! $inherit) {
            $legacyIds = collect();
            foreach (['pole_work_progress', 'pole_progress_histories', 'progress_photos'] as $table) {
                $legacyIds = $legacyIds->merge(DB::table($table)->join('work_items as template', 'template.id', '=', $table.'.work_item_id')
                    ->where($table.'.pole_id', $pole->id)->where('template.project_id', $pole->project_id)->whereNull('template.pole_id')->pluck('template.id'));
            }
            if ($legacyIds->isEmpty()) {
                return $items;
            }
            $templatesQuery->whereIn('id', $legacyIds->unique());
        }
        $templates = $templatesQuery->orderBy('sequence')->orderBy('id')->get();
        foreach ($templates as $template) {
            $copies = $items->where('source_item_id', $template->id);
            abort_if($copies->count() > 1, 409, 'Ada salinan pekerjaan ganda. Perlu rekonsiliasi sebelum perubahan.');
            $copy = $copies->first() ?? $pole->workItems()->create([
                ...$template->only(['project_id', 'name', 'weight_percent', 'sequence', 'planned_duration_days', 'is_active', 'planned_start_month', 'planned_end_month']),
                'source_item_id' => $template->id,
            ]);
            $legacyProgress = DB::table('pole_work_progress')->where('pole_id', $pole->id)->where('work_item_id', $template->id)->exists();
            abort_if($legacyProgress && DB::table('pole_work_progress')->where('pole_id', $pole->id)->where('work_item_id', $copy->id)->exists(), 409, 'Progres template dan salinan sama-sama ada. Data dipertahankan untuk rekonsiliasi.');
            DB::table('pole_progress_histories')->where('pole_id', $pole->id)->where('work_item_id', $template->id)->whereNull('weight_percent_snapshot')->update([
                'weight_percent_snapshot' => $template->weight_percent, 'is_active_snapshot' => $template->is_active,
            ]);
            foreach (['pole_work_progress', 'pole_progress_histories', 'progress_photos'] as $table) {
                DB::table($table)->where('pole_id', $pole->id)->where('work_item_id', $template->id)->update(['work_item_id' => $copy->id]);
            }
        }
        $pole->forceFill(['work_items_customized_at' => now()])->save();

        return $pole->workItems()->orderBy('sequence')->orderBy('id')->get();
    }

    public function preserveHistoryWeights(Collection $items): void
    {
        foreach ($items as $item) {
            DB::table('pole_progress_histories')->where('work_item_id', $item->id)
                ->whereNull('weight_percent_snapshot')->update([
                    'weight_percent_snapshot' => $item->weight_percent,
                    'is_active_snapshot' => $item->is_active,
                ]);
        }
    }

    public function normalize(Collection $items): void
    {
        $items = $items->values();
        $this->preserveHistoryWeights($items);
        if ($items->isEmpty()) {
            return;
        }
        $total = (float) $items->sum('weight_percent');
        $weights = $items->map(fn ($item) => round($total > 0 ? $item->weight_percent * 100 / $total : 100 / $items->count(), 2))->all();
        $weights[array_search(max($weights), $weights, true)] += round(100 - array_sum($weights), 2);
        foreach ($items->values() as $index => $item) {
            $item->update(['weight_percent' => max(0, $weights[$index])]);
        }
    }

    public function meta(Collection $items): array
    {
        $total = round((float) $items->sum('weight_percent'), 2);

        return ['total_weight' => $total, 'is_balanced' => abs($total - 100) < 0.01];
    }
}
