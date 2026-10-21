<?php

namespace App\Services;

use App\Models\Project;
use App\Models\WorkItem;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WorkItemInput
{
    public function validate(Request $request, Project $project, ?int $poleId = null, ?WorkItem $item = null): array
    {
        $presence = $request->isMethod('patch') ? 'sometimes' : 'required';
        $values = $request->validate([
            'name' => [$presence, 'string', 'max:255', Rule::unique('work_items')->where('project_id', $project->id)->where('pole_id', $poleId)->ignore($item?->id)],
            'weight_percent' => [$presence, 'numeric', 'min:0', 'max:100'],
            'sequence' => ['nullable', 'integer', 'min:0'],
            'planned_duration_days' => ['nullable', 'integer', 'min:0'],
            'planned_start_month' => ['nullable', 'integer', 'min:1', 'max:60'],
            'planned_end_month' => ['nullable', 'integer', 'min:1', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        if (array_key_exists('sequence', $values) && $values['sequence'] === null) {
            $values['sequence'] = 0;
        }
        $schedule = array_replace($item?->only(['planned_start_month', 'planned_end_month']) ?? [], $values);
        if (($schedule['planned_start_month'] ?? null) !== null && ($schedule['planned_end_month'] ?? null) !== null
            && $schedule['planned_end_month'] < $schedule['planned_start_month']) {
            throw ValidationException::withMessages(['planned_end_month' => ['Bulan akhir harus sama dengan atau setelah bulan awal.']]);
        }

        return $values;
    }
}
