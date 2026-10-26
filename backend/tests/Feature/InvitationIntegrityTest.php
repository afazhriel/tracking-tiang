<?php

namespace Tests\Feature;

use App\Models\Invitation;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class InvitationIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private function invitation(array $attributes = []): Invitation
    {
        return Invitation::create([...[
            'email' => 'invited@example.test', 'name' => 'Invited', 'role' => 'pic',
            'token_hash' => Invitation::hashToken(str_repeat('a', 64)),
            'expires_at' => now()->addDay(), 'status' => 'pending',
            'invited_by' => User::factory()->admin()->create()->id,
        ], ...$attributes]);
    }

    private function accept()
    {
        return $this->postJson('/api/invitations/'.str_repeat('a', 64).'/accept', [
            'name' => 'New member', 'password' => 'fixture-password', 'password_confirmation' => 'fixture-password',
        ]);
    }

    public function test_team_invitation_creates_project_access_and_can_only_be_accepted_once(): void
    {
        $project = Project::create(['name' => 'Team project', 'code' => 'INVITE']);
        $team = Team::create(['name' => 'Team', 'project_id' => $project->id]);
        $invitation = $this->invitation(['team_id' => $team->id]);
        $response = $this->accept()->assertCreated()->assertJsonStructure(['token', 'user']);
        $userId = $response->json('user.id');
        $this->assertDatabaseHas('team_members', ['team_id' => $team->id, 'user_id' => $userId]);
        // A team invitation creates derived access, never a direct grant.
        $this->assertDatabaseMissing('project_user', ['project_id' => $project->id, 'user_id' => $userId]);
        $this->assertTrue(User::findOrFail($userId)->canAccessProject($project->id));
        $this->assertSame('accepted', $invitation->fresh()->status);
        $this->accept()->assertForbidden();
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_failure_when_marking_accepted_does_not_leave_an_active_account_or_membership(): void
    {
        config(['app.debug' => false]);
        $project = Project::create(['name' => 'Invite project', 'code' => 'FAIL']);
        $this->invitation(['project_id' => $project->id]);
        Event::listen('eloquent.updating: '.Invitation::class, function () {
            throw new \RuntimeException('Simulated invitation persistence failure');
        });
        $this->accept()->assertStatus(500);
        $this->assertDatabaseMissing('users', ['email' => 'invited@example.test']);
        $this->assertDatabaseCount('project_user', 0);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseHas('invitations', ['email' => 'invited@example.test', 'status' => 'pending']);
    }

    public function test_explicitly_expired_invitation_is_rejected_even_if_timestamp_is_in_the_future(): void
    {
        $this->invitation(['status' => 'expired']);
        $this->getJson('/api/invitations/'.str_repeat('a', 64))->assertForbidden();
        $this->accept()->assertForbidden();
        $this->assertDatabaseMissing('users', ['email' => 'invited@example.test']);
    }
}
