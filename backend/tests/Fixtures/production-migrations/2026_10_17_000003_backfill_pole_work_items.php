<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Backfill: setiap tiang mendapat salinan item pekerjaan project,
 * lalu baris progres/histori/foto yang ada di-remap ke salinan tiang.
 *
 * Item project (pole_id NULL) tetap dipertahankan sebagai template.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('work_items', 'pole_id')) {
            return;
        }

        /* Sudah pernah di-backfill -> jangan duplikasi. */
        if (DB::table('work_items')->whereNotNull('pole_id')->exists()) {
            return;
        }

        if (! DB::table('work_items')->whereNull('pole_id')->exists()) {
            return;
        }

        $now = now();

        DB::table('poles')->orderBy('id')->chunk(100, function ($poles) use ($now) {
            foreach ($poles as $pole) {
                $templates = DB::table('work_items')
                    ->whereNull('pole_id')
                    ->where('project_id', $pole->project_id)
                    ->orderBy('sequence')
                    ->orderBy('id')
                    ->get();

                foreach ($templates as $template) {
                    $copyId = DB::table('work_items')->insertGetId([
                        'project_id' => $template->project_id,
                        'pole_id' => $pole->id,
                        'source_item_id' => $template->id,
                        'name' => $template->name,
                        'weight_percent' => $template->weight_percent,
                        'sequence' => $template->sequence,
                        'planned_duration_days' => $template->planned_duration_days,
                        'is_active' => $template->is_active,
                        'planned_start_month' => $template->planned_start_month,
                        'planned_end_month' => $template->planned_end_month,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);

                    DB::table('pole_work_progress')
                        ->where('pole_id', $pole->id)
                        ->where('work_item_id', $template->id)
                        ->update(['work_item_id' => $copyId]);

                    DB::table('pole_progress_histories')
                        ->where('pole_id', $pole->id)
                        ->where('work_item_id', $template->id)
                        ->update(['work_item_id' => $copyId]);

                    DB::table('progress_photos')
                        ->where('pole_id', $pole->id)
                        ->where('work_item_id', $template->id)
                        ->update(['work_item_id' => $copyId]);
                }
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('work_items', 'pole_id')) {
            return;
        }

        $copies = DB::table('work_items')
            ->whereNotNull('pole_id')
            ->whereNotNull('source_item_id')
            ->get();

        foreach ($copies as $copy) {
            DB::table('pole_work_progress')
                ->where('work_item_id', $copy->id)
                ->update(['work_item_id' => $copy->source_item_id]);

            DB::table('pole_progress_histories')
                ->where('work_item_id', $copy->id)
                ->update(['work_item_id' => $copy->source_item_id]);

            DB::table('progress_photos')
                ->where('work_item_id', $copy->id)
                ->update(['work_item_id' => $copy->source_item_id]);
        }

        DB::table('work_items')->whereNotNull('pole_id')->delete();
    }
};
