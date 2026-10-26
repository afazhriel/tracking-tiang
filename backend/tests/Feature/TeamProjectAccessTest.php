<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TeamProjectAccessTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $owner, string $code = 'OWN'): Project
    {
        $project = Project::create(['name' => $code, 'code' => $code, 'target_quantity' => 100, 'unit_code' => 'unit']);
        $project->forceFill(['owner_user_id' => $owner->id])->save();

        return $project;
    }

    private function team(Project $project): Team
    {
        return Team::create(['name' => 'Tim proyek', 'project_id' => $project->id, 'status' => 'active']);
    }

    public function test_owner_of_each_role_can_manage_own_team_but_cannot_transfer_to_foreign_project(): void
    {
        foreach (['admin', 'supervisor', 'pic'] as $role) {
            $owner = User::factory()->create(['role' => $role, 'status' => 'active']);
            $project = $this->project($owner, $role);
            $teamId = $this->actingAs($owner, 'sanctum')->postJson('/api/teams', ['name' => 'Tim', 'project_id' => $project->id])
                ->assertCreated()->assertJsonPath('can_manage', true)->json('id');
            $member = User::factory()->pic()->create();
            $this->postJson("/api/teams/$teamId/members", ['user_id' => $member->id, 'role' => 'Ketua'])->assertOk();
            $this->assertDatabaseHas('team_members', ['team_id' => $teamId, 'user_id' => $member->id, 'role' => 'Ketua']);
            $this->assertSame('pic', $member->fresh()->role);
            $this->putJson("/api/teams/$teamId", ['name' => 'Tim baru'])->assertOk()->assertJsonPath('name', 'Tim baru');
            if ($role !== 'admin') {
                $foreign = $this->project(User::factory()->pic()->create(), 'foreign-'.$role);
                $this->putJson("/api/teams/$teamId", ['project_id' => $foreign->id])->assertForbidden();
                $this->postJson('/api/teams', ['name' => 'Illegal', 'project_id' => $foreign->id])->assertForbidden();
                $this->assertDatabaseHas('teams', ['id' => $teamId, 'project_id' => $project->id]);
            }
        }
    }

    public function test_non_owner_supervisor_and_pic_can_browse_but_cannot_manage_or_list_foreign_teams(): void
    {
        $project = $this->project(User::factory()->pic()->create());
        $team = $this->team($project);
        $other = $this->project(User::factory()->pic()->create(), 'OTHER');
        $foreign = $this->team($other);
        foreach (['supervisor', 'pic'] as $role) {
            $viewer = User::factory()->create(['role' => $role, 'status' => 'active']);
            $team->users()->attach($viewer);
            $this->actingAs($viewer, 'sanctum')->getJson('/api/teams?project_id='.$project->id)->assertOk()->assertJsonCount(1)->assertJsonPath('0.can_manage', false);
            $this->getJson('/api/teams?project_id='.$other->id)->assertForbidden();
            $this->getJson('/api/teams/'.$foreign->id)->assertForbidden();
            $this->getJson('/api/teams/'.$team->id)->assertOk();
            $this->getJson('/api/teams/'.$team->id.'/assignments')->assertOk();
            $this->putJson('/api/teams/'.$team->id, ['name' => 'Changed'])->assertForbidden();
            $this->postJson('/api/teams/'.$team->id.'/members', ['user_id' => $viewer->id])->assertForbidden();
            $this->deleteJson('/api/teams/'.$team->id.'/members/'.$viewer->id)->assertForbidden();
            $this->getJson('/api/projects/'.$project->id.'/team-candidates')->assertForbidden();
            $this->getJson('/api/users')->assertForbidden();
        }
        $this->assertDatabaseHas('teams', ['id' => $team->id, 'name' => 'Tim proyek']);
    }

    public function test_derived_access_revokes_without_deleting_direct_access_or_another_teams_grant(): void
    {
        $owner = User::factory()->pic()->create();
        $project = $this->project($owner);
        $first = $this->team($project);
        $second = $this->team($project);
        $member = User::factory()->pic()->create();
        $this->actingAs($owner, 'sanctum');
        $this->postJson("/api/teams/{$first->id}/members", ['user_id' => $member->id])->assertOk();
        $this->assertTrue($member->canAccessProject($project->id));
        $this->assertDatabaseMissing('project_user', ['user_id' => $member->id, 'project_id' => $project->id]);
        $this->postJson("/api/teams/{$second->id}/members", ['user_id' => $member->id])->assertOk();
        $this->deleteJson("/api/teams/{$first->id}/members/{$member->id}")->assertOk()->assertJsonPath('project_access_remaining', true);
        $this->putJson("/api/teams/{$second->id}", ['status' => 'inactive'])->assertOk();
        $this->actingAs($member, 'sanctum')->getJson("/api/projects/{$project->id}")->assertForbidden();
        $this->actingAs($owner, 'sanctum')->putJson("/api/teams/{$second->id}", ['status' => 'active'])->assertOk();
        $member->projects()->attach($project, ['role' => 'legitimate-direct']);
        $this->deleteJson("/api/teams/{$second->id}/members/{$member->id}")->assertOk()->assertJsonPath('project_access_remaining', true);
        $this->assertDatabaseHas('project_user', ['project_id' => $project->id, 'user_id' => $member->id, 'role' => 'legitimate-direct']);
    }

    public function test_direct_membership_can_be_added_and_removed_independently_of_team_access(): void
    {
        $owner = User::factory()->pic()->create();
        $project = $this->project($owner);
        $team = $this->team($project);
        $member = User::factory()->pic()->create();
        $team->users()->attach($member);
        $this->actingAs($owner, 'sanctum')->postJson("/api/projects/{$project->id}/members", ['user_id' => $member->id])->assertCreated();
        $this->deleteJson("/api/projects/{$project->id}/members/{$member->id}")->assertOk()->assertJsonPath('access_remaining', true);
        $this->assertDatabaseMissing('project_user', ['project_id' => $project->id, 'user_id' => $member->id]);
        $this->deleteJson("/api/teams/{$team->id}/members/{$member->id}")->assertOk();
        $this->assertFalse($member->canAccessProject($project->id));
    }

    public function test_team_only_assignment_does_not_create_a_direct_user_grant_and_preserves_history(): void
    {
        $owner = User::factory()->pic()->create();
        $project = $this->project($owner);
        $team = $this->team($project);
        $member = User::factory()->pic()->create();
        $team->users()->attach($member);
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'OWN-1']);
        $other = $this->project(User::factory()->pic()->create(), 'OTHER');
        $foreign = Pole::create(['project_id' => $other->id, 'pole_code' => 'OTHER-1']);
        $this->actingAs($owner, 'sanctum')->postJson("/api/teams/{$team->id}/assignments", ['pole_id' => $foreign->id])->assertUnprocessable();
        $assignmentId = $this->postJson("/api/teams/{$team->id}/assignments", ['pole_id' => $pole->id])->assertCreated()->json('id');
        $this->postJson("/api/teams/{$team->id}/assignments", ['pole_id' => $pole->id])->assertOk()->assertJsonPath('id', $assignmentId);
        $this->assertDatabaseHas('pole_assignments', ['id' => $assignmentId, 'user_id' => null, 'team_id' => $team->id]);
        $this->assertDatabaseCount('project_user', 0);
        $this->actingAs($member, 'sanctum')->getJson("/api/projects/{$project->id}/poles/{$pole->id}")->assertOk();
        $this->postJson("/api/teams/{$team->id}/assignments", ['pole_id' => $pole->id])->assertForbidden();
        $this->actingAs($owner, 'sanctum')->deleteJson("/api/teams/{$team->id}/assignments/$assignmentId")->assertOk();
        $this->assertDatabaseHas('pole_assignments', ['id' => $assignmentId, 'status' => 'revoked']);
        $this->actingAs($member, 'sanctum')->getJson("/api/projects/{$project->id}/poles/{$pole->id}")->assertForbidden();
    }

    public function test_candidates_are_project_scoped_and_exact_email_does_not_list_every_user(): void
    {
        $owner = User::factory()->pic()->create();
        $project = $this->project($owner);
        $outside = User::factory()->pic()->create(['email' => 'outside@example.test']);
        $this->actingAs($owner, 'sanctum')->getJson("/api/projects/{$project->id}/team-candidates")->assertOk()->assertJsonMissing(['id' => $outside->id]);
        $this->getJson("/api/projects/{$project->id}/team-candidates?email=outside")->assertUnprocessable();
        $this->getJson("/api/projects/{$project->id}/team-candidates?email=outside@example.test")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $outside->id);
    }

    public function test_validation_and_suspended_accounts_cannot_mutate_membership(): void
    {
        $owner = User::factory()->pic()->create();
        $project = $this->project($owner);
        $team = $this->team($project);
        $suspended = User::factory()->pic()->create(['status' => 'suspended']);
        $this->actingAs($owner, 'sanctum')->postJson('/api/teams', ['name' => 'Unscoped'])->assertUnprocessable()->assertJsonValidationErrors('project_id');
        $this->putJson("/api/teams/{$team->id}", ['status' => 'anything'])->assertUnprocessable();
        $this->postJson("/api/teams/{$team->id}/members", ['user_id' => $suspended->id])->assertUnprocessable();
        $this->assertDatabaseCount('team_members', 0);
        $owner->update(['status' => 'suspended']);
        $this->actingAs($owner->fresh(), 'sanctum')->putJson("/api/teams/{$team->id}", ['name' => 'No'])->assertForbidden();
    }

    public function test_moving_and_deactivating_team_updates_derived_access_only(): void
    {
        $owner = User::factory()->pic()->create();
        $old = $this->project($owner);
        $new = $this->project($owner, 'NEW');
        $team = $this->team($old);
        $member = User::factory()->pic()->create();
        $team->users()->attach($member);
        $this->actingAs($owner, 'sanctum')->putJson("/api/teams/{$team->id}", ['project_id' => $new->id])->assertOk();
        $this->assertFalse($member->canAccessProject($old->id));
        $this->assertTrue($member->canAccessProject($new->id));
        $this->putJson("/api/teams/{$team->id}", ['status' => 'inactive'])->assertOk();
        $this->assertFalse($member->canAccessProject($new->id));
        $this->assertDatabaseHas('team_members', ['team_id' => $team->id, 'user_id' => $member->id]);
    }
}
