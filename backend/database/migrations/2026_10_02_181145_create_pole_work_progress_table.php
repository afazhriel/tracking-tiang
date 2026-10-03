<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pole_work_progress', function (Blueprint $table) {
            $table->id();

            $table->foreignId('pole_id')
                ->constrained('poles')
                ->cascadeOnDelete();

            $table->foreignId('work_item_id')
                ->constrained('work_items')
                ->cascadeOnDelete();

            $table->decimal('progress_percent', 5, 2)->default(0);

            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->text('notes')->nullable();

            $table->foreignId('updated_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();

            $table->unique(['pole_id', 'work_item_id']);
            $table->index(['pole_id', 'work_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pole_work_progress');
    }
};
