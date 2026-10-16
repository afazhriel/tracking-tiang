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
                'is_balanced' => $this->isWeightBalanced($workItems->sum('weight_percent')),
                'progress_denominator' => $denominator,
                'total_target_poles' => $project->total_target_poles,
            ],
        ]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $this->validated($request, $project);

        $workItem = $project->workItems()->create($validated);

        $this->normalizeWorkItemWeights($project);

        return response()->json([
            'message' => 'Item pekerjaan berhasil dibuat. Bobot seluruh item disesuaikan otomatis agar total 100%.',
            'data' => $workItem->fresh(),
            'meta' => $this->weightMeta($project),
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

        $workItem->update($validated);

        $this->normalizeWorkItemWeights($project);

        return response()->json([
            'message' => 'Item pekerjaan berhasil diperbarui. Bobot seluruh item disesuaikan otomatis agar total 100%.',
            'data' => $workItem->fresh(),
            'meta' => $this->weightMeta($project),
        ]);
    }

    /**
     * Rapikan bobot seluruh item pekerjaan agar totalnya tepat 100%.
     *
     * Dipakai untuk data lama yang bobotnya belum seimbang (mis. setelah
     * item dihapus, atau data yang diinput sebelum normalisasi otomatis
     * berlaku). Bobot tiap item dipertahankan proporsinya.
     */
    public function normalize(Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $this->normalizeWorkItemWeights($project);

        return response()->json([
            'message' => 'Bobot seluruh item pekerjaan telah dirapikan menjadi 100%.',
            'meta' => $this->weightMeta($project),
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
     * Normalisasi bobot seluruh item pekerjaan agar totalnya tepat 100%.
     *
     * Bobot yang diisi pengguna dibaca sebagai bobot *relatif* terhadap
     * kondisi saat ini, bukan angka mati. Contoh: total item lama 100%,
     * pengguna menambah item berbobot 50% -> total sementara 150% ->
     * seluruh item diskalakan dengan faktor 100/150 sehingga total kembali
     * 100% (item lama 66,67%, item baru 33,33%). Input di atas 100% tidak
     * lagi ditolak, cukup dihitung ulang.
     *
     * Pembulatan dilakukan per item ke 2 desimal (presisi kolom
     * `weight_percent`). Sisa pembulatan diserap item dengan bobot terbesar
     * supaya penjumlahannya benar-benar 100,00% dan tidak pernah negatif.
     * Karena semua halaman progres dan Kurva S memakai `weight_percent`,
     * penyesuaian ini otomatis konsisten di seluruh aplikasi.
     */
    private function normalizeWorkItemWeights(Project $project): void
    {
        $items = $project->workItems()
            ->orderBy('sequence')
            ->orderBy('id')
            ->get();

        if ($items->isEmpty()) {
            return;
        }

        $count = $items->count();
        $total = (float) $items->sum('weight_percent');

        $scaled = $items->map(function (WorkItem $item) use ($total, $count) {
            if ($total > 0) {
                return round(((float) $item->weight_percent / $total) * 100, 2);
            }

            /* Semua bobot nol -> bagi rata supaya total tetap 100%. */
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

    /**
     * Ringkasan bobot untuk respons API.
     */
    private function weightMeta(Project $project): array
    {
        $total = (float) $project->workItems()->sum('weight_percent');

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
