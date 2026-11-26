<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Organization;
use App\Models\Pole;
use App\Models\Project;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * KPI per user + RAB pengajuan + logo organisasi + peran Pelihat
 * (tidak bisa mencatat progres titik).
 */
class KpiRabTest extends TestCase
{
    use RefreshDatabase;

    private function org(string $name): Organization
    {
        return Organization::create(['name' => $name]);
    }

    private function poleProject(Organization $org, string $code = 'PRJ-KPI'): Project
    {
        return Project::create([
            'name' => 'Proyek '.$code,
            'code' => $code,
            'status' => 'active',
            'org_id' => $org->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'target_quantity' => 3,
            'unit_code' => 'pole',
        ]);
    }

    private function makePole(Project $project, string $code, ?string $dueDate = null): Pole
    {
        WorkItem::create([
            'project_id' => $project->id,
            'pole_id' => null,
            'name' => 'Pondasi',
            'weight_percent' => 100,
            'sequence' => 1,
            'is_active' => true,
        ]);

        return Pole::create([
            'project_id' => $project->id,
            'pole_code' => $code,
            'due_date' => $dueDate,
        ]);
    }

    private function item(Project $project): WorkItem
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
        $pic = User::factory()->pic()->create(['org_id' => $project->org_id]);
        $pic->projects()->attach($project->id, ['role' => $role]);

        return $pic;
    }

    private function assign(User $admin, User $pic, Pole $pole): void
    {
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/users/{$pic->id}/poles", ['pole_id' => $pole->id])
            ->assertCreated();
    }

    private function record(User $pic, Project $project, Pole $pole, WorkItem $item, float $percent): void
    {
        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $item->id,
                'progress_percent' => $percent,
            ])
            ->assertOk();
    }

    private function rabPayload(): array
    {
        return [
            'title' => 'RAB Pondasi',
            'items' => [
                ['name' => 'Semen', 'category' => 'Material', 'volume' => 2, 'unit' => 'sak', 'unit_price' => 100000, 'line_total' => 1],
                ['name' => 'Tukang', 'category' => null, 'volume' => 3, 'unit' => 'hari', 'unit_price' => 50000],
            ],
        ];
    }

    /* ================= KPI ================= */

    public function test_pic_can_view_own_kpi(): void
    {
        $org = $this->org('PT KPI A');
        $project = $this->poleProject($org);
        $pic = $this->member($project);

        $this->actingAs($pic, 'sanctum')
            ->getJson("/api/users/{$pic->id}/kpi")
            ->assertOk()
            ->assertJsonPath('data.user.id', $pic->id)
            ->assertJsonPath('data.kpi.assigned', 0);
    }

    public function test_user_from_other_org_cannot_view_kpi(): void
    {
        $orgA = $this->org('PT KPI A');
        $orgB = $this->org('PT KPI B');
        $project = $this->poleProject($orgA);
        $picA = $this->member($project);
        $picB = User::factory()->pic()->create(['org_id' => $orgB->id]);

        $this->actingAs($picB, 'sanctum')
            ->getJson("/api/users/{$picA->id}/kpi")
            ->assertForbidden();
    }

    public function test_pic_can_view_same_org_member_kpi(): void
    {
        $org = $this->org('PT KPI A');
        $project = $this->poleProject($org);
        $picA = $this->member($project);
        $picB = $this->member($project);

        $this->actingAs($picB, 'sanctum')
            ->getJson("/api/users/{$picA->id}/kpi")
            ->assertOk()
            ->assertJsonPath('data.user.id', $picA->id);
    }

    public function test_supervisor_and_admin_can_view_kpi(): void
    {
        $org = $this->org('PT KPI A');
        $project = $this->poleProject($org);
        $pic = $this->member($project);
        $supervisor = User::factory()->supervisor()->create(['org_id' => $org->id]);
        $admin = User::factory()->admin()->create(['org_id' => $org->id]);

        $this->actingAs($supervisor, 'sanctum')
            ->getJson("/api/users/{$pic->id}/kpi")
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/users/{$pic->id}/kpi")
            ->assertOk();
    }

    public function test_supervisor_from_other_org_cannot_view_kpi(): void
    {
        $orgA = $this->org('PT KPI A');
        $orgB = $this->org('PT KPI B');
        $project = $this->poleProject($orgA);
        $pic = $this->member($project);
        $supervisorB = User::factory()->supervisor()->create(['org_id' => $orgB->id]);

        $this->actingAs($supervisorB, 'sanctum')
            ->getJson("/api/users/{$pic->id}/kpi")
            ->assertForbidden();
    }

    public function test_kpi_math_counts_assigned_done_avg_late_and_records(): void
    {
        $org = $this->org('PT KPI A');
        $project = $this->poleProject($org);
        $admin = User::factory()->admin()->create(['org_id' => $org->id]);
        $pic = $this->member($project);
        $item = $this->item($project);

        $done = $this->makePole($project, 'K-1');
        $half = $this->makePole($project, 'K-2');
        $late = $this->makePole($project, 'K-3', now()->subDay()->toDateString());

        $this->assign($admin, $pic, $done);
        $this->assign($admin, $pic, $half);
        $this->assign($admin, $pic, $late);

        $this->record($pic, $project, $done, $item, 100);
        $this->record($pic, $project, $half, $item, 50);

        $this->actingAs($pic, 'sanctum')
            ->getJson("/api/users/{$pic->id}/kpi")
            ->assertOk()
            ->assertJsonPath('data.kpi.assigned', 3)
            ->assertJsonPath('data.kpi.done', 1)
            ->assertJsonPath('data.kpi.avg_progress', 50)
            ->assertJsonPath('data.kpi.late', 1)
            ->assertJsonPath('data.kpi.on_time', 2)
            ->assertJsonPath('data.kpi.progress_records', 2);
    }

    public function test_kpi_overview_scoped_to_actor_org(): void
    {
        $orgA = $this->org('PT KPI A');
        $orgB = $this->org('PT KPI B');
        $projectA = $this->poleProject($orgA);
        $picA = $this->member($projectA);
        $picB = User::factory()->pic()->create(['org_id' => $orgB->id]);

        $response = $this->actingAs($picA, 'sanctum')->getJson('/api/kpi')->assertOk();
        $ids = collect($response->json('data'))->pluck('user.id')->all();

        $this->assertContains($picA->id, $ids);
        $this->assertNotContains($picB->id, $ids);
    }

    /* ================= RAB ================= */

    public function test_member_can_create_draft_and_total_is_computed_server_side(): void
    {
        $org = $this->org('PT RAB A');
        $project = $this->poleProject($org);
        $pic = $this->member($project);

        $response = $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets", $this->rabPayload())
            ->assertCreated();

        // 2x100.000 + 3x50.000 = 350.000 (line_total kiriman klien = 1 diabaikan).
        $response->assertJsonPath('data.status', 'draf')
            ->assertJsonPath('data.total', 350000)
            ->assertJsonPath('data.items.0.line_total', 200000)
            ->assertJsonPath('data.items.1.line_total', 150000);
    }

    public function test_pelihat_cannot_create_rab(): void
    {
        $org = $this->org('PT RAB A');
        $project = $this->poleProject($org);
        $pelihat = $this->member($project, 'pelihat');

        $this->actingAs($pelihat, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets", $this->rabPayload())
            ->assertForbidden();
    }

    public function test_submit_notifies_approvers_and_approve_locks_budget(): void
    {
        $org = $this->org('PT RAB A');
        $project = $this->poleProject($org);
        $pic = $this->member($project);
        $supervisor = User::factory()->supervisor()->create(['org_id' => $org->id]);

        $budgetId = $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets", $this->rabPayload())
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'diajukan');

        $this->assertDatabaseHas('notifications', [
            'user_id' => $supervisor->id,
            'category' => 'rab',
        ]);

        $this->actingAs($supervisor, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/decide", [
                'decision' => 'disetujui',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'disetujui');

        // RAB yang disetujui terkunci: edit + hapus ditolak.
        $this->actingAs($pic, 'sanctum')
            ->putJson("/api/projects/{$project->id}/budgets/{$budgetId}", $this->rabPayload())
            ->assertStatus(422);

        $this->actingAs($pic, 'sanctum')
            ->deleteJson("/api/projects/{$project->id}/budgets/{$budgetId}")
            ->assertStatus(422);

        // Pengaju dikabari keputusannya.
        $this->assertDatabaseHas('notifications', [
            'user_id' => $pic->id,
            'category' => 'rab',
        ]);
    }

    public function test_reject_requires_note_and_can_be_fixed_and_resubmitted(): void
    {
        $org = $this->org('PT RAB A');
        $project = $this->poleProject($org);
        $pic = $this->member($project);
        $supervisor = User::factory()->supervisor()->create(['org_id' => $org->id]);

        $budgetId = $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets", $this->rabPayload())
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/submit")
            ->assertOk();

        // Tolak tanpa alasan -> 422.
        $this->actingAs($supervisor, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/decide", [
                'decision' => 'ditolak',
            ])
            ->assertStatus(422);

        $this->actingAs($supervisor, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/decide", [
                'decision' => 'ditolak',
                'note' => 'Harga semen kemahalan.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'ditolak')
            ->assertJsonPath('data.rejection_note', 'Harga semen kemahalan.');

        // Yang ditolak bisa diperbaiki lalu diajukan ulang.
        $payload = $this->rabPayload();
        $payload['items'][0]['unit_price'] = 90000;

        $this->actingAs($pic, 'sanctum')
            ->putJson("/api/projects/{$project->id}/budgets/{$budgetId}", $payload)
            ->assertOk()
            ->assertJsonPath('data.total', 330000);

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'diajukan');
    }

    public function test_other_org_supervisor_cannot_decide_rab(): void
    {
        $orgA = $this->org('PT RAB A');
        $orgB = $this->org('PT RAB B');
        $project = $this->poleProject($orgA);
        $pic = $this->member($project);
        $supervisorB = User::factory()->supervisor()->create(['org_id' => $orgB->id]);

        $budgetId = $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets", $this->rabPayload())
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/submit")
            ->assertOk();

        $this->actingAs($supervisorB, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/decide", [
                'decision' => 'disetujui',
            ])
            ->assertForbidden();
    }

    public function test_duplicate_approved_budget_creates_new_draft(): void
    {
        $org = $this->org('PT RAB A');
        $project = $this->poleProject($org);
        $pic = $this->member($project);
        $supervisor = User::factory()->supervisor()->create(['org_id' => $org->id]);

        $budgetId = $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets", $this->rabPayload())
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/submit")
            ->assertOk();

        $this->actingAs($supervisor, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/decide", [
                'decision' => 'disetujui',
            ])
            ->assertOk();

        $response = $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/budgets/{$budgetId}/duplicate")
            ->assertCreated();

        $response->assertJsonPath('data.status', 'draf')
            ->assertJsonPath('data.total', 350000);
        $this->assertNotEquals($budgetId, $response->json('data.id'));
    }

    /* ================= Logo organisasi ================= */

    public function test_org_admin_can_upload_and_view_logo(): void
    {
        Storage::fake('public');

        $org = $this->org('PT LOGO A');
        $admin = User::factory()->admin()->create(['org_id' => $org->id]);
        // Fixture PNG asli — UploadedFile::fake()->image() butuh GD yang tidak ada di image php.
        $file = new UploadedFile(__DIR__.'/../Fixtures/logo.png', 'logo.png', 'image/png', null, true);

        $this->actingAs($admin, 'sanctum')
            ->post("/api/organizations/{$org->id}/logo", ['logo' => $file])
            ->assertOk()
            ->assertJsonPath('data.logo_url', "/api/organizations/{$org->id}/logo");

        Storage::disk('public')->assertExists("org-logos/org-{$org->id}.png");

        $this->actingAs($admin, 'sanctum')
            ->get("/api/organizations/{$org->id}/logo")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png');
    }

    public function test_pic_cannot_upload_org_logo(): void
    {
        $org = $this->org('PT LOGO A');
        $pic = User::factory()->pic()->create(['org_id' => $org->id]);
        // Fixture PNG asli — UploadedFile::fake()->image() butuh GD yang tidak ada di image php.
        $file = new UploadedFile(__DIR__.'/../Fixtures/logo.png', 'logo.png', 'image/png', null, true);

        $this->actingAs($pic, 'sanctum')
            ->post("/api/organizations/{$org->id}/logo", ['logo' => $file])
            ->assertForbidden();
    }

    /* ================= Peran Pelihat ================= */

    public function test_pelihat_assigned_to_pole_cannot_record_progress(): void
    {
        $org = $this->org('PT PERAN A');
        $project = $this->poleProject($org);
        $admin = User::factory()->admin()->create(['org_id' => $org->id]);
        $pelihat = $this->member($project, 'pelihat');
        $pole = $this->makePole($project, 'P-1');
        $item = $this->item($project);

        $this->assign($admin, $pelihat, $pole);

        $this->actingAs($pelihat, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $item->id,
                'progress_percent' => 50,
            ])
            ->assertForbidden();
    }

    public function test_pelaksana_assigned_to_pole_can_record_progress(): void
    {
        $org = $this->org('PT PERAN A');
        $project = $this->poleProject($org);
        $admin = User::factory()->admin()->create(['org_id' => $org->id]);
        $pelaksana = $this->member($project, 'pelaksana');
        $pole = $this->makePole($project, 'P-1');
        $item = $this->item($project);

        $this->assign($admin, $pelaksana, $pole);

        $this->actingAs($pelaksana, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $item->id,
                'progress_percent' => 50,
            ])
            ->assertOk();
    }

    /* ================= Pesan trigger rencana ================= */

    public function test_baseline_trigger_message_uses_rencana_word(): void
    {
        $org = $this->org('PT TRIG A');
        $project = $this->poleProject($org);

        try {
            DB::table('project_baselines')->insert([
                'project_id' => $project->id,
                'version' => 1,
                'status' => 'approved',
                'unit_code' => 'pole',
                'target_quantity' => 3,
                'start_date' => now()->toDateString(),
                'end_date' => now()->addMonth()->toDateString(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->fail('Trigger pengaman baseline seharusnya menolak.');
        } catch (\Illuminate\Database\QueryException $e) {
            $this->assertStringContainsString('Rencana baru harus berstatus draft', $e->getMessage());
        }
    }
}
