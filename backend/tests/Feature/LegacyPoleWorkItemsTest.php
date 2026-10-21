<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\PoleWorkProgress;
use App\Models\ProgressPhoto;
use App\Models\Project;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LegacyPoleWorkItemsTest extends TestCase
{
    use RefreshDatabase;

    private Project $project;

    private Pole $pole;

    private WorkItem $template;

    private string $url;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->admin()->create(), 'sanctum');
        $this->project = Project::create(['name' => 'Legacy', 'code' => 'OLD', 'total_target_poles' => 2, 'start_date' => '2026-01-01', 'end_date' => '2026-12-31']);
        $this->pole = Pole::create(['project_id' => $this->project->id, 'pole_code' => 'OLD-1']);
        $this->template = $this->project->workItems()->create(['name' => 'Pondasi', 'weight_percent' => 100, 'sequence' => 1, 'is_active' => true]);
        $this->url = "/api/projects/{$this->project->id}/poles/{$this->pole->id}/work-items";
    }

    private function records(): array
    {
        Storage::fake('public');
        Storage::disk('public')->put('progress-photos/old.png', 'old photo');
        $progress = PoleWorkProgress::create(['pole_id' => $this->pole->id, 'work_item_id' => $this->template->id, 'progress_percent' => 75, 'notes' => 'Do not lose']);
        $history = PoleProgressHistory::create(['pole_id' => $this->pole->id, 'work_item_id' => $this->template->id, 'progress_percent' => 75, 'recorded_at' => '2026-02-01 08:00:00', 'notes' => 'Original history']);
        $photo = ProgressPhoto::create(['ulid' => '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'pole_id' => $this->pole->id, 'work_item_id' => $this->template->id, 'progress_history_id' => $history->id, 'disk' => 'public', 'path' => 'progress-photos/old.png']);

        return [$progress, $history, $photo];
    }

    public function test_reading_legacy_items_does_not_backfill_or_change_progress(): void
    {
        $this->records();
        $this->getJson($this->url)->assertOk()->assertJsonPath('meta.inherited', true)->assertJsonPath('data.0.id', $this->template->id);
        $this->assertDatabaseCount('work_items', 1);
        $this->assertDatabaseHas('pole_work_progress', ['work_item_id' => $this->template->id, 'progress_percent' => 75]);
    }

    public function test_explicit_edit_remaps_records_atomically_and_preserves_files_and_history_weight(): void
    {
        [$progress, $history, $photo] = $this->records();
        $other = Pole::create(['project_id' => $this->project->id, 'pole_code' => 'OLD-2']);
        $otherProgress = PoleWorkProgress::create(['pole_id' => $other->id, 'work_item_id' => $this->template->id, 'progress_percent' => 10]);
        $this->patchJson($this->url.'/'.$this->template->id, ['name' => 'Pondasi khusus'])->assertOk();
        $copy = $this->pole->workItems()->sole();
        $this->assertSame($copy->id, $progress->fresh()->work_item_id);
        $this->assertSame($copy->id, $history->fresh()->work_item_id);
        $this->assertSame($copy->id, $photo->fresh()->work_item_id);
        $this->assertSame($history->id, $photo->fresh()->progress_history_id);
        $this->assertSame('Original history', $history->fresh()->notes);
        $this->assertSame('100.00', $history->fresh()->weight_percent_snapshot);
        $this->assertSame('Do not lose', $progress->fresh()->notes);
        $this->assertSame($this->template->id, $otherProgress->fresh()->work_item_id);
        $this->assertSame('Pondasi', $this->template->fresh()->name);
        Storage::disk('public')->assertExists('progress-photos/old.png');
    }

    public function test_validation_failure_rolls_back_copies_and_reference_changes(): void
    {
        [$progress, $history, $photo] = $this->records();
        $this->patchJson($this->url.'/'.$this->template->id, ['weight_percent' => -1])->assertUnprocessable()->assertJsonValidationErrors('weight_percent');
        $this->assertDatabaseCount('work_items', 1);
        foreach ([$progress, $history, $photo] as $record) {
            $this->assertSame($this->template->id, $record->fresh()->work_item_id);
        }
        $this->assertNull($this->pole->fresh()->work_items_customized_at);
    }

    public function test_delete_with_records_returns_conflict_and_rolls_back_materialization(): void
    {
        $this->records();
        $this->deleteJson($this->url.'/'.$this->template->id)->assertConflict();
        $this->assertDatabaseCount('work_items', 1);
        $this->assertDatabaseCount('progress_photos', 1);
        $this->assertDatabaseCount('pole_progress_histories', 1);
        Storage::disk('public')->assertExists('progress-photos/old.png');
    }

    public function test_delete_of_last_unused_item_stays_empty_on_future_reads(): void
    {
        $this->deleteJson($this->url.'/'.$this->template->id)->assertOk();
        $this->getJson($this->url)->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.inherited', false);
        $this->assertDatabaseHas('work_items', ['id' => $this->template->id]);
    }

    public function test_partial_backfill_is_completed_per_pole_without_duplicate_copies(): void
    {
        [$progress, $history] = $this->records();
        $copy = $this->pole->workItems()->create(['project_id' => $this->project->id, 'source_item_id' => $this->template->id, 'name' => 'Manual name', 'weight_percent' => 100]);
        $this->patchJson($this->url.'/'.$copy->id, ['sequence' => 2])->assertOk();
        $this->assertSame(1, $this->pole->workItems()->count());
        $this->assertSame($copy->id, $progress->fresh()->work_item_id);
        $this->assertSame($copy->id, $history->fresh()->work_item_id);
        $this->assertSame('Manual name', $copy->fresh()->name);
        $this->postJson($this->url.'/apply-template')->assertOk();
        $this->postJson($this->url.'/apply-template')->assertOk();
        $this->assertSame(1, $this->pole->workItems()->count());
        $this->assertSame('Manual name', $copy->fresh()->name);
    }

    public function test_partial_backfill_with_two_progress_states_fails_without_discarding_either(): void
    {
        [$legacy] = $this->records();
        $copy = $this->pole->workItems()->create(['project_id' => $this->project->id, 'source_item_id' => $this->template->id, 'name' => 'Pondasi salinan', 'weight_percent' => 100]);
        $newer = PoleWorkProgress::create(['pole_id' => $this->pole->id, 'work_item_id' => $copy->id, 'progress_percent' => 90]);
        $this->postJson($this->url.'/apply-template')->assertConflict();
        $this->postJson("/api/projects/{$this->project->id}/poles/{$this->pole->id}/progress", ['work_item_id' => $copy->id, 'progress_percent' => 95])->assertConflict();
        $this->assertSame('75.00', $legacy->fresh()->progress_percent);
        $this->assertSame('90.00', $newer->fresh()->progress_percent);
        $this->assertDatabaseCount('pole_work_progress', 2);
        $this->assertDatabaseCount('progress_photos', 1);
    }

    public function test_apply_template_retains_custom_and_outdated_items(): void
    {
        $custom = $this->pole->workItems()->create(['project_id' => $this->project->id, 'name' => 'Manual', 'weight_percent' => 40]);
        $oldSource = $this->project->workItems()->create(['name' => 'Old template', 'weight_percent' => 0]);
        $outdated = $this->pole->workItems()->create(['project_id' => $this->project->id, 'source_item_id' => $oldSource->id, 'name' => 'Old copy', 'weight_percent' => 60]);
        $oldSource->delete();
        $this->postJson($this->url.'/apply-template')->assertOk();
        $this->assertDatabaseHas('work_items', ['id' => $custom->id, 'name' => 'Manual']);
        $this->assertDatabaseHas('work_items', ['id' => $outdated->id, 'name' => 'Old copy']);
        $this->assertEqualsWithDelta(100, $this->pole->workItems()->sum('weight_percent'), 0.001);
    }

    public function test_weight_changes_do_not_rewrite_the_historical_curve(): void
    {
        $this->records();
        $this->postJson($this->url, ['name' => 'New job', 'weight_percent' => 100])->assertCreated();
        $this->getJson("/api/projects/{$this->project->id}/poles/{$this->pole->id}/curve")
            ->assertOk()->assertJsonPath('actual_curve.0.progress_percent', 75)
            ->assertJsonPath('actual_current_percent', 37.5);
    }

    public function test_aggregate_includes_legacy_scoped_and_custom_weights_and_matches_project_curve(): void
    {
        $this->records();
        $other = Pole::create(['project_id' => $this->project->id, 'pole_code' => 'OTHER']);
        $copy = $other->workItems()->create(['project_id' => $this->project->id, 'source_item_id' => $this->template->id, 'name' => 'Pondasi', 'weight_percent' => 20]);
        $custom = $other->workItems()->create(['project_id' => $this->project->id, 'name' => 'Custom', 'weight_percent' => 80]);
        foreach ([[$copy, 50], [$custom, 100]] as [$item, $percent]) {
            PoleWorkProgress::create(['pole_id' => $other->id, 'work_item_id' => $item->id, 'progress_percent' => $percent]);
        }
        $response = $this->getJson("/api/projects/{$this->project->id}/work-items?scope=aggregate")->assertOk()
            ->assertJsonPath('data.0.weighted_contribution', 42.5)->assertJsonPath('meta.custom_weighted_contribution', 40)
            ->assertJsonPath('meta.actual_current_percent', 82.5);
        $this->getJson("/api/projects/{$this->project->id}/curve")->assertOk()->assertJsonPath('actual_current_percent', $response->json('meta.actual_current_percent'));
    }

    public function test_template_edits_and_normalization_do_not_change_scoped_items(): void
    {
        $copy = $this->pole->workItems()->create(['project_id' => $this->project->id, 'source_item_id' => $this->template->id, 'name' => 'Pondasi', 'weight_percent' => 100]);
        $this->postJson("/api/projects/{$this->project->id}/work-items", ['name' => 'Extra template', 'weight_percent' => 100])->assertCreated();
        $this->assertSame('100.00', $copy->fresh()->weight_percent);
        $this->assertSame('50.00', $this->template->fresh()->weight_percent);
        $this->deleteJson("/api/projects/{$this->project->id}/work-items/{$this->template->id}")->assertConflict();
    }

    public function test_partial_update_rejects_a_schedule_ending_before_existing_start(): void
    {
        $this->template->update(['planned_start_month' => 4, 'planned_end_month' => 6]);
        $this->patchJson($this->url.'/'.$this->template->id, ['planned_end_month' => 2])->assertUnprocessable()->assertJsonValidationErrors('planned_end_month');
        $this->assertDatabaseCount('work_items', 1);
    }

    public function test_other_project_and_other_pole_item_ids_are_rejected(): void
    {
        $other = Pole::create(['project_id' => $this->project->id, 'pole_code' => 'OTHER']);
        $item = $other->workItems()->create(['project_id' => $this->project->id, 'name' => 'Secret', 'weight_percent' => 100]);
        $this->patchJson($this->url.'/'.$item->id, ['name' => 'Changed'])->assertNotFound();
        $this->postJson("/api/projects/{$this->project->id}/poles/{$this->pole->id}/progress", ['work_item_id' => $item->id, 'progress_percent' => 100])->assertNotFound();
        $foreign = Project::create(['name' => 'Foreign', 'code' => 'FOREIGN']);
        $this->getJson("/api/projects/{$foreign->id}/poles/{$this->pole->id}/work-items")->assertNotFound();
        $this->assertSame('Secret', $item->fresh()->name);
    }

    public function test_progress_on_an_existing_scoped_item_has_a_bounded_query_count_with_a_large_catalog(): void
    {
        for ($i = 0; $i < 50; $i++) {
            $this->project->workItems()->create(['name' => 'Template '.$i, 'weight_percent' => 0]);
        }
        $copy = $this->pole->workItems()->create(['project_id' => $this->project->id, 'source_item_id' => $this->template->id, 'name' => 'Pondasi', 'weight_percent' => 100]);
        $count = 0;
        DB::listen(function () use (&$count) {
            $count++;
        });
        $this->postJson("/api/projects/{$this->project->id}/poles/{$this->pole->id}/progress", ['work_item_id' => $copy->id, 'progress_percent' => 50])
            ->assertOk()->assertJsonPath('pole_progress', 50);
        $this->assertLessThanOrEqual(35, $count, 'A normal progress update must not query every project template separately.');
    }
}
