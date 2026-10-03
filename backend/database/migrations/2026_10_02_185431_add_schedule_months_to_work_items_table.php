<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('work_items', function (Blueprint $table) {
            $table->unsignedTinyInteger('planned_start_month')
                ->nullable()
                ->after('planned_duration_days');

            $table->unsignedTinyInteger('planned_end_month')
                ->nullable()
                ->after('planned_start_month');
        });
    }

    public function down(): void
    {
        Schema::table('work_items', function (Blueprint $table) {
            $table->dropColumn([
                'planned_start_month',
                'planned_end_month',
            ]);
        });
    }
};
