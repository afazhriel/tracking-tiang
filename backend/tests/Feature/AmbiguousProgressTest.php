<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\PoleWorkProgress;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AmbiguousProgressTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('derivedEndpoints')]
    public function test_conflicting_legacy_states_do_not_become_a_false_total(string $suffix): void
    {
        $this->actingAs(User::factory()->admin()->create(), 'sanctum');
        $project = Project::create(['name' => 'Conflict', 'code' => 'CONFLICT']);
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'P-1']);
        $template = $project->workItems()->create(['name' => 'Pondasi', 'weight_percent' => 100]);
        $copy = $pole->workItems()->create(['project_id' => $project->id, 'source_item_id' => $template->id, 'name' => 'Pondasi', 'weight_percent' => 100]);
        foreach ([[$template, 75], [$copy, 90]] as [$item, $percent]) {
            PoleWorkProgress::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_percent' => $percent]);
        }
        $path = str_replace('{pole}', (string) $pole->id, $suffix);
        $this->getJson("/api/projects/{$project->id}/{$path}")->assertConflict();
        $this->assertDatabaseHas('pole_work_progress', ['work_item_id' => $template->id, 'progress_percent' => 75]);
        $this->assertDatabaseHas('pole_work_progress', ['work_item_id' => $copy->id, 'progress_percent' => 90]);
    }

    public static function derivedEndpoints(): array
    {
        return array_map(fn ($path) => [$path], ['curve', 'poles/{pole}/curve', 'work-items?scope=aggregate', 'poles/summary', 'poles/{pole}/progress']);
    }

    public function test_partial_history_remap_uses_one_timeline_for_the_same_source_item(): void
    {
        $this->actingAs(User::factory()->admin()->create(), 'sanctum');
        $project = Project::create(['name' => 'History', 'code' => 'HISTORY', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31']);
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'P-1']);
        $template = $project->workItems()->create(['name' => 'Pondasi', 'weight_percent' => 100]);
        $copy = $pole->workItems()->create(['project_id' => $project->id, 'source_item_id' => $template->id, 'name' => 'Pondasi', 'weight_percent' => 100]);
        PoleWorkProgress::create(['pole_id' => $pole->id, 'work_item_id' => $copy->id, 'progress_percent' => 90]);
        foreach ([[$template, 75, '2026-01-01'], [$copy, 90, '2026-01-02']] as [$item, $percent, $date]) {
            PoleProgressHistory::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_percent' => $percent, 'recorded_at' => $date, 'weight_percent_snapshot' => 100]);
        }
        $this->getJson("/api/projects/{$project->id}/poles/{$pole->id}/curve")->assertOk()
            ->assertJsonPath('actual_curve.0.progress_percent', 75)->assertJsonPath('actual_curve.1.progress_percent', 90)
            ->assertJsonPath('actual_current_percent', 90);
        $this->assertDatabaseCount('pole_progress_histories', 2);
    }

    public function test_pic_summary_is_not_blocked_by_conflicts_on_inaccessible_poles(): void
    {
        $project = Project::create(['name' => 'Scoped summary', 'code' => 'SCOPED']);
        $visible = Pole::create(['project_id' => $project->id, 'pole_code' => 'VISIBLE']);
        $hidden = Pole::create(['project_id' => $project->id, 'pole_code' => 'HIDDEN']);
        $template = $project->workItems()->create(['name' => 'Pondasi', 'weight_percent' => 100]);
        $copy = $hidden->workItems()->create(['project_id' => $project->id, 'source_item_id' => $template->id, 'name' => 'Pondasi', 'weight_percent' => 100]);
        foreach ([$template, $copy] as $item) {
            PoleWorkProgress::create(['pole_id' => $hidden->id, 'work_item_id' => $item->id, 'progress_percent' => 50]);
        }
        $pic = User::factory()->pic()->create();
        $pic->projects()->attach($project);
        $pic->poleAssignments()->create(['pole_id' => $visible->id, 'assigned_at' => now(), 'status' => 'active']);
        $this->actingAs($pic, 'sanctum')->getJson("/api/projects/{$project->id}/poles/summary")->assertOk()->assertJsonPath('data.0.pole_count', 1);
    }
}
