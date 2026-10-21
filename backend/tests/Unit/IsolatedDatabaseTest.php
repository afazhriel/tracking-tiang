<?php

namespace Tests\Unit;

use Illuminate\Config\Repository;
use Illuminate\Foundation\Application;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Support\IsolatedDatabase;

class IsolatedDatabaseTest extends TestCase
{
    #[DataProvider('unsafeConfigurations')]
    public function test_unsafe_database_configuration_is_rejected(string $environment, string $connection, array $config): void
    {
        $app = new Application;
        $app->instance('env', $environment);
        $app->instance('config', new Repository(['database' => [
            'default' => $connection, 'connections' => [$connection => $config],
        ]]));

        $this->expectException(LogicException::class);

        IsolatedDatabase::assertSafe($app);
    }

    public static function unsafeConfigurations(): array
    {
        return [
            'production environment' => ['production', 'pgsql', ['host' => 'postgres', 'database' => 'tracking_ci']],
            'production database' => ['testing', 'pgsql', ['host' => 'postgres', 'database' => 'tracking_tiang']],
            'remote server' => ['testing', 'pgsql', ['host' => 'db.example.com', 'database' => 'tracking_ci']],
            'database URL override' => ['testing', 'pgsql', ['host' => 'postgres', 'database' => 'tracking_ci', 'url' => 'pgsql://example.invalid']],
            'SQLite URL override' => ['testing', 'sqlite', ['database' => ':memory:', 'url' => 'pgsql://example.invalid']],
            'SQLite user data file' => ['testing', 'sqlite', ['database' => '/tmp/development.sqlite']],
        ];
    }
}
