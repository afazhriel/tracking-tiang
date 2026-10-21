<?php

namespace Tests\Feature;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class AccountSafetyTest extends TestCase
{
    use DatabaseTruncation;

    protected function setUp(): void
    {
        parent::setUp();
        // Separate API processes need committed fixtures. Clear only the guarded
        // testing database so subsequent transactional feature tests start empty.
        $this->beforeApplicationDestroyed(fn () => $this->truncateTablesForAllConnections());
    }

    public function test_last_admin_cannot_be_made_pending(): void
    {
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'sanctum')->patchJson("/api/users/{$admin->id}/status", ['status' => 'pending'])->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->assertSame('active', $admin->fresh()->status);
    }

    public function test_last_admin_cannot_lose_the_admin_role(): void
    {
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'sanctum')->putJson("/api/users/{$admin->id}", ['role' => 'pic'])
            ->assertUnprocessable()->assertJsonValidationErrors('role');
        $this->assertSame('admin', $admin->fresh()->role);
    }

    public function test_an_admin_can_still_set_a_pic_to_pending_with_an_accurate_message(): void
    {
        $admin = User::factory()->admin()->create();
        $pic = User::factory()->pic()->create();
        $this->actingAs($admin, 'sanctum')->patchJson("/api/users/{$pic->id}/status", ['status' => 'pending'])
            ->assertOk()->assertJsonPath('data.status', 'pending')->assertJsonPath('message', 'Akun menunggu persetujuan.');
    }

    public function test_two_concurrent_suspensions_cannot_remove_all_active_admins(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('The locking regression requires isolated PostgreSQL.');
        }
        $first = User::factory()->admin()->create();
        $second = User::factory()->admin()->create();
        $worker = base_path('tests/Support/account-race-worker.php');
        $a = new Process([PHP_BINARY, $worker, (string) $first->id, (string) $first->id, 'tracking-admin-race-a'], base_path(), timeout: 15);
        $b = new Process([PHP_BINARY, $worker, (string) $second->id, (string) $second->id, 'tracking-admin-race-b'], base_path(), timeout: 15);
        $statuses = $this->race($a, $b, $first, 'tracking-admin-race-a', 'tracking-admin-race-b');
        $this->assertSame([200, 422], $statuses);
        $this->assertSame(1, User::where('role', 'admin')->where('status', 'active')->count());
    }

    public function test_concurrent_accept_and_revoke_cannot_leave_an_active_account_with_a_revoked_invitation(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('The locking regression requires isolated PostgreSQL.');
        }
        $admin = User::factory()->admin()->create();
        $invitation = Invitation::create(['email' => 'race-invite@example.test', 'role' => 'pic', 'status' => 'pending', 'expires_at' => now()->addDay(), 'token_hash' => Invitation::hashToken(str_repeat('a', 64)), 'invited_by' => $admin->id]);
        $worker = base_path('tests/Support/account-race-worker.php');
        $a = new Process([PHP_BINARY, $worker, (string) $admin->id, (string) $invitation->id, 'tracking-invite-race-a', 'accept'], base_path(), timeout: 15);
        $b = new Process([PHP_BINARY, $worker, (string) $admin->id, (string) $invitation->id, 'tracking-invite-race-b', 'revoke'], base_path(), timeout: 15);
        $statuses = $this->race($a, $b, $invitation, 'tracking-invite-race-a', 'tracking-invite-race-b');
        $result = ['status' => $invitation->fresh()->status, 'account_created' => User::where('email', 'race-invite@example.test')->exists(), 'responses' => $statuses];
        $this->assertContains($result, [
            ['status' => 'accepted', 'account_created' => true, 'responses' => [201, 422]],
            ['status' => 'revoked', 'account_created' => false, 'responses' => [200, 403]],
        ]);
    }

    private function race(Process $a, Process $b, Model $record, string $nameA, string $nameB): array
    {
        DB::beginTransaction();
        try {
            $record->newQuery()->whereKey($record->getKey())->lockForUpdate()->firstOrFail();
            $a->start();
            $this->waitFor(fn () => $this->isWaiting($nameA));
            $b->start();
            $this->waitFor(fn () => ! $b->isRunning() || $this->isWaiting($nameB));
            DB::rollBack();
            $a->wait();
            $b->wait();
            $this->assertSame(0, $a->getExitCode(), 'First isolated API worker failed.');
            $this->assertSame(0, $b->getExitCode(), 'Second isolated API worker failed.');
            $statuses = [json_decode($a->getOutput(), true, flags: JSON_THROW_ON_ERROR)['status'], json_decode($b->getOutput(), true, flags: JSON_THROW_ON_ERROR)['status']];
            sort($statuses);

            return $statuses;
        } finally {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            $a->stop(0);
            $b->stop(0);
        }
    }

    private function waitFor(callable $ready): void
    {
        $deadline = microtime(true) + 6;
        do {
            if ($ready()) {
                return;
            }
            usleep(20000);
        } while (microtime(true) < $deadline);
        $this->fail('Isolated API workers did not reach the expected PostgreSQL synchronization point.');
    }

    private function isWaiting(string $name): bool
    {
        DB::select('SELECT pg_stat_clear_snapshot()');

        return DB::table('pg_stat_activity')->where('application_name', $name)->where('wait_event_type', 'Lock')->exists();
    }
}
