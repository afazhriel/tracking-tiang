<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Menambahkan role + status ke `users` TANPA menyentuh data lama.
 *
 * Penting: tabel `users` sudah ada di production dengan data. Jadi
 * migration ini hanya ADD COLUMN — tidak pernah recreate tabel.
 *
 * `role` sengaja dibuat nullable tanpa default. Kalau diberi default
 * di level kolom, setiap user yang dibuat lewat jalur lain (misal
 * manual di server) ikut mendapat role tersebut tanpa pernah
 * ditunjuk oleh admin.
 *
 * Backfill di bawah hanya menyentuh user yang SUDAH ADA saat
 * migration berjalan. Nilainya `admin` karena sebelum migration ini
 * belum ada authorization sama sekali — satu-satunya user yang ada
 * saat itu sudah bisa melakukan apa pun. Kalau dia setback ke `pic`,
 * dia langsung kehilangan akses yang sebelumnya dia punya. Jadi
 * `admin` di sini artinya "pertahankan akses yang sudah ada", bukan
 * "berikan akses baru".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->nullable()->after('password');
            $table->string('status')->default('active')->after('role');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->index('role');
            $table->index('status');
        });

        /*
         * Hanya baris lama (role IS NULL). User baru yang dibuat
         * setelah migration lewat invitation akan selalu punya role
         * eksplisit, jadi tidak tersentuh baris ini.
         */
        DB::table('users')
            ->whereNull('role')
            ->update(['role' => 'admin']);

        DB::table('users')
            ->whereNull('status')
            ->update(['status' => 'active']);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropIndex(['status']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['role', 'status']);
        });
    }
};
