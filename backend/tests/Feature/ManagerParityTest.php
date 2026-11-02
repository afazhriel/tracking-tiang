<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ManagerParityTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_admin_and_supervisor_manage_unowned_projects_without_membership(): void
    {
        $owner = User::factory()->pic()->create();
        $project = Project::create(['name' => 'Foreign', 'code' => 'FOREIGN', 'target_quantity' => 100]);
        $project->forceFill(['owner_user_id' => $owner->id])->save();
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'P-1']);
        foreach (['admin', 'supervisor'] as $role) {
            $user = User::factory()->create(['role' => $role, 'status' => 'active']);
            $this->actingAs($user, 'sanctum');
            $this->getJson("/api/projects/{$project->id}")->assertOk();
            $this->getJson("/api/projects/{$project->id}/poles/{$pole->id}")->assertOk();
            $this->getJson("/api/projects/{$project->id}/members")->assertOk();
            $this->getJson('/api/users')->assertOk();
            $this->postJson("/api/projects/{$project->id}/work-items", ['name' => $role, 'weight_percent' => 100])->assertCreated();
            $this->postJson('/api/projects', ['name' => $role, 'code' => strtoupper($role), 'target_quantity' => 100, 'unit_code' => 'unit'])->assertCreated();
            $this->assertSame($role, $user->fresh()->role);
        }
        $this->actingAs(User::factory()->pic()->create(), 'sanctum');
        $this->getJson("/api/projects/{$project->id}")->assertForbidden();
        $this->postJson('/api/projects', ['name' => 'Blocked', 'code' => 'BLOCK', 'target_quantity' => 100, 'unit_code' => 'unit'])->assertForbidden();
    }

    public function test_supervisor_quantity_realization_matches_curve_and_work_summary(): void
    {
        $project = Project::create(['name' => 'Tracking Tank', 'code' => 'TANKI', 'progress_source' => 'quantity_entries', 'target_quantity' => 100, 'unit_code' => 'unit']);
        $this->actingAs(User::factory()->supervisor()->create(), 'sanctum');
        $this->postJson("/api/projects/{$project->id}/quantities", ['quantity_delta' => 25, 'request_key' => 'manager-parity-quantity'])->assertSuccessful();
        $this->getJson("/api/projects/{$project->id}/curve")->assertOk()->assertJsonPath('actual_current_percent', 25)->assertJsonPath('actual_curve.0.progress_percent', 25);
        $this->getJson("/api/projects/{$project->id}/work-items?scope=aggregate")->assertOk()->assertJsonPath('meta.actual_current_percent', 25)->assertJsonPath('meta.total_weight', null);
    }

    public function test_inactive_managers_are_denied_and_last_real_admin_cannot_be_demoted(): void
    {
        $admin = User::factory()->admin()->create();
        $supervisor = User::factory()->supervisor()->create();
        $this->actingAs($supervisor, 'sanctum')->putJson("/api/users/{$admin->id}", ['role' => 'pic'])->assertUnprocessable();
        $this->assertSame('admin', $admin->fresh()->role);
        foreach (['admin', 'supervisor'] as $role) {
            foreach (['pending', 'suspended'] as $status) {
                $user = User::factory()->create(['role' => $role, 'status' => $status]);
                $this->assertFalse($user->canAdminister());
                $this->actingAs($user, 'sanctum')->getJson('/api/users')->assertForbidden();
                $this->postJson('/api/projects', [])->assertForbidden();
            }
        }
    }
}
