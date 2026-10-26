<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectTeamAssignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_project_team_and_assign_a_pole_that_the_pic_can_access(): void
    {
        $admin = User::factory()->admin()->create();
        $pic = User::factory()->pic()->create();
        $this->actingAs($admin, 'sanctum');
        $projectId = $this->postJson('/api/projects', ['name' => 'Project flow', 'code' => 'FLOW', 'target_quantity' => '100', 'unit_code' => 'pole'])->assertCreated()->json('data.id');
        $teamId = $this->postJson('/api/teams', ['name' => 'Field team', 'project_id' => $projectId])->assertCreated()->json('id');
        $this->postJson("/api/teams/{$teamId}/members", ['user_id' => $pic->id])->assertOk();
        $poleId = $this->postJson("/api/projects/{$projectId}/poles", ['pole_code' => 'FLOW-1'])->assertCreated()->json('data.id');
        $this->postJson("/api/users/{$pic->id}/poles", ['pole_id' => $poleId, 'team_id' => $teamId])->assertCreated()->assertJsonPath('pole.pole_code', 'FLOW-1');
        $this->getJson("/api/users/{$pic->id}/poles")->assertOk()->assertJsonPath('0.pole.pole_code', 'FLOW-1');
        $this->actingAs($pic, 'sanctum')->getJson("/api/projects/{$projectId}/poles/{$poleId}")->assertOk();
        $this->postJson('/api/projects', ['name' => 'Own project', 'code' => 'OWN', 'target_quantity' => '100', 'unit_code' => 'unit'])->assertCreated();
        $this->postJson("/api/teams/{$teamId}/members", ['user_id' => $admin->id])->assertForbidden();
        $this->actingAs($admin, 'sanctum')->deleteJson("/api/users/{$pic->id}/poles/{$poleId}")->assertOk();
        $this->assertDatabaseHas('pole_assignments', ['pole_id' => $poleId, 'user_id' => $pic->id, 'status' => 'revoked']);
    }

    public function test_direct_assignment_grants_project_membership_without_replacing_an_existing_role(): void
    {
        $admin = User::factory()->admin()->create();
        $pic = User::factory()->pic()->create();
        $project = Project::create(['name' => 'Assignment', 'code' => 'ASSIGN']);
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'A-1']);
        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$pic->id}/poles", ['pole_id' => $pole->id])->assertCreated();
        $this->actingAs($pic, 'sanctum')->getJson("/api/projects/{$project->id}/poles/{$pole->id}")->assertOk();
        $pic->projects()->updateExistingPivot($project->id, ['role' => 'custom-existing-role']);
        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$pic->id}/poles", ['pole_id' => $pole->id])->assertOk();
        $this->assertDatabaseHas('project_user', ['project_id' => $project->id, 'user_id' => $pic->id, 'role' => 'custom-existing-role']);
    }

    public function test_assignment_rejects_a_team_from_another_project(): void
    {
        $admin = User::factory()->admin()->create();
        $pic = User::factory()->pic()->create();
        $first = Project::create(['name' => 'First', 'code' => 'FIRST']);
        $second = Project::create(['name' => 'Second', 'code' => 'SECOND']);
        $pole = Pole::create(['project_id' => $first->id, 'pole_code' => 'FIRST-1']);
        $team = Team::create(['name' => 'Foreign team', 'project_id' => $second->id, 'status' => 'active']);
        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$pic->id}/poles", ['pole_id' => $pole->id, 'team_id' => $team->id])->assertUnprocessable();
        $this->assertDatabaseCount('pole_assignments', 0);
    }
}
