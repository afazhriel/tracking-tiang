<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Item pekerjaan menjadi milik tiang (independen per tiang).
 *
 * - `pole_id` NULL  -> item template/master milik project.
 * - `pole_id` terisi -> salinan item milik satu tiang, tempat progres dicatat.
 * - `source_item_id` -> menunjuk item template asal salinan, dipakai untuk
 *   agregasi per nama pekerjaan di halaman Pekerjaan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('work_items', function (Blueprint $table) {
            $table->foreignId('pole_id')
                ->nullable()
                ->after('project_id')
                ->constrained('poles')
                ->cascadeOnDelete();

            $table->foreignId('source_item_id')
                ->nullable()
                ->after('pole_id')
                ->constrained('work_items')
                ->nullOnDelete();

            $table->index(
                ['project_id', 'pole_id', 'sequence'],
                'work_items_project_pole_sequence_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('work_items', function (Blueprint $table) {
            $table->dropForeign(['source_item_id']);
            $table->dropForeign(['pole_id']);
            $table->dropIndex('work_items_project_pole_sequence_idx');
            $table->dropColumn(['source_item_id', 'pole_id']);
        });
    }
};
