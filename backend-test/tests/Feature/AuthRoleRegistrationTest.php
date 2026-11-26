<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthRoleRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_self_registration_creates_pending_user_with_default_role(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Budi Lapangan',
            'email' => 'Budi@Example.com',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ]);

        $response->assertCreated()
            ->assertJsonPath('user.role', User::ROLE_PIC)
            ->assertJsonPath('user.status', User::STATUS_PENDING)
            ->assertJsonStructure(['message', 'user' => ['id', 'name', 'email', 'role', 'role_label', 'status']]);

        /* Tidak ada token: akun pending belum boleh dipakai. */
        $response->assertJsonMissingPath('token');

        $this->assertDatabaseHas('users', [
            'email' => 'budi@example.com',
            'role' => User::ROLE_PIC,
            'status' => User::STATUS_PENDING,
        ]);
    }

    public function test_self_registration_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'budi@example.com']);

        $this->postJson('/api/register', [
            'name' => 'Budi Lagi',
            'email' => 'Budi@example.com',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_self_registration_requires_password_confirmation(): void
    {
        $this->postJson('/api/register', [
            'name' => 'Budi',
            'email' => 'budi@example.com',
            'password' => 'rahasia123',
            'password_confirmation' => 'beda12345',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_pending_user_cannot_login(): void
    {
        User::factory()->pending()->create([
            'email' => 'pending@example.com',
            'password' => 'rahasia123',
        ]);

        $this->postJson('/api/login', [
            'email' => 'pending@example.com',
            'password' => 'rahasia123',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_suspended_user_cannot_login(): void
    {
        User::factory()->suspended()->create([
            'email' => 'susp@example.com',
            'password' => 'rahasia123',
        ]);

        $this->postJson('/api/login', [
            'email' => 'susp@example.com',
            'password' => 'rahasia123',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_login_is_case_insensitive_on_email(): void
    {
        User::factory()->create([
            'email' => 'budi@example.com',
            'password' => 'rahasia123',
        ]);

        $this->postJson('/api/login', [
            'email' => 'BUDI@example.com',
            'password' => 'rahasia123',
        ])->assertOk()->assertJsonStructure(['token', 'token_type', 'user']);
    }

    public function test_admin_can_approve_pending_user_and_then_that_user_can_login(): void
    {
        $admin = User::factory()->admin()->create();
        $pending = User::factory()->pending()->create([
            'email' => 'pending@example.com',
            'password' => 'rahasia123',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/users/{$pending->id}/status", ['status' => User::STATUS_ACTIVE])
            ->assertOk()
            ->assertJsonPath('data.status', User::STATUS_ACTIVE);

        $this->postJson('/api/login', [
            'email' => 'pending@example.com',
            'password' => 'rahasia123',
        ])->assertOk()->assertJsonPath('user.status', User::STATUS_ACTIVE);
    }

    public function test_non_admin_cannot_list_users(): void
    {
        $pic = User::factory()->pic()->create();

        $this->actingAs($pic, 'sanctum')
            ->getJson('/api/users')
            ->assertStatus(403);
    }

    public function test_admin_can_list_users(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(2)->create();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/users')
            ->assertOk()
            ->assertJsonStructure(['data']);
    }

    public function test_last_active_admin_cannot_be_suspended(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/users/{$admin->id}/status", ['status' => User::STATUS_SUSPENDED])
            ->assertStatus(422);

        $this->assertDatabaseHas('users', [
            'id' => $admin->id,
            'status' => User::STATUS_ACTIVE,
        ]);
    }

    public function test_active_middleware_blocks_suspended_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $user->forceFill(['status' => User::STATUS_SUSPENDED])->save();

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/me')
            ->assertStatus(403);
    }
}
