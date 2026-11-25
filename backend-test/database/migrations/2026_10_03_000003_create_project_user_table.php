<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Keanggotaan user per project.
 *
 * Nama tabel `project_user` mengikuti permintaan. Kolom `project_id`
 * memakai tipe yang sama dengan `projects.id` (bigint via
 * `$table->id()`), jadi FK-nya konsisten dengan `poles.project_id`.
 *
 * Role di sini nullable karena role global user sudah ada di
 * `users.role`. Kolom ini hanya untuk override di dalam satu project
 * (mis. admin global tetapi PIC di project tertentu) — biarkan
 * kosong kalau tidak ada override.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('role')->nullable();
            $table->timestamps();

            /* Satu user satu baris per project. */
            $table->unique(['project_id', 'user_id']);

            /* Query utama authorization: "user ini punya akses project
               mana saja" — selalu menyaring user_id. */
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_user');
    }
};
