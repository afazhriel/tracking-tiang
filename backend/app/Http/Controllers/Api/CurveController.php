<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\Project;
use App\Services\CurrentWeightCurve;
use App\Services\PoleWorkItems;
use App\Services\ProgressIntegrity;
use App\Services\ProjectBaselineCurve;
use App\Services\ProjectQuantityProgress;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;

class CurveController extends Controller
{
    public function show(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        return $this->buildCurveResponse($project, null);
    }

    public function poleCurve(Project $project, Pole $pole): JsonResponse
    {
        abort_unless((int) $pole->project_id === (int) $project->id, 404);
        $this->authorize('view', $pole);

        return $this->buildCurveResponse($project, $pole);
    }

    /**
     * Sumber item untuk kurva rencana.
     *
     * - Proyek : seluruh item template (`pole_id` NULL).
     * - Tiang: item yang terlihat pada tiang, termasuk template warisan.
     *   Tiang dengan konfigurasi sendiri tidak memakai jadwal template pengganti.
     */
    private function planWorkItems(Project $project, ?Pole $pole = null)
    {
        $items = $pole !== null
            ? app(PoleWorkItems::class)->visible($pole)
            : $project->workItems()->whereNull('pole_id')->orderBy('sequence')->orderBy('id')->get();

        return $items->where('is_active', true)->values();
    }

    private function buildCurveResponse(Project $project, ?Pole $pole = null): JsonResponse
    {
        if (
            $pole === null
            && $project->progress_source === 'quantity_entries'
        ) {
            return response()->json(
                app(ProjectQuantityProgress::class)
                    ->curve($project)
            );
        }

        app(ProgressIntegrity::class)->assertUnambiguous($project, $pole);

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
         * B1..Bn = bulan ke-1 sampai bulan rencana terakhir
         * ==========================================
         *
         * Panjang array mengikuti bulan rencana terjauh pada item
         * (tanpa memaksakan minimum bulan), supaya item dengan planned_end_month > 9
         * tidak memicu "Undefined array key".
         */
        $invalidSchedule = $workItems->contains(fn ($item) => ! $item->planned_start_month
            || ! $item->planned_end_month || $item->planned_start_month < 1
            || $item->planned_end_month < $item->planned_start_month || $item->planned_end_month > 60);
        $maxMonth = 0;

        foreach ($workItems as $item) {
            if (! $item->planned_start_month || ! $item->planned_end_month || $item->planned_end_month > 60) {
                continue;
            }

            $end = (int) $item->planned_end_month;

            if ($end > $maxMonth) {
                $maxMonth = $end;
            }
        }

        $monthly = $maxMonth > 0 ? array_fill(1, $maxMonth, 0) : [];

        foreach ($workItems as $item) {
            $start = $item->planned_start_month;
            $end = $item->planned_end_month;

            if (! $start || ! $end || $start < 1 || $end < $start || $end > 60) {
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

        /*
         * Titik awal kurva: rencana kumulatif 0% pada tanggal mulai
         * proyek. Tanpa ini, garis rencana baru muncul di akhir bulan
         * pertama sehingga rencana & variance periode awal kosong.
         * `month` null agar tidak menambah hitungan jumlah bulan.
         */
        $planned[] = [
            'month' => null,
            'date' => $projectStart->format('Y-m-d'),
            'monthly_percent' => 0.0,
            'cumulative_percent' => 0.0,
        ];

        foreach ($monthly as $month => $weight) {
            $cumulative += $weight;

            $date = $projectStart->copy()
                ->addMonthsNoOverflow($month)
                ->subDay();

            if ($date->gt(Carbon::parse($project->end_date))) {
                $date = Carbon::parse($project->end_date);
            }

            if ($date->format('Y-m-d') <= $planned[array_key_last($planned)]['date']) {
                continue;
            }

            $planned[] = [
                'month' => $month,
                'date' => $date->format('Y-m-d'),
                'monthly_percent' => round($weight, 2),
                'cumulative_percent' => round($cumulative, 2),
            ];
        }

        $planIssues = [];
        if ($invalidSchedule) {
            $planIssues[] = 'incomplete_or_invalid_work_schedule';
            $planned = [];
        }
        if (! $project->start_date || ! $project->end_date || $project->end_date < $project->start_date) {
            $planIssues[] = 'missing_or_invalid_project_dates';
            $planned = [];
        } elseif ($maxMonth && $projectStart->copy()->addMonthsNoOverflow($maxMonth)->subDay()->gt(Carbon::parse($project->end_date))) {
            // Do not silently compress a multi-month schedule into a shorter project.
            $planIssues[] = 'work_schedule_exceeds_project_end';
            $planned = [];
        }
        if ($workItems->isEmpty()) {
            $planned = [];
        }

        // Rencana proyek hanya berasal dari baseline yang disahkan.
        // Rencana per tiang tetap menggunakan perhitungan sebelumnya.
        $baselinePlan = null;

        if ($pole === null) {
            $baselinePlan = app(ProjectBaselineCurve::class)
                ->planned($project);

            $planned = $baselinePlan['planned_curve'];
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
            ->orderBy('recorded_at')->orderBy('id')
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
                $currentState[$history->pole_id][$history->workItem?->source_item_id ?? $history->work_item_id] = [
                    'progress_percent' => (float) $history->progress_percent,
                    'work_item_id' => $history->work_item_id,
                    'weight_percent' => $history->weight_percent_snapshot,
                    'is_active' => $history->is_active_snapshot,
                ];
            }

            $totalPoleProgress = 0;
            $unknown = false;

            foreach ($currentState as $poleProgress) {
                foreach ($poleProgress as $state) {
                    if ($state['weight_percent'] === null || $state['is_active'] === null) {
                        $unknown = true;
                    }
                    if ($state['is_active'] === false) {
                        continue;
                    }
                    $totalPoleProgress += (
                        (float) $state['weight_percent']
                        * (float) $state['progress_percent']
                    ) / 100;
                }
            }

            $actual[] = [
                'date' => $date,
                'progress_percent' => $unknown ? null : ($scale > 0
                    ? round($totalPoleProgress / $scale, 4)
                    : 0),
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

            $currentPercent = $pole->workProgress->filter(fn ($item) => (bool) $item->workItem?->is_active)->sum(function ($item) {
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
            $totalPoleProgress = 0;

            $project->load('poles.workProgress.workItem');

            foreach ($project->poles as $p) {
                $p->loadMissing('workProgress.workItem');

                $poleProgress = $p->workProgress->filter(fn ($item) => (bool) $item->workItem?->is_active)->sum(function ($item) {
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

        $weights = [];
        $scopeWeights = [];
        $scopePoles = $pole !== null ? collect([$pole]) : $project->poles;
        foreach ($scopePoles as $scopePole) {
            $scopePole->loadMissing('workProgress.workItem');
            $progressItems = $scopePole->workProgress->keyBy(fn ($row) => $row->workItem?->source_item_id ?? $row->work_item_id);
            $canonical = app(PoleWorkItems::class)->visible($scopePole)
                ->groupBy(fn ($item) => $item->source_item_id ?? $item->id)
                ->map(function ($group, $key) use ($scopePole, $progressItems) {
                    $copies = $group->where('pole_id', $scopePole->id);
                    abort_if($copies->count() > 1, 409, 'Salinan pekerjaan ganda memerlukan rekonsiliasi.');

                    return $progressItems->get($key)?->workItem ?? $copies->first() ?? $group->first();
                })->filter(fn ($item) => $item->is_active);
            $scopeWeights[] = ['pole_id' => $scopePole->id, 'total_weight' => round((float) $canonical->sum('weight_percent'), 2)];
            foreach ($canonical as $key => $item) {
                $weights[$scopePole->id.':'.$key] = (float) $item->weight_percent;
            }
        }
        $restated = app(CurrentWeightCurve::class)->build($histories, $weights, $scale);
        $last = count($restated) ? $restated[array_key_last($restated)]['progress_percent'] : 0;

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
            'actual_curve' => $restated,
            'calculation_basis' => 'current_active_weights',
            'legacy_snapshot_curve' => $actual,
            'legacy_snapshot_curve_status' => 'unversioned_mixed_weights_not_comparable',
            'data_quality' => [
                'scope_weights' => $scopeWeights,
                'missing_weight_snapshots' => $histories->whereNull('weight_percent_snapshot')->count(),
                'records_before_project_start' => $project->start_date ? $histories->filter(fn ($row) => $row->recorded_at->lt(Carbon::parse($project->start_date)))->count() : 0,
                'current_matches_latest_history' => abs($last - $currentPercent) < 0.0001,
                'plan_issues' => $pole !== null ? $planIssues : [],
            ],
            'actual_current_percent' => $currentPercent,
        ];

        if ($baselinePlan !== null) {
            $response['baseline_status'] = $baselinePlan['status'];
            $response['baseline_version'] = $baselinePlan['version'];
        }

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
