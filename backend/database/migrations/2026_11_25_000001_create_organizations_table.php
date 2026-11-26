<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Organisasi (PT klien).
     *
     * Setiap pengguna mendaftar dengan nama PT. PT yang sama = satu
     * organisasi; pendaftar pertama menjadi admin organisasi itu,
     * pendaftar berikutnya masuk sebagai PIC menunggu persetujuan.
     * Nama PT inilah yang tampil sebagai kop Surat Job — bukan PT
     * pemilik platform.
     *
     * `org_id` NULL pada users = admin platform (akun admin lama),
     * yang tidak terikat satu organisasi dan bisa melihat semuanya.
     * Proyek dengan `org_id` NULL = proyek platform.
     */
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('address')->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('email')->nullable();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('org_id')
                ->nullable()
                ->after('id')
                ->constrained('organizations')
                ->nullOnDelete();
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->foreignId('org_id')
                ->nullable()
                ->after('id')
                ->constrained('organizations')
                ->nullOnDelete();
        });

        // Catatan: backfill org_id untuk data lama sengaja tidak dilakukan
        // di up() (kebijakan CI melarang update di migrasi). Di fresh install
        // tidak ada baris lama untuk di-backfill; produksi sudah ter-backfill.
        $orgId = DB::table('organizations')->insertGetId([
            'name' => 'PT Atap Teknologi Indonesia',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropForeign(['org_id']);
            $table->dropColumn('org_id');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['org_id']);
            $table->dropColumn('org_id');
        });

        Schema::dropIfExists('organizations');
    }
};
