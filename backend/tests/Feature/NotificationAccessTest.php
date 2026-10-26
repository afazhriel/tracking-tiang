<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Pole;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_progress_notifies_only_active_authorized_viewers_and_never_the_actor(): void
    {
        $project = Project::create(['name' => 'Notify', 'code' => 'NOTIFY']);
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => str_repeat('X', 255)]);
        $item = $project->workItems()->create(['pole_id' => $pole->id, 'name' => 'Pekerjaan', 'weight_percent' => 100]);
        $actor = User::factory()->admin()->create();
        $manager = User::factory()->supervisor()->create();
        $assigned = User::factory()->pic()->create();
        $unassigned = User::factory()->pic()->create();
        $suspended = User::factory()->admin()->create(['status' => 'suspended']);
        $pending = User::factory()->admin()->create(['status' => 'pending']);
        // Supervisors must explicitly belong to this project; their
        // global role alone cannot expose a different project's data.
        $manager->projects()->attach($project);
        foreach ([$assigned, $unassigned] as $user) {
            $user->projects()->attach($project);
        }
        $assigned->poleAssignments()->create(['pole_id' => $pole->id, 'assigned_at' => now(), 'status' => 'active']);
        $this->actingAs($actor, 'sanctum')->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", ['work_item_id' => $item->id, 'progress_percent' => 50])->assertOk();
        $this->assertEqualsCanonicalizing([$manager->id, $assigned->id], Notification::pluck('user_id')->all());
        foreach ([$actor, $unassigned, $suspended, $pending] as $user) {
            $this->assertDatabaseMissing('notifications', ['user_id' => $user->id]);
        }
        $this->assertLessThanOrEqual(255, mb_strlen(Notification::first()->title));
        $this->actingAs($manager, 'sanctum')->getJson("/api/projects/{$project->id}/poles/{$pole->id}/work-items")->assertOk()->assertJsonPath('meta.can_manage', false);
        $this->actingAs($assigned, 'sanctum')->getJson("/api/projects/{$project->id}/poles/{$pole->id}/work-items")->assertOk()->assertJsonPath('meta.can_manage', true);
        $this->actingAs($unassigned, 'sanctum')->getJson("/api/projects/{$project->id}/activities?pole_id={$pole->id}")->assertForbidden();
        $this->getJson("/api/projects/{$project->id}/activities")->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/projects/{$project->id}/poles/{$pole->id}/curve")->assertForbidden();
        $this->getJson("/api/projects/{$project->id}/work-items/{$item->id}")->assertForbidden();
    }

    public function test_read_all_can_be_limited_to_one_project_and_preserves_other_users_and_read_timestamps(): void
    {
        $user = User::factory()->admin()->create();
        $other = User::factory()->admin()->create();
        $first = Project::create(['name' => 'First', 'code' => 'FIRST']);
        $second = Project::create(['name' => 'Second', 'code' => 'SECOND']);
        $own = Notification::create(['user_id' => $user->id, 'project_id' => $first->id, 'title' => 'Own']);
        $alreadyRead = Notification::create(['user_id' => $user->id, 'project_id' => $first->id, 'title' => 'Read', 'read_at' => '2026-01-01 12:00:00']);
        $elsewhere = Notification::create(['user_id' => $user->id, 'project_id' => $second->id, 'title' => 'Other project']);
        $foreign = Notification::create(['user_id' => $other->id, 'project_id' => $first->id, 'title' => 'Other user']);
        $this->actingAs($user, 'sanctum')->postJson('/api/notifications/read-all', ['project_id' => $first->id])->assertOk()->assertJsonPath('data.updated', 1);
        $this->assertNotNull($own->fresh()->read_at);
        $this->assertSame('2026-01-01 12:00:00', $alreadyRead->fresh()->read_at->format('Y-m-d H:i:s'));
        $this->assertNull($elsewhere->fresh()->read_at);
        $this->assertNull($foreign->fresh()->read_at);
        $this->postJson('/api/notifications/read-all', ['project_id' => $first->id])->assertOk()->assertJsonPath('data.updated', 0);
        $this->getJson('/api/notifications/unread-count')->assertOk()->assertJsonPath('data.unread', 1);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_pagination_is_bounded_and_single_read_is_idempotent(): void
    {
        $user = User::factory()->pic()->create();
        $notification = Notification::create(['user_id' => $user->id, 'title' => 'One']);
        Notification::create(['user_id' => $user->id, 'title' => 'Two']);
        $this->actingAs($user, 'sanctum')->getJson('/api/notifications?limit=1&page=2')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2);
        $this->getJson('/api/notifications?limit=1000')->assertUnprocessable();
        $readAt = $this->postJson("/api/notifications/{$notification->id}/read")->assertOk()->json('data.read_at');
        $this->travel(1)->hours();
        $this->postJson("/api/notifications/{$notification->id}/read")->assertOk()->assertJsonPath('data.read_at', $readAt);
    }
}
