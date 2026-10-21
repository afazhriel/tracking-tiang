<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\PoleWorkProgress;
use App\Models\ProgressPhoto;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class AtomicUploadTest extends TestCase
{
    use RefreshDatabase;

    private string $url;

    private PoleWorkProgress $progress;

    private int $itemId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('media');
        config(['app.debug' => false]);
        $this->actingAs(User::factory()->admin()->create(), 'sanctum');
        User::factory()->admin()->create();
        $project = Project::create(['name' => 'Uploads', 'code' => 'UPLOAD']);
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'UPLOAD-1']);
        $item = $pole->workItems()->create(['project_id' => $project->id, 'name' => 'Pondasi', 'weight_percent' => 100]);
        $this->itemId = $item->id;
        $this->url = "/api/projects/{$project->id}/poles/{$pole->id}/progress";
        $this->progress = PoleWorkProgress::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_percent' => 10, 'notes' => 'Keep original notes', 'started_at' => '2026-01-01']);
        $history = PoleProgressHistory::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_percent' => 10, 'recorded_at' => now()]);
        Storage::disk('public')->put('progress-photos/old.png', 'original');
        ProgressPhoto::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_history_id' => $history->id, 'path' => 'progress-photos/old.png']);
    }

    private function upload(): UploadedFile
    {
        return UploadedFile::fake()->image('photo.png', 8, 8);
    }

    private function assertOriginalRecords(): void
    {
        $this->assertSame('10.00', $this->progress->fresh()->progress_percent);
        $this->assertDatabaseCount('pole_progress_histories', 1);
        $this->assertDatabaseCount('progress_photos', 1);
        $this->assertDatabaseCount('notifications', 0);
        $this->assertSame(['progress-photos/old.png'], Storage::disk('public')->allFiles());
        $this->assertSame([], Storage::disk('media')->allFiles());
    }

    public function test_storage_false_does_not_commit_progress_or_a_photo_with_an_invalid_path(): void
    {
        $disk = Storage::disk('media');
        $proxy = Mockery::mock($disk);
        $proxy->shouldReceive('putFileAs')->andReturn(false);
        Storage::set('media', $proxy);
        $this->postJson($this->url, ['work_item_id' => $this->itemId, 'progress_percent' => 80, 'photos' => [$this->upload()]])
            ->assertStatus(503)->assertJsonPath('saved', false);
        $this->assertOriginalRecords();
    }

    public function test_failure_of_second_photo_removes_only_new_files_and_rolls_back_all_related_records(): void
    {
        $disk = Storage::disk('media');
        $proxy = Mockery::mock($disk);
        $calls = 0;
        $proxy->shouldReceive('putFileAs')->andReturnUsing(function ($directory, $file, $name = null, $options = []) use ($disk, &$calls) {
            if (++$calls === 2) {
                $disk->put($directory.'/'.$name, 'partial upload');

                return false;
            }

            return $disk->putFileAs($directory, $file, $name, $options);
        });
        Storage::set('media', $proxy);
        $this->postJson($this->url, ['work_item_id' => $this->itemId, 'progress_percent' => 80, 'photos' => [$this->upload(), $this->upload()]])
            ->assertStatus(503)->assertJsonPath('saved', false);
        $this->assertOriginalRecords();
    }

    public function test_metadata_failure_rolls_back_progress_and_discards_new_unreferenced_files(): void
    {
        $count = 0;
        Event::listen('eloquent.creating: '.ProgressPhoto::class, function () use (&$count) {
            if (++$count === 2) {
                throw new \RuntimeException('Simulated metadata failure');
            }
        });
        $this->postJson($this->url, ['work_item_id' => $this->itemId, 'progress_percent' => 80, 'photos' => [$this->upload(), $this->upload()]])->assertStatus(500);
        $this->assertOriginalRecords();
    }

    public function test_omitted_optional_progress_fields_keep_existing_values_and_explicit_null_clears_them(): void
    {
        $this->postJson($this->url, ['work_item_id' => $this->itemId, 'progress_percent' => 30])->assertOk()->assertJsonPath('pole_progress', 30);
        $this->assertSame('Keep original notes', $this->progress->fresh()->notes);
        $this->assertStringStartsWith('2026-01-01', (string) $this->progress->fresh()->started_at);
        $this->postJson($this->url, ['work_item_id' => $this->itemId, 'progress_percent' => 40, 'notes' => null, 'started_at' => null])->assertOk();
        $this->assertNull($this->progress->fresh()->notes);
        $this->assertNull($this->progress->fresh()->started_at);
    }

    public function test_successful_multi_photo_save_commits_one_history_and_all_photo_references(): void
    {
        $response = $this->postJson($this->url, ['work_item_id' => $this->itemId, 'progress_percent' => 80, 'photos' => [$this->upload(), $this->upload()]])
            ->assertOk()->assertJsonCount(2, 'photos')->assertJsonPath('pole_progress', 80);
        $this->assertSame('80.00', $this->progress->fresh()->progress_percent);
        $this->assertDatabaseCount('pole_progress_histories', 2);
        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseCount('progress_photos', 3);
        $this->assertCount(1, Storage::disk('public')->allFiles());
        $this->assertCount(2, Storage::disk('media')->allFiles());
        $histories = ProgressPhoto::whereIn('id', array_column($response->json('photos'), 'id'))->pluck('progress_history_id')->unique();
        $this->assertCount(1, $histories);
    }

    public function test_notification_failure_cannot_leave_saved_progress_or_uploads(): void
    {
        Event::listen('eloquent.creating: '.Notification::class, function () {
            throw new \RuntimeException('Simulated notification persistence failure');
        });
        $this->postJson($this->url, ['work_item_id' => $this->itemId, 'progress_percent' => 80, 'photos' => [$this->upload()]])->assertStatus(500);
        $this->assertOriginalRecords();
    }

    public function test_failed_avatar_write_retains_previous_path_and_file(): void
    {
        $user = User::factory()->pic()->create(['avatar' => 'avatars/original.png']);
        Storage::disk('public')->put($user->avatar, 'original avatar');
        $proxy = Mockery::mock(Storage::disk('media'));
        $proxy->shouldReceive('putFileAs')->andReturn(false);
        Storage::set('media', $proxy);
        $this->actingAs($user, 'sanctum')->postJson('/api/user/avatar', ['avatar' => $this->upload()])->assertStatus(503)->assertJsonPath('saved', false);
        $this->assertSame('avatars/original.png', $user->fresh()->avatar);
        Storage::disk('public')->assertExists('avatars/original.png');
    }
}
