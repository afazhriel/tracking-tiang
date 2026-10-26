<?php

require __DIR__.'/../backend/vendor/autoload.php';

use Symfony\Component\Process\Process;
use Tests\Support\MigrationPolicy;

$root = dirname(__DIR__);
$base = getenv('CI_BASE_SHA') ?: '';
if (! preg_match('/^[0-9a-f]{40}$/', $base)) {
    fwrite(STDERR, "CI_BASE_SHA must identify the reviewed upgrade baseline.\n");
    exit(1);
}

$diff = new Process(['git', '-C', $root, 'diff', '--name-status', '--no-renames', $base, '--', 'backend/database/migrations']);
$diff->mustRun();
// Frozen blob SHAs from the 2026-10-26 production handoff. These migrations
// already existed on the VPS snapshot but are absent from main. Only their
// exact original bytes are exempt from the *new migration* operation scanner.
// Any alteration fails closed; new migrations still receive the full scan.
$deployedHandoffBlobs = [
    'backend/database/migrations/2026_10_23_073333_create_project_baselines_table.php' => '1e9fef0e41a01ceeb13dda4af1c5cc7c8e968db3',
    'backend/database/migrations/2026_10_23_080910_protect_approved_project_baselines.php' => '5534b7f0fae5c5b0461f7b1063a82419be5480d6',
    'backend/database/migrations/2026_10_23_104000_add_owner_user_id_to_projects_table.php' => '7b66ed8dc99e175d19db6324294a8e6fb97f0700',
    'backend/database/migrations/2026_10_24_120000_add_project_quantity_tracking.php' => '5e5bd16bbce96bf5a7316a7fd1dbcd45462b2031',
];

// Explicitly reviewed corrective data migration. Unlike the four
// handoff migrations this one is not yet deployed; the SHA pin stops
// unreviewed changes from silently inheriting its DML exception.
$reviewedCorrectionBlobs = [
    'backend/database/migrations/2026_10_26_120000_restore_historical_pole_progress_source.php' => '8bc938a1d676ba2c5162c31f806e260ea1e40cfa',
];

$errors = [];
foreach (array_filter(explode("\n", trim($diff->getOutput()))) as $line) {
    [$status, $file] = explode("\t", $line, 2);
    if ($status !== 'A') {
        $errors[] = $file.': existing migrations must not be rewritten, removed or renamed.';
        continue;
    }

    $reviewedBlob = $deployedHandoffBlobs[$file] ?? $reviewedCorrectionBlobs[$file] ?? null;
    if ($reviewedBlob !== null) {
        $object = new Process(['git', '-C', $root, 'hash-object', $root.'/'.$file]);
        $object->mustRun();
        if (! hash_equals($reviewedBlob, trim($object->getOutput()))) {
            $errors[] = $file.': frozen reviewed migration was modified.';
        }

        continue;
    }

    foreach (MigrationPolicy::violations(file_get_contents($root.'/'.$file)) as $error) {
        $errors[] = $file.': '.$error;
    }
}

if ($errors !== []) {
    fwrite(STDERR, implode("\n", $errors)."\n");
    exit(1);
}

echo "Migration history and additive migration policy passed.\n";
