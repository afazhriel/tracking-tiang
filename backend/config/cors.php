<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Default Laravel mengizinkan semua origin ('*'). Itu terlalu longgar:
    | minimal dibatasi ke aplikasi frontend resmi. Daftar diambil dari
    | `CORS_ALLOWED_ORIGINS` (dipisah koma), dengan fallback domain
    | produksi + localhost untuk development.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env(
            'CORS_ALLOWED_ORIGINS',
            'https://pjl.ituiot.com,http://localhost:3000,http://127.0.0.1:3000'
        ))
    ))),

    /*
     * Origin WebView aplikasi native (Android/iOS).
     *
     * Di dalam APK, aset frontend dibundel lokal dan disajikan
     * Capacitor dari origin berikut — BUKAN dari domain web. Tanpa
     * entri ini, semua panggilan API dari aplikasi akan diblokir
     * CORS walaupun tokennya benar.
     *   - `https://localhost`          → androidScheme https (default)
     *   - `capacitor://localhost`      → iOS
     *   - `http://localhost`           → Android dengan androidScheme http
     */
    'allowed_origins_patterns' => [
        '#^https?://localhost(:\d+)?$#',
        '#^capacitor://localhost$#',
    ],

    'allowed_headers' => ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With'],

    'exposed_headers' => [],

    'max_age' => 3600,

    'supports_credentials' => false,

];
