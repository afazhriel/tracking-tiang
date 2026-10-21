<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\BrowserSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class BrowserSessionTest extends TestCase
{
    use RefreshDatabase;

    private function loginBrowser(): array
    {
        $user = User::factory()->pic()->create(['password' => 'fixture-password']);
        $response = $this->withHeaders(['X-Tracking-Client' => 'browser', 'Origin' => rtrim(config('app.url'), '/')])
            ->postJson('/api/login', ['email' => $user->email, 'password' => 'fixture-password'])
            ->assertOk()->assertJsonPath('token_type', 'Cookie')->assertJsonMissingPath('token');
        $cookie = $response->getCookie(BrowserSession::COOKIE, false);
        $this->assertNotNull($cookie);
        $this->assertTrue($cookie->isSecure());
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('strict', $cookie->getSameSite());
        $this->assertNull($cookie->getDomain());
        $this->assertSame('/', $cookie->getPath());
        $this->assertEqualsWithDelta(now()->addHours(12)->timestamp, $cookie->getExpiresTime(), 2);
        $this->app['auth']->forgetGuards();
        $this->withCredentials()->withUnencryptedCookie(BrowserSession::COOKIE, $cookie->getValue());

        return [$user, $cookie];
    }

    public function test_browser_login_uses_a_protected_cookie_and_authenticates_without_authorization_header(): void
    {
        [$user] = $this->loginBrowser();
        $this->getJson('/api/me')->assertOk()->assertJsonPath('id', $user->id)->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_cookie_mutation_requires_the_browser_header_and_a_matching_origin(): void
    {
        $this->loginBrowser();
        $this->withHeader('Origin', 'https://attacker.example')->postJson('/api/logout')->assertStatus(419);
        $this->withHeader('Origin', rtrim(config('app.url'), '/'))->withoutHeader('X-Tracking-Client')->postJson('/api/logout')->assertStatus(419);
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_browser_login_rejects_a_foreign_or_missing_origin(): void
    {
        $this->withHeaders(['X-Tracking-Client' => 'browser', 'Origin' => 'https://attacker.example'])
            ->postJson('/api/login', [])->assertStatus(419);
        $this->withoutHeader('Origin')->postJson('/api/login', [])->assertStatus(419);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_browser_cookie_expires_server_side_and_suspension_is_enforced(): void
    {
        [$user] = $this->loginBrowser();
        $user->update(['status' => 'suspended']);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/me')->assertForbidden();
        $user->update(['status' => 'active']);
        $this->travel(13)->hours();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_cookie_logout_revokes_the_token_and_expires_the_cookie(): void
    {
        $this->loginBrowser();
        $response = $this->postJson('/api/logout')->assertOk();
        $this->assertTrue($response->getCookie(BrowserSession::COOKIE, false)->isCleared());
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_existing_bearer_can_move_to_a_cookie_without_returning_or_duplicating_the_token(): void
    {
        $user = User::factory()->pic()->create();
        $token = $user->createToken('legacy-browser')->plainTextToken;
        $response = $this->withHeaders(['Authorization' => 'Bearer '.$token, 'X-Tracking-Client' => 'browser', 'Origin' => rtrim(config('app.url'), '/')])
            ->postJson('/api/browser-session')->assertOk()->assertJsonMissingPath('token');
        $this->assertSame($token, $response->getCookie(BrowserSession::COOKIE, false)->getValue());
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->assertNotNull(PersonalAccessToken::firstOrFail()->expires_at);
    }

    public function test_a_suspended_user_can_still_revoke_their_own_browser_session(): void
    {
        [$user] = $this->loginBrowser();
        $user->update(['status' => 'suspended']);
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_native_bearer_contract_still_works_without_browser_cookies_or_origin(): void
    {
        $user = User::factory()->pic()->create(['password' => 'fixture-password']);
        $response = $this->postJson('/api/login', ['email' => $user->email, 'password' => 'fixture-password'])->assertOk()->assertJsonPath('token_type', 'Bearer');
        $this->assertNull($response->getCookie(BrowserSession::COOKIE, false));
        $this->withToken($response->json('token'))->postJson('/api/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}
