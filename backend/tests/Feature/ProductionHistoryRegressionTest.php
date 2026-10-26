<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProductionHistoryRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_team_changes_preserve_quantity_timeline_and_legacy_project_records(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 26)->setTime(12, 0));
        $owner = User::factory()->pic()->create();
        $legacy = Project::create(['name' => 'Tiang', 'code' => 'TT-001', 'target_quantity' => 10, 'unit_code' => 'pole', 'progress_source' => 'pole_weighted']);
        $pole = Pole::create(['project_id' => $legacy->id, 'pole_code' => 'TT-history']);
        $tank = Project::create(['name' => 'Tanki', 'code' => 'TANKI --01', 'target_quantity' => 100, 'unit_code' => 'unit', 'progress_source' => 'quantity_entries', 'start_date' => '2026-10-01', 'end_date' => '2026-10-31']);
        $tank->forceFill(['owner_user_id' => $owner->id])->save();
        $payload = ['quantity_delta' => '25.0000', 'recorded_at' => '2026-10-20 12:00:00', 'request_key' => 'history-request-001', 'notes' => 'Histori dipertahankan'];
        $this->actingAs($owner, 'sanctum')->postJson("/api/projects/{$tank->id}/quantities", $payload)->assertCreated()->assertJsonPath('summary.actual_current_percent', 25);
        $this->postJson("/api/projects/{$tank->id}/quantities", $payload)->assertOk();
        $this->postJson("/api/projects/{$tank->id}/quantities", [...$payload, 'quantity_delta' => '30'])->assertConflict();
        $this->postJson("/api/projects/{$tank->id}/quantities", [...$payload, 'request_key' => 'negative-correction', 'quantity_delta' => '-30'])->assertUnprocessable();
        $beforeEntries = DB::table('project_quantity_entries')->get()->toJson();
        $beforeProject = $legacy->fresh()->toArray();
        $beforePole = $pole->fresh()->toArray();
        $beforeCurve = $this->getJson("/api/projects/{$tank->id}/curve")->assertOk()->json();
        $teamId = $this->postJson('/api/teams', ['name' => 'Tanki team', 'project_id' => $tank->id])->assertCreated()->json('id');
        $member = User::factory()->pic()->create();
        $this->postJson("/api/teams/$teamId/members", ['user_id' => $member->id])->assertOk();
        $this->actingAs($member, 'sanctum')->getJson("/api/projects/{$tank->id}/quantities")->assertOk();
        $this->postJson("/api/projects/{$tank->id}/quantities", [...$payload, 'request_key' => 'member-cannot-write'])->assertForbidden();
        $this->getJson("/api/projects/{$legacy->id}/curve")->assertForbidden();
        $this->actingAs($owner, 'sanctum')->deleteJson("/api/teams/$teamId/members/{$member->id}")->assertOk();
        $this->putJson("/api/teams/$teamId", ['status' => 'inactive'])->assertOk();
        $this->assertSame($beforeEntries, DB::table('project_quantity_entries')->get()->toJson());
        $this->assertSame($beforeProject, $legacy->fresh()->toArray());
        $this->assertSame($beforePole, $pole->fresh()->toArray());
        $this->assertSame($beforeCurve, $this->getJson("/api/projects/{$tank->id}/curve")->assertOk()->json());
        $this->assertDatabaseCount('project_quantity_entries', 1);
    }
}
