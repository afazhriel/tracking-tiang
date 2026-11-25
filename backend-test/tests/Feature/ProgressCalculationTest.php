<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\PoleWorkProgress;
use App\Models\Project;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProgressCalculationTest extends TestCase
{
    use RefreshDatabase;

    public function test_inactive_work_items_are_excluded_from_pole_progress(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);

        $project = Project::create([
            'name' => 'Project Test',
            'code' => 'PROJECT-TEST',
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
            'total_target_poles' => 100,
            'status' => 'active',
        ]);

        $pole = Pole::create([
            'project_id' => $project->id,
            'pole_code' => 'POLE-TEST-001',
            'status' => 'active',
        ]);

        $activeItem = WorkItem::create([
            'project_id' => $project->id,
            'name' => 'Item Aktif',
            'weight_percent' => 60,
            'sequence' => 1,
            'is_active' => true,
        ]);

        $inactiveItem = WorkItem::create([
            'project_id' => $project->id,
            'name' => 'Item Nonaktif',
            'weight_percent' => 40,
            'sequence' => 2,
            'is_active' => false,
        ]);

        PoleWorkProgress::create([
            'pole_id' => $pole->id,
            'work_item_id' => $activeItem->id,
            'progress_percent' => 50,
            'updated_by' => $user->id,
        ]);

        PoleWorkProgress::create([
            'pole_id' => $pole->id,
            'work_item_id' => $inactiveItem->id,
            'progress_percent' => 100,
            'updated_by' => $user->id,
        ]);

        $this->actingAs($user)
            ->getJson("/api/projects/{$project->id}/poles/{$pole->id}/progress")
            ->assertOk()
            ->assertJsonPath('pole_progress', 30);
    }

    public function test_curve_current_progress_averages_registered_poles_not_project_target(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);

        $project = Project::create([
            'name' => 'Curve Test',
            'code' => 'CURVE-TEST',
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
            'total_target_poles' => 1500,
            'status' => 'active',
        ]);

        $item = WorkItem::create([
            'project_id' => $project->id,
            'name' => 'Item Aktif',
            'weight_percent' => 100,
            'sequence' => 1,
            'is_active' => true,
            'planned_start_month' => 1,
            'planned_end_month' => 12,
        ]);

        $poleOne = Pole::create([
            'project_id' => $project->id,
            'pole_code' => 'CURVE-POLE-001',
            'status' => 'active',
        ]);

        $poleTwo = Pole::create([
            'project_id' => $project->id,
            'pole_code' => 'CURVE-POLE-002',
            'status' => 'active',
        ]);

        PoleWorkProgress::create([
            'pole_id' => $poleOne->id,
            'work_item_id' => $item->id,
            'progress_percent' => 30,
        ]);

        PoleWorkProgress::create([
            'pole_id' => $poleTwo->id,
            'work_item_id' => $item->id,
            'progress_percent' => 10,
        ]);

        $this->actingAs($user)
            ->getJson("/api/projects/{$project->id}/curve")
            ->assertOk()
            ->assertJsonPath('registered_poles', 2)
            ->assertJsonPath('actual_current_percent', 20);
    }


    public function test_curve_history_uses_weight_and_active_status_snapshots(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);

        $project = Project::create([
            'name' => 'Snapshot Test',
            'code' => 'SNAPSHOT-TEST',
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
            'total_target_poles' => 100,
            'status' => 'active',
        ]);

        $pole = Pole::create([
            'project_id' => $project->id,
            'pole_code' => 'SNAPSHOT-POLE-001',
            'status' => 'active',
        ]);

        $item = WorkItem::create([
            'project_id' => $project->id,
            'name' => 'Item Snapshot',
            'weight_percent' => 60,
            'sequence' => 1,
            'is_active' => true,
            'planned_start_month' => 1,
            'planned_end_month' => 12,
        ]);

        \App\Models\PoleProgressHistory::create([
            'pole_id' => $pole->id,
            'work_item_id' => $item->id,
            'progress_percent' => 50,
            'weight_percent_snapshot' => 60,
            'is_active_snapshot' => true,
            'recorded_at' => '2026-02-15 10:00:00',
            'recorded_by' => $user->id,
        ]);

        $item->update([
            'weight_percent' => 100,
            'is_active' => false,
        ]);

        $this->actingAs($user)
            ->getJson("/api/projects/{$project->id}/curve")
            ->assertOk()
            ->assertJsonPath('actual_curve.0.progress_percent', 30);
    }

}

