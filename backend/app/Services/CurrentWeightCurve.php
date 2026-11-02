<?php

namespace App\Services;

use Illuminate\Support\Collection;

class CurrentWeightCurve
{
    /** Restate realization history on one explicit, current weight basis. */
    public function build(Collection $histories, array $weights, int $denominator): array
    {
        $state = [];
        $points = [];
        foreach ($histories->groupBy(fn ($row) => $row->recorded_at->format('Y-m-d')) as $date => $rows) {
            foreach ($rows as $row) {
                $key = $row->pole_id.':'.($row->workItem?->source_item_id ?? $row->work_item_id);
                $state[$key] = (float) $row->progress_percent;
            }
            $total = 0;
            foreach ($weights as $key => $weight) {
                $total += $weight * ($state[$key] ?? 0) / 100;
            }
            $points[] = ['date' => $date, 'progress_percent' => $denominator > 0 ? round($total / $denominator, 4) : 0];
        }

        return $points;
    }
}
