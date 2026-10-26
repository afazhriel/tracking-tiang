<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\Project;
use App\Models\WorkItem;
use App\Services\PoleWorkItems;
use App\Services\WorkItemInput;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PoleWorkItemController extends Controller
{
    public function __construct(private PoleWorkItems $items, private WorkItemInput $input) {}

    public function index(Project $project, Pole $pole): JsonResponse
    {
        $this->scope($project, $pole, 'view');
        $items = $this->items->visible($pole);
        $inherited = ! $pole->workItems()->exists() && $pole->work_items_customized_at === null;

        return response()->json(['data' => $items, 'meta' => [
            ...$this->items->meta($items),
            'inherited' => $inherited,
            'needs_reconciliation' => ! $inherited && $items->contains(fn ($item) => $item->pole_id === null),
            'can_manage' => request()->user()->can('update', $pole),
        ]]);
    }

    public function store(Request $request, Project $project, Pole $pole): JsonResponse
    {
        $this->scope($project, $pole, 'update');

        return DB::transaction(function () use ($request, $project, $pole) {
            $pole = $this->items->lock($pole);
            $this->items->materialize($pole);
            $validated = $this->input->validate($request, $project, $pole->id);
            $item = $pole->workItems()->create([...$validated, 'project_id' => $project->id]);
            $this->items->normalize($pole->workItems()->orderBy('id')->get());

            return $this->response($pole, 'Item pekerjaan tiang berhasil ditambahkan.', $item->fresh(), 201);
        });
    }

    public function update(Request $request, Project $project, Pole $pole, WorkItem $workItem): JsonResponse
    {
        $this->scope($project, $pole, 'update');
        $this->itemScope($project, $pole, $workItem);

        return DB::transaction(function () use ($request, $project, $pole, $workItem) {
            $pole = $this->items->lock($pole);
            $this->items->materialize($pole);
            $item = $this->resolve($pole, $workItem);
            $validated = $this->input->validate($request, $project, $pole->id, $item);
            $this->items->preserveHistoryWeights($pole->workItems()->get());
            $item->update($validated);
            $this->items->normalize($pole->workItems()->orderBy('id')->get());

            return $this->response($pole, 'Item pekerjaan tiang diperbarui.', $item->fresh());
        });
    }

    public function destroy(Project $project, Pole $pole, WorkItem $workItem): JsonResponse
    {
        $this->scope($project, $pole, 'update');
        $this->itemScope($project, $pole, $workItem);

        return DB::transaction(function () use ($pole, $workItem) {
            $pole = $this->items->lock($pole);
            $this->items->materialize($pole);
            $item = $this->resolve($pole, $workItem);
            foreach (['pole_work_progress', 'pole_progress_histories', 'progress_photos'] as $table) {
                abort_if(DB::table($table)->where('work_item_id', $item->id)->exists(), 409, 'Item memiliki progres/foto. Nonaktifkan item agar riwayat tetap tersimpan.');
            }
            $this->items->preserveHistoryWeights($pole->workItems()->get());
            $item->delete();
            $pole->forceFill(['work_items_customized_at' => now()])->save();
            $this->items->normalize($pole->workItems()->orderBy('id')->get());

            return $this->response($pole, 'Item pekerjaan tiang dihapus.');
        });
    }

    public function applyTemplate(Project $project, Pole $pole): JsonResponse
    {
        $this->scope($project, $pole, 'update');

        return DB::transaction(function () use ($project, $pole) {
            $pole = $this->items->lock($pole);
            $this->items->materialize($pole);
            $this->items->preserveHistoryWeights($pole->workItems()->get());
            foreach ($project->workItems()->whereNull('pole_id')->get() as $template) {
                $existing = $pole->workItems()->where('source_item_id', $template->id)->first();
                if ($existing) {
                    $hasRecords = false;
                    foreach (['pole_work_progress', 'pole_progress_histories', 'progress_photos'] as $table) {
                        $hasRecords = $hasRecords || DB::table($table)->where('work_item_id', $existing->id)->exists();
                    }
                    if (! $hasRecords) {
                        $existing->update($template->only(['name', 'weight_percent', 'sequence', 'planned_duration_days', 'is_active', 'planned_start_month', 'planned_end_month']));
                    }
                } else {
                    $pole->workItems()->create([
                        ...$template->only(['project_id', 'name', 'weight_percent', 'sequence', 'planned_duration_days', 'is_active', 'planned_start_month', 'planned_end_month']),
                        'source_item_id' => $template->id,
                    ]);
                }
            }
            $pole->forceFill(['work_items_customized_at' => now()])->save();
            $this->items->normalize($pole->workItems()->orderBy('id')->get());

            return $this->response($pole, 'Template diterapkan. Item dan riwayat sebelumnya tetap disimpan.');
        });
    }

    private function scope(Project $project, Pole $pole, string $ability): void
    {
        abort_unless((int) $pole->project_id === (int) $project->id, 404);
        $this->authorize($ability, $pole);
    }

    private function itemScope(Project $project, Pole $pole, WorkItem $item): void
    {
        abort_unless((int) $item->project_id === (int) $project->id, 404);
        abort_unless($item->pole_id === null || (int) $item->pole_id === (int) $pole->id, 404);
    }

    private function resolve(Pole $pole, WorkItem $original): WorkItem
    {
        return $original->pole_id === null
            ? $pole->workItems()->where('source_item_id', $original->id)->firstOrFail()
            : $pole->workItems()->whereKey($original->id)->firstOrFail();
    }

    private function response(Pole $pole, string $message, ?WorkItem $item = null, int $status = 200): JsonResponse
    {
        $all = $pole->workItems()->orderBy('sequence')->orderBy('id')->get();

        return response()->json(['message' => $message, 'data' => $item ?? $all, 'meta' => $this->items->meta($all)], $status);
    }
}
