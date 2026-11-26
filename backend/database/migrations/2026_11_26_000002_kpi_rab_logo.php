<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * KPI + RAB + logo organisasi (26 Nov 2026):
 * - organizations.logo_path (logo kop RAB/Surat Job, file di disk public)
 * - project_budgets + project_budget_items (RAB pengajuan per proyek)
 * - Pesan trigger pengaman baseline: "Baseline" -> "Rencana"
 *   (logika trigger tidak berubah, hanya kata yang tampil ke pengguna)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->string('logo_path')->nullable()->after('email');
        });

        Schema::create('project_budgets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
            $table->string('title')->nullable();
            $table->string('status', 20)->default('draf');
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('submitted_at')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('decided_at')->nullable();
            $table->text('rejection_note')->nullable();
            $table->timestamps();
            $table->index(['project_id', 'status']);
            $table->index(['project_id', 'created_at']);
        });

        Schema::create('project_budget_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('budget_id')->constrained('project_budgets')->cascadeOnDelete();
            $table->string('name');
            $table->string('category', 100)->nullable();
            $table->decimal('volume', 18, 4);
            $table->string('unit', 32);
            $table->decimal('unit_price', 18, 2);
            $table->decimal('line_total', 18, 2);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index(['budget_id', 'sort_order']);
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('project_budget_items');
        Schema::dropIfExists('project_budgets');

        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn('logo_path');
        });

        // Kembalikan pesan trigger ke kata "Baseline" (migrasi awal
        // 2026_10_23_080910) — fungsi + trigger dibuat ulang persis.
        DB::unprepared('DROP TRIGGER IF EXISTS project_baseline_period_protection ON project_baseline_periods');
        DB::unprepared('DROP TRIGGER IF EXISTS project_baseline_protection ON project_baselines');
        DB::unprepared('DROP FUNCTION IF EXISTS guard_project_baseline_period()');
        DB::unprepared('DROP FUNCTION IF EXISTS guard_project_baseline()');

        DB::unprepared(<<<'SQL'
CREATE FUNCTION guard_project_baseline() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft'
           OR NEW.approved_by IS NOT NULL
           OR NEW.approved_at IS NOT NULL THEN
            RAISE EXCEPTION 'Baseline baru harus berstatus draft';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Baseline yang disahkan tidak boleh dihapus';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status IN ('approved', 'superseded') THEN
        IF OLD.status = 'approved'
           AND NEW.status = 'superseded'
           AND (to_jsonb(NEW) - 'status' - 'updated_at')
               = (to_jsonb(OLD) - 'status' - 'updated_at') THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Baseline yang disahkan tidak boleh diubah';
    END IF;

    IF NEW.status = 'superseded' THEN
        RAISE EXCEPTION 'Draft tidak boleh langsung menjadi superseded';
    END IF;

    IF NEW.status = 'approved' THEN
        IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
            RAISE EXCEPTION 'Data persetujuan wajib lengkap';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM project_baseline_periods
            WHERE project_baseline_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Baseline tidak memiliki periode';
        END IF;

        IF (
            SELECT COALESCE(SUM(planned_quantity), 0)
            FROM project_baseline_periods
            WHERE project_baseline_id = NEW.id
        ) <> NEW.target_quantity THEN
            RAISE EXCEPTION 'Jumlah target periode tidak sesuai baseline';
        END IF;

        IF (
            SELECT MIN(period_start)
            FROM project_baseline_periods
            WHERE project_baseline_id = NEW.id
        ) <> NEW.start_date OR (
            SELECT MAX(period_end)
            FROM project_baseline_periods
            WHERE project_baseline_id = NEW.id
        ) <> NEW.end_date THEN
            RAISE EXCEPTION 'Rentang tanggal baseline tidak lengkap';
        END IF;

        IF EXISTS (
            SELECT 1 FROM (
                SELECT period_number, period_start,
                       ROW_NUMBER() OVER (ORDER BY period_number) AS seq,
                       LAG(period_end) OVER (ORDER BY period_number) AS prev_end
                FROM project_baseline_periods
                WHERE project_baseline_id = NEW.id
            ) periods
            WHERE period_number <> seq
               OR (prev_end IS NOT NULL
                   AND period_start <> prev_end + 1)
        ) THEN
            RAISE EXCEPTION 'Periode baseline tidak berurutan';
        END IF;

        IF NEW.unit_code = 'pole'
           AND NEW.target_quantity <> (
               SELECT total_target_poles FROM projects
               WHERE id = NEW.project_id
           ) THEN
            RAISE EXCEPTION 'Target baseline berbeda dari target proyek';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
SQL);

        DB::unprepared(<<<'SQL'
CREATE TRIGGER project_baseline_protection
BEFORE INSERT OR UPDATE OR DELETE ON project_baselines
FOR EACH ROW EXECUTE FUNCTION guard_project_baseline();
SQL);

        DB::unprepared(<<<'SQL'
CREATE FUNCTION guard_project_baseline_period() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    baseline_status text;
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.project_baseline_id <> NEW.project_baseline_id THEN
        RAISE EXCEPTION 'Periode tidak boleh dipindahkan antar baseline';
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT status INTO baseline_status
        FROM project_baselines
        WHERE id = OLD.project_baseline_id
        FOR UPDATE;

        IF baseline_status <> 'draft' THEN
            RAISE EXCEPTION 'Periode baseline terkunci';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT status INTO baseline_status
        FROM project_baselines
        WHERE id = NEW.project_baseline_id
        FOR UPDATE;

        IF baseline_status <> 'draft' THEN
            RAISE EXCEPTION 'Periode baseline terkunci';
        END IF;

        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$$;
SQL);

        DB::unprepared(<<<'SQL'
CREATE TRIGGER project_baseline_period_protection
BEFORE INSERT OR UPDATE OR DELETE ON project_baseline_periods
FOR EACH ROW EXECUTE FUNCTION guard_project_baseline_period();
SQL);
    }
};
