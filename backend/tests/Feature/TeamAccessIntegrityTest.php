<?php

namespace Tests\Feature;

use App\Models\Invitation;
use App\Models\Pole;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use App\Services\TeamAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TeamAccessIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private function assignedTeam(?int $teamProject = null): array
    {
        $admin = User::factory()->admin()->create();
        $project = Project::create(['name' => 'Team assignment', 'code' => 'TEAM']);
        $team = Team::create(['name' => 'Field team', 'project_id' => $teamProject, 'status' => 'active']);
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'TEAM-1']);
        $anchor = User::factory()->pic()->create();
        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$anchor->id}/poles", ['pole_id' => $pole->id, 'team_id' => $team->id])->assertCreated();

        return [$admin, $project, $team, $pole];
    }

    public function test_member_added_after_assignment_receives_access_without_overwriting_existing_membership(): void
    {
        [$admin, $project, $team, $pole] = $this->assignedTeam();
        $member = User::factory()->pic()->create();
        $this->postJson("/api/teams/{$team->id}/members", ['user_id' => $member->id])->assertOk();
        $this->actingAs($member, 'sanctum')->getJson("/api/projects/{$project->id}/poles/{$pole->id}")->assertOk();
        $member->projects()->updateExistingPivot($project->id, ['role' => 'preserved-role']);
        $this->actingAs($admin, 'sanctum')->postJson("/api/teams/{$team->id}/members", ['user_id' => $member->id])->assertOk();
        $this->assertDatabaseHas('project_user', ['project_id' => $project->id, 'user_id' => $member->id, 'role' => 'preserved-role']);
    }

    public function test_removing_a_member_revokes_team_pole_access_but_keeps_project_membership(): void
    {
        [$admin, $project, $team, $pole] = $this->assignedTeam();
        $member = User::factory()->pic()->create();
        $member->projects()->attach($project);
        $this->postJson("/api/teams/{$team->id}/members", ['user_id' => $member->id])->assertOk();
        $this->deleteJson("/api/teams/{$team->id}/members/{$member->id}")->assertOk();
        $this->actingAs($member, 'sanctum')->getJson("/api/projects/{$project->id}/poles/{$pole->id}")->assertForbidden();
        $this->assertDatabaseHas('project_user', ['project_id' => $project->id, 'user_id' => $member->id]);
    }

    public function test_a_team_with_active_assignments_cannot_move_to_another_project(): void
    {
        [$admin, $project, $team] = $this->assignedTeam();
        $other = Project::create(['name' => 'Other', 'code' => 'OTHER']);
        $this->putJson("/api/teams/{$team->id}", ['project_id' => $other->id])->assertConflict();
        $this->assertNull($team->fresh()->project_id);
        $this->assertDatabaseHas('pole_assignments', ['team_id' => $team->id, 'status' => 'active']);
    }

    public function test_inactive_team_does_not_grant_indirect_pole_access(): void
    {
        [$admin, $project, $team, $pole] = $this->assignedTeam();
        $member = User::factory()->pic()->create();
        $member->projects()->attach($project);
        $team->users()->attach($member);
        $this->putJson("/api/teams/{$team->id}", ['status' => 'inactive'])->assertOk();
        $this->actingAs($member, 'sanctum')->getJson("/api/projects/{$project->id}/poles/{$pole->id}")->assertForbidden();
        $this->assertDatabaseHas('team_members', ['team_id' => $team->id, 'user_id' => $member->id]);
    }

    public function test_invited_member_of_an_unscoped_assigned_team_receives_project_access(): void
    {
        [$admin, $project, $team, $pole] = $this->assignedTeam();
        $token = str_repeat('b', 64);
        Invitation::create(['email' => 'new-team@example.test', 'role' => 'pic', 'team_id' => $team->id, 'invited_by' => $admin->id, 'status' => 'pending', 'expires_at' => now()->addDay(), 'token_hash' => Invitation::hashToken($token)]);
        $this->postJson("/api/invitations/{$token}/accept", ['name' => 'New member', 'password' => 'test-password', 'password_confirmation' => 'test-password'])->assertCreated();
        $member = User::where('email', 'new-team@example.test')->firstOrFail();
        $this->actingAs($member, 'sanctum')->getJson("/api/projects/{$project->id}/poles/{$pole->id}")->assertOk();
    }

    public function test_member_of_a_project_team_gets_membership_before_any_pole_assignment(): void
    {
        $admin = User::factory()->admin()->create();
        $project = Project::create(['name' => 'New project', 'code' => 'NEW']);
        $team = Team::create(['name' => 'New team', 'project_id' => $project->id, 'status' => 'active']);
        $member = User::factory()->pic()->create();
        $this->actingAs($admin, 'sanctum')->postJson("/api/teams/{$team->id}/members", ['user_id' => $member->id])->assertOk();
        $this->actingAs($member, 'sanctum')->getJson("/api/projects/{$project->id}")->assertOk();
    }

    public function test_moving_an_unassigned_team_preserves_old_memberships_and_grants_the_new_project(): void
    {
        $admin = User::factory()->admin()->create();
        $old = Project::create(['name' => 'Old', 'code' => 'OLD']);
        $new = Project::create(['name' => 'New', 'code' => 'NEW']);
        $team = Team::create(['name' => 'Team', 'project_id' => $old->id, 'status' => 'active']);
        $member = User::factory()->pic()->create();
        $team->users()->attach($member);
        $member->projects()->attach($old, ['role' => 'legacy-role']);
        $this->actingAs($admin, 'sanctum')->putJson("/api/teams/{$team->id}", ['project_id' => $new->id])->assertOk();
        $this->assertDatabaseHas('project_user', ['user_id' => $member->id, 'project_id' => $old->id, 'role' => 'legacy-role']);
        $this->assertDatabaseHas('project_user', ['user_id' => $member->id, 'project_id' => $new->id]);
    }

    public function test_failed_project_grant_rolls_back_the_team_membership(): void
    {
        [$admin, $project, $team] = $this->assignedTeam();
        $member = User::factory()->pic()->create();
        $this->mock(TeamAccess::class)->shouldReceive('grantProjects')->once()->andThrow(new \RuntimeException('Fixture failure'));
        $this->postJson("/api/teams/{$team->id}/members", ['user_id' => $member->id])->assertStatus(500);
        $this->assertDatabaseMissing('team_members', ['team_id' => $team->id, 'user_id' => $member->id]);
        $this->assertDatabaseMissing('project_user', ['project_id' => $project->id, 'user_id' => $member->id]);
    }
}
