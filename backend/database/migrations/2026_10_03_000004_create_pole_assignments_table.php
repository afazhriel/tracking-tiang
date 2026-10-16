<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Penugasan tiang ke user dan/atau tim.
 *
 * Aturan yang dijaga migration ini:
 *
 * 1. Tiap baris harus punya minimal satu target (`user_id` ATAU
 *    `team_id`). Dijaga dua lapis: CHECK constraint di database dan
 *    validasi di controller. Kalau tidak, baris tanpa target jadi
 *    tiang yang "ditugaskan ke tidak siapa-siapa" dan lolos dari
 *    filter authorization.
 *
 * 2. TIDAK ada kolom project di sini. `poles.project_id` tetap
 *    satu-satunya sumber kebenaran project suatu tiang. Kolom itu
 *    sengaja tidak ditambahkan supaya tidak ada dua tempat yang bisa
 *    menyimpang dan tidak ada jalur yang bisa "memindahkan" tiang ke
 *    project lain lewat tabel assignment.
 *
 * 3. Penghapusan assignment TIDAK menghapus baris. Endpoint DELETE
 *    mengubah `status` jadi `revoked`. Kalau nanti user yang sama
 *    ditugaskan lagi, baris lama yang di-revive — sehingga riwayat
 *    "siapa yang pernahDitugaskan" tidak hilang.
 *
 * Uniqueness memakai (pole_id, user_id) dan (pole_id, team_id)
 * terpisah. Di PostgreSQL NULL tidak dianggap duplikat, jadi satu
 * tiang boleh punya banyak user (semua NULL di kolom team) tanpa
 * saling menabrak unique constraint.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pole_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pole_id')->constrained('poles')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()
                ->constrained('users')->nullOnDelete();
            $table->foreignId('team_id')->nullable()
                ->constrained('teams')->nullOnDelete();

            /* Siapa yang memberi penugasan. nullOnDelete supaya
              _account admin yang dihapus tidak ikut menghapus
               penugasan milik lapangan. */
            $table->foreignId('assigned_by')->nullable()
                ->constrained('users')->nullOnDelete();

            $table->timestamp('assigned_at');
            $table->string('status')->default('active');
            $table->timestamps();

            $table->unique(['pole_id', 'user_id']);
            $table->unique(['pole_id', 'team_id']);

            /* Tiga index ini yang dipakai query authorization PIC:
               "tiang mana yang ditugaskan ke user ini". */
            $table->index('user_id');
            $table->index('team_id');
            $table->index(['pole_id', 'status']);
        });

        /* CHECK constraint ditambahkan lewat ALTER TABLE — didukung
           PostgreSQL/MySQL, tapi TIDAK oleh SQLite (dipakai test suite).
           Jadi hanya dijalankan pada driver yang mendukungnya; di
           SQLite aturan ini tetap dijaga layer validasi controller. */
        if (in_array(DB::connection()->getDriverName(), ['pgsql', 'mysql', 'mariadb'], true)) {
            DB::statement(
                'ALTER TABLE pole_assignments ADD CONSTRAINT pole_assignments_target_check '
                .'CHECK (user_id IS NOT NULL OR team_id IS NOT NULL)'
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('pole_assignments');
    }
};
