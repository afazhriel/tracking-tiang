<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('poles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('region_id')->nullable()->constrained('regions')->nullOnDelete();

            $table->string('pole_code');
            $table->text('address')->nullable();

            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();

            $table->string('status')->default('active');

            $table->timestamps();

            $table->unique(['project_id', 'pole_code']);
            $table->index(['project_id', 'region_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poles');
    }
};
