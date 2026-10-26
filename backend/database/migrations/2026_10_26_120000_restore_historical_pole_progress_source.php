<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // The original quantity upgrade set quantity_entries as the default
        // for every existing project. TT-001 was explicitly corrected, but
        // other legacy projects with real pole history need the same legacy
        // calculation. Only correct rows with unambiguous historical evidence.
        // Never convert the live TANKI --01 quantity project.
        DB::table('projects')
            ->where('progress_source', 'quantity_entries')
            ->where('code', '<>', 'TANKI --01')
            ->where('total_target_poles', '>', 0)
            ->whereNotNull('target_quantity')
            ->whereRaw('target_quantity = total_target_poles')
            ->whereExists(function ($query) {
                $query->selectRaw('1')
                    ->from('poles as p')
                    ->join('pole_progress_histories as h', 'h.pole_id', '=', 'p.id')
                    ->whereColumn('p.project_id', 'projects.id');
            })
            ->whereNotExists(function ($query) {
                $query->selectRaw('1')
                    ->from('project_quantity_entries as e')
                    ->whereColumn('e.project_id', 'projects.id');
            })
            ->update(['progress_source' => 'pole_weighted']);
    }

    public function down(): void
    {
        // Do not automatically reverse a historical source correction.
        // A rollback to quantity_entries would conceal real pole progress.
    }
};
