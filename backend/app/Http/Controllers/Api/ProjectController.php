<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $accessibleIds = $request->user()->accessibleProjectIds();

        $projects = Project::withCount(['regions', 'poles', 'workItems'])
            ->when($accessibleIds !== null, fn ($query) => $query->whereIn('id', $accessibleIds))
            ->latest()
            ->get();

        return response()->json([
            'data' => $projects,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Project::class);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:255', 'unique:projects,code'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'total_target_poles' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'string', 'max:50'],
        ]);

        $project = Project::create($validated);

        return response()->json([
            'message' => 'Project berhasil dibuat.',
            'data' => $project,
        ], 201);
    }

    public function show(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $project->load([
            'regions',
            'workItems',
        ])->loadCount('poles');

        return response()->json([
            'data' => $project,
        ]);
    }
}
