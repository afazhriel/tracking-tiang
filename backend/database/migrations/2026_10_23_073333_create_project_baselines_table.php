<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_baselines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')
                ->constrained('projects')->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->string('status', 20)->default('draft');
            $table->string('unit_code', 40)->default('pole');
            $table->decimal('target_quantity', 14, 4);
            $table->date('start_date');
            $table->date('end_date');
            $table->foreignId('created_by')->nullable()
                ->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_by')->nullable()
                ->constrained('users')->restrictOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['project_id', 'version']);
            $table->index(['project_id', 'status']);
        });

        Schema::create('project_baseline_periods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_baseline_id')
                ->constrained('project_baselines')->restrictOnDelete();
            $table->unsignedInteger('period_number');
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('planned_quantity', 14, 4);
            $table->timestamps();

            $table->unique([
                'project_baseline_id',
                'period_number',
            ], 'baseline_period_number_unique');

            $table->unique([
                'project_baseline_id',
                'period_end',
            ], 'baseline_period_end_unique');
        });

        DB::statement("ALTER TABLE project_baselines ADD CONSTRAINT project_baselines_status_check CHECK (status IN ('draft','approved','superseded'))");
        DB::statement("ALTER TABLE project_baselines ADD CONSTRAINT project_baselines_target_positive CHECK (target_quantity > 0)");
        DB::statement("ALTER TABLE project_baselines ADD CONSTRAINT project_baselines_dates_valid CHECK (start_date <= end_date)");
        DB::statement("ALTER TABLE project_baselines ADD CONSTRAINT project_baselines_unit_valid CHECK (btrim(unit_code) <> '')");
        DB::statement("ALTER TABLE project_baseline_periods ADD CONSTRAINT baseline_period_quantity_valid CHECK (planned_quantity >= 0)");
        DB::statement("ALTER TABLE project_baseline_periods ADD CONSTRAINT baseline_period_dates_valid CHECK (period_start <= period_end)");
        DB::statement("ALTER TABLE project_baseline_periods ADD CONSTRAINT baseline_period_number_valid CHECK (period_number > 0)");
        DB::statement("CREATE UNIQUE INDEX project_baselines_one_approved ON project_baselines (project_id) WHERE status = 'approved'");
    }

    public function down(): void
    {
        Schema::dropIfExists('project_baseline_periods');
        Schema::dropIfExists('project_baselines');
    }
};
