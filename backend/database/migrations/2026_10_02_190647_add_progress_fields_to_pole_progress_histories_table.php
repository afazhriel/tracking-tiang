<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pole_progress_histories', function (Blueprint $table) {
            $table->foreignId('pole_id')
                ->constrained('poles')
                ->cascadeOnDelete();

            $table->foreignId('work_item_id')
                ->constrained('work_items')
                ->cascadeOnDelete();

            $table->decimal('progress_percent', 5, 2);

            $table->dateTime('recorded_at');

            $table->foreignId('recorded_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->text('notes')->nullable();
        });

        Schema::table('pole_progress_histories', function (Blueprint $table) {
            $table->index(
                ['pole_id', 'work_item_id', 'recorded_at'],
                'pole_progress_history_lookup'
            );
        });
    }

    public function down(): void
    {
        Schema::table('pole_progress_histories', function (Blueprint $table) {
            $table->dropIndex('pole_progress_history_lookup');
            $table->dropForeign(['recorded_by']);
            $table->dropForeign(['work_item_id']);
            $table->dropForeign(['pole_id']);
            $table->dropColumn([
                'pole_id',
                'work_item_id',
                'progress_percent',
                'recorded_at',
                'recorded_by',
                'notes',
            ]);
        });
    }
};
