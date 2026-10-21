<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\Pole;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Pusat pembuatan notifikasi.
 *
 * Notifikasi bersifat per-user. Untuk event yang berkaitan dengan
 * project (mis. progress baru), penerimanya adalah seluruh user aktif
 * yang punya akses ke project tersebut, kecuali pelaku aksi.
 */
class NotificationService
{
    public function send(
        int $userId,
        ?int $projectId,
        string $category,
        string $title,
        ?string $description = null,
        ?string $href = null,
        array $data = []
    ): Notification {
        return Notification::create([
            'user_id' => $userId,
            'project_id' => $projectId,
            'category' => $category,
            'title' => mb_substr($title, 0, 255),
            'description' => $description,
            'href' => $href,
            'data' => $data ?: null,
        ]);
    }

    /**
     * Kirim ke seluruh user yang punya akses project, kecuali $exceptUserId.
     *
     * @return Collection<int, Notification>
     */
    public function sendToProjectMembers(
        Project $project,
        string $category,
        string $title,
        ?string $description = null,
        ?string $href = null,
        array $data = [],
        ?int $exceptUserId = null,
        ?Pole $pole = null
    ): Collection {
        $recipients = User::whereIn('id', $this->projectRecipientIds($project))->get()
            ->filter(fn (User $user) => $user->isActive() && ($pole === null || $user->can('view', $pole)))
            ->map(fn (User $user) => (int) $user->id);

        if ($exceptUserId !== null) {
            $recipients = $recipients->reject(fn (int $id) => $id === $exceptUserId);
        }

        return $recipients->map(
            fn (int $userId) => $this->send(
                $userId,
                $project->id,
                $category,
                $title,
                $description,
                $href,
                $data
            )
        );
    }

    /**
     * ID user yang boleh menerima notifikasi project ini:
     * anggota `project_user` + seluruh admin/supervisor aktif.
     *
     * @return Collection<int, int>
     */
    private function projectRecipientIds(Project $project): Collection
    {
        $members = DB::table('project_user')
            ->where('project_id', $project->id)
            ->pluck('user_id');

        $managers = User::query()
            ->whereIn('role', [User::ROLE_ADMIN, User::ROLE_SUPERVISOR])
            ->pluck('id');

        return $members
            ->merge($managers)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
    }
}
