<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\ProgressPhoto;
use App\Models\Project;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Penugasan provinsi: supervisor/PIC hanya boleh menambah tiang dan
 * mencatat progress di provinsi yang ditugaskan. Admin bebas.
 *
 * Sekaligus menguji upload foto pada endpoint catat progress.
 */
class ProvinceProgressTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $now = now();

        DB::table('provinces')->insert([
            ['id' => '32', 'name' => 'Jawa Barat', 'latitude' => 0, 'longitude' => 0, 'created_at' => $now, 'updated_at' => $now],
            ['id' => '33', 'name' => 'Jawa Tengah', 'latitude' => 0, 'longitude' => 0, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    private function makeProject(string $code = 'PRJ-1'): Project
    {
        return Project::create([
            'name' => 'Proyek '.$code,
            'code' => $code,
            'status' => 'active',
        ]);
    }

    private function makePole(Project $project, string $provinceId, string $code = 'TIANG-1'): Pole
    {
        return Pole::create([
            'project_id' => $project->id,
            'province_id' => $provinceId,
            'pole_code' => $code,
        ]);
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

    private function picWithProvince(string $provinceId, Project $project): User
    {
        $pic = User::factory()->pic()->create();
        $pic->provinces()->sync([$provinceId]);
        $pic->projects()->attach($project->id);

        return $pic;
    }

    /**
     * PNG 1x1 valid (tanpa perlu ekstensi GD).
     */
    private function fakePng(string $name = 'foto.png'): UploadedFile
    {
        $bytes = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
        );

        return UploadedFile::fake()->createWithContent($name, $bytes);
    }

    public function test_pic_without_province_cannot_create_pole(): void
    {
        $project = $this->makeProject();
        $pic = User::factory()->pic()->create();
        $pic->projects()->attach($project->id);

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles", [
                'pole_code' => 'TIANG-9',
                'province_id' => '32',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('province_id');
    }

    public function test_pic_can_create_pole_in_assigned_province(): void
    {
        $project = $this->makeProject();
        $pic = $this->picWithProvince('32', $project);

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles", [
                'pole_code' => 'TIANG-10',
                'province_id' => '32',
            ])
            ->assertCreated()
            ->assertJsonPath('data.province_id', '32');

        $this->assertDatabaseHas('poles', [
            'project_id' => $project->id,
            'pole_code' => 'TIANG-10',
            'province_id' => '32',
        ]);
    }

    public function test_pic_cannot_create_pole_outside_assigned_province(): void
    {
        $project = $this->makeProject();
        $pic = $this->picWithProvince('32', $project);

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles", [
                'pole_code' => 'TIANG-11',
                'province_id' => '33',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('province_id');
    }

    public function test_admin_can_create_pole_without_province(): void
    {
        $project = $this->makeProject();
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles", [
                'pole_code' => 'TIANG-ADM',
            ])
            ->assertCreated();
    }

    public function test_pic_can_record_progress_in_assigned_province(): void
    {
        $project = $this->makeProject();
        $workItem = $this->makeWorkItem($project);
        $pole = $this->makePole($project, '32');
        $pic = $this->picWithProvince('32', $project);

        $this->actingAs($pic, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $workItem->id,
                'progress_percent' => 50,
            ])
            ->assertOk()
            ->assertJsonPath('pole_progress', 50);

        $this->assertDatabaseHas('pole_work_progress', [
            'pole_id' => $pole->id,
            'work_item_id' => $workItem->id,
        ]);
    }

    public function test_supervisor_without_province_cannot_record_progress(): void
    {
        $project = $this->makeProject();
        $workItem = $this->makeWorkItem($project);
        $pole = $this->makePole($project, '32');
        $supervisor = User::factory()->supervisor()->create();

        $this->actingAs($supervisor, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $workItem->id,
                'progress_percent' => 50,
            ])
            ->assertStatus(403);
    }

    public function test_admin_can_assign_provinces_to_user(): void
    {
        $admin = User::factory()->admin()->create();
        $pic = User::factory()->pic()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/users/{$pic->id}/provinces", [
                'province_ids' => ['32', '33'],
            ])
            ->assertOk()
            ->assertJsonCount(2, 'data.provinces');

        $this->assertDatabaseHas('province_user', ['user_id' => $pic->id, 'province_id' => '32']);
        $this->assertDatabaseHas('province_user', ['user_id' => $pic->id, 'province_id' => '33']);
    }

    public function test_non_admin_cannot_assign_provinces(): void
    {
        $pic = User::factory()->pic()->create();
        $target = User::factory()->pic()->create();

        $this->actingAs($pic, 'sanctum')
            ->patchJson("/api/users/{$target->id}/provinces", [
                'province_ids' => ['32'],
            ])
            ->assertStatus(403);
    }

    public function test_me_includes_assigned_provinces(): void
    {
        $project = $this->makeProject();
        $pic = $this->picWithProvince('32', $project);

        $this->actingAs($pic, 'sanctum')
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('provinces.0.id', '32');
    }

    public function test_progress_upload_stores_photo_and_serves_it(): void
    {
        Storage::fake('public');

        $project = $this->makeProject();
        $workItem = $this->makeWorkItem($project);
        $pole = $this->makePole($project, '32');
        $pic = $this->picWithProvince('32', $project);

        $response = $this->actingAs($pic, 'sanctum')
            ->post("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $workItem->id,
                'progress_percent' => 30,
                'notes' => 'Pondasi mulai dikerjakan',
                'photos' => [$this->fakePng('foto1.png')],
            ]);

        $response->assertOk()->assertJsonCount(1, 'photos');

        $ulid = $response->json('photos.0.url');
        $this->assertStringStartsWith('/api/photos/', $ulid);

        $photo = ProgressPhoto::first();
        $this->assertNotNull($photo);
        $this->assertSame($pole->id, $photo->pole_id);
        Storage::disk('public')->assertExists($photo->path);

        $this->assertDatabaseHas('progress_photos', [
            'pole_id' => $pole->id,
            'progress_history_id' => PoleProgressHistory::first()->id,
        ]);

        /* URL publik dapat menyajikan file tanpa auth. */
        $this->get($photo->url())->assertOk();
    }

    public function test_unknown_photo_returns_404(): void
    {
        $this->get('/api/photos/01ARZ3NDEKTSV4RRFFQ69G5FAV')->assertStatus(404);
    }

    public function test_activity_includes_uploaded_photos(): void
    {
        Storage::fake('public');

        $project = $this->makeProject();
        $workItem = $this->makeWorkItem($project);
        $pole = $this->makePole($project, '32');
        $pic = $this->picWithProvince('32', $project);

        $this->actingAs($pic, 'sanctum')
            ->post("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                'work_item_id' => $workItem->id,
                'progress_percent' => 40,
                'photos' => [$this->fakePng('foto2.png')],
            ])
            ->assertOk();

        $this->actingAs($pic, 'sanctum')
            ->getJson("/api/projects/{$project->id}/activities")
            ->assertOk()
            ->assertJsonCount(1, 'data.0.photos');
    }

    public function test_pole_summary_groups_by_province(): void
    {
        $project = $this->makeProject();
        $admin = User::factory()->admin()->create();

        $this->makePole($project, '32', 'T-1');
        $this->makePole($project, '32', 'T-2');
        $this->makePole($project, '33', 'T-3');

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/poles/summary")
            ->assertOk()
            ->assertJsonPath('total_poles', 3);

        $byProvince = collect($response->json('data'))->keyBy('province_id');

        $this->assertSame(2, $byProvince['32']['pole_count']);
        $this->assertSame(1, $byProvince['33']['pole_count']);
    }
}
