<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pole_progress_histories', function (Blueprint $table) {
            $table->decimal('weight_percent_snapshot', 5, 2)->nullable();
            $table->boolean('is_active_snapshot')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('pole_progress_histories', function (Blueprint $table) {
            $table->dropColumn([
                'weight_percent_snapshot',
                'is_active_snapshot',
            ]);
        });
    }
};
