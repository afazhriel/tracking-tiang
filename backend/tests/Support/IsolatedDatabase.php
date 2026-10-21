<?php

namespace Tests\Support;

use Illuminate\Foundation\Application;
use LogicException;

final class IsolatedDatabase
{
    public static function assertSafe(Application $app, bool $postgresOnly = false): void
    {
        $connection = $app['config']->get('database.default');
        $config = $app['config']->get("database.connections.{$connection}", []);

        if (! $app->environment('testing')) {
            throw new LogicException('Database tests require APP_ENV=testing.');
        }
        if (! empty($config['url'])) {
            throw new LogicException('Database URL overrides are not allowed in tests.');
        }

        if (! $postgresOnly && $connection === 'sqlite' && ($config['database'] ?? null) === ':memory:') {
            return;
        }

        if ($connection !== 'pgsql'
            || ! in_array($config['host'] ?? null, ['127.0.0.1', 'localhost', 'postgres'], true)
            || ! in_array($config['database'] ?? null, ['tracking_ci', 'tracking_migrations_ci'], true)) {
            throw new LogicException('Tests require an isolated PostgreSQL CI database or SQLite :memory:.');
        }
    }
}
