<?php

/*
 * Healthcheck container backend: PHP hidup + database terjangkau.
 * Dipakai oleh healthcheck Docker (docker-compose.yml) yang dibaca
 * skrip autoheal — tanpa ini autoheal tidak bisa mendeteksi backend
 * yang bermasalah.
 */

try {
    $dsn = sprintf(
        'pgsql:host=%s;port=%s;dbname=%s',
        getenv('DB_HOST') ?: 'postgres',
        getenv('DB_PORT') ?: '5432',
        getenv('DB_DATABASE')
    );

    $pdo = new PDO($dsn, getenv('DB_USERNAME'), getenv('DB_PASSWORD'), [
        PDO::ATTR_TIMEOUT => 3,
    ]);
    $pdo->query('SELECT 1');

    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage());
    exit(1);
}
