<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notifikasi nyata (bukan disintesis dari data progress).
 *
 * Notifikasi bersifat per-user, opsional terikat project.
 * `href` disimpan supaya klik notifikasi bisa mengarahkan ke halaman
 * terkait (mis. detail tiang) tanpa frontend perlu menebak.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->foreignId('project_id')
                ->nullable()
                ->constrained('projects')
                ->cascadeOnDelete();

            $table->string('category', 32)->default('sistem');
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('href')->nullable();
            $table->json('data')->nullable();

            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'read_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
