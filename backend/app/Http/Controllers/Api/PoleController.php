<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PoleController extends Controller
{
    public function index(Project $project): JsonResponse
    {
        $poles = $project->poles()
            ->with('region')
            ->orderBy('pole_code')
            ->paginate(100);

        return response()->json($poles);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate([
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'pole_code' => ['required', 'string', 'max:255'],
            'address' => ['nullable', 'string'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'status' => ['nullable', 'string', 'max:50'],
        ]);

        $validated['project_id'] = $project->id;

        $pole = Pole::create($validated);

        return response()->json([
            'message' => 'Tiang berhasil dibuat.',
            'data' => $pole->load('region'),
        ], 201);
    }

    public function show(Project $project, Pole $pole): JsonResponse
    {
        abort_unless($pole->project_id === $project->id, 404);

        $pole->load([
            'region',
            'workProgress.workItem',
        ]);

        return response()->json([
            'data' => $pole,
        ]);
    }
}
