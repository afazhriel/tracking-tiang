<?php

use App\Models\Pole;
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
$owner = User::factory()->pic()->create(['name' => 'Browser PIC', 'email' => 'browser-owner@example.test', 'password' => 'browser-fixture-password']);
$other = User::factory()->pic()->create(['email' => 'browser-other@example.test', 'password' => 'browser-fixture-password']);
$admin = User::factory()->admin()->create(['email' => 'browser-admin@example.test', 'password' => 'browser-fixture-password']);
$project = Project::create(['name' => 'Browser project', 'code' => 'BROWSER']);
$pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'BROWSER-1']);
$item = $pole->workItems()->create(['project_id' => $project->id, 'name' => 'Browser work', 'weight_percent' => 100]);
$owner->projects()->attach($project);
$owner->poleAssignments()->create(['pole_id' => $pole->id, 'assigned_at' => now(), 'status' => 'active']);
$path = 'progress-photos/browser-ci-'.Str::ulid().'.png';
Storage::disk('public')->put($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));
$photo = ProgressPhoto::create(['pole_id' => $pole->id, 'disk' => 'public', 'path' => $path]);
$owner->update(['avatar' => $path]);
echo json_encode(['owner_id' => $owner->id, 'project_id' => $project->id, 'pole_id' => $pole->id, 'work_item_id' => $item->id, 'photo_url' => $photo->url()], JSON_THROW_ON_ERROR);
