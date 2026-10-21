<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\Project;
use App\Services\PoleVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Aktivitas lapangan — bersumber dari histori progress tiang.
 *
 * Setiap kali PIC menyimpan progress (POST /poles/{pole}/progress),
 * sebuah baris `PoleProgressHistory` dibuat. Controller ini
 * membaca histori tersebut dan memformatnya sebagai "timeline
 * aktivitas" yang siap dikonsumsi frontend.
 *
 * Field yang dikembalikan sudah disesuaikan dengan `normalizeActivity()`
 * di frontend (AktivitasPage.jsx).
 */
class ActivityController extends Controller
{
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
            'pole_id' => ['nullable', 'integer', 'exists:poles,id'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date'],
        ]);

        $limit = $validated['limit'] ?? 100;

        if (isset($validated['pole_id'])) {
            $pole = Pole::where('project_id', $project->id)->findOrFail($validated['pole_id']);
            $this->authorize('view', $pole);
        }

        $activities = PoleProgressHistory::with([
            'pole:id,pole_code,address,region_id,province_id',
            'pole.region:id,name,code',
            'pole.province:id,name',
            'workItem:id,name,sequence',
            'recordedBy:id,name,email',
            'photos',
        ])
            ->whereHas('pole', function ($query) use ($request, $project) {
                $query->where('project_id', $project->id);
                PoleVisibility::apply($query, $request->user());
            })
            ->when($validated['pole_id'] ?? null, fn ($q, $poleId) => $q->where('pole_id', $poleId))
            ->when($validated['start_date'] ?? null, fn ($q, $date) => $q->where('recorded_at', '>=', $date))
            ->when($validated['end_date'] ?? null, fn ($q, $date) => $q->where('recorded_at', '<=', $date.' 23:59:59'))
            ->orderByDesc('recorded_at')
            ->limit($limit)
            ->get();

        $data = $activities->map(function (PoleProgressHistory $history) {
            return [
                'id' => $history->id,
                'created_at' => $history->recorded_at?->toIso8601String(),
                'recorded_at' => $history->recorded_at?->toIso8601String(),
                'progress_percent' => $history->progress_percent,
                'notes' => $history->notes,
                'title' => 'Update Progress',
                'action' => 'progress',
                'type' => 'progress',

                /* Relasi user */
                'user' => $history->recordedBy ? [
                    'id' => $history->recordedBy->id,
                    'name' => $history->recordedBy->name,
                ] : null,
                'user_name' => $history->recordedBy?->name,

                /* Relasi tiang */
                'pole_id' => $history->pole_id,
                'pole_code' => $history->pole?->pole_code,
                'pole' => $history->pole ? [
                    'id' => $history->pole->id,
                    'pole_code' => $history->pole->pole_code,
                    'address' => $history->pole->address,
                    'region' => $history->pole->region ? [
                        'id' => $history->pole->region->id,
                        'name' => $history->pole->region->name,
                    ] : null,
                    'province' => $history->pole->province ? [
                        'id' => $history->pole->province->id,
                        'name' => $history->pole->province->name,
                    ] : null,
                ] : null,

                /* Foto dokumentasi */
                'photos' => $history->photos
                    ->map(fn ($photo) => $photo->toPayload())
                    ->values(),

                /* Relasi item pekerjaan */
                'work_item_name' => $history->workItem?->name,
                'work_item' => $history->workItem ? [
                    'id' => $history->workItem->id,
                    'name' => $history->workItem->name,
                    'sequence' => $history->workItem->sequence,
                ] : null,
            ];
        });

        return response()->json([
            'data' => $data,
            'meta' => [
                'total' => $data->count(),
                'project' => $project->id,
            ],
        ]);
    }
}
