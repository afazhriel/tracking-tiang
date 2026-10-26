<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->decimal('target_quantity', 18, 4)->nullable();

            $table->string('unit_code', 32)
                ->default('unit');

            $table->string('progress_source', 32)
                ->default('quantity_entries');
        });

        // Pertahankan nilai target seluruh proyek lama.
        DB::table('projects')
            ->whereNotNull('total_target_poles')
            ->update([
                'target_quantity' => DB::raw('total_target_poles'),
            ]);

        // TT-001 tetap menggunakan sumber progres tiang historis.
        DB::table('projects')
            ->where('id', 1)
            ->where('code', 'TT-001')
            ->update([
                'unit_code' => 'pole',
                'progress_source' => 'pole_weighted',
            ]);

        DB::statement(
            'ALTER TABLE projects ADD CONSTRAINT ' .
            'projects_target_quantity_nonnegative ' .
            'CHECK (target_quantity IS NULL OR target_quantity >= 0)'
        );

        // Histori realisasi untuk proyek umum.
        // Tidak digunakan untuk menghitung ulang histori TT-001.
        Schema::create('project_quantity_entries', function (Blueprint $table) {
            $table->id();

            $table->foreignId('project_id')
                ->constrained('projects')
                ->restrictOnDelete();

            $table->decimal('quantity_delta', 18, 4);

            $table->string('unit_code', 32);

            $table->dateTime('recorded_at');

            $table->foreignId('recorded_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->string('request_key', 100)->nullable();
            $table->char('request_fingerprint', 64)->nullable();

            $table->text('notes')->nullable();

            $table->timestamps();

            $table->unique(
                ['project_id', 'request_key'],
                'project_qty_entries_request_unique'
            );

            $table->index(
                ['project_id', 'recorded_at'],
                'project_qty_entries_date_index'
            );
        });

        DB::statement(
            'ALTER TABLE project_quantity_entries ' .
            'ADD CONSTRAINT project_qty_entries_nonzero ' .
            'CHECK (quantity_delta <> 0)'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('project_quantity_entries');

        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn([
                'target_quantity',
                'unit_code',
                'progress_source',
            ]);
        });
    }
};
