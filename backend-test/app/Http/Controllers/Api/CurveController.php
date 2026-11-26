<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PoleProgressHistory;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Carbon\Carbon;

class CurveController extends Controller
{
    public function show(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $workItems = $project->workItems()
            ->orderBy('sequence')
            ->get();

        /*
         * Penyebut yang sama dengan WorkItemController (target tiang,
         * fallback jumlah tiang terdaftar) supaya progres proyek di
         * Kurva S = penjumlahan kontribusi tiap item pekerjaan.
         */
        $denominator = $project->progressDenominator();

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
        $histories = PoleProgressHistory::with('workItem')
            ->whereHas('pole', function ($query) use ($project) {
                $query->where('project_id', $project->id);
            })
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
                ];
            }

            /*
             * Hitung progress global terhadap target seluruh proyek.
             *
             * Tiang yang belum mempunyai progress otomatis
             * bernilai 0%. Jadi denominator selalu target
             * jumlah tiang proyek, bukan jumlah tiang yang
             * sudah mempunyai history.
             */
            $totalPoleProgress = 0;

            foreach ($currentState as $poleProgress) {
                foreach ($poleProgress as $state) {
                    $workItem = $workItems->firstWhere(
                        'id',
                        $state['work_item_id']
                    );

                    if (!$workItem) {
                        continue;
                    }

                    $totalPoleProgress += (
                        (float) $workItem->weight_percent
                        * $state['progress_percent']
                    ) / 100;
                }
            }

            $actual[] = [
                'date' => $date,
                'progress_percent' => $denominator > 0
                    ? round($totalPoleProgress / $denominator, 4)
                    : 0,
            ];
        }

        /*
         * ==========================================
         * PROGRESS GLOBAL TERKINI
         *
         * Progress seluruh tiang dibagi terhadap
         * target jumlah tiang proyek.
         *
         * Tiang yang belum mempunyai progress
         * otomatis bernilai 0%.
         * ==========================================
         */
        $registeredPoles = $project->poles()->count();

        $totalPoleProgress = 0;

        foreach ($project->poles as $pole) {
            $pole->loadMissing('workProgress.workItem');

            $poleProgress = $pole->workProgress->sum(function ($item) {
                return (
                    (float) $item->workItem->weight_percent
                    * (float) $item->progress_percent
                ) / 100;
            });

            $totalPoleProgress += $poleProgress;
        }

        $currentPercent = $denominator > 0
            ? round($totalPoleProgress / $denominator, 4)
            : 0;

        return response()->json([
            'project' => [
                'id' => $project->id,
                'name' => $project->name,
                'code' => $project->code,
                'start_date' => $project->start_date,
                'end_date' => $project->end_date,
                'total_target_poles' => $project->total_target_poles,
                'progress_denominator' => $denominator,
            ],

            'registered_poles' => $registeredPoles,

            'planned_curve' => $planned,

            'actual_curve' => $actual,

            'actual_current_percent' => $currentPercent,
        ]);
    }
}
