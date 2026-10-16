<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Penugasan provinsi per user.
 *
 * PIC/supervisor hanya boleh MENAMBAH tiang dan MENCATAT progress
 * di provinsi yang ditugaskan ke mereka. Admin tidak dibatasi.
 *
 * `province_id` mengikuti PK string(10) tabel `provinces`
 * (lihat 2026_10_05_063605_create_indonesia_regions_tables.php).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('province_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('province_id', 10);
            $table->foreign('province_id')
                ->references('id')
                ->on('provinces')
                ->cascadeOnDelete();
            $table->timestamps();

            /* Mencegah provinsi yang sama ditugaskan dua kali ke user
               yang sama. */
            $table->unique(['user_id', 'province_id']);
            $table->index('province_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('province_user');
    }
};
