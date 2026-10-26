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

        $projects = Project::withCount([
            'regions',
            'poles',
            'workItems' => fn ($query) => $query->whereNull('pole_id'),
        ])
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
            'target_quantity' => [
                'required',
                'regex:/^\d{1,10}(\.\d{1,4})?$/D',
                'gt:0',
            ],
            'unit_code' => [
                'required',
                'string',
                'regex:/^[a-z][a-z0-9_]{0,31}$/D',
            ],
            'status' => ['nullable', 'string', 'max:50'],
        ]);

        $project = \Illuminate\Support\Facades\DB::transaction(
            function () use ($request, $validated) {
                $project = new Project($validated);
                $project->owner_user_id = $request->user()->getKey();
                $project->save();

                \Illuminate\Support\Facades\DB::table('project_user')->insert([
                    'project_id' => $project->getKey(),
                    'user_id' => $request->user()->getKey(),
                    'role' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                return $project;
            }
        );

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
            'workItems' => fn ($query) => $query
                ->whereNull('pole_id')
                ->orderBy('sequence')
                ->orderBy('id'),
        ])->loadCount('poles');

        return response()->json([
            'data' => $project,
        ]);
    }
}
