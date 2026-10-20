<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Support\MigrationPolicy;

class MigrationPolicyTest extends TestCase
{
    public function test_additive_up_and_destructive_down_are_allowed(): void
    {
        $source = <<<'PHP'
        <?php
        return new class {
            public function up() { Schema::table('users', function ($table) { $table->string('note')->nullable(); }); }
            public function down() { Schema::table('users', function ($table) { $table->dropColumn('note'); }); }
        };
        PHP;

        $this->assertSame([], MigrationPolicy::violations($source));
    }

    #[DataProvider('unsafeOperations')]
    public function test_destructive_up_is_rejected(string $statement): void
    {
        $source = '<?php return new class { public function up() { '.$statement.' } };';

        $this->assertNotEmpty(MigrationPolicy::violations($source));
    }

    public static function unsafeOperations(): array
    {
        return [
            'drop table' => ["Schema::dropIfExists('users');"],
            'drop column' => ["Schema::table('users', fn (\$table) => \$table->dropColumn('email'));"],
            'delete records' => ["DB::table('users')->delete();"],
            'truncate records' => ["DB::table('users')->truncate();"],
            'rewrite records' => ["DB::table('users')->update(['name' => 'changed']);"],
            'raw SQL' => ["DB::statement('DROP TABLE users');"],
            'rename column' => ["\$table->renameColumn('email', 'address');"],
            'change type' => ["\$table->integer('id')->change();"],
            'dynamic operation' => ['Schema::$operation();'],
        ];
    }
}
