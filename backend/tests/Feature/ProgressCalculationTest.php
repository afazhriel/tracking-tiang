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

    /*
     * Semantik Kurva S yang berlaku (diputuskan & diverifikasi 26 Nov 2026):
     * actual_current_percent = jumlah progres tiap tiang terdaftar DIBAGI
     * target total proyek, BUKAN rata-rata tiang saja. Contoh yang sudah
     * diverifikasi: 1 tiang @60% dari target 3 tiang = 20%. Test
     * MigrationCompatibilityTest juga mengunci semantik ini
     * (37,5% / target 4 = 9,375). Versi lama test ini mengharapkan
     * rata-rata tiang (20%), itu bertentangan dengan semantik di atas.
     */
    public function test_curve_current_progress_divides_by_project_target(): void
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
            // (30 + 10) / target 1500 = 0,0267 — bukan rata-rata 20.
            ->assertJsonPath('actual_current_percent', 0.0267);
    }

    /*
     * Riwayat memakai snapshot bobot saat dicatat, kurva berjalan memakai
     * bobot aktif saat ini: satu catatan 50% dengan snapshot bobot 60%
     * (item lalu diubah jadi bobot 100% + nonaktif) harus tetap 30%
     * per tiang di kurva snapshot (= 0,3 setelah dibagi target 100),
     * sementara kurva berjalan jadi 0 karena itemnya kini nonaktif.
     */
    public function test_curve_history_snapshot_curve_keeps_old_weight_while_current_curve_uses_current_weights(): void
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
            // Kurva snapshot: 50% x 60% = 30 per tiang, / target 100 = 0,3.
            ->assertJsonPath('legacy_snapshot_curve.0.progress_percent', 0.3)
            // Kurva berjalan: item kini nonaktif -> tidak dihitung.
            ->assertJsonPath('actual_curve.0.progress_percent', 0);
    }
}
