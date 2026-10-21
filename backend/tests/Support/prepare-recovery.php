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
$pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'RESTORE-1']);
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
echo implode("\n", $files)."\n";
