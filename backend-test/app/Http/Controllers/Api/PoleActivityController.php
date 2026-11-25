<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\Project;
use Illuminate\Http\JsonResponse;

class PoleActivityController extends Controller
{
    public function index(Project $project, Pole $pole): JsonResponse
    {
        abort_unless((int) $pole->project_id === (int) $project->id, 404);
        $this->authorize('view', $pole);

        $activities = PoleProgressHistory::with([
            'workItem:id,name,weight_percent',
            'recordedBy:id,name',
        ])
            ->where('pole_id', $pole->id)
            ->orderByDesc('recorded_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PoleProgressHistory $history) => [
                'id' => $history->id,
                'work_item_id' => $history->work_item_id,
                'work_item_name' => $history->workItem?->name,
                'weight_percent' => $history->workItem?->weight_percent,
                'progress_percent' => (float) $history->progress_percent,
                'notes' => $history->notes,
                'recorded_at' => $history->recorded_at,
                'recorded_by' => $history->recordedBy?->name,
            ]);

        return response()->json(['data' => $activities]);
    }
}
