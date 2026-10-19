<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kolom profil tambahan: nomor telepon + path avatar.
 *
 * Seperti migration role/status sebelumnya: ADD COLUMN saja, tanpa
 * recreate tabel — `users` sudah berisi data di production.
 *
 * Keduanya nullable tanpa default. Profil lama tetap valid tanpa
 * telepon/foto, dan kolom `avatar` menyimpan path pada disk `public`
 * (bukan URL) supaya disk/filename bisa diganti tanpa migrasi data.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone')->nullable()->after('email');
            $table->string('avatar')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['phone', 'avatar']);
        });
    }
};
