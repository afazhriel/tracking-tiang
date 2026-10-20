<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\ProgressPhoto;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Pengerasan keamanan:
 * - login dibatasi (rate limit) untuk mencegah brute-force,
 * - daftar tiang/teams dibatasi sesuai hak akses (bukan hanya tombol UI),
 * - item pekerjaan per-tiang butuh otorisasi tiang,
 * - foto progress memakai MIME dari server + cache privat.
 */
class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::table('provinces')->where('id', '32')->doesntExist()) {
            $now = now();

            DB::table('provinces')->insert([
                ['id' => '32', 'name' => 'Jawa Barat', 'latitude' => 0, 'longitude' => 0, 'created_at' => $now, 'updated_at' => $now],
                ['id' => '33', 'name' => 'Jawa Tengah', 'latitude' => 0, 'longitude' => 0, 'created_at' => $now, 'updated_at' => $now],
            ]);
        }
    }

    private function makeProject(string $code): Project
    {
        return Project::create([
            'name' => 'Proyek '.$code,
            'code' => $code,
            'status' => 'active',
        ]);
    }

    private function makePole(Project $project, ?string $provinceId, string $code): Pole
    {
        return Pole::create([
            'project_id' => $project->id,
            'province_id' => $provinceId,
            'pole_code' => $code,
        ]);
    }

    public function test_login_is_throttled_after_repeated_failed_attempts(): void
    {
        User::factory()->create([
            'email' => 'budi@example.com',
            'password' => 'rahasia123',
        ]);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/login', [
                'email' => 'budi@example.com',
                'password' => 'salah-terus',
            ])->assertStatus(422);
        }

        $this->postJson('/api/login', [
            'email' => 'budi@example.com',
            'password' => 'salah-terus',
        ])->assertStatus(429);
    }

    public function test_pic_only_lists_poles_in_assigned_province(): void
    {
        $project = $this->makeProject('PRJ-SCOPE');
        $pic = User::factory()->pic()->create();
        $pic->provinces()->sync(['32']);
        $pic->projects()->attach($project->id);

        $this->makePole($project, '32', 'T-ASSIGNED');
        $this->makePole($project, '33', 'T-FOREIGN');
        $this->makePole($project, null, 'T-NOPROV');

        $response = $this->actingAs($pic, 'sanctum')
            ->getJson("/api/projects/{$project->id}/poles");

        $response->assertOk();

        $codes = collect($response->json('data'))->pluck('pole_code');

        $this->assertSame(['T-ASSIGNED'], $codes->all());
    }

    public function test_pic_only_lists_teams_of_accessible_project(): void
    {
        $accessible = $this->makeProject('PRJ-OK');
        $foreign = $this->makeProject('PRJ-NO');

        Team::create(['name' => 'Tim Saya', 'project_id' => $accessible->id, 'status' => 'active']);
        Team::create(['name' => 'Tim Lain', 'project_id' => $foreign->id, 'status' => 'active']);

        $pic = User::factory()->pic()->create();
        $pic->projects()->attach($accessible->id);

        $response = $this->actingAs($pic, 'sanctum')->getJson('/api/teams');

        $response->assertOk();

        $this->assertSame(['Tim Saya'], $response->json('*.name'));
    }

    public function test_work_items_scope_pole_requires_pole_access(): void
    {
        $project = $this->makeProject('PRJ-WI');
        $pic = User::factory()->pic()->create();
        $pic->provinces()->sync(['32']);
        $pic->projects()->attach($project->id);

        $foreignPole = $this->makePole($project, '33', 'T-FOREIGN');

        $this->actingAs($pic, 'sanctum')
            ->getJson("/api/projects/{$project->id}/work-items?scope=pole&pole_id={$foreignPole->id}")
            ->assertStatus(403);
    }

    public function test_progress_photo_is_served_with_private_cache_and_server_mime(): void
    {
        Storage::fake('public');

        $project = $this->makeProject('PRJ-PHOTO');
        $pole = $this->makePole($project, '32', 'T-PHOTO');

        $workItem = WorkItem::create([
            'project_id' => $project->id,
            'pole_id' => $pole->id,
            'name' => 'Pondasi',
            'weight_percent' => 100,
            'sequence' => 1,
            'is_active' => true,
        ]);

        $pic = User::factory()->pic()->create();
        $pic->provinces()->sync(['32']);
        $pic->projects()->attach($project->id);

        $bytes = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
        );

        $response = $this->actingAs($pic, 'sanctum')
            ->post("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $workItem->id,
                'progress_percent' => 20,
                'photos' => [UploadedFile::fake()->createWithContent('foto.png', $bytes)],
            ])
            ->assertOk();

        $photo = ProgressPhoto::firstOrFail();

        $this->get($response->json('photos.0.url'))
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Content-Type', 'image/png');

        $cacheControl = $this->get($response->json('photos.0.url'))->headers->get('Cache-Control');

        $this->assertStringContainsString('private', (string) $cacheControl);
        $this->assertStringNotContainsString('public', (string) $cacheControl);
    }
}
