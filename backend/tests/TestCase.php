<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Support\IsolatedDatabase;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        $app = parent::createApplication();
        // Runs before RefreshDatabase can migrate or clear any database.
        IsolatedDatabase::assertSafe($app);

        return $app;
    }
}
