<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectBaseline;
use Illuminate\Support\Facades\Schema;

class ProjectBaselineCurve
{
    public function planned(Project $project): array
    {
        if (! Schema::hasTable('project_baselines')) {
            return [
                'status' => 'not_available',
                'version' => null,
                'planned_curve' => [],
            ];
        }

        $baseline = ProjectBaseline::query()
            ->where('project_id', $project->id)
            ->where('status', 'approved')
            ->with('periods')
            ->first();

        if (! $baseline) {
            return [
                'status' => 'not_approved',
                'version' => null,
                'planned_curve' => [],
            ];
        }

        $target = (float) $baseline->target_quantity;

        if ($target <= 0) {
            throw new \LogicException('Target baseline tidak valid.');
        }

        $cumulative = 0.0;

        $planned = [[
            'month' => null,
            'date' => $baseline->start_date->format('Y-m-d'),
            'monthly_percent' => 0.0,
            'cumulative_percent' => 0.0,
        ]];

        foreach ($baseline->periods as $period) {
            $quantity = (float) $period->planned_quantity;
            $cumulative += $quantity;

            $planned[] = [
                'month' => (int) $period->period_number,
                'date' => $period->period_end->format('Y-m-d'),
                'monthly_percent' => round($quantity / $target * 100, 2),
                'cumulative_percent' => round($cumulative / $target * 100, 2),
            ];
        }

        return [
            'status' => 'approved',
            'version' => (int) $baseline->version,
            'baseline_id' => $baseline->id,
            'target_quantity' => $baseline->target_quantity,
            'unit_code' => $baseline->unit_code,
            'planned_curve' => $planned,
        ];
    }
}
