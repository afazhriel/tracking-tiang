<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_pic_can_read_notifications_for_an_assigned_project(): void
    {
        $pic = User::factory()->create(['role' => 'pic', 'status' => 'active']);
        $project = Project::create(['name' => 'Assigned project', 'code' => 'NOTIFY-1']);
        $pic->projects()->attach($project);

        $this->actingAs($pic, 'sanctum')->getJson("/api/projects/{$project->id}/notifications")
            ->assertOk()->assertJsonPath('meta.project', $project->id);
    }

    public function test_pic_cannot_read_an_unassigned_projects_notifications(): void
    {
        $pic = User::factory()->create(['role' => 'pic', 'status' => 'active']);
        $project = Project::create(['name' => 'Other project', 'code' => 'NOTIFY-2']);

        $this->actingAs($pic, 'sanctum')->getJson("/api/projects/{$project->id}/notifications")
            ->assertForbidden();
    }

    public function test_global_notifications_are_not_restricted_to_the_first_project(): void
    {
        $pic = User::factory()->create(['role' => 'pic', 'status' => 'active']);
        $project = Project::create(['name' => 'Assigned project', 'code' => 'NOTIFY-3']);
        $pic->projects()->attach($project);

        $this->actingAs($pic, 'sanctum')->getJson('/api/notifications')
            ->assertOk()->assertJsonPath('meta.project', null);
    }
}
