<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tabel tim + anggotanya.
 *
 * `project_id` nullable: satu tim bisa dipakai lintas project, atau
 * dibuat khusus untuk satu project. Tidak memaksapilihan karena
 * `project_user` (migration terpisah) sudah menangani cakupan per
 * project untuk level user.
 *
 * `code` nullable-unique: unique dengan NULL di PostgreSQL tidak
 * dianggap duplikat, jadi banyak tim tanpa code tetap aman.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teams', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code')->nullable()->unique();
            $table->foreignId('project_id')->nullable()
                ->constrained('projects')->nullOnDelete();
            $table->string('status')->default('active');
            $table->timestamps();

            $table->index('project_id');
            $table->index('status');
        });

        Schema::create('team_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained('teams')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            /* Peran di dalam tim (mis. "ketua") berbeda dari role
               global user, jadi tidak dipaksa sama. */
            $table->string('role')->nullable();
            $table->timestamps();

            /* Mencegah anggota yang sama masuk dua kali ke tim yang
               sama — inilah yang membuat endpoint add-member bisa
               idempoten tanpa check manual. */
            $table->unique(['team_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('team_members');
        Schema::dropIfExists('teams');
    }
};
