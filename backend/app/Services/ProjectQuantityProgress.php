<?php

namespace App\Services;

use App\Models\Project;
use Illuminate\Support\Facades\DB;

class ProjectQuantityProgress
{
    public static function scaled(mixed $value): int
    {
        $text = (string) $value;

        if (! preg_match(
            '/^(-?)(\d{1,10})(?:\.(\d{1,4}))?$/D',
            $text,
            $parts
        )) {
            throw new \InvalidArgumentException(
                'Format kuantitas tidak valid.'
            );
        }

        $whole = (int) $parts[2];
        $fraction = (int) str_pad($parts[3] ?? '', 4, '0');
        $value = ($whole * 10000) + $fraction;

        return $parts[1] === '-' ? -$value : $value;
    }

    public function state(Project $project): array
    {
        $target = self::scaled($project->target_quantity);

        if ($target <= 0) {
            throw new \DomainException(
                'Target kuantitas proyek harus lebih besar dari nol.'
            );
        }

        $entries = DB::table('project_quantity_entries')
            ->where('project_id', $project->id)
            ->orderBy('recorded_at')
            ->orderBy('id')
            ->get(['quantity_delta', 'recorded_at']);

        $balance = 0;
        $daily = [];

        foreach ($entries as $entry) {
            $balance += self::scaled($entry->quantity_delta);

            if ($balance < 0 || $balance > $target) {
                throw new \DomainException(
                    'Realisasi historis tidak boleh negatif atau melebihi target.'
                );
            }

            $date = substr((string) $entry->recorded_at, 0, 10);
            $daily[$date] = $balance;
        }

        $actual = [];

        foreach ($daily as $date => $quantity) {
            $actual[] = [
                'date' => $date,
                'progress_percent' => round(
                    $quantity / $target * 100,
                    4
                ),
            ];
        }

        return [
            'target_scaled' => $target,
            'balance_scaled' => $balance,
            'actual_current_quantity' => $balance / 10000,
            'actual_current_percent' => round(
                $balance / $target * 100,
                4
            ),
            'actual_curve' => $actual,
        ];
    }

    public function curve(Project $project): array
    {
        $state = $this->state($project);

        $plan = app(ProjectBaselineCurve::class)->planned($project);

        return [
            'project' => [
                'id' => $project->id,
                'name' => $project->name,
                'code' => $project->code,
                'start_date' => $project->start_date,
                'end_date' => $project->end_date,
                'target_quantity' => $project->target_quantity,
                'unit_code' => $project->unit_code,
                'progress_source' => $project->progress_source,
                'total_target_poles' => $project->total_target_poles,
                'progress_denominator' => $project->target_quantity,
            ],
            'planned_curve' => $plan['planned_curve'],
            'actual_curve' => $state['actual_curve'],
            'actual_current_quantity' => $state['actual_current_quantity'],
            'actual_current_percent' => $state['actual_current_percent'],
            'baseline_status' => $plan['status'],
            'baseline_version' => $plan['version'],
            'registered_poles' => $project->poles()->count(),
        ];
    }
}
