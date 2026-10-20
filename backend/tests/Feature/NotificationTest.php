<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Pole;
use App\Models\Project;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Notifikasi nyata (tabel `notifications`): dibuat saat progress dicatat,
 * dibaca per-user, dan status read/unread-nya bisa diubah.
 */
class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private function makeProject(): Project
    {
        return Project::create([
            'name' => 'Proyek Notif',
            'code' => 'PRJ-NOTIF',
            'status' => 'active',
        ]);
    }

    private function member(Project $project): User
    {
        $pic = User::factory()->pic()->create();
        $pic->projects()->attach($project->id);

        return $pic;
    }

    private function templateAndPole(User $admin, Project $project): Pole
    {
        WorkItem::create([
            'project_id' => $project->id,
            'pole_id' => null,
            'name' => 'Pondasi',
            'weight_percent' => 100,
            'sequence' => 1,
            'is_active' => true,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles", [
                'pole_code' => 'N-1',
            ])
            ->assertCreated();

        return Pole::findOrFail($response->json('data.id'));
    }

    public function test_progress_creates_notification_for_members_but_not_actor(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();
        $pic = $this->member($project);

        $pole = $this->templateAndPole($admin, $project);
        $item = $pole->workItems()->firstOrFail();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $item->id,
                'progress_percent' => 50,
            ])
            ->assertOk();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $pic->id,
            'category' => 'progress',
        ]);

        $this->assertSame(
            0,
            Notification::where('user_id', $admin->id)->count()
        );
    }

    public function test_completing_pole_creates_completion_notification(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();
        $pic = $this->member($project);

        $pole = $this->templateAndPole($admin, $project);
        $item = $pole->workItems()->firstOrFail();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $item->id,
                'progress_percent' => 100,
            ])
            ->assertOk();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $pic->id,
            'category' => 'aktivitas',
        ]);
    }

    public function test_index_returns_only_current_user_notifications(): void
    {
        $project = $this->makeProject();
        $pic = $this->member($project);
        $other = $this->member($project);

        Notification::create([
            'user_id' => $pic->id,
            'project_id' => $project->id,
            'category' => 'sistem',
            'title' => 'Milik PIC',
        ]);

        Notification::create([
            'user_id' => $other->id,
            'project_id' => $project->id,
            'category' => 'sistem',
            'title' => 'Milik orang lain',
        ]);

        $response = $this->actingAs($pic, 'sanctum')
            ->getJson('/api/notifications')
            ->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Milik PIC', $response->json('data.0.title'));
        $this->assertSame(1, $response->json('meta.unread'));
    }

    public function test_unread_count_and_read_all(): void
    {
        $project = $this->makeProject();
        $pic = $this->member($project);

        foreach (['Satu', 'Dua'] as $title) {
            Notification::create([
                'user_id' => $pic->id,
                'project_id' => $project->id,
                'category' => 'sistem',
                'title' => $title,
            ]);
        }

        $this->actingAs($pic, 'sanctum')
            ->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('meta.unread', 2);

        $this->actingAs($pic, 'sanctum')
            ->postJson('/api/notifications/read-all')
            ->assertOk();

        $this->actingAs($pic, 'sanctum')
            ->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('meta.unread', 0);
    }

    public function test_mark_single_notification_as_read(): void
    {
        $project = $this->makeProject();
        $pic = $this->member($project);

        $notification = Notification::create([
            'user_id' => $pic->id,
            'project_id' => $project->id,
            'category' => 'sistem',
            'title' => 'Baca saya',
        ]);

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/notifications/{$notification->id}/read")
            ->assertOk()
            ->assertJsonPath('data.is_read', true);

        $this->assertNotNull($notification->fresh()->read_at);
    }

    public function test_cannot_mark_other_users_notification_as_read(): void
    {
        $project = $this->makeProject();
        $pic = $this->member($project);
        $other = $this->member($project);

        $notification = Notification::create([
            'user_id' => $other->id,
            'project_id' => $project->id,
            'category' => 'sistem',
            'title' => 'Bukan milikmu',
        ]);

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/notifications/{$notification->id}/read")
            ->assertStatus(403);
    }

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }
}
