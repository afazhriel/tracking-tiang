<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Carbon\Carbon;

class CurveController extends Controller
{
    public function show(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        return $this->buildCurveResponse($project, null);
    }

    public function poleCurve(Project $project, Pole $pole): JsonResponse
    {
        $this->authorize('view', $project);

        // Ensure pole belongs to project
        abort_unless((int) $pole->project_id === (int) $project->id, 404);

        return $this->buildCurveResponse($project, $pole);
    }

    /**
     * Sumber item untuk kurva rencana.
     *
     * - Proyek : seluruh item template (`pole_id` NULL).
     * - Tiang  : item milik tiang itu; bila tidak ada yang punya bulan
     *            rencana, jatuh kembali ke template project.
     */
    private function planWorkItems(Project $project, ?Pole $pole = null)
    {
        if ($pole !== null) {
            $poleItems = $pole->workItems()
                ->whereNotNull('planned_start_month')
                ->whereNotNull('planned_end_month')
                ->orderBy('sequence')
                ->orderBy('id')
                ->get();

            if ($poleItems->isNotEmpty()) {
                return $poleItems;
            }
        }

        return $project->workItems()
            ->whereNull('pole_id')
            ->whereNotNull('planned_start_month')
            ->whereNotNull('planned_end_month')
            ->orderBy('sequence')
            ->orderBy('id')
            ->get();
    }

    private function buildCurveResponse(Project $project, ?Pole $pole = null): JsonResponse
    {
        /*
         * Rencana untuk kurva proyek memakai item TEMPLATE (`pole_id`
         * NULL) supaya rencana tidak berlipat sejumlah tiang. Rencana
         * untuk satu tiang memakai item milik tiang itu sendiri; bila
         * tiang belum punya item berbulan rencana, jatuh kembali ke
         * template project.
         */
        $workItems = $this->planWorkItems($project, $pole);

        /*
         * Penyebut yang sama dengan WorkItemController (target tiang,
         * fallback jumlah tiang terdaftar) supaya progres proyek di
         * Kurva S = penjumlahan kontribusi tiap item pekerjaan.
         *
         * Khusus SATU tiang penyebutnya 1: progress berbobot tiang sudah
         * bernilai 0-100, jadi tidak boleh dibagi jumlah tiang project.
         */
        $denominator = $project->progressDenominator();
        $scale = $pole !== null ? 1 : $denominator;

        /*
         * ==========================================
         * KURVA S RENCANA
         * B1-B9 = bulan ke-1 sampai ke-9 proyek
         * ==========================================
         */
        $monthly = array_fill(1, 9, 0);

        foreach ($workItems as $item) {
            $start = $item->planned_start_month;
            $end = $item->planned_end_month;

            if (!$start || !$end) {
                continue;
            }

            $duration = $end - $start + 1;
            $monthlyWeight = (float) $item->weight_percent / $duration;

            for ($month = $start; $month <= $end; $month++) {
                $monthly[$month] += $monthlyWeight;
            }
        }

        /*
         * Buat titik planned berdasarkan tanggal kalender.
         * Setiap titik mewakili akhir bulan proyek.
         */
        $planned = [];
        $cumulative = 0;

        $projectStart = Carbon::parse($project->start_date);

        foreach ($monthly as $month => $weight) {
            $cumulative += $weight;

            $date = $projectStart->copy()
                ->addMonths($month)
                ->subDay();

            if ($date->gt(Carbon::parse($project->end_date))) {
                $date = Carbon::parse($project->end_date);
            }

            $planned[] = [
                'month' => $month,
                'date' => $date->format('Y-m-d'),
                'monthly_percent' => round($weight, 2),
                'cumulative_percent' => round($cumulative, 2),
            ];
        }

        /*
         * ==========================================
         * HISTORI ACTUAL
         * ==========================================
         */
        $historiesQuery = PoleProgressHistory::with('workItem')
            ->whereHas('pole', function ($query) use ($project) {
                $query->where('project_id', $project->id);
            });

        // If pole is specified, filter histories to only this pole
        if ($pole !== null) {
            $historiesQuery->where('pole_id', $pole->id);
        }

        $histories = $historiesQuery
            ->orderBy('recorded_at')
            ->get();

        /*
         * State terakhir setiap:
         * tiang + item pekerjaan
         */
        $currentState = [];

        /*
         * Kelompokkan histori berdasarkan tanggal.
         */
        $historiesByDate = $histories->groupBy(function ($history) {
            return $history->recorded_at->format('Y-m-d');
        });

        $actual = [];

        foreach ($historiesByDate as $date => $dailyHistories) {
            foreach ($dailyHistories as $history) {
                $currentState[$history->pole_id][$history->work_item_id] = [
                    'progress_percent' => (float) $history->progress_percent,
                    'work_item_id' => $history->work_item_id,
                    'weight_percent' => (float) ($history->workItem->weight_percent ?? 0),
                ];
            }

            $totalPoleProgress = 0;

            foreach ($currentState as $poleProgress) {
                foreach ($poleProgress as $state) {
                    $totalPoleProgress += (
                        (float) $state['weight_percent']
                        * (float) $state['progress_percent']
                    ) / 100;
                }
            }

            $actual[] = [
                'date' => $date,
                'progress_percent' => $scale > 0
                    ? round($totalPoleProgress / $scale, 4)
                    : 0,
            ];
        }

        /*
         * ==========================================
         * PROGRESS TERKINI
         * ==========================================
         */
        if ($pole !== null) {
            // Single pole progress
            $pole->loadMissing('workProgress.workItem');

            $currentPercent = $pole->workProgress->sum(function ($item) {
                return (
                    (float) $item->workItem->weight_percent
                    * (float) $item->progress_percent
                ) / 100;
            });

            $currentPercent = $scale > 0
                ? round($currentPercent / $scale, 4)
                : 0;
        } else {
            // All poles progress (project level)
            $registeredPoles = $project->poles()->count();

            $totalPoleProgress = 0;

            foreach ($project->poles as $p) {
                $p->loadMissing('workProgress.workItem');

                $poleProgress = $p->workProgress->sum(function ($item) {
                    return (
                        (float) $item->workItem->weight_percent
                        * (float) $item->progress_percent
                    ) / 100;
                });

                $totalPoleProgress += $poleProgress;
            }

            $currentPercent = $scale > 0
                ? round($totalPoleProgress / $scale, 4)
                : 0;
        }

        $response = [
            'project' => [
                'id' => $project->id,
                'name' => $project->name,
                'code' => $project->code,
                'start_date' => $project->start_date,
                'end_date' => $project->end_date,
                'total_target_poles' => $project->total_target_poles,
                'progress_denominator' => $denominator,
            ],

            'planned_curve' => $planned,
            'actual_curve' => $actual,
            'actual_current_percent' => $currentPercent,
        ];

        if ($pole !== null) {
            $response['pole'] = [
                'id' => $pole->id,
                'pole_code' => $pole->pole_code,
                'address' => $pole->address,
                'progress' => $currentPercent,
            ];
            $response['registered_poles'] = 1;
        } else {
            $response['registered_poles'] = $project->poles()->count();
        }

        return response()->json($response);
    }
}
