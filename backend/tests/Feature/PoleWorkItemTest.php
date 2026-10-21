<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\Project;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Item pekerjaan independen per tiang:
 * - tiang baru otomatis mendapat salinan item template,
 * - progres hanya boleh dicatat ke item milik tiang itu,
 * - item tiang bisa di-CRUD dan bobotnya dinormalisasi per tiang,
 * - halaman Pekerjaan memakai agregasi per item template.
 */
class PoleWorkItemTest extends TestCase
{
    use RefreshDatabase;

    private function makeProject(array $attributes = []): Project
    {
        return Project::create(array_merge([
            'name' => 'Proyek Uji',
            'code' => 'PRJ-PWI',
            'status' => 'active',
        ], $attributes));
    }

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function makeTemplate(
        Project $project,
        string $name,
        float $weight,
        int $sequence
    ): WorkItem {
        return WorkItem::create([
            'project_id' => $project->id,
            'pole_id' => null,
            'name' => $name,
            'weight_percent' => $weight,
            'sequence' => $sequence,
            'is_active' => true,
        ]);
    }

    private function createPole(User $admin, Project $project, string $code): Pole
    {
        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles", [
                'pole_code' => $code,
            ])
            ->assertCreated();

        return Pole::findOrFail($response->json('data.id'));
    }

    public function test_creating_pole_seeds_template_items(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();

        $this->makeTemplate($project, 'Pondasi', 60, 1);
        $this->makeTemplate($project, 'Tiang', 40, 2);

        $pole = $this->createPole($admin, $project, 'T-1');
        $pole->load('workItems');

        $this->assertCount(2, $pole->workItems);
        $this->assertEqualsWithDelta(
            100.0,
            (float) $pole->workItems->sum('weight_percent'),
            0.01
        );

        foreach ($pole->workItems as $item) {
            $this->assertNotNull($item->source_item_id);
            $this->assertSame($pole->id, $item->pole_id);
        }
    }

    public function test_progress_rejected_for_another_poles_item(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();

        $this->makeTemplate($project, 'Pondasi', 100, 1);

        $poleA = $this->createPole($admin, $project, 'A');
        $poleB = $this->createPole($admin, $project, 'B');

        $itemB = $poleB->workItems()->firstOrFail();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$poleA->id}/progress", [
                'work_item_id' => $itemB->id,
                'progress_percent' => 50,
            ])
            ->assertStatus(404);
    }

    public function test_pole_item_crud_normalizes_weights_per_pole(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();

        $this->makeTemplate($project, 'Pondasi', 100, 1);
        $pole = $this->createPole($admin, $project, 'T-1');

        $created = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/work-items", [
                'name' => 'Tiang',
                'weight_percent' => 100,
            ])
            ->assertCreated();

        $pole->load('workItems');

        $this->assertEqualsWithDelta(
            100.0,
            (float) $pole->workItems->sum('weight_percent'),
            0.01
        );
        $this->assertEqualsWithDelta(
            50.0,
            (float) $pole->workItems->firstWhere('name', 'Pondasi')->weight_percent,
            0.01
        );

        $newItemId = $created->json('data.id');

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/projects/{$project->id}/poles/{$pole->id}/work-items/{$newItemId}", [
                'name' => 'Tiang Beton',
                'weight_percent' => 50,
            ])
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/projects/{$project->id}/poles/{$pole->id}/work-items/{$newItemId}")
            ->assertOk();

        $pole->load('workItems');

        $this->assertCount(1, $pole->workItems);
        $this->assertEqualsWithDelta(
            100.0,
            (float) $pole->workItems->sum('weight_percent'),
            0.01
        );
    }

    public function test_apply_template_adds_new_template_items_to_pole(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();

        $this->makeTemplate($project, 'Pondasi', 100, 1);
        $pole = $this->createPole($admin, $project, 'T-1');

        /* Tambah template baru -> bobot template dinormalisasi 50/50. */
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/work-items", [
                'name' => 'Tiang',
                'weight_percent' => 100,
            ])
            ->assertCreated();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$pole->id}/work-items/apply-template")
            ->assertOk();

        $pole->load('workItems');

        $this->assertCount(2, $pole->workItems);
        $this->assertEqualsWithDelta(
            100.0,
            (float) $pole->workItems->sum('weight_percent'),
            0.01
        );
        $this->assertEqualsWithDelta(
            50.0,
            (float) $pole->workItems->firstWhere('name', 'Pondasi')->weight_percent,
            0.01
        );
    }

    public function test_default_index_returns_project_templates_only(): void
    {
        $project = $this->makeProject();
        $admin = $this->admin();

        $this->makeTemplate($project, 'Pondasi', 100, 1);
        $this->createPole($admin, $project, 'T-1');

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/work-items")
            ->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertNull($response->json('data.0.pole_id'));
    }

    public function test_aggregate_scope_rolls_up_pole_progress(): void
    {
        $project = $this->makeProject(['total_target_poles' => 2]);
        $admin = $this->admin();

        $this->makeTemplate($project, 'Pondasi', 100, 1);

        $poleA = $this->createPole($admin, $project, 'A');
        $this->createPole($admin, $project, 'B');

        $itemA = $poleA->workItems()->firstOrFail();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/poles/{$poleA->id}/progress", [
                'work_item_id' => $itemA->id,
                'progress_percent' => 100,
            ])
            ->assertOk();

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/work-items?scope=aggregate")
            ->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertEqualsWithDelta(50.0, (float) $response->json('data.0.actual_progress'), 0.01);
        $this->assertSame(1, $response->json('data.0.poles_with_progress'));
        $this->assertSame(2, $response->json('meta.progress_denominator'));

        $curve = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/curve")
            ->assertOk();

        $this->assertEqualsWithDelta(50.0, (float) $curve->json('actual_current_percent'), 0.01);
    }
}
