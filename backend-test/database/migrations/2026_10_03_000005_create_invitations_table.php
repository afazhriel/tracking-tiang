<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Undangan bermuka akun — satu-satunya cara membuat user baru.
 *
 * TIDAK ada public registration: tanpa baris valid di tabel ini,
 * `POST /api/invitations/{token}/accept` tidak bisa dipanggil.
 *
 * `token_hash` menyimpan SHA-256 dari token, bukan tokennya sendiri.
 * Token 64 karakter hanya pernah ada di response pembuatan
 * undangan (untuk dikirim lewat email) dan di input user.
 * Kalau database bocor, token yang di-curi tidak langsung bisa
 * dipakai karena yang tersimpan sudah di-hash. Perbandingan saat
 * accept selalu lewat hash, jadi tidak ada jalur yang membandingkan
 * token mentah.
 *
 * Tidak ada kolom password di sini. Password baru dibuat user saat
 * accept, jadi kredensial tidak pernah ada di tabel undangan.
 *
 * `user_id` nullable: undangan bisa dibuat sebelum akunnya ada.
 * Diisi otomatis setelah accept berhasil.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->string('email');
            $table->string('name')->nullable();
            $table->string('role');

            /* Keduanya nullable: undangan bisa_SETELAH dibuat tanpa
               langsung ditugaskan ke tim/project, dan diisi belakangan
               lewat PATCH. */
            $table->foreignId('team_id')->nullable()
                ->constrained('teams')->nullOnDelete();
            $table->foreignId('project_id')->nullable()
                ->constrained('projects')->nullOnDelete();

            $table->foreignId('invited_by')->constrained('users')->cascadeOnDelete();
            $table->string('token_hash', 64);

            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->string('status')->default('pending');
            $table->foreignId('user_id')->nullable()
                ->constrained('users')->nullOnDelete();

            $table->timestamps();

            /* Lookup utama: cari hash token saat accept. */
            $table->unique('token_hash');

            /* Daftar undangan per status, dan cek "sudah ada
               undangan pending untuk email ini?". */
            $table->index(['email', 'status']);
            $table->index(['status', 'expires_at']);
            $table->index('project_id');
            $table->index('team_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
    }
};
