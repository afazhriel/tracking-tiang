<?php

namespace Tests\Feature;

use App\Models\Pole;
use App\Models\ProgressPhoto;
use App\Models\Project;
use App\Models\User;
use App\Services\BrowserSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PrivateMediaTest extends TestCase
{
    use RefreshDatabase;

    private function photo(): ProgressPhoto
    {
        Storage::fake('public');
        Storage::disk('public')->put('progress-photos/legacy.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));
        $project = Project::create(['name' => 'Private', 'code' => 'PRIVATE']);
        $pole = Pole::create(['project_id' => $project->id, 'pole_code' => 'PRIVATE-1']);

        return ProgressPhoto::create(['pole_id' => $pole->id, 'disk' => 'public', 'path' => 'progress-photos/legacy.png']);
    }

    public function test_anonymous_requests_cannot_read_existing_photos_or_enumerate_avatars(): void
    {
        $photo = $this->photo();
        $user = User::factory()->pic()->create(['avatar' => $photo->path]);
        $this->get($photo->url())->assertUnauthorized();
        $this->get('/api/user/avatar/'.$user->id)->assertUnauthorized();
        Storage::disk('public')->assertExists($photo->path);
    }

    public function test_photo_access_checks_the_pole_policy_and_revocation_each_time(): void
    {
        $photo = $this->photo();
        $pic = User::factory()->pic()->create();
        $pic->projects()->attach($photo->pole->project_id);
        $token = $pic->createToken('browser', ['*'], now()->addHours(12))->plainTextToken;
        $this->withUnencryptedCookie(BrowserSession::COOKIE, $token)->get($photo->url())->assertForbidden();
        $assignment = $pic->poleAssignments()->create(['pole_id' => $photo->pole_id, 'status' => 'active', 'assigned_at' => now()]);
        $this->app['auth']->forgetGuards();
        $this->get($photo->url())->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertHeader('Content-Type', 'image/png');
        $assignment->update(['status' => 'revoked']);
        $this->app['auth']->forgetGuards();
        $this->get($photo->url())->assertForbidden();
    }

    public function test_pic_cannot_read_another_users_avatar_even_when_authenticated(): void
    {
        $photo = $this->photo();
        $owner = User::factory()->pic()->create(['avatar' => $photo->path]);
        $other = User::factory()->pic()->create();
        $this->actingAs($other, 'sanctum')->get('/api/user/avatar/'.$owner->id)->assertForbidden();
        $this->actingAs($owner, 'sanctum')->get($owner->avatarUrl())->assertOk();
    }

    public function test_legacy_html_disguised_as_a_photo_or_avatar_is_never_rendered_inline(): void
    {
        $photo = $this->photo();
        Storage::disk('public')->put($photo->path, '<html><script>alert(1)</script></html>');
        $photo->update(['mime_type' => 'image/png']);
        $admin = User::factory()->admin()->create(['avatar' => $photo->path]);
        $this->actingAs($admin, 'sanctum')->get($photo->url())->assertStatus(415);
        $this->get($admin->avatarUrl())->assertStatus(415);
        Storage::disk('public')->assertExists($photo->path);
    }
}
