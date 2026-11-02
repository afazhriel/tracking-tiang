<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\PoleWorkProgress;
use App\Models\Project;
use App\Models\User;
use App\Services\PoleWorkItems;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class ProgressConsistencyTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $this->travelTo(now()->setDate(2026, 11, 2)->setTime(12, 0));
        $this->actingAs(User::factory()->admin()->create(), 'sanctum');
        $project = Project::create(['name' => 'Tracking Tiang', 'code' => 'TT-001', 'progress_source' => 'pole_weighted', 'total_target_poles' => 1500, 'target_quantity' => 1500, 'start_date' => '2026-10-15', 'end_date' => '2027-07-14']);
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'ABANG-01']);
        $items = [];
        foreach ([[78.41, 78.41], [21.59, 5.24]] as $i => [$weight, $snapshot]) {
            $item = $pole->workItems()->create(['project_id' => $project->id, 'name' => 'Job '.$i, 'weight_percent' => $weight, 'is_active' => true, 'planned_start_month' => 1, 'planned_end_month' => 9]);
            PoleWorkProgress::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_percent' => 100]);
            PoleProgressHistory::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_percent' => 100, 'weight_percent_snapshot' => $snapshot, 'is_active_snapshot' => true, 'recorded_at' => '2026-10-27 10:00:00']);
            $items[] = $item;
        }

        return [$project, $pole, $items];
    }

    public function test_current_basis_matches_latest_history_without_rewriting_snapshots(): void
    {
        [$project, $pole] = $this->fixture();
        $before = PoleProgressHistory::orderBy('id')->get()->toJson();
        $this->getJson("/api/projects/{$project->id}/poles/{$pole->id}/curve")
            ->assertOk()->assertJsonPath('actual_current_percent', 100)
            ->assertJsonPath('actual_curve.0.progress_percent', 100)
            ->assertJsonPath('legacy_snapshot_curve.0.progress_percent', 83.65)
            ->assertJsonPath('calculation_basis', 'current_active_weights')
            ->assertJsonPath('data_quality.current_matches_latest_history', true);
        $this->getJson("/api/projects/{$project->id}/curve")->assertOk()
            ->assertJsonPath('actual_current_percent', 0.0667)
            ->assertJsonPath('actual_curve.0.progress_percent', 0.0667)
            ->assertJsonCount(0, 'planned_curve')->assertJsonPath('baseline_status', 'not_approved');
        $this->assertSame($before, PoleProgressHistory::orderBy('id')->get()->toJson());
    }

    public function test_unknown_snapshots_and_pre_project_dates_remain_visible_and_unmodified(): void
    {
        [$project, $pole, $items] = $this->fixture();
        PoleProgressHistory::query()->update(['weight_percent_snapshot' => null, 'recorded_at' => '2026-10-09 10:00:00']);
        $before = PoleProgressHistory::orderBy('id')->get()->toJson();
        app(PoleWorkItems::class)->normalize(collect($items));
        $this->getJson("/api/projects/{$project->id}/poles/{$pole->id}/curve")->assertOk()
            ->assertJsonPath('legacy_snapshot_curve.0.progress_percent', null)
            ->assertJsonPath('data_quality.missing_weight_snapshots', 2)
            ->assertJsonPath('data_quality.records_before_project_start', 2);
        $this->assertSame($before, PoleProgressHistory::orderBy('id')->get()->toJson());
    }

    public function test_schedule_outside_project_period_is_flagged_instead_of_repeated_end_dates(): void
    {
        [$project, $pole] = $this->fixture();
        $project->update(['end_date' => '2026-10-29']);
        $this->getJson("/api/projects/{$project->id}/poles/{$pole->id}/curve")->assertOk()
            ->assertJsonCount(0, 'planned_curve')
            ->assertJsonPath('data_quality.plan_issues.0', 'work_schedule_exceeds_project_end');
        $project->update(['end_date' => '2027-07-14']);
        $dates = $this->getJson("/api/projects/{$project->id}/poles/{$pole->id}/curve")->assertOk()->json('planned_curve');
        $this->assertCount(10, $dates);
        $this->assertCount(10, array_unique(array_column($dates, 'date')));
        $this->assertSame('2027-07-14', end($dates)['date']);
    }

    public function test_realization_time_and_partial_date_updates_are_validated_atomically(): void
    {
        [$project, $pole, $items] = $this->fixture();
        $url = "/api/projects/{$project->id}/poles/{$pole->id}/progress";
        $payload = ['work_item_id' => $items[0]->id, 'progress_percent' => 90];
        $this->postJson($url, $payload + ['recorded_at' => '2026-10-28T15:00:00+07:00', 'started_at' => '2026-10-20'])->assertOk();
        $this->assertDatabaseHas('pole_progress_histories', ['work_item_id' => $items[0]->id, 'recorded_at' => '2026-10-28 08:00:00', 'progress_percent' => 90]);
        foreach (['2026-10-01T00:00:00Z', '2026-10-27T11:00:00Z', '2026-11-03T00:00:00Z'] as $date) {
            $this->postJson($url, $payload + ['recorded_at' => $date])->assertUnprocessable()->assertJsonValidationErrors('recorded_at');
        }
        $this->postJson($url, $payload + ['completed_at' => '2026-10-19'])->assertUnprocessable()->assertJsonValidationErrors('completed_at');
        $this->assertDatabaseCount('pole_progress_histories', 3);
    }

    public function test_weight_reconciliation_requires_fresh_plan_and_preserves_histories(): void
    {
        [$project, $pole, $items] = $this->fixture();
        $items[0]->update(['weight_percent' => 19.03]);
        $items[1]->update(['weight_percent' => 5.24]);
        $before = PoleProgressHistory::orderBy('id')->get()->toJson();
        $this->assertSame(0, Artisan::call('tracking:reconcile-weights', ['project' => $project->id]));
        $plan = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame('19.03', $items[0]->fresh()->weight_percent);
        $this->assertSame(1, Artisan::call('tracking:reconcile-weights', ['project' => $project->id, '--apply' => true, '--expect' => 'stale', '--reason' => 'scope reviewed']));
        $this->assertSame(0, Artisan::call('tracking:reconcile-weights', ['project' => $project->id, '--apply' => true, '--expect' => $plan['fingerprint'], '--reason' => 'scope reviewed']));
        $this->assertEquals(100, $pole->workItems()->sum('weight_percent'));
        $this->assertSame(1, Artisan::call('tracking:reconcile-weights', ['project' => $project->id, '--apply' => true, '--expect' => $plan['fingerprint'], '--reason' => 'stale repeat']));
        $this->assertSame($before, PoleProgressHistory::orderBy('id')->get()->toJson());
    }
}
