<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Notifikasi per-user yang tersimpan di tabel `notifications`.
 *
 * Field yang dibaca frontend (NotifikasiPage):
 *   id, category, title, description, created_at, read_at, is_read, href
 */
class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return $this->listForUser($request);
    }

    public function projectIndex(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        return $this->listForUser($request, $project->id);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $count = Notification::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->count();

        return response()->json([
            'data' => ['unread' => $count],
            'meta' => ['unread' => $count],
        ]);
    }

    public function markRead(Request $request, Notification $notification): JsonResponse
    {
        $this->authorizeOwnership($request, $notification);

        if (! $notification->isRead()) {
            $notification->forceFill(['read_at' => now()])->save();
        }

        return response()->json([
            'message' => 'Notifikasi ditandai sudah dibaca.',
            'data' => $notification->fresh()->toPayload(),
        ]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $values = $request->validate(['project_id' => ['nullable', 'integer', 'exists:projects,id']]);
        if (isset($values['project_id'])) {
            $this->authorize('view', Project::findOrFail($values['project_id']));
        }
        $updated = Notification::query()
            ->where('user_id', $request->user()->id)
            ->when($values['project_id'] ?? null, fn ($query, $id) => $query->where('project_id', $id))
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json([
            'message' => 'Semua notifikasi ditandai sudah dibaca.',
            'data' => ['updated' => $updated],
        ]);
    }

    private function listForUser(Request $request, ?int $projectId = null): JsonResponse
    {
        $userId = $request->user()->id;

        $base = Notification::query()->where('user_id', $userId);

        if ($projectId !== null) {
            $base->where('project_id', $projectId);
        }

        $unread = (clone $base)->whereNull('read_at')->count();

        $pagination = $request->validate(['limit' => ['sometimes', 'integer', 'min:1', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $limit = $pagination['limit'] ?? 50;
        $page = $pagination['page'] ?? 1;
        $notifications = (clone $base)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->forPage($page, $limit)
            ->get()
            ->map(fn (Notification $notification) => $notification->toPayload());

        return response()->json([
            'data' => $notifications,
            'meta' => [
                'total' => $base->count(),
                'page' => $page,
                'per_page' => $limit,
                'unread' => $unread,
                'project' => $projectId,
            ],
        ]);
    }

    private function authorizeOwnership(Request $request, Notification $notification): void
    {
        abort_unless(
            (int) $notification->user_id === (int) $request->user()->id,
            403
        );
    }
}
