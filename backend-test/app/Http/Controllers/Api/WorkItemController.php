<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PoleProgressHistory;
use App\Models\PoleWorkProgress;
use App\Models\Project;
use App\Models\WorkItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WorkItemController extends Controller
{
    /**
     * Daftar item pekerjaan project, dilengkapi progres aktual agregat.
     *
     * Progres aktual tiap item dihitung dari `pole_work_progress`
     * (rata-rata capaian seluruh tiang pada penyebut yang sama dengan
     * Kurva S), sehingga:
     *
     *   kontribusi item = bobot x actual_progress / 100
     *
     * dan penjumlahan kontribusi seluruh item sama dengan
     * `actual_current_percent` pada endpoint Kurva S. Frontend tidak
     * perlu menghitung ulang atau menembak puluhan endpoint progress.
     */
    public function index(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $workItems = $project->workItems()
            ->orderBy('sequence')
            ->get();

        $denominator = $project->progressDenominator();

        $aggregates = PoleWorkProgress::query()
            ->join('poles', 'poles.id', '=', 'pole_work_progress.pole_id')
            ->where('poles.project_id', $project->id)
            ->groupBy('pole_work_progress.work_item_id')
            ->select('pole_work_progress.work_item_id')
            ->selectRaw('SUM(pole_work_progress.progress_percent) as total_progress')
            ->selectRaw('COUNT(DISTINCT pole_work_progress.pole_id) as poles_with_progress')
            ->get()
            ->keyBy('work_item_id');

        $data = $workItems->map(function (WorkItem $item) use ($aggregates, $denominator) {
            $aggregate = $aggregates->get($item->id);

            $totalProgress = $aggregate ? (float) $aggregate->total_progress : 0.0;
            $polesWithProgress = $aggregate ? (int) $aggregate->poles_with_progress : 0;

            $actualProgress = $denominator > 0
                ? min(100, round($totalProgress / $denominator, 2))
                : 0.0;

            return array_merge($item->toArray(), [
                'actual_progress' => $actualProgress,
                'poles_with_progress' => $polesWithProgress,
                'weighted_contribution' => round(
                    ((float) $item->weight_percent * $actualProgress) / 100,
                    2
                ),
            ]);
        });

        return response()->json([
            'data' => $data,
            'meta' => [
                'total_weight' => round((float) $workItems->sum('weight_percent'), 2),
                'progress_denominator' => $denominator,
                'total_target_poles' => $project->total_target_poles,
            ],
        ]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $this->validated($request, $project);

        $this->assertWeightWithinBudget($project, (float) $validated['weight_percent']);

        $workItem = $project->workItems()->create($validated);

        return response()->json([
            'message' => 'Item pekerjaan berhasil dibuat.',
            'data' => $workItem,
        ], 201);
    }

    public function update(
        Request $request,
        Project $project,
        WorkItem $workItem
    ): JsonResponse {
        abort_unless((int) $workItem->project_id === (int) $project->id, 404);

        $this->authorize('update', $project);

        $validated = $this->validated($request, $project, $workItem);

        $this->assertWeightWithinBudget(
            $project,
            (float) $validated['weight_percent'],
            $workItem->id
        );

        $workItem->update($validated);

        return response()->json([
            'message' => 'Item pekerjaan berhasil diperbarui.',
            'data' => $workItem->fresh(),
        ]);
    }

    public function destroy(Project $project, WorkItem $workItem): JsonResponse
    {
        abort_unless((int) $workItem->project_id === (int) $project->id, 404);

        $this->authorize('delete', $project);

        $hasReferencedProgress = PoleWorkProgress::where('work_item_id', $workItem->id)->exists()
            || PoleProgressHistory::where('work_item_id', $workItem->id)->exists();

        if ($hasReferencedProgress) {
            return response()->json([
                'message' => 'Item pekerjaan tidak bisa dihapus karena sudah memiliki progres tercatat. Nonaktifkan item ini pada pengaturan supaya tersembunyi tanpa menghapus riwayat progres.',
                'errors' => [
                    'work_item' => ['Item sudah memiliki data progres. Hapus progres terkait terlebih dahulu atau nonaktifkan item.'],
                ],
            ], 409);
        }

        $workItem->delete();

        return response()->json([
            'message' => 'Item pekerjaan berhasil dihapus.',
        ]);
    }

    public function show(Project $project, WorkItem $workItem): JsonResponse
    {
        abort_unless((int) $workItem->project_id === (int) $project->id, 404);

        $this->authorize('view', $project);

        return response()->json([
            'data' => $workItem,
        ]);
    }

    /**
     * Pastikan penjumlahan bobot seluruh item tidak melebihi 100%.
     *
     * Validasi per-item (`min:0`, `max:100`) tidak cukup: total bobot
     * beberapa item bisa melampaui 100% sehingga progres berbobot dan
     * Kurva S kehilangan makna. Saat update, bobot item yang sedang
     * diedit dihitung ulang terhadap sisa item lainnya.
     */
    private function assertWeightWithinBudget(
        Project $project,
        float $weight,
        ?int $ignoreWorkItemId = null
    ): void {
        $otherTotal = (float) $project->workItems()
            ->when(
                $ignoreWorkItemId !== null,
                fn ($query) => $query->whereKeyNot($ignoreWorkItemId)
            )
            ->sum('weight_percent');

        if (($otherTotal + $weight) > 100.0001) {
            throw ValidationException::withMessages([
                'weight_percent' => [
                    'Total bobot seluruh item melebihi 100% (saat ini '.
                    round($otherTotal + $weight, 2).
                    '%). Kurangi bobot item lain terlebih dahulu.',
                ],
            ]);
        }
    }

    /**
     * Aturan validasi item pekerjaan.
     *
     * `name` wajib unik per project (bukan lintas project) supaya dua
     * project berbeda boleh memakai nama pekerjaan yang sama. Saat
     * update, item yang sedang diedit diabaikan dari pemeriksaan unik.
     */
    private function validated(
        Request $request,
        Project $project,
        ?WorkItem $workItem = null
    ): array {
        return $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('work_items', 'name')
                    ->where(fn ($query) => $query->where('project_id', $project->id))
                    ->ignore($workItem?->id),
            ],
            'weight_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'sequence' => ['nullable', 'integer', 'min:0'],
            'planned_duration_days' => ['nullable', 'integer', 'min:0'],
            'planned_start_month' => ['nullable', 'integer', 'min:1', 'max:60'],
            'planned_end_month' => ['nullable', 'integer', 'min:1', 'max:60'],
            'is_active' => ['nullable', 'boolean'],
        ]);
    }
}
