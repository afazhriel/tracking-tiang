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
use Illuminate\Support\Facades\DB;

class ProgressController extends Controller
{
    public function index(Project $project, Pole $pole): JsonResponse
    {
        abort_unless((int) $pole->project_id === (int) $project->id, 404);

        $this->authorize('view', $pole);

        $progress = PoleWorkProgress::with('workItem')
            ->where('pole_id', $pole->id)
            ->get();

        return response()->json([
            'data' => $progress,
            'pole_progress' => $this->calculatePoleProgress($pole),
        ]);
    }

    public function store(
        Request $request,
        Project $project,
        Pole $pole
    ): JsonResponse {
        abort_unless((int) $pole->project_id === (int) $project->id, 404);

        $this->authorize('updateProgress', $pole);

        $validated = $request->validate([
            'work_item_id' => ['required', 'integer', 'exists:work_items,id'],
            'progress_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'started_at' => ['nullable', 'date'],
            'completed_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $workItem = WorkItem::where('id', $validated['work_item_id'])
            ->where('project_id', $project->id)
            ->firstOrFail();

        $userId = $request->user()?->id;

        [$progress] = DB::transaction(function () use (
            $pole,
            $workItem,
            $validated,
            $userId
        ) {
            $progress = PoleWorkProgress::updateOrCreate(
                [
                    'pole_id' => $pole->id,
                    'work_item_id' => $workItem->id,
                ],
                [
                    'progress_percent' => $validated['progress_percent'],
                    'started_at' => $validated['started_at'] ?? null,
                    'completed_at' => $validated['completed_at'] ?? null,
                    'notes' => $validated['notes'] ?? null,
                    'updated_by' => $userId,
                ]
            );

            PoleProgressHistory::create([
                'pole_id' => $pole->id,
                'work_item_id' => $workItem->id,
                'progress_percent' => $validated['progress_percent'],
                'recorded_at' => now(),
                'recorded_by' => $userId,
                'notes' => $validated['notes'] ?? null,
            ]);

            return [$progress];
        });

        return response()->json([
            'message' => 'Progress berhasil disimpan.',
            'data' => $progress->load('workItem'),
            'pole_progress' => $this->calculatePoleProgress($pole),
        ]);
    }

    private function calculatePoleProgress(Pole $pole): float
    {
        $pole->loadMissing('workProgress.workItem');

        $progress = $pole->workProgress->sum(function ($item) {
            return (
                (float) $item->workItem->weight_percent
                * (float) $item->progress_percent
            ) / 100;
        });

        return round($progress, 2);
    }
}
