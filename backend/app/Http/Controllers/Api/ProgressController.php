<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\PoleWorkProgress;
use App\Models\ProgressPhoto;
use App\Models\Project;
use App\Models\User;
use App\Models\WorkItem;
use App\Services\NotificationService;
use App\Services\PendingPhotos;
use App\Services\PoleWorkItems;
use App\Services\ProgressIntegrity;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class ProgressController extends Controller
{
    public function __construct(private NotificationService $notifications, private PoleWorkItems $items, private PendingPhotos $uploads) {}

    public function index(Project $project, Pole $pole): JsonResponse
    {
        abort_unless((int) $pole->project_id === (int) $project->id, 404);

        $this->authorize('view', $pole);
        app(ProgressIntegrity::class)->assertUnambiguous($project, $pole);

        $progress = PoleWorkProgress::with('workItem')
            ->where('pole_id', $pole->id)
            ->get();

        $photos = ProgressPhoto::where('pole_id', $pole->id)
            ->orderByDesc('id')
            ->get()
            ->map(fn (ProgressPhoto $photo) => $photo->toPayload());

        return response()->json([
            'data' => $progress,
            'photos' => $photos,
            'pole_progress' => $this->calculatePoleProgress($pole),
        ]);
    }

    public function store(
        Request $request,
        Project $project,
        Pole $pole
    ): JsonResponse {
        abort_unless((int) $pole->project_id === (int) $project->id, 404);

        $this->authorize('updateProgress', $pole);

        $validated = $request->validate([
            'work_item_id' => ['required', 'integer', 'exists:work_items,id'],
            'progress_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'started_at' => ['nullable', 'date'],
            'completed_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'recorded_at' => ['nullable', 'date', 'before_or_equal:now'],
            'photos' => ['nullable', 'array', 'max:5'],
            'photos.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $userId = $request->user()?->id;
        $files = $request->file('photos') ?? [];

        try {
            [$progress, $photos, $poleProgress] = DB::transaction(function () use (
                $pole,
                $project,
                $validated,
                $userId,
                $files
            ) {
                $pole = $this->items->lock($pole);
                $workItem = WorkItem::whereKey($validated['work_item_id'])->where('project_id', $project->id)->firstOrFail();
                if ($workItem->pole_id !== null) {
                    abort_unless((int) $workItem->pole_id === (int) $pole->id, 404);
                }
                if ($pole->workItems()->exists() || $pole->work_items_customized_at !== null) {
                    $this->items->materialize($pole);
                    if ($workItem->pole_id === null) {
                        $workItem = $pole->workItems()->where('source_item_id', $workItem->id)->firstOrFail();
                    }
                }
                abort_unless($workItem->is_active, 422, 'Item pekerjaan nonaktif tidak boleh menerima progres.');
                $recordedAt = isset($validated['recorded_at']) ? Carbon::parse($validated['recorded_at'])->utc() : now();
                $latest = PoleProgressHistory::where('pole_id', $pole->id)->where('work_item_id', $workItem->id)
                    ->orderByDesc('recorded_at')->orderByDesc('id')->first();
                if (($project->start_date && $recordedAt->lt(Carbon::parse($project->start_date)))
                    || ($latest && $recordedAt->lt($latest->recorded_at))) {
                    throw ValidationException::withMessages(['recorded_at' => 'Tanggal realisasi tidak boleh mendahului awal proyek atau catatan terakhir pekerjaan ini.']);
                }
                $previous = PoleWorkProgress::where('pole_id', $pole->id)->where('work_item_id', $workItem->id)->first();
                $dates = array_replace($previous?->only(['started_at', 'completed_at']) ?? [], Arr::only($validated, ['started_at', 'completed_at']));
                if (! empty($dates['started_at']) && ! empty($dates['completed_at'])
                    && Carbon::parse($dates['completed_at'])->lt(Carbon::parse($dates['started_at']))) {
                    throw ValidationException::withMessages(['completed_at' => 'Tanggal selesai tidak boleh mendahului tanggal mulai.']);
                }
                $progress = PoleWorkProgress::updateOrCreate(
                    [
                        'pole_id' => $pole->id,
                        'work_item_id' => $workItem->id,
                    ],
                    [
                        ...Arr::only($validated, ['progress_percent', 'started_at', 'completed_at', 'notes']),
                        'updated_by' => $userId,
                    ]
                );

                $history = PoleProgressHistory::create([
                    'pole_id' => $pole->id,
                    'work_item_id' => $workItem->id,
                    'progress_percent' => $validated['progress_percent'],
                    'recorded_at' => $recordedAt,
                    'weight_percent_snapshot' => $workItem->weight_percent,
                    'is_active_snapshot' => $workItem->is_active,
                    'recorded_by' => $userId,
                    'notes' => $validated['notes'] ?? null,
                ]);

                $photos = collect();
                foreach ($files as $file) {
                    $path = $this->uploads->store($file, 'progress-photos');
                    $photos->push(ProgressPhoto::create([
                        'ulid' => (string) Str::ulid(),
                        'pole_id' => $pole->id,
                        'work_item_id' => $workItem->id,
                        'progress_history_id' => $history->id,
                        'disk' => 'media',
                        'path' => $path,
                        'original_name' => $file->getClientOriginalName(),
                        'mime_type' => $file->getMimeType(),
                        'size' => $file->getSize(),
                        'uploaded_by' => $userId,
                    ]));
                }
                $poleProgress = $this->calculatePoleProgress($pole);
                $this->notifyProgress($project, $pole, $workItem, $validated['progress_percent'], $poleProgress, $userId);
                $progress->setRelation('workItem', $workItem);

                return [$progress, $photos, $poleProgress];
            });
        } catch (Throwable $exception) {
            $this->uploads->discardUnreferenced();
            throw $exception;
        }

        return response()->json([
            'message' => 'Progress berhasil disimpan.',
            'data' => $progress,
            'photos' => $photos->map(fn (ProgressPhoto $photo) => $photo->toPayload()),
            'pole_progress' => $poleProgress,
        ]);
    }

    /**
     * Kirim notifikasi progress (dan penyelesaian tiang) ke anggota project.
     */
    private function notifyProgress(
        Project $project,
        Pole $pole,
        WorkItem $workItem,
        float|int|string $progressPercent,
        float $poleProgress,
        ?int $userId
    ): void {
        $poleCode = $pole->pole_code ?: "Tiang #{$pole->id}";
        $userName = $userId
            ? (User::find($userId)?->name ?? 'Tim lapangan')
            : 'Tim lapangan';
        $progress = number_format((float) $progressPercent, 0);

        $this->notifications->sendToProjectMembers(
            $project,
            'progress',
            "Progress {$poleCode} diperbarui",
            "{$userName} memperbarui {$workItem->name} ke {$progress}%.",
            "/tiang/{$pole->id}",
            [
                'pole_id' => $pole->id,
                'work_item_id' => $workItem->id,
                'progress_percent' => (float) $progressPercent,
            ],
            $userId,
            $pole
        );

        if ((float) $progressPercent >= 100 && round($poleProgress, 2) >= 100) {
            $this->notifications->sendToProjectMembers(
                $project,
                'aktivitas',
                "{$poleCode} mencapai 100%",
                "Seluruh item pekerjaan pada {$poleCode} sudah diselesaikan.",
                "/tiang/{$pole->id}",
                ['pole_id' => $pole->id],
                $userId,
                $pole
            );
        }
    }

    private function calculatePoleProgress(Pole $pole): float
    {
        $pole->loadMissing('workProgress.workItem');

        $progress = $pole->workProgress->filter(fn ($item) => (bool) $item->workItem?->is_active)->sum(function ($item) {
            return (
                (float) $item->workItem->weight_percent
                * (float) $item->progress_percent
            ) / 100;
        });

        return round($progress, 2);
    }
}
