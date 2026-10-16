<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\Project;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Normalisasi bobot item pekerjaan.
 *
 * Menambah/mengubah item tidak lagi ditolak walaupun jumlah bobot
 * melebihi 100%; seluruh item otomatis diskalakan hingga totalnya
 * tepat 100% sehingga progres berbobot dan Kurva S tetap konsisten.
 */
class WorkItemNormalizationTest extends TestCase
{
    use RefreshDatabase;

    private function makeProject(array $attributes = []): Project
    {
        return Project::create(array_merge([
            'name' => 'Proyek Uji',
            'code' => 'PRJ-NRM',
            'status' => 'active',
        ], $attributes));
    }

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function makeWorkItem(
        Project $project,
        string $name,
        float $weight,
        int $sequence
    ): WorkItem {
        return WorkItem::create([
            'project_id' => $project->id,
            'name' => $name,
            'weight_percent' => $weight,
            'sequence' => $sequence,
            'is_active' => true,
        ]);
    }

    private function totalWeight(Project $project): float
    {
        return round((float) $project->workItems()->sum('weight_percent'), 2);
    }

    public function test_adding_item_over_budget_is_allowed_and_normalized(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();

        $this->makeWorkItem($project, 'Pondasi', 100, 1);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/work-items", [
                'name' => 'Tiang',
                'weight_percent' => 50,
            ])
            ->assertCreated();

        $this->assertEqualsWithDelta(100.0, $this->totalWeight($project), 0.01);

        $items = $project->workItems()->get();

        $this->assertEqualsWithDelta(
            66.67,
            (float) $items->firstWhere('name', 'Pondasi')->weight_percent,
            0.01
        );
        $this->assertEqualsWithDelta(
            33.33,
            (float) $items->firstWhere('name', 'Tiang')->weight_percent,
            0.01
        );
    }

    public function test_updating_weight_normalizes_total_to_100(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();

        $first = $this->makeWorkItem($project, 'A', 50, 1);
        $this->makeWorkItem($project, 'B', 50, 2);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/projects/{$project->id}/work-items/{$first->id}", [
                'name' => 'A',
                'weight_percent' => 100,
            ])
            ->assertOk();

        $this->assertEqualsWithDelta(100.0, $this->totalWeight($project), 0.01);
    }

    public function test_normalize_endpoint_rebalances_imbalanced_weights(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();

        $this->makeWorkItem($project, 'A', 70, 1);
        $this->makeWorkItem($project, 'B', 40, 2);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/work-items/normalize")
            ->assertOk();

        $this->assertEqualsWithDelta(100.0, $this->totalWeight($project), 0.01);

        $items = $project->workItems()->get();

        $this->assertEqualsWithDelta(
            63.64,
            (float) $items->firstWhere('name', 'A')->weight_percent,
            0.01
        );
        $this->assertEqualsWithDelta(
            36.36,
            (float) $items->firstWhere('name', 'B')->weight_percent,
            0.01
        );
    }

    public function test_work_item_index_reports_balance(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();

        $this->makeWorkItem($project, 'A', 50, 1);
        $this->makeWorkItem($project, 'B', 60, 2);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/work-items")
            ->assertOk();

        $this->assertFalse($response->json('meta.is_balanced'));

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/work-items/normalize")
            ->assertOk();

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/work-items")
            ->assertOk();

        $this->assertTrue($response->json('meta.is_balanced'));
        $this->assertEqualsWithDelta(100.0, (float) $response->json('meta.total_weight'), 0.01);
    }

    public function test_curve_actual_percent_consistent_with_normalized_weights(): void
    {
        $project = $this->makeProject([
            'code' => 'PRJ-CRV',
            'total_target_poles' => 1,
        ]);
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/work-items", [
                'name' => 'A',
                'weight_percent' => 100,
            ])
            ->assertCreated();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/work-items", [
                'name' => 'B',
                'weight_percent' => 50,
            ])
            ->assertCreated();

        $this->assertEqualsWithDelta(100.0, $this->totalWeight($project), 0.01);

        $pole = Pole::create([
            'project_id' => $project->id,
            'pole_code' => 'TIANG-K1',
        ]);

        foreach ($project->workItems()->get() as $item) {
            $this->actingAs($admin, 'sanctum')
                ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/progress", [
                    'work_item_id' => $item->id,
                    'progress_percent' => 100,
                ])
                ->assertOk();
        }

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/curve")
            ->assertOk();

        $this->assertEqualsWithDelta(
            100.0,
            (float) $response->json('actual_current_percent'),
            0.01
        );
    }
}
