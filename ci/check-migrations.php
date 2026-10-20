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
$errors = [];
foreach (array_filter(explode("\n", trim($diff->getOutput()))) as $line) {
    [$status, $file] = explode("\t", $line, 2);
    if ($status !== 'A') {
        $errors[] = $file.': existing migrations must not be rewritten, removed or renamed.';
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
