<?php

// Run from the backend directory. Report counts/booleans only, never user rows.
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

try {
    require getcwd().'/vendor/autoload.php';
    $app = require getcwd().'/bootstrap/app.php';
    $app->make(Kernel::class)->bootstrap();
    if (DB::connection()->getDriverName() !== 'pgsql') {
        throw new RuntimeException('PostgreSQL required');
    }
    $report = DB::transaction(function (): array {
        DB::statement('SET TRANSACTION READ ONLY');
        DB::statement("SET LOCAL statement_timeout = '5s'");
        DB::statement("SET LOCAL lock_timeout = '1s'");
        $report = [
            'production_env' => app()->environment('production'),
            'debug_disabled' => ! config('app.debug'),
            'https_app_url' => parse_url(config('app.url'), PHP_URL_SCHEME) === 'https',
            'php_upload_max_filesize' => ini_get('upload_max_filesize'),
            'php_post_max_size' => ini_get('post_max_size'),
            'php_max_file_uploads' => (int) ini_get('max_file_uploads'),
        ];
        foreach (['users', 'projects', 'poles', 'work_items', 'pole_work_progress', 'pole_progress_histories', 'progress_photos', 'migrations'] as $table) {
            $report['rows'][$table] = DB::table($table)->count();
        }
        // Production activation diagnostics are aggregate-only. No names,
        // email addresses, entry payloads, photo paths or secrets are logged.
        foreach (['teams', 'team_members', 'pole_assignments', 'project_quantity_entries', 'project_baselines', 'project_baseline_periods'] as $table) {
            $report['optional_rows'][$table] = Schema::hasTable($table)
                ? DB::table($table)->count()
                : null;
        }
        if (Schema::hasColumn('projects', 'progress_source')
            && Schema::hasColumn('projects', 'target_quantity')) {
            $report['invalid_quantity_targets'] = DB::table('projects')
                ->where('progress_source', 'quantity_entries')
                ->where(fn ($query) => $query->whereNull('target_quantity')->orWhere('target_quantity', '<=', 0))
                ->count();
            foreach (['TT-001', 'TANKI --01'] as $code) {
                $project = DB::table('projects')->where('code', $code)->first(['id', 'progress_source']);
                $report['protected_projects'][$code] = $project ? [
                    'present' => true,
                    'source' => $project->progress_source,
                    'poles' => DB::table('poles')->where('project_id', $project->id)->count(),
                    'history' => DB::table('pole_progress_histories as h')
                        ->join('poles as p', 'p.id', '=', 'h.pole_id')
                        ->where('p.project_id', $project->id)->count(),
                    'quantity_entries' => Schema::hasTable('project_quantity_entries')
                        ? DB::table('project_quantity_entries')->where('project_id', $project->id)->count()
                        : null,
                    'baselines' => Schema::hasTable('project_baselines')
                        ? DB::table('project_baselines')->where('project_id', $project->id)->count()
                        : null,
                ] : ['present' => false];
            }
        }
        $report['active_admins'] = DB::table('users')->where('role', 'admin')
            ->where(fn ($query) => $query->whereNull('status')->orWhereNotIn('status', ['pending', 'suspended']))->count();
        $report['legacy_scope_columns_present'] = Schema::hasColumn('work_items', 'pole_id')
            && Schema::hasColumn('work_items', 'source_item_id');
        if ($report['legacy_scope_columns_present']) {
            $duplicates = DB::table('pole_work_progress as progress')
                ->join('work_items as item', 'item.id', '=', 'progress.work_item_id')
                ->selectRaw('1')->groupByRaw('progress.pole_id, COALESCE(item.source_item_id, item.id)')
                ->havingRaw('COUNT(*) > 1');
            $report['ambiguous_progress_groups'] = DB::query()->fromSub($duplicates, 'duplicates')->count();
        } else {
            $report['ambiguous_progress_groups'] = null;
        }
        $report['media_files_checked'] = 0;
        $report['media_files_missing'] = 0;
        $report['media_paths_unsupported'] = 0;
        // Bounded read-only sampling; no unbounded directory walk or file content.
        foreach (DB::table('progress_photos')->orderBy('id')->limit(1000)->get(['disk', 'path']) as $photo) {
            $root = match ($photo->disk) {
                'public' => storage_path('app/public'),
                'media' => storage_path('app/private/media'),
                default => null,
            };
            if ($root === null || str_contains($photo->path, '..') || str_starts_with($photo->path, '/') || str_contains($photo->path, "\0")) {
                $report['media_paths_unsupported']++;

                continue;
            }
            $report['media_files_checked']++;
            if (! is_file($root.'/'.$photo->path)) {
                $report['media_files_missing']++;
            }
        }
        $report['media_scan_truncated'] = $report['rows']['progress_photos'] > 1000;

        return $report;
    });
    echo json_encode($report, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT).PHP_EOL;
} catch (Throwable $exception) {
    // SQL/connection exceptions can contain credentials or user rows.
    fwrite(STDERR, "Read-only readiness audit failed; no database changes were requested. Inspect privately on the VPS.\n");
    exit(1);
}
