<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\PoleWorkProgress;
use App\Models\Project;
use App\Models\WorkItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Item pekerjaan.
 *
 * Dua jenis item:
 * - Template project (`pole_id` NULL): katalog default, sumber Kurva S
 *   rencana, dikelola di halaman Pengaturan Pekerjaan.
 * - Item tiang (`pole_id` terisi): salinan milik satu tiang, tempat
 *   progres dicatat. Boleh berbeda antar tiang.
 *
 * Bobot selalu dinormalisasi agar total 100% per kelompok: seluruh
 * template project, dan seluruh item pada masing-masing tiang.
 */
class WorkItemController extends Controller
{
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $scope = (string) $request->query('scope', 'project');

        if ($scope === 'aggregate') {
            return $this->aggregate($project);
        }

        if ($scope === 'pole') {
            $pole = $this->poleFromRequest($request, $project);

            $this->authorize('view', $pole);

            $items = $pole->workItems()->orderBy('sequence')->orderBy('id')->get();

            return response()->json([
                'data' => $items,
                'meta' => $this->weightMeta($items),
            ]);
        }

        $items = $this->templateItems($project);

        return response()->json([
            'data' => $items,
            'meta' => $this->weightMeta($items),
        ]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $this->validated($request, $project);

        $validated['pole_id'] = null;
        $validated['source_item_id'] = null;

        $workItem = $project->workItems()->create($validated);

        $this->normalizeTemplateWeights($project);

        return response()->json([
            'message' => 'Item pekerjaan berhasil dibuat. Bobot template disesuaikan otomatis agar total 100%.',
            'data' => $workItem->fresh(),
            'meta' => $this->weightMeta($this->templateItems($project)),
        ], 201);
    }

    public function update(
        Request $request,
        Project $project,
        WorkItem $workItem
    ): JsonResponse {
        $this->assertBelongsToProject($project, $workItem);

        $this->authorize('update', $project);

        $validated = $this->validated($request, $project, $workItem);

        $workItem->update($validated);

        if ($workItem->isTemplate()) {
            $this->normalizeTemplateWeights($project);

            return response()->json([
                'message' => 'Item project diperbarui. Bobot template disesuaikan otomatis agar total 100%.',
                'data' => $workItem->fresh(),
                'meta' => $this->weightMeta($this->templateItems($project)),
            ]);
        }

        $pole = $workItem->pole()->firstOrFail();
        $this->normalizePoleWeights($pole);

        return response()->json([
            'message' => 'Item pekerjaan diperbarui. Bobot item tiang disesuaikan otomatis agar total 100%.',
            'data' => $workItem->fresh(),
            'meta' => $this->weightMeta($pole->workItems()->get()),
        ]);
    }

    /**
     * Rapikan bobot seluruh template project agar totalnya tepat 100%.
     */
    public function normalize(Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $this->normalizeTemplateWeights($project);

        return response()->json([
            'message' => 'Bobot seluruh item template pekerjaan telah dirapikan menjadi 100%.',
            'meta' => $this->weightMeta($this->templateItems($project)),
        ]);
    }

    public function destroy(Project $project, WorkItem $workItem): JsonResponse
    {
        $this->assertBelongsToProject($project, $workItem);

        $this->authorize('delete', $project);

        if ($this->hasReferencedProgress($workItem)) {
            return response()->json([
                'message' => 'Item pekerjaan tidak bisa dihapus karena sudah memiliki progres tercatat. Nonaktifkan item ini pada pengaturan supaya tersembunyi tanpa menghapus riwayat progres.',
                'errors' => [
                    'work_item' => ['Item sudah memiliki data progres. Hapus progres terkait terlebih dahulu atau nonaktifkan item.'],
                ],
            ], 409);
        }

        $poleId = $workItem->pole_id;
        $wasTemplate = $workItem->isTemplate();

        $workItem->delete();

        if ($wasTemplate) {
            $this->normalizeTemplateWeights($project);
        } elseif ($poleId && ($pole = Pole::find($poleId))) {
            $this->normalizePoleWeights($pole);
        }

        return response()->json([
            'message' => 'Item pekerjaan berhasil dihapus.',
        ]);
    }

    public function show(Project $project, WorkItem $workItem): JsonResponse
    {
        $this->assertBelongsToProject($project, $workItem);

        $this->authorize('view', $project);

        return response()->json([
            'data' => $workItem,
        ]);
    }

    /*
     * =========================================================
     * ITEM PER TIANG
     * =========================================================
     */

    public function poleIndex(Project $project, Pole $pole): JsonResponse
    {
        $this->assertPoleBelongsToProject($project, $pole);
        $this->authorize('view', $pole);

        $items = $pole->workItems()->orderBy('sequence')->orderBy('id')->get();

        return response()->json([
            'data' => $items,
            'meta' => $this->weightMeta($items),
        ]);
    }

    public function poleStore(Request $request, Project $project, Pole $pole): JsonResponse
    {
        $this->assertPoleBelongsToProject($project, $pole);
        $this->authorize('updateProgress', $pole);

        $validated = $this->validated($request, $project, null, $pole->id);

        $validated['source_item_id'] = null;
        $validated['pole_id'] = $pole->id;
        $validated['project_id'] = $project->id;

        $workItem = WorkItem::create($validated);

        $this->normalizePoleWeights($pole);

        return response()->json([
            'message' => 'Item pekerjaan khusus tiang berhasil ditambahkan.',
            'data' => $workItem->fresh(),
            'meta' => $this->weightMeta($pole->workItems()->get()),
        ], 201);
    }

    public function poleUpdate(
        Request $request,
        Project $project,
        Pole $pole,
        WorkItem $workItem
    ): JsonResponse {
        $this->assertPoleBelongsToProject($project, $pole);
        $this->assertBelongsToPole($pole, $workItem);

        $this->authorize('updateProgress', $pole);

        $validated = $this->validated($request, $project, $workItem, $pole->id);

        $workItem->update($validated);

        $this->normalizePoleWeights($pole);

        return response()->json([
            'message' => 'Item pekerjaan tiang diperbarui.',
            'data' => $workItem->fresh(),
            'meta' => $this->weightMeta($pole->workItems()->get()),
        ]);
    }

    public function poleDestroy(Project $project, Pole $pole, WorkItem $workItem): JsonResponse
    {
        $this->assertPoleBelongsToProject($project, $pole);
        $this->assertBelongsToPole($pole, $workItem);

        $this->authorize('updateProgress', $pole);

        if ($this->hasReferencedProgress($workItem)) {
            return response()->json([
                'message' => 'Item tidak bisa dihapus karena sudah memiliki progres. Nonaktifkan item ini sebagai gantinya.',
                'errors' => [
                    'work_item' => ['Item sudah memiliki data progres.'],
                ],
            ], 409);
        }

        $workItem->delete();

        $this->normalizePoleWeights($pole);

        return response()->json([
            'message' => 'Item pekerjaan tiang berhasil dihapus.',
            'meta' => $this->weightMeta($pole->workItems()->get()),
        ]);
    }

    /**
     * Terapkan ulang template project ke tiang ini.
     *
     * Item tiang yang belum punya progres diganti dengan salinan template
     * terbaru. Item yang sudah punya progres dipertahankan supaya riwayat
     * tidak hilang.
     */
    public function applyTemplate(Project $project, Pole $pole): JsonResponse
    {
        $this->assertPoleBelongsToProject($project, $pole);
        $this->authorize('updateProgress', $pole);

        $templates = $this->templateItems($project);

        DB::transaction(function () use ($pole, $templates) {
            $progressItemIds = PoleWorkProgress::where('pole_id', $pole->id)
                ->pluck('work_item_id')
                ->all();

            $historyItemIds = PoleProgressHistory::where('pole_id', $pole->id)
                ->pluck('work_item_id')
                ->all();

            $protected = array_unique(array_merge($progressItemIds, $historyItemIds));

            $existingBySource = $pole->workItems()
                ->whereNotNull('source_item_id')
                ->get()
                ->keyBy('source_item_id');

            $keptSourceIds = [];

            foreach ($templates as $template) {
                $existing = $existingBySource->get($template->id);
                $keptSourceIds[] = $template->id;

                if ($existing) {
                    if (! in_array($existing->id, $protected, true)) {
                        $existing->update([
                            'name' => $template->name,
                            'weight_percent' => $template->weight_percent,
                            'sequence' => $template->sequence,
                            'planned_duration_days' => $template->planned_duration_days,
                            'is_active' => $template->is_active,
                            'planned_start_month' => $template->planned_start_month,
                            'planned_end_month' => $template->planned_end_month,
                        ]);
                    }

                    continue;
                }

                $pole->workItems()->create([
                    'project_id' => $pole->project_id,
                    'source_item_id' => $template->id,
                    'name' => $template->name,
                    'weight_percent' => $template->weight_percent,
                    'sequence' => $template->sequence,
                    'planned_duration_days' => $template->planned_duration_days,
                    'is_active' => $template->is_active,
                    'planned_start_month' => $template->planned_start_month,
                    'planned_end_month' => $template->planned_end_month,
                ]);
            }

            /* Buang item tiang yang berasal dari template yang sudah dihapus
               dan belum punya progres. */
            $pole->workItems()
                ->whereNotNull('source_item_id')
                ->whereNotIn('source_item_id', $keptSourceIds)
                ->whereNotIn('id', $protected)
                ->delete();
        });

        $this->normalizePoleWeights($pole);

        return response()->json([
            'message' => 'Template pekerjaan berhasil diterapkan ke tiang ini.',
            'data' => $pole->workItems()->orderBy('sequence')->orderBy('id')->get(),
            'meta' => $this->weightMeta($pole->workItems()->get()),
        ]);
    }

    /*
     * =========================================================
     * AGREGASI PROYEK (halaman Pekerjaan)
     * =========================================================
     */

    /**
     * Satu baris per item template, dengan progres aktual agregat dari
     * seluruh salinan tiang yang berasal dari item tersebut.
     */
    private function aggregate(Project $project): JsonResponse
    {
        $templates = $this->templateItems($project);
        $denominator = $project->progressDenominator();

        $aggregates = PoleWorkProgress::query()
            ->join('work_items', 'work_items.id', '=', 'pole_work_progress.work_item_id')
            ->where('work_items.project_id', $project->id)
            ->whereNotNull('work_items.source_item_id')
            ->groupBy('work_items.source_item_id')
            ->select('work_items.source_item_id')
            ->selectRaw('SUM(pole_work_progress.progress_percent) as total_progress')
            ->selectRaw('COUNT(DISTINCT pole_work_progress.pole_id) as poles_with_progress')
            ->get()
            ->keyBy('source_item_id');

        $data = $templates->map(function (WorkItem $item) use ($aggregates, $denominator) {
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
                'total_weight' => round((float) $templates->sum('weight_percent'), 2),
                'is_balanced' => $this->isWeightBalanced($templates->sum('weight_percent')),
                'progress_denominator' => $denominator,
                'total_target_poles' => $project->total_target_poles,
            ],
        ]);
    }

    /*
     * =========================================================
     * HELPER
     * =========================================================
     */

    private function templateItems(Project $project): Collection
    {
        return $project->workItems()
            ->whereNull('pole_id')
            ->orderBy('sequence')
            ->orderBy('id')
            ->get();
    }

    private function poleFromRequest(Request $request, Project $project): Pole
    {
        $poleId = (int) $request->query('pole_id');

        return Pole::where('project_id', $project->id)
            ->whereKey($poleId)
            ->firstOrFail();
    }

    private function assertBelongsToProject(Project $project, WorkItem $workItem): void
    {
        abort_unless((int) $workItem->project_id === (int) $project->id, 404);
    }

    private function assertPoleBelongsToProject(Project $project, Pole $pole): void
    {
        abort_unless((int) $pole->project_id === (int) $project->id, 404);
    }

    private function assertBelongsToPole(Pole $pole, WorkItem $workItem): void
    {
        abort_unless((int) $workItem->pole_id === (int) $pole->id, 404);
    }

    private function hasReferencedProgress(WorkItem $workItem): bool
    {
        return PoleWorkProgress::where('work_item_id', $workItem->id)->exists()
            || PoleProgressHistory::where('work_item_id', $workItem->id)->exists();
    }

    private function normalizeTemplateWeights(Project $project): void
    {
        $this->normalizeWeights($this->templateItems($project));
    }

    private function normalizePoleWeights(Pole $pole): void
    {
        $this->normalizeWeights(
            $pole->workItems()->orderBy('sequence')->orderBy('id')->get()
        );
    }

    /**
     * Normalisasi bobot satu kelompok item agar totalnya tepat 100%.
     *
     * Bobot dibaca sebagai bobot relatif: seluruh item diskalakan dengan
     * faktor 100/total, dibulatkan per item ke 2 desimal, dan sisa
     * pembulatan diserap item berbobot terbesar.
     */
    private function normalizeWeights(Collection $items): void
    {
        if ($items->isEmpty()) {
            return;
        }

        $count = $items->count();
        $total = (float) $items->sum('weight_percent');

        $scaled = $items->map(function (WorkItem $item) use ($total, $count) {
            if ($total > 0) {
                return round(((float) $item->weight_percent / $total) * 100, 2);
            }

            return round(100 / $count, 2);
        })->all();

        $diff = round(100 - array_sum($scaled), 2);

        if (abs($diff) >= 0.01) {
            $maxIndex = array_search(max($scaled), $scaled, true);

            $scaled[$maxIndex] = round($scaled[$maxIndex] + $diff, 2);
        }

        foreach ($items as $index => $item) {
            $item->update(['weight_percent' => max(0.0, $scaled[$index])]);
        }
    }

    private function weightMeta(Collection $items): array
    {
        $total = (float) $items->sum('weight_percent');

        return [
            'total_weight' => round($total, 2),
            'is_balanced' => $this->isWeightBalanced($total),
        ];
    }

    private function isWeightBalanced(float|int|string $total): bool
    {
        return abs((float) $total - 100) < 0.01;
    }

    /**
     * Aturan validasi item pekerjaan.
     *
     * `name` unik dalam satu kelompok (template project, atau item satu
     * tiang), supaya dua tiang boleh memakai nama pekerjaan yang sama.
     */
    private function validated(
        Request $request,
        Project $project,
        ?WorkItem $workItem = null,
        ?int $poleId = null
    ): array {
        $poleId = $poleId ?? $workItem?->pole_id;

        return $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('work_items', 'name')
                    ->where(function ($query) use ($project, $poleId) {
                        $query->where('project_id', $project->id);

                        if ($poleId === null) {
                            $query->whereNull('pole_id');
                        } else {
                            $query->where('pole_id', $poleId);
                        }

                        return $query;
                    })
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
