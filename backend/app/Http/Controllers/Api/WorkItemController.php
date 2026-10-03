<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\WorkItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkItemController extends Controller
{
    public function index(Project $project): JsonResponse
    {
        return response()->json([
            'data' => $project->workItems()
                ->orderBy('sequence')
                ->get(),
        ]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'weight_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'sequence' => ['nullable', 'integer', 'min:0'],
            'planned_duration_days' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $workItem = $project->workItems()->create($validated);

        return response()->json([
            'message' => 'Item pekerjaan berhasil dibuat.',
            'data' => $workItem,
        ], 201);
    }

    public function show(Project $project, WorkItem $workItem): JsonResponse
    {
        abort_unless($workItem->project_id === $project->id, 404);

        return response()->json([
            'data' => $workItem,
        ]);
    }
}
