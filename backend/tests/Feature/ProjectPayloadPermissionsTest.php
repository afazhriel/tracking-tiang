<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Payload proyek membawa hak user yang sedang login
 * (my_project_role + can_record_progress) supaya frontend
 * menampilkan tombol catat hanya bila server mengizinkan.
 */
class ProjectPayloadPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private function project(Organization $org): Project
    {
        return Project::create([
            'name' => 'Proyek Klien',
            'code' => 'PRJ-IZIN',
            'status' => 'active',
            'org_id' => $org->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'target_quantity' => 10,
            'unit_code' => 'klien',
        ]);
    }

    public function test_supervisor_bukan_anggota_boleh_mencatat(): void
    {
        $org = Organization::create(['name' => 'Org Izin']);
        $project = $this->project($org);
        $supervisor = User::factory()->create([
            'role' => 'supervisor',
            'org_id' => $org->id,
            'status' => 'active',
        ]);

        $response = $this->actingAs($supervisor)->getJson("/api/projects/{$project->id}");

        $response->assertOk();
        $this->assertTrue($response->json('data.can_record_progress'));
        $this->assertNull($response->json('data.my_project_role'));
    }

    public function test_anggota_pelaksana_boleh_mencatat(): void
    {
        $org = Organization::create(['name' => 'Org Izin']);
        $project = $this->project($org);
        $pic = User::factory()->pic()->create(['org_id' => $org->id]);
        $pic->projects()->attach($project->id, ['role' => 'pelaksana']);

        $response = $this->actingAs($pic)->getJson("/api/projects/{$project->id}");

        $response->assertOk();
        $this->assertTrue($response->json('data.can_record_progress'));
        $this->assertSame('pelaksana', $response->json('data.my_project_role'));
    }

    public function test_anggota_pelihat_tidak_boleh_mencatat(): void
    {
        $org = Organization::create(['name' => 'Org Izin']);
        $project = $this->project($org);
        $pic = User::factory()->pic()->create(['org_id' => $org->id]);
        $pic->projects()->attach($project->id, ['role' => 'pelihat']);

        $response = $this->actingAs($pic)->getJson("/api/projects/{$project->id}");

        $response->assertOk();
        $this->assertFalse($response->json('data.can_record_progress'));
        $this->assertSame('pelihat', $response->json('data.my_project_role'));
    }

    public function test_daftar_proyek_membawa_hak_catat(): void
    {
        $org = Organization::create(['name' => 'Org Izin']);
        $project = $this->project($org);
        $supervisor = User::factory()->create([
            'role' => 'supervisor',
            'org_id' => $org->id,
            'status' => 'active',
        ]);

        $response = $this->actingAs($supervisor)->getJson('/api/projects');

        $response->assertOk();
        $row = collect($response->json('data'))
            ->firstWhere('id', $project->id);
        $this->assertNotNull($row);
        $this->assertTrue($row['can_record_progress']);
    }
}
