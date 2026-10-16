<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();

            $table->string('name');
            $table->decimal('weight_percent', 5, 2);
            $table->unsignedInteger('sequence')->default(0);
            $table->unsignedInteger('planned_duration_days')->nullable();

            $table->boolean('is_active')->default(true);

            $table->timestamps();

            $table->index(['project_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_items');
    }
};
