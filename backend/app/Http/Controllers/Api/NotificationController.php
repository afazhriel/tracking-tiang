<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PoleProgressHistory;
use App\Models\PoleWorkProgress;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Notifikasi sistem — dibangun dari data progress yang ada.
 *
 * Backend belum punya tabel notifikasi tersendiri. Endpoint ini
 * mensintesis notifikasi dari sumber yang sudah ada:
 *   - Histori progress terbaru       → notifikasi "progress"
 *   - Tiang dengan progres 100%      → notifikasi "selesai"
 *
 * Frontend (NotifikasiPage.jsx) memahami field:
 *   id, title, description, category, created_at, read_at, is_read
 */
class NotificationController extends Controller
{
    public function index(Request $request, ?Project $project = null): JsonResponse
    {
        if ($project) {
            $this->authorize('view', $project);
        }

        $notifications = collect();

        /*
         * Resolusi project: endpoint bisa dipanggil dengan atau tanpa
         * project ID. Kalau tanpa project, pakai project pertama milik
         * user yang login (kalau ada).
         */
        $resolvedProject = $project->exists ?? false
            ? $project
            : ($request->user()?->projects()->first());

        if ($resolvedProject) {
            $notifications = $notifications->merge(
                $this->progressNotifications($resolvedProject)
            );

            $notifications = $notifications->merge(
                $this->completionNotifications($resolvedProject)
            );
        }

        /* Urutkan terbaru ke terlama, batasi 50 */
        $sorted = $notifications
            ->sortByDesc('created_at')
            ->values()
            ->take(50);

        return response()->json([
            'data' => $sorted,
            'meta' => [
                'total' => $sorted->count(),
                'unread' => $sorted->where('is_read', false)->count(),
                'project' => $resolvedProject?->id,
            ],
        ]);
    }

    /** Notifikasi dari 10 update progress terbaru. */
    private function progressNotifications(Project $project): Collection
    {
        $histories = PoleProgressHistory::with([
            'pole:id,pole_code',
            'workItem:id,name',
            'recordedBy:id,name',
        ])
            ->whereHas('pole', fn ($q) => $q->where('project_id', $project->id))
            ->orderByDesc('recorded_at')
            ->limit(10)
            ->get();

        return $histories->map(function (PoleProgressHistory $history, int $index) {
            $poleCode = $history->pole?->pole_code ?? "Tiang #{$history->pole_id}";
            $itemName = $history->workItem?->name ?? 'Pekerjaan';
            $userName = $history->recordedBy?->name ?? 'Tim lapangan';
            $progress = number_format((float) $history->progress_percent, 0);

            return [
                'id' => "progress-{$history->id}",
                'title' => "Progress {$poleCode} diperbarui",
                'description' => "{$userName} memperbarui {$itemName} ke {$progress}%.",
                'category' => 'progress',
                'created_at' => $history->recorded_at?->toIso8601String(),
                'read_at' => null,
                'is_read' => $index >= 3,   // tiga terbaru dianggap belum dibaca
                'href' => "/tiang/{$history->pole_id}",
            ];
        });
    }

    /** Notifikasi tiang yang sudah selesai 100% (maks 10). */
    private function completionNotifications(Project $project): Collection
    {
        /* Tiang selesai = semua progress item bobotnya 100%. Sebagai
           proxy sederhana: cari pole_work_progress dengan progress 100
           yang diperbarui dalam 7 hari terakhir. */
        $recent = PoleWorkProgress::with('pole:id,pole_code')
            ->whereHas('pole', fn ($q) => $q->where('project_id', $project->id))
            ->where('progress_percent', 100)
            ->where('updated_at', '>=', Carbon::now()->subDays(7))
            ->orderByDesc('updated_at')
            ->limit(10)
            ->get();

        return $recent->map(function (PoleWorkProgress $progress) {
            $poleCode = $progress->pole?->pole_code ?? "Tiang #{$progress->pole_id}";

            return [
                'id' => "done-{$progress->id}",
                'title' => "{$poleCode} mencapai 100%",
                'description' => "Item pekerjaan pada {$poleCode} sudah diselesaikan.",
                'category' => 'aktivitas',
                'created_at' => $progress->updated_at?->toIso8601String(),
                'read_at' => null,
                'is_read' => true,
                'href' => "/tiang/{$progress->pole_id}",
            ];
        });
    }
}
