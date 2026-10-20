<?php

namespace Tests\Migration;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\IsolatedDatabase;
use Tests\TestCase;

class MigrationCompatibilityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        if (config('database.default') !== 'pgsql') {
            $this->markTestSkipped('Migration compatibility requires isolated PostgreSQL.');
        }
        IsolatedDatabase::assertSafe($this->app, postgresOnly: true);
    }

    public function test_fresh_install_supports_login(): void
    {
        $this->artisan('migrate:fresh', ['--force' => true])->assertSuccessful();
        $user = User::factory()->admin()->create(['password' => Hash::make('fixture-password')]);

        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'fixture-password'])
            ->assertOk()->assertJsonStructure(['token', 'user']);
    }

    #[DataProvider('baselineSchemas')]
    public function test_upgrade_preserves_existing_records_columns_and_files(bool $productionDrift): void
    {
        $this->freezeTime();
        $base = getenv('CI_BASE_MIGRATIONS');
        $this->assertNotFalse($base, 'CI_BASE_MIGRATIONS must point to the base commit migrations.');
        $this->assertDirectoryExists($base);
        $this->artisan('migrate:fresh', ['--path' => $base, '--realpath' => true, '--force' => true])->assertSuccessful();
        Storage::fake('public');
        Storage::disk('public')->put('progress-photos/legacy.png', 'legacy upload');
        Storage::disk('public')->put('avatars/legacy.png', 'legacy avatar');
        $this->seedLegacyRecords();

        if ($productionDrift) {
            $this->artisan('migrate', [
                '--path' => base_path('tests/Fixtures/production-migrations'),
                '--realpath' => true, '--force' => true,
            ])->assertSuccessful();
            DB::table('notifications')->insert([
                'user_id' => DB::table('users')->where('email', 'legacy@example.test')->value('id'),
                'title' => 'Notifikasi lama', 'description' => 'Pertahankan isi notifikasi',
                'read_at' => null, 'created_at' => '2026-01-01 12:00:00',
                'updated_at' => '2026-01-01 12:00:00',
            ]);
        }
        $before = $this->snapshot();

        $this->artisan('migrate', ['--force' => true])->assertSuccessful();

        foreach ($before as $table => $snapshot) {
            $this->assertTrue(Schema::hasTable($table), "Legacy table removed: {$table}");
            foreach ($snapshot['columns'] as $column) {
                $this->assertTrue(Schema::hasColumn($table, $column), "Legacy column removed: {$table}.{$column}");
            }
            $this->assertSame($snapshot['rows'], $this->rows($table, $snapshot['columns']), "Legacy records changed: {$table}");
            foreach ($snapshot['foreign_keys'] as $foreignKey) {
                $this->assertContains($foreignKey, Schema::getForeignKeys($table), "Legacy relationship removed: {$table}");
            }
        }
        Storage::disk('public')->assertExists('progress-photos/legacy.png');
        Storage::disk('public')->assertExists('avatars/legacy.png');
        $after = $this->snapshot();
        $this->artisan('migrate', ['--force' => true])->assertSuccessful();
        $this->assertSame($after, $this->snapshot(), 'Running migrations twice must not duplicate or rewrite data.');
        $user = User::where('email', 'legacy@example.test')->firstOrFail();
        $project = DB::table('projects')->where('code', 'LEGACY')->value('id');
        $this->actingAs($user, 'sanctum')->getJson("/api/projects/{$project}/curve")
            ->assertOk()->assertJsonPath('actual_current_percent', 9.375);
    }

    public static function baselineSchemas(): array
    {
        return ['GitHub base schema' => [false], 'known production schema extensions' => [true]];
    }

    public function test_pre_role_and_profile_users_keep_passwords_and_progress_after_upgrade(): void
    {
        $path = sys_get_temp_dir().'/tracking-historical-'.bin2hex(random_bytes(6));
        mkdir($path);
        foreach (glob(database_path('migrations/*.php')) as $file) {
            if (basename($file) < '2026_10_03') {
                copy($file, $path.'/'.basename($file));
            }
        }
        try {
            $this->artisan('migrate:fresh', ['--path' => $path, '--realpath' => true, '--force' => true])->assertSuccessful();
            $this->seedLegacyRecords();
            $before = $this->snapshot();

            $this->artisan('migrate', ['--force' => true])->assertSuccessful();

            foreach ($before as $table => $snapshot) {
                $this->assertSame($snapshot['rows'], $this->rows($table, $snapshot['columns']), $table);
            }
            $this->assertDatabaseHas('users', ['email' => 'legacy@example.test', 'role' => 'admin', 'status' => 'active', 'phone' => null, 'avatar' => null]);
            $this->postJson('/api/login', ['email' => 'legacy@example.test', 'password' => 'fixture-password'])->assertOk();
        } finally {
            foreach (glob($path.'/*') as $file) {
                unlink($file);
            }
            rmdir($path);
        }
    }

    private function seedLegacyRecords(): void
    {
        $timestamps = ['created_at' => '2026-01-01 12:00:00', 'updated_at' => '2026-01-01 12:00:00'];
        $user = ['name' => 'Pengguna Lama', 'email' => 'legacy@example.test', 'password' => Hash::make('fixture-password')];
        if (Schema::hasColumn('users', 'role')) {
            $user += ['role' => 'admin', 'status' => 'active'];
        }
        if (Schema::hasColumn('users', 'phone')) {
            $user += ['phone' => '081234567890', 'avatar' => 'avatars/legacy.png'];
        }
        $userId = DB::table('users')->insertGetId($user + $timestamps);
        if (Schema::hasColumn('users', 'role')) {
            DB::table('users')->insert([
                'name' => 'PIC lama', 'email' => 'legacy-pic@example.test',
                'password' => Hash::make('fixture-password'), 'role' => 'pic', 'status' => 'pending',
            ] + $timestamps);
        }
        if (Schema::hasTable('personal_access_tokens')) {
            DB::table('personal_access_tokens')->insert([
                'tokenable_type' => User::class, 'tokenable_id' => $userId,
                'name' => 'legacy-device', 'token' => hash('sha256', 'fixture-token'),
                'abilities' => '["*"]',
            ] + $timestamps);
        }
        $projectId = DB::table('projects')->insertGetId(['name' => 'Proyek Lama', 'code' => 'LEGACY', 'status' => 'active', 'total_target_poles' => 4] + $timestamps);
        $poleId = DB::table('poles')->insertGetId(['project_id' => $projectId, 'pole_code' => 'LAMA-01', 'address' => 'Alamat lama – tidak boleh hilang', 'latitude' => '-6.2000000', 'longitude' => '106.8000000'] + $timestamps);
        $itemId = DB::table('work_items')->insertGetId(['project_id' => $projectId, 'name' => 'Pondasi Lama', 'weight_percent' => '100.00', 'sequence' => 1, 'is_active' => true] + $timestamps);
        DB::table('pole_work_progress')->insert(['pole_id' => $poleId, 'work_item_id' => $itemId, 'progress_percent' => '37.50', 'notes' => 'Catatan lama', 'updated_by' => $userId] + $timestamps);
        $historyId = DB::table('pole_progress_histories')->insertGetId(['pole_id' => $poleId, 'work_item_id' => $itemId, 'progress_percent' => '37.50', 'recorded_by' => $userId, 'recorded_at' => '2026-01-01 12:00:00', 'notes' => 'Riwayat lama'] + $timestamps);
        if (Schema::hasTable('progress_photos')) {
            DB::table('progress_photos')->insert(['ulid' => '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'pole_id' => $poleId, 'work_item_id' => $itemId, 'progress_history_id' => $historyId, 'path' => 'progress-photos/legacy.png', 'uploaded_by' => $userId] + $timestamps);
        }
        if (Schema::hasTable('teams')) {
            $teamId = DB::table('teams')->insertGetId(['name' => 'Tim Lama', 'project_id' => $projectId] + $timestamps);
            DB::table('team_members')->insert(['team_id' => $teamId, 'user_id' => $userId, 'role' => 'ketua'] + $timestamps);
            DB::table('project_user')->insert(['project_id' => $projectId, 'user_id' => $userId, 'role' => 'admin'] + $timestamps);
        }
    }

    private function snapshot(): array
    {
        $snapshot = [];
        foreach (Schema::getTableListing('public', schemaQualified: false) as $table) {
            if ($table === 'migrations') {
                continue;
            }
            $columns = Schema::getColumnListing($table);
            $snapshot[$table] = ['columns' => $columns, 'rows' => $this->rows($table, $columns), 'foreign_keys' => Schema::getForeignKeys($table)];
        }
        ksort($snapshot);

        return $snapshot;
    }

    private function rows(string $table, array $columns): array
    {
        return DB::table($table)->get($columns)->map(fn ($row) => (array) $row)
            ->sortBy(fn ($row) => json_encode($row))->values()->all();
    }
}
