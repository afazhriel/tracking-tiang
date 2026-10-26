<?php

use App\Models\Notification;
use App\Models\Pole;
use App\Models\PoleProgressHistory;
use App\Models\PoleWorkProgress;
use App\Models\ProgressPhoto;
use App\Models\Project;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Support\IsolatedDatabase;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
IsolatedDatabase::assertSafe($app, postgresOnly: true);
Artisan::call('migrate:fresh', ['--force' => true]);
$user = User::factory()->pic()->create();
$project = Project::create(['name' => 'Recovery fixture', 'code' => 'RECOVERY']);
$user->projects()->attach($project, ['role' => 'legacy-role']);
// Recovery must exercise independent derived grants, not only direct access.
$team = \App\Models\Team::create(['name' => 'Recovery team', 'project_id' => $project->id, 'status' => 'active']);
$teamMember = User::factory()->pic()->create();
$team->users()->attach($teamMember, ['role' => 'field']);

$pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'RESTORE-1']);
\App\Models\PoleAssignment::create([
    'pole_id' => $pole->id,
    'team_id' => $team->id,
    'user_id' => null,
    'assigned_by' => $user->id,
    'assigned_at' => now(),
    'status' => 'active',
]);

$template = $project->workItems()->create(['name' => 'Legacy template', 'weight_percent' => 100]);
$copy = $pole->workItems()->create(['project_id' => $project->id, 'name' => 'Partial copy', 'source_item_id' => $template->id, 'weight_percent' => 80]);
$pole->workItems()->create(['project_id' => $project->id, 'name' => 'Manual job', 'weight_percent' => 20]);
$files = [];
foreach ([[$template, 75, 'public'], [$copy, 90, 'media']] as [$item, $percent, $disk]) {
    PoleWorkProgress::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_percent' => $percent, 'notes' => 'Keep legacy state']);
    $history = PoleProgressHistory::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_percent' => $percent, 'weight_percent_snapshot' => $item->weight_percent, 'recorded_at' => now()->subDay()]);
    $path = 'recovery-ci/'.Str::ulid().'.png';
    Storage::disk($disk)->put($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));
    ProgressPhoto::create(['pole_id' => $pole->id, 'work_item_id' => $item->id, 'progress_history_id' => $history->id, 'disk' => $disk, 'path' => $path]);
    $files[] = 'storage/app/'.($disk === 'public' ? 'public' : 'private/media').'/'.$path;
}
Notification::create(['user_id' => $user->id, 'project_id' => $project->id, 'category' => 'sistem', 'title' => 'Existing read notification', 'read_at' => now()->subHour(), 'data' => ['pole_id' => $pole->id]]);
// Approved quantity baseline, idempotency key/fingerprint and quantity history
// must survive a real PostgreSQL custom-format dump and restore.
$quantity = Project::create([
    'name' => 'Quantity recovery fixture', 'code' => 'TANKI --01',
    'target_quantity' => '100.0000', 'unit_code' => 'unit',
    'progress_source' => 'quantity_entries',
    'start_date' => '2026-10-01', 'end_date' => '2026-10-31',
]);
$quantity->forceFill(['owner_user_id' => $user->id])->save();
\Illuminate\Support\Facades\DB::table('project_quantity_entries')->insert([
    'project_id' => $quantity->id,
    'quantity_delta' => '25.0000',
    'unit_code' => 'unit',
    'recorded_at' => '2026-10-20 12:00:00',
    'recorded_by' => $user->id,
    'request_key' => 'recovery-quantity-001',
    'request_fingerprint' => hash('sha256', 'recovery-quantity-001'),
    'notes' => 'Preserve amount, timeline and request fingerprint',
    'created_at' => now(),
    'updated_at' => now(),
]);
$baselineId = \Illuminate\Support\Facades\DB::table('project_baselines')->insertGetId([
    'project_id' => $quantity->id,
    'version' => 1,
    'status' => 'draft',
    'unit_code' => 'unit',
    'target_quantity' => '100.0000',
    'start_date' => '2026-10-01',
    'end_date' => '2026-10-31',
    'created_by' => $user->id,
    'created_at' => now(),
    'updated_at' => now(),
]);
\Illuminate\Support\Facades\DB::table('project_baseline_periods')->insert([
    'project_baseline_id' => $baselineId,
    'period_number' => 1,
    'period_start' => '2026-10-01',
    'period_end' => '2026-10-31',
    'planned_quantity' => '100.0000',
    'created_at' => now(),
    'updated_at' => now(),
]);
\Illuminate\Support\Facades\DB::table('project_baselines')->where('id', $baselineId)->update([
    'status' => 'approved',
    'approved_by' => $user->id,
    'approved_at' => now(),
    'updated_at' => now(),
]);

echo implode("\n", $files)."\n";
