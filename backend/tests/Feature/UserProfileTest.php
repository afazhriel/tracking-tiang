<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Endpoint profil sendiri (`/api/user/profile`, `/api/user/password`,
 * `/api/user/avatar`, `/api/logout-all`).
 *
 * Titik beratnya dua hal: perubahan email harus dikunci password lama,
 * dan avatar tidak boleh meninggalkan file lama setelah diganti.
 */
class UserProfileTest extends TestCase
{
    use RefreshDatabase;

    private const PNG_BASE64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    public function test_user_can_update_name_and_phone_without_password(): void
    {
        $user = User::factory()->create(['email' => 'budi@example.com']);

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/user/profile', [
                'name' => 'Budi Baru',
                'email' => 'budi@example.com',
                'phone' => '081234567890',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Budi Baru')
            ->assertJsonPath('data.phone', '081234567890');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'name' => 'Budi Baru',
            'phone' => '081234567890',
        ]);
    }

    public function test_changing_email_requires_current_password(): void
    {
        $user = User::factory()->create([
            'email' => 'lama@example.com',
            'password' => 'rahasia123',
        ]);

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/user/profile', [
                'name' => $user->name,
                'email' => 'baru@example.com',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/user/profile', [
                'name' => $user->name,
                'email' => 'baru@example.com',
                'current_password' => 'salah1234',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/user/profile', [
                'name' => $user->name,
                'email' => 'Baru@Example.com',
                'current_password' => 'rahasia123',
            ])
            ->assertOk()
            ->assertJsonPath('data.email', 'baru@example.com');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'email' => 'baru@example.com',
        ]);
    }

    public function test_profile_update_rejects_email_taken_by_another_user(): void
    {
        $user = User::factory()->create(['email' => 'saya@example.com']);
        User::factory()->create(['email' => 'oranglain@example.com']);

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/user/profile', [
                'name' => $user->name,
                'email' => 'oranglain@example.com',
                'current_password' => 'password',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_user_can_change_password_with_correct_current_password(): void
    {
        $user = User::factory()->create([
            'email' => 'budi@example.com',
            'password' => 'rahasia123',
        ]);

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/user/password', [
                'current_password' => 'salah1234',
                'password' => 'barusaja123',
                'password_confirmation' => 'barusaja123',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/user/password', [
                'current_password' => 'rahasia123',
                'password' => 'barusaja123',
                'password_confirmation' => 'barusaja123',
            ])
            ->assertOk();

        $this->postJson('/api/login', [
            'email' => 'budi@example.com',
            'password' => 'barusaja123',
        ])->assertOk()->assertJsonStructure(['token', 'user']);
    }

    public function test_avatar_upload_replaces_file_and_can_be_served(): void
    {
        Storage::fake('public');

        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->post('/api/user/avatar', [
                'avatar' => $this->pngUpload('pertama.png'),
            ]);

        $response->assertOk()->assertJsonPath('message', 'Foto profil berhasil diperbarui.');

        $firstPath = $user->fresh()->avatar;

        $this->assertNotNull($firstPath);
        Storage::disk('public')->assertExists($firstPath);

        /* Foto lama harus terhapus setelah diganti. */
        $this->actingAs($user, 'sanctum')
            ->post('/api/user/avatar', [
                'avatar' => $this->pngUpload('kedua.png'),
            ])
            ->assertOk();

        $secondPath = $user->fresh()->avatar;

        $this->assertNotSame($firstPath, $secondPath);
        Storage::disk('public')->assertExists($secondPath);
        Storage::disk('public')->assertMissing($firstPath);

        /* Disajikan lewat endpoint public tanpa header Authorization. */
        $this->get('/api/user/avatar/'.$user->id)->assertOk();

        /* Hapus: kolom kosong + file hilang. */
        $this->actingAs($user, 'sanctum')
            ->deleteJson('/api/user/avatar')
            ->assertOk();

        $this->assertNull($user->fresh()->avatar);
        Storage::disk('public')->assertMissing($secondPath);

        $this->get('/api/user/avatar/'.$user->id)->assertNotFound();
    }

    public function test_avatar_rejects_non_image_payload(): void
    {
        Storage::fake('public');

        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->post('/api/user/avatar', [
                'avatar' => UploadedFile::fake()->create('dokumen.pdf', 10, 'application/pdf'),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('avatar');

        $this->assertNull($user->fresh()->avatar);
    }

    public function test_logout_all_revokes_every_token_including_current_one(): void
    {
        $user = User::factory()->create();

        $first = $user->createToken('perangkat-1')->plainTextToken;
        $user->createToken('perangkat-2')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$first}")
            ->getJson('/api/me')
            ->assertOk();

        $this->withHeader('Authorization', "Bearer {$first}")
            ->postJson('/api/logout-all')
            ->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);

        /*
         * Guard Sanctum menyimpan user pada instance guard, dan dalam satu
         * proses test instance itu terpakai ulang antar request (di server
         * tiap request adalah proses PHP baru). Lupakan guard supaya request
         * terakhir benar-benar membaca ulang token dari database.
         */
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', "Bearer {$first}")
            ->getJson('/api/me')
            ->assertStatus(401);
    }

    private function pngUpload(string $filename): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'avatar');
        file_put_contents($path, base64_decode(self::PNG_BASE64));

        return new UploadedFile($path, $filename, 'image/png', null, true);
    }
}
