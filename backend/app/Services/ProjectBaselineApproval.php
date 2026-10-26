<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectBaseline;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class ProjectBaselineApproval
{
    public function approve(int $baselineId, User $approver): ProjectBaseline
    {
        return DB::transaction(function () use ($baselineId, $approver) {
            $reference = ProjectBaseline::findOrFail($baselineId);

            $project = Project::query()
                ->whereKey($reference->project_id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $approver->isActive() && $approver->can('update', $project),
                403,
                'Tidak berwenang mengesahkan baseline.'
            );

            $baseline = ProjectBaseline::query()
                ->whereKey($baselineId)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $baseline->status === 'draft',
                422,
                'Hanya baseline draft yang dapat disahkan.'
            );

            $target = $this->scaled($baseline->target_quantity);

            // Target, satuan, dan jadwal draft harus sama
            // dengan konfigurasi proyek saat pengesahan.
            // Setelah disahkan, baseline menjadi snapshot tetap.
            abort_unless(
                (float) $project->target_quantity > 0
                && (string) $baseline->unit_code === (string) $project->unit_code
                && $target === $this->scaled($project->target_quantity),
                422,
                'Target atau satuan baseline berbeda dari proyek.'
            );

            abort_unless(
                $project->start_date
                && $project->end_date
                && $baseline->start_date->isSameDay($project->start_date)
                && $baseline->end_date->isSameDay($project->end_date),
                422,
                'Periode proyek berubah. Buat baseline baru sesuai jadwal terbaru.'
            );

            $periods = $baseline->periods()
                ->reorder()
                ->orderBy('period_number')
                ->lockForUpdate()
                ->get();

            abort_if($periods->isEmpty(), 422, 'Periode rencana belum diisi.');

            $cursor = CarbonImmutable::parse($baseline->start_date);
            $finalDate = CarbonImmutable::parse($baseline->end_date);
            $total = 0;

            foreach ($periods as $index => $period) {
                $start = CarbonImmutable::parse($period->period_start);
                $end = CarbonImmutable::parse($period->period_end);

                abort_unless(
                    $period->period_number === $index + 1 &&
                    $start->isSameDay($cursor) &&
                    $end->greaterThanOrEqualTo($start) &&
                    $end->lessThanOrEqualTo($finalDate),
                    422,
                    'Nomor atau tanggal periode tidak valid.'
                );

                $total += $this->scaled($period->planned_quantity);
                $cursor = $end->addDay();
            }

            abort_unless(
                $cursor->isSameDay($finalDate->addDay()),
                422,
                'Periode belum mencakup seluruh jadwal baseline.'
            );

            abort_unless(
                $total === $target,
                422,
                'Total rencana periode harus sama dengan target baseline.'
            );

            $previous = ProjectBaseline::query()
                ->where('project_id', $project->id)
                ->where('status', 'approved')
                ->lockForUpdate()
                ->first();

            if ($previous) {
                abort_unless(
                    $baseline->version > $previous->version,
                    422,
                    'Nomor versi revisi harus lebih tinggi.'
                );

                $previous->forceFill(['status' => 'superseded'])->save();
            }

            $baseline->forceFill([
                'status' => 'approved',
                'approved_by' => $approver->id,
                'approved_at' => now(),
            ])->save();

            return $baseline->fresh();
        }, 3);
    }

    private function scaled(mixed $value): int
    {
        $value = (string) $value;

        abort_unless(
            preg_match('/^\d{1,10}(\.\d{1,4})?$/D', $value) === 1,
            422,
            'Format angka target tidak valid.'
        );

        [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '');

        return ((int) $whole * 10000)
            + (int) str_pad($fraction, 4, '0');
    }
}
