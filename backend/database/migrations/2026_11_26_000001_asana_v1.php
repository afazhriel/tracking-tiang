<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fitur gaya Asana v1:
 * - tenggat per titik (poles.due_date)
 * - riwayat aktivitas proyek (project_activities) untuk peristiwa
 *   yang tidak punya tabel histori sendiri (penugasan, anggota,
 *   baseline, progres kuantitas)
 * - peran proyek lama tanpa peran dianggap pelaksana
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('poles', function (Blueprint $table) {
            $table->date('due_date')->nullable();
        });

        Schema::create('project_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 32);
            $table->string('subject_type', 32)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('title', 255);
            $table->text('description')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();
            $table->index(['project_id', 'created_at']);
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('project_activities');

        Schema::table('poles', function (Blueprint $table) {
            $table->dropColumn('due_date');
        });
    }
};
