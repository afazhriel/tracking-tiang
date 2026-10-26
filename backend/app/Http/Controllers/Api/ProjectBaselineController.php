<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectBaseline;
use App\Services\ProjectBaselineApproval;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectBaselineController extends Controller
{
    public function index(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        return response()->json([
            'data' => ProjectBaseline::query()
                ->where('project_id', $project->id)
                ->with('periods')
                ->orderByDesc('version')
                ->get(),
        ]);
    }

    public function show(Project $project, ProjectBaseline $baseline): JsonResponse
    {
        abort_unless((int) $baseline->project_id === (int) $project->id, 404);
        $this->authorize('view', $project);

        return response()->json([
            'data' => $baseline->load('periods'),
        ]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $data = $request->validate([
            'notes' => ['nullable', 'string', 'max:5000'],
            'periods' => ['required', 'array', 'min:1', 'max:60'],
            'periods.*.period_start' => ['required', 'date'],
            'periods.*.period_end' => ['required', 'date'],
            'periods.*.planned_quantity' => [
                'required', 'numeric', 'min:0', 'decimal:0,4',
            ],
        ]);

        return DB::transaction(function () use ($project, $request, $data) {
            $lockedProject = Project::query()
                ->whereKey($project->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $lockedProject->start_date &&
                $lockedProject->end_date &&
                (float) $lockedProject->target_quantity > 0,
                422,
                'Tanggal dan target kuantitas proyek wajib diisi.'
            );

            $version = (int) ProjectBaseline::query()
                ->where('project_id', $lockedProject->id)
                ->max('version') + 1;

            $baseline = ProjectBaseline::create([
                'project_id' => $lockedProject->id,
                'version' => $version,
                'unit_code' => $lockedProject->unit_code,
                'target_quantity' => $lockedProject->target_quantity,
                'start_date' => $lockedProject->start_date,
                'end_date' => $lockedProject->end_date,
                'notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ]);

            foreach ($data['periods'] as $index => $period) {
                $baseline->periods()->create([
                    'period_number' => $index + 1,
                    'period_start' => $period['period_start'],
                    'period_end' => $period['period_end'],
                    'planned_quantity' => $period['planned_quantity'],
                ]);
            }

            return response()->json([
                'message' => 'Draf baseline berhasil dibuat.',
                'data' => $baseline->load('periods'),
            ], 201);
        });
    }

    public function update(
        Request $request,
        Project $project,
        ProjectBaseline $baseline
    ): JsonResponse {
        abort_unless((int) $baseline->project_id === (int) $project->id, 404);
        $this->authorize('update', $project);

        $data = $request->validate([
            'notes' => ['nullable', 'string', 'max:5000'],
            'periods' => ['required', 'array', 'min:1', 'max:60'],
            'periods.*.period_start' => ['required', 'date_format:Y-m-d'],
            'periods.*.period_end' => ['required', 'date_format:Y-m-d'],
            'periods.*.planned_quantity' => [
                'required', 'numeric', 'min:0', 'decimal:0,4',
            ],
        ]);

        foreach ($data['periods'] as $period) {
            abort_unless(
                $period['period_start'] <= $period['period_end'],
                422,
                'Tanggal periode tidak valid.'
            );
        }

        return DB::transaction(function () use ($project, $baseline, $data) {
            Project::query()
                ->whereKey($project->id)
                ->lockForUpdate()
                ->firstOrFail();

            $draft = ProjectBaseline::query()
                ->whereKey($baseline->id)
                ->where('project_id', $project->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $draft->status === 'draft',
                422,
                'Baseline yang sudah disahkan tidak boleh diedit.'
            );

            $draft->update(['notes' => $data['notes'] ?? null]);
            $draft->periods()->delete();

            foreach ($data['periods'] as $index => $period) {
                $draft->periods()->create([
                    'period_number' => $index + 1,
                    'period_start' => $period['period_start'],
                    'period_end' => $period['period_end'],
                    'planned_quantity' => $period['planned_quantity'],
                ]);
            }

            return response()->json([
                'message' => 'Draf baseline berhasil diperbarui.',
                'data' => $draft->fresh()->load('periods'),
            ]);
        }, 3);
    }

    public function approve(
        Project $project,
        ProjectBaseline $baseline,
        ProjectBaselineApproval $approval
    ): JsonResponse {
        abort_unless((int) $baseline->project_id === (int) $project->id, 404);
        $this->authorize('update', $project);

        $approved = $approval->approve($baseline->id, request()->user());

        return response()->json([
            'message' => 'Baseline berhasil disahkan.',
            'data' => $approved->load('periods'),
        ]);
    }
}
