<?php

namespace App\Console\Commands;

use App\Models\Project;
use App\Services\PoleWorkItems;
use App\Services\ProgressIntegrity;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class ReconcileProjectWeights extends Command
{
    protected $signature = 'tracking:reconcile-weights {project} {--apply} {--expect=} {--reason=}';

    protected $description = 'Preview proportional active weight normalization; apply only a reviewed fingerprint.';

    public function handle(): int
    {
        try {
            return DB::transaction(function () {
                $project = Project::whereKey($this->argument('project'))->lockForUpdate()->firstOrFail();
                if ($project->progress_source !== 'pole_weighted') {
                    throw new RuntimeException('Proyek kuantitas tidak memakai normalisasi bobot tiang.');
                }
                app(ProgressIntegrity::class)->assertUnambiguous($project);
                $items = $project->workItems()->orderBy('id')->lockForUpdate()->get();
                foreach ($project->poles as $pole) {
                    $visible = app(PoleWorkItems::class)->visible($pole);
                    if ($visible->whereNotNull('pole_id')->isNotEmpty() && $visible->whereNull('pole_id')->isNotEmpty()) {
                        throw new RuntimeException('Referensi template/salinan masih bercampur. Rekonsiliasi referensi dahulu.');
                    }
                }
                $progress = DB::table('pole_work_progress')->whereIn('pole_id', $project->poles->modelKeys())->orderBy('id')->get();
                $fingerprint = hash('sha256', json_encode([$project->getAttributes(), $items->toArray(), $progress], JSON_THROW_ON_ERROR));
                $changes = [];
                foreach ($items->where('is_active', true)->groupBy(fn ($item) => $item->pole_id ?? 'template') as $scope => $group) {
                    $group = $group->values();
                    $total = (float) $group->sum('weight_percent');
                    if ($total <= 0 || $group->contains(fn ($item) => (float) $item->weight_percent < 0)) {
                        throw new RuntimeException('Bobot nol/negatif tidak dapat ditafsirkan sebagai proporsi.');
                    }
                    if (abs($total - 100) < 0.005) {
                        continue;
                    }
                    $units = $group->map(fn ($item) => (int) round((float) $item->weight_percent / $total * 10000))->all();
                    $units[array_search(max($units), $units, true)] += 10000 - array_sum($units);
                    foreach ($group as $index => $item) {
                        $changes[] = ['scope' => $scope, 'id' => $item->id, 'name' => $item->name, 'before' => $item->weight_percent, 'after' => $units[$index] / 100];
                    }
                }
                $plan = ['project_id' => $project->id, 'fingerprint' => $fingerprint, 'changes' => $changes, 'history_action' => 'none'];
                $this->line(json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
                if (! $this->option('apply')) {
                    return self::SUCCESS;
                }
                if (! hash_equals($fingerprint, (string) $this->option('expect')) || trim((string) $this->option('reason')) === '') {
                    throw new RuntimeException('Apply memerlukan fingerprint terbaru --expect dan alasan --reason.');
                }
                if (! $changes) {
                    return self::SUCCESS;
                }
                $directory = storage_path('app/private/weight-reconciliations');
                if (! is_dir($directory) && ! mkdir($directory, 0700, true)) {
                    throw new RuntimeException('Tidak dapat membuat arsip sebelum perubahan.');
                }
                $path = $directory.'/'.now()->format('YmdHis').'-'.bin2hex(random_bytes(8)).'.json';
                $archive = json_encode(['status' => 'execution_intent_verify_database_for_outcome', 'reason' => $this->option('reason'), 'plan' => $plan, 'before_items' => $items->toArray(), 'before_progress' => $progress], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
                $handle = fopen($path, 'x');
                if (! $handle) {
                    throw new RuntimeException('Tidak dapat membuka arsip.');
                }
                try {
                    if (! chmod($path, 0600) || fwrite($handle, $archive) !== strlen($archive) || ! fflush($handle)) {
                        throw new RuntimeException('Arsip gagal ditulis; perubahan dibatalkan.');
                    }
                } finally {
                    fclose($handle);
                }
                foreach ($changes as $change) {
                    $items->find($change['id'])->update(['weight_percent' => $change['after']]);
                }
                $this->info('Bobot diperbarui. Arsip sebelum perubahan: '.$path);

                return self::SUCCESS;
            });
        } catch (Throwable $error) {
            $this->error($error->getMessage());

            return self::FAILURE;
        }
    }
}
