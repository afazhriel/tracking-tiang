<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PoleWorkProgress;
use App\Models\Project;
use App\Models\WorkItem;
use App\Services\PoleWorkItems;
use App\Services\ProgressIntegrity;
use App\Services\WorkItemInput;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WorkItemController extends Controller
{
    public function __construct(private PoleWorkItems $items, private WorkItemInput $input) {}

    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);
        $values = $request->validate([
            'scope' => ['sometimes', Rule::in(['project', 'aggregate', 'pole'])],
            'pole_id' => ['required_if:scope,pole', 'integer'],
        ]);
        if (($values['scope'] ?? null) === 'pole') {
            $pole = $project->poles()->findOrFail($values['pole_id']);

            return app(PoleWorkItemController::class)->index($project, $pole);
        }

        app(ProgressIntegrity::class)->assertUnambiguous($project);
        $templates = $this->templates($project);
        $denominator = $project->progressDenominator();
        $aggregates = PoleWorkProgress::query()
            ->join('work_items as wi', 'wi.id', '=', 'pole_work_progress.work_item_id')
            ->join('poles', 'poles.id', '=', 'pole_work_progress.pole_id')
            ->where('wi.project_id', $project->id)->where('poles.project_id', $project->id)
            ->where(fn ($q) => $q->whereNull('wi.pole_id')->orWhereColumn('wi.pole_id', 'poles.id'))
            ->where("wi.is_active", true)
            ->groupByRaw('COALESCE(wi.source_item_id, wi.id)')
            ->selectRaw('COALESCE(wi.source_item_id, wi.id) as item_id')
            ->selectRaw('SUM(pole_work_progress.progress_percent) as total_progress')
            ->selectRaw('SUM(wi.weight_percent * pole_work_progress.progress_percent / 100) as weighted_progress')
            ->selectRaw('COUNT(DISTINCT pole_work_progress.pole_id) as poles_with_progress')
            ->get()->toBase()->keyBy('item_id');
        $contribution = fn ($row) => $denominator > 0 ? (float) ($row?->weighted_progress ?? 0) / $denominator : 0;
        $data = $templates->map(fn (WorkItem $item) => [
            ...$item->toArray(),
            'actual_progress' => $denominator > 0 ? min(100, round((float) ($aggregates->get($item->id)?->total_progress ?? 0) / $denominator, 2)) : 0,
            'poles_with_progress' => (int) ($aggregates->get($item->id)?->poles_with_progress ?? 0),
            'weighted_contribution' => round($contribution($aggregates->get($item->id)), 4),
        ]);
        $custom = $aggregates->except($templates->modelKeys());

        return response()->json(['data' => $data, 'meta' => [
            ...$this->items->meta($templates),
            'progress_denominator' => $denominator,
            'total_target_poles' => $project->total_target_poles,
            'custom_weighted_contribution' => round($custom->sum($contribution), 4),
            'actual_current_percent' => round($aggregates->sum($contribution), 4),
        ]]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        return DB::transaction(function () use ($request, $project) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            $item = $project->workItems()->create($this->input->validate($request, $project));
            $this->items->normalize($this->templates($project));

            return response()->json(['message' => 'Template pekerjaan dibuat. Bobot disesuaikan menjadi 100%.', 'data' => $item->fresh(), 'meta' => $this->items->meta($this->templates($project))], 201);
        });
    }

    public function update(Request $request, Project $project, WorkItem $workItem): JsonResponse
    {
        $this->belongsTo($project, $workItem);
        $this->authorize('update', $project);
        if ($workItem->pole_id !== null) {
            return app(PoleWorkItemController::class)->update($request, $project, $workItem->pole, $workItem);
        }

        return DB::transaction(function () use ($request, $project, $workItem) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            $item = WorkItem::findOrFail($workItem->id);
            $values = $this->input->validate($request, $project, null, $item);
            $this->items->preserveHistoryWeights($this->templates($project));
            $item->update($values);
            $this->items->normalize($this->templates($project));

            return response()->json(['message' => 'Template pekerjaan diperbarui.', 'data' => $item->fresh(), 'meta' => $this->items->meta($this->templates($project))]);
        });
    }

    public function normalize(Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        return DB::transaction(function () use ($project) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            $this->items->normalize($this->templates($project));

            return response()->json(['message' => 'Bobot template telah dirapikan menjadi 100%.', 'meta' => $this->items->meta($this->templates($project))]);
        });
    }

    public function destroy(Project $project, WorkItem $workItem): JsonResponse
    {
        $this->belongsTo($project, $workItem);
        $this->authorize('delete', $project);
        if ($workItem->pole_id !== null) {
            return app(PoleWorkItemController::class)->destroy($project, $workItem->pole, $workItem);
        }

        return DB::transaction(function () use ($project, $workItem) {
            Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            abort_if($workItem->copies()->exists(), 409, 'Template memiliki salinan per tiang. Nonaktifkan agar data tetap tersimpan.');
            foreach (['pole_work_progress', 'pole_progress_histories', 'progress_photos'] as $table) {
                abort_if(DB::table($table)->where('work_item_id', $workItem->id)->exists(), 409, 'Item memiliki progres/foto. Nonaktifkan agar riwayat tetap tersimpan.');
            }
            $workItem->delete();
            $this->items->normalize($this->templates($project));

            return response()->json(['message' => 'Item pekerjaan berhasil dihapus.']);
        });
    }

    public function show(Project $project, WorkItem $workItem): JsonResponse
    {
        $this->belongsTo($project, $workItem);
        $this->authorize('view', $project);
        if ($workItem->pole_id !== null) {
            $this->authorize('view', $workItem->pole);
        }

        return response()->json(['data' => $workItem]);
    }

    private function belongsTo(Project $project, WorkItem $item): void
    {
        abort_unless((int) $item->project_id === (int) $project->id, 404);
    }

    private function templates(Project $project)
    {
        return $project->workItems()->whereNull('pole_id')->orderBy('sequence')->orderBy('id')->get();
    }
}
