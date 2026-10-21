<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('poles', 'work_items_customized_at')) {
            Schema::table('poles', function (Blueprint $table) {
                $table->timestamp('work_items_customized_at')->nullable();
            });
        }
        if (! Schema::hasColumn('work_items', 'pole_id')) {
            Schema::table('work_items', function (Blueprint $table) {
                $table->foreignId('pole_id')->nullable()->constrained('poles')->cascadeOnDelete();
                $table->index(['project_id', 'pole_id', 'sequence'], 'work_items_project_pole_sequence_idx');
            });
        }
        if (! Schema::hasColumn('work_items', 'source_item_id')) {
            Schema::table('work_items', function (Blueprint $table) {
                $table->foreignId('source_item_id')->nullable()->constrained('work_items')->nullOnDelete();
            });
        }
        if (! Schema::hasColumn('pole_progress_histories', 'weight_percent_snapshot')) {
            Schema::table('pole_progress_histories', function (Blueprint $table) {
                $table->decimal('weight_percent_snapshot', 5, 2)->nullable();
            });
        }
        if (! Schema::hasColumn('pole_progress_histories', 'is_active_snapshot')) {
            Schema::table('pole_progress_histories', function (Blueprint $table) {
                $table->boolean('is_active_snapshot')->nullable();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Additive fields may predate this migration; retain them and user data.
    }
};
