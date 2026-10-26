<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->foreignId('owner_user_id')
                ->nullable()
                ->constrained('users')
                ->restrictOnDelete();

            $table->index('owner_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropForeign(['owner_user_id']);
            $table->dropIndex(['owner_user_id']);
            $table->dropColumn('owner_user_id');
        });
    }
};
