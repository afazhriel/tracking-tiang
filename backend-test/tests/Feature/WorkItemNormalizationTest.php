<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use App\Models\WorkItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkItemNormalizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_adding_active_work_item_normalizes_active_weights_to_100_percent(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);

        $project = Project::create([
            'name' => 'Normalization Test',
            'code' => 'NORMALIZATION-TEST',
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
            'total_target_poles' => 100,
            'status' => 'active',
        ]);

        WorkItem::create([
            'project_id' => $project->id,
            'name' => 'Pekerjaan A',
            'weight_percent' => 60,
            'sequence' => 1,
            'is_active' => true,
        ]);

        WorkItem::create([
            'project_id' => $project->id,
            'name' => 'Pekerjaan B',
            'weight_percent' => 40,
            'sequence' => 2,
            'is_active' => true,
        ]);

        $this->actingAs($user)
            ->postJson("/api/projects/{$project->id}/work-items", [
                'name' => 'Pekerjaan C',
                'weight_percent' => 50,
                'sequence' => 3,
                'is_active' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('active_weight_total', 100);

        $this->assertSame(
            100.00,
            round(
                (float) WorkItem::where('project_id', $project->id)
                    ->where('is_active', true)
                    ->sum('weight_percent'),
                2
            )
        );
    }
}
