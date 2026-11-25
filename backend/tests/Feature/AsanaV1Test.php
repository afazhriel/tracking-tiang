<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Pole;
use App\Models\Project;
use App\Models\ProjectActivity;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Fitur gaya Asana v1: PIC per titik + "Tugas saya", notifikasi tim,
 * peran proyek, riwayat aktivitas, tenggat + status turunan titik.
 */
class AsanaV1Test extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function makePoleProject(string $code = 'PRJ-TIANG'): Project
    {
        return Project::create([
            'name' => 'Proyek '.$code,
            'code' => $code,
            'status' => 'active',
        ]);
    }

    private function makeQuantityProject(string $code = 'PRJ-JML'): Project
    {
        return Project::create([
            'name' => 'Proyek '.$code,
            'code' => $code,
            'status' => 'active',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'target_quantity' => 10,
            'unit_code' => 'klien',
        ]);
    }

    private function makePole(Project $project, string $code = 'T-1'): Pole
    {
        WorkItem::create([
            'project_id' => $project->id,
            'pole_id' => null,
            'name' => 'Pondasi',
            'weight_percent' => 100,
            'sequence' => 1,
            'is_active' => true,
        ]);

        $pole = Pole::create([
            'project_id' => $project->id,
            'pole_code' => $code,
        ]);

        return $pole->fresh();
    }

    private function makeWorkItem(Project $project): WorkItem
    {
        return WorkItem::create([
            'project_id' => $project->id,
            'name' => 'Pondasi',
            'weight_percent' => 100,
            'sequence' => 1,
            'is_active' => true,
        ]);
    }

    private function member(Project $project, string $role = 'pelaksana'): User
    {
        $pic = User::factory()->pic()->create();
        $pic->projects()->attach($project->id, ['role' => $role]);

        return $pic;
    }

    public function test_pic_cannot_record_progress_on_unassigned_pole(): void
    {
        $project = $this->makePoleProject();
        $admin = $this->admin();
        $pic = $this->member($project);
        $pole = $this->makePole($project);
        $item = $this->makeWorkItem($project);

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $item->id,
                'progress_percent' => 50,
            ])
            ->assertStatus(403);
    }

    public function test_assigned_pic_can_record_progress_and_appears_in_my_tasks(): void
    {
        $project = $this->makePoleProject();
        $admin = $this->admin();
        $pic = $this->member($project);
        $pole = $this->makePole($project);
        $item = $this->makeWorkItem($project);

        // Supervisor/Admin menugaskan titik ke PIC.
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/users/{$pic->id}/poles", ['pole_id' => $pole->id])
            ->assertCreated();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $pic->id,
            'title' => "Anda ditugaskan ke {$pole->pole_code}",
        ]);

        // PIC kini bisa mencatat.
        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $item->id,
                'progress_percent' => 50,
            ])
            ->assertOk()
            ->assertJsonPath('pole_progress', 50);

        // "Tugas saya" menampilkan titik + status turunan.
        $this->actingAs($pic, 'sanctum')
            ->getJson('/api/me/assigned-poles')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.pole_code', $pole->pole_code)
            ->assertJsonPath('data.0.progress_percent', 50)
            ->assertJsonPath('data.0.status_key', 'jalan')
            ->assertJsonPath('data.0.status_label', 'Berjalan');
    }

    public function test_pole_due_date_and_overdue_flag(): void
    {
        $project = $this->makePoleProject();
        $admin = $this->admin();
        $pole = $this->makePole($project);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/projects/{$project->id}/poles/{$pole->id}", [
                'due_date' => now()->subDay()->toDateString(),
            ])
            ->assertOk()
            ->assertJsonPath('data.due_date', now()->subDay()->toDateString())
            ->assertJsonPath('data.status_key', 'belum')
            ->assertJsonPath('data.is_overdue', true);

        // PIC tidak boleh mengubah tenggat.
        $pic = $this->member($project);
        $this->actingAs($pic, 'sanctum')
            ->patchJson("/api/projects/{$project->id}/poles/{$pole->id}", [
                'due_date' => now()->toDateString(),
            ])
            ->assertStatus(403);
    }

    public function test_pelaksana_member_can_record_quantity_progress_and_notifies(): void
    {
        $project = $this->makeQuantityProject();
        $admin = $this->admin();
        $pic = $this->member($project, 'pelaksana');

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/quantities", [
                'quantity_delta' => 3,
                'request_key' => 'asana-test-0001',
            ])
            ->assertCreated();

        // Admin (anggota proyek lain) mendapat notifikasi progres.
        $this->assertDatabaseHas('notifications', [
            'user_id' => $admin->id,
            'category' => 'progress',
        ]);

        // Riwayat aktivitas mencatat peristiwa kuantitas.
        $this->assertDatabaseHas('project_activities', [
            'project_id' => $project->id,
            'action' => ProjectActivity::ACTION_PROGRESS_KUANTITAS,
        ]);

        // Feed aktivitas menampilkan peristiwa kuantitas.
        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/activities")
            ->assertOk()
            ->assertJsonFragment(['action' => ProjectActivity::ACTION_PROGRESS_KUANTITAS]);
    }

    public function test_pelihat_member_cannot_record_quantity_progress(): void
    {
        $project = $this->makeQuantityProject();
        $pic = $this->member($project, 'pelihat');

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/quantities", [
                'quantity_delta' => 1,
                'request_key' => 'asana-test-0002',
            ])
            ->assertStatus(403);
    }

    public function test_member_add_notifies_member_and_logs_activity(): void
    {
        $project = $this->makePoleProject();
        $admin = $this->admin();
        $pic = User::factory()->pic()->create();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/members", [
                'user_id' => $pic->id,
                'role' => 'pelaksana',
            ])
            ->assertCreated()
            ->assertJsonPath('data.role', 'pelaksana');

        $this->assertDatabaseHas('project_user', [
            'project_id' => $project->id,
            'user_id' => $pic->id,
            'role' => 'pelaksana',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $pic->id,
            'category' => 'sistem',
        ]);
        $this->assertDatabaseHas('project_activities', [
            'project_id' => $project->id,
            'action' => ProjectActivity::ACTION_ANGGOTA_TAMBAH,
        ]);
    }

    public function test_member_role_can_be_changed(): void
    {
        $project = $this->makePoleProject();
        $admin = $this->admin();
        $pic = $this->member($project, 'pelaksana');

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/projects/{$project->id}/members/{$pic->id}", [
                'role' => 'pelihat',
            ])
            ->assertOk()
            ->assertJsonPath('data.role', 'pelihat');

        $this->assertDatabaseHas('project_user', [
            'project_id' => $project->id,
            'user_id' => $pic->id,
            'role' => 'pelihat',
        ]);
    }

    public function test_baseline_approve_notifies_members_and_logs_activity(): void
    {
        $project = $this->makeQuantityProject();
        $admin = $this->admin();
        $pic = $this->member($project, 'pelaksana');

        $baseline = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/baselines", [
                'periods' => [
                    ['period_start' => now()->toDateString(), 'period_end' => now()->addMonth()->toDateString(), 'planned_quantity' => 10],
                ],
            ])
            ->assertCreated()
            ->json('data');

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/baselines/{$baseline['id']}/approve")
            ->assertOk();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $pic->id,
            'category' => 'aktivitas',
        ]);
        $this->assertDatabaseHas('project_activities', [
            'project_id' => $project->id,
            'action' => ProjectActivity::ACTION_BASELINE_SAHKAN,
        ]);
    }

    public function test_assignment_revoke_notifies_pic_and_logs_activity(): void
    {
        $project = $this->makePoleProject();
        $admin = $this->admin();
        $pic = $this->member($project);
        $pole = $this->makePole($project);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/users/{$pic->id}/poles", ['pole_id' => $pole->id])
            ->assertCreated();

        Notification::query()->delete();
        ProjectActivity::query()->delete();

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/users/{$pic->id}/poles/{$pole->id}")
            ->assertOk();

        $this->assertDatabaseHas('notifications', [
            'user_id' => $pic->id,
            'title' => "Penugasan Anda di {$pole->pole_code} dicabut",
        ]);
        $this->assertDatabaseHas('project_activities', [
            'project_id' => $project->id,
            'action' => ProjectActivity::ACTION_CABUT_PENUGASAN,
        ]);
    }
}
