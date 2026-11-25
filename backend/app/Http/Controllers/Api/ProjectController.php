<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

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
            'progress_source' => [
                'nullable',
                'string',
                'in:pole_weighted,quantity_entries',
            ],
            'status' => ['nullable', 'string', 'max:50'],
        ]);

        $project = DB::transaction(
            function () use ($request, $validated) {
                $project = new Project($validated);
                $project->owner_user_id = $request->user()->getKey();
                // Proyek mengikuti organisasi pembuatnya. Admin platform
                // (tanpa organisasi) membuat proyek platform (org NULL).
                $project->org_id = $request->user()->org_id;
                $project->save();

                DB::table('project_user')->insert([
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

    public function update(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'code' => [
                'sometimes',
                'string',
                'max:255',
                Rule::unique('projects', 'code')->ignore($project->id),
            ],
            'start_date' => ['sometimes', 'nullable', 'date'],
            'end_date' => ['sometimes', 'nullable', 'date'],
            'target_quantity' => [
                'sometimes',
                'regex:/^\d{1,10}(\.\d{1,4})?$/D',
                'gt:0',
            ],
            'unit_code' => [
                'sometimes',
                'string',
                'regex:/^[a-z][a-z0-9_]{0,31}$/D',
            ],
            'status' => ['sometimes', 'string', 'max:50'],
            'progress_source' => [
                'sometimes',
                'string',
                'in:pole_weighted,quantity_entries',
            ],
        ]);

        $start = $validated['start_date'] ?? $project->start_date;
        $end = $validated['end_date'] ?? $project->end_date;
        if ($start && $end && $end < $start) {
            return response()->json([
                'message' => 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
            ], 422);
        }

        if (array_key_exists('progress_source', $validated)
            && $validated['progress_source'] !== $project->progress_source) {
            $hasData = $project->poles()->exists()
                || DB::table('project_quantity_entries')
                    ->where('project_id', $project->id)
                    ->exists();

            if ($hasData) {
                return response()->json([
                    'message' => 'Mode pencatatan tidak dapat diubah karena proyek sudah memiliki data titik lokasi atau catatan kuantitas.',
                ], 422);
            }
        }

        $project->fill($validated)->save();

        return response()->json([
            'message' => 'Proyek berhasil diperbarui.',
            'data' => $project,
        ]);
    }

    public function show(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $project->load([
            'organization',
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
