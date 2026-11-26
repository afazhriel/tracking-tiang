<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Foto dokumentasi progress tiang.
 *
 * File disimpan di disk `public` (storage/app/public/progress-photos)
 * dan diakses lewat route publik `GET /api/photos/{ulid}` — URL-nya
 * memakai ULID acak sehingga tidak bisa ditebak, dan tidak butuh
 * symlink `storage:link` maupun perubahan nginx.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('progress_photos', function (Blueprint $table) {
            $table->id();
            $table->string('ulid', 26)->unique();

            $table->foreignId('pole_id')->constrained('poles')->cascadeOnDelete();
            $table->foreignId('work_item_id')->nullable()
                ->constrained('work_items')->nullOnDelete();

            /* Tautkan ke baris histori progress yang menghasilkannya,
               supaya timeline aktivitas bisa menampilkan foto per event. */
            $table->unsignedBigInteger('progress_history_id')->nullable();
            $table->foreign('progress_history_id')
                ->references('id')
                ->on('pole_progress_histories')
                ->nullOnDelete();

            $table->string('disk')->default('public');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->foreignId('uploaded_by')->nullable()
                ->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('pole_id');
            $table->index('progress_history_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('progress_photos');
    }
};
