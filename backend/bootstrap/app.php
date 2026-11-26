<?php

use App\Http\Middleware\BrowserToken;
use App\Http\Middleware\EnsureUserHasRole;
use App\Http\Middleware\EnsureUserIsActive;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [BrowserToken::class]);
        $middleware->alias([
            'active' => EnsureUserIsActive::class,
            'role' => EnsureUserHasRole::class,
        ]);

        /*
         * Backend ini API-only dan tidak punya route `login`. Tanpa ini,
         * `Authenticate` mencoba redirect ke route `login` lalu melempar
         * RouteNotFoundException (500). Mengembalikan null membuatnya
         * melempar AuthenticationException yang dirender jadi JSON 401.
         */
        $middleware->redirectGuestsTo(fn () => null);

        /*
         * Rate limiting untuk seluruh grup `api` (limiter `api`
         * didefinisikan di AppServiceProvider). Melindungi dari
         * brute-force dan penyalahgunaan endpoint.
         */
        $middleware->throttleApi('api');

        /*
         * Aplikasi berjalan di belakang nginx (reverse proxy). Tanpa ini,
         * `$request->ip()` selalu berisi IP proxy sehingga rate limit dan
         * audit log kehilangan IP klien sebenarnya. Hanya proxy jaringan
         * privat yang dipercaya agar header X-Forwarded-For dari internet
         * tidak bisa dipalsukan.
         */
        $middleware->trustProxies(at: [
            '127.0.0.1',
            '::1',
            '10.0.0.0/8',
            '172.16.0.0/12',
            '192.168.0.0/16',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        /*
         * Error authorization harus jadi JSON 403 dengan `message`,
         * bukan halaman HTML. Tanpa ini, `fetch` di frontend dapat
         * HTML dan `data.message` jadi undefined — user hanya melihat
         * "Permintaan gagal (HTTP 403)" tanpa tahu kenapa.
         */
        $exceptions->render(function (
            AuthorizationException $e,
            Request $request
        ) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'Forbidden.',
                ], 403);
            }
        });

        /* Sama untuk 401 — Sanctum sudah mengembalikan JSON sendiri
           untuk token hilang, tapi `Authenticate` juga dipanggil
           dari beberapa tempat. */
        $exceptions->render(function (
            AuthenticationException $e,
            Request $request
        ) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'Unauthenticated.',
                ], 401);
            }
        });

        /*
         * AKAR BUG 4 — id tidak valid di alamat (mis. /users/abc)
         * sebelumnya meledak jadi 500.
         *
         * Rantai masalahnya: model binding menerima string apa pun,
         * Eloquent meneruskannya ke PostgreSQL (`where id = 'abc'`),
         * dan PostgreSQL menolaknya dengan QueryException 22P02
         * (invalid input syntax for type integer) yang tidak
         * ditangani -> 500.
         *
         * Pola rute numerik (`Route::pattern('[0-9]+')`) mencegah
         * sebagian kasus, tapi handler ini jaring pengaman di AKAR:
         * QueryException 22P02 dari rute API mana pun dijawab 404
         * JSON "Data tidak ditemukan." — termasuk parameter yang
         * belum dipola dan id yang datang lewat body/query.
         */
        $exceptions->render(function (
            QueryException $e,
            Request $request
        ) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            $previous = $e->getPrevious();
            $isInvalidInput = $e->getCode() === '22P02'
                || ($previous !== null && $previous->getCode() === '22P02')
                || str_contains($e->getMessage(), '22P02');

            if ($isInvalidInput) {
                return response()->json([
                    'message' => 'Data tidak ditemukan.',
                ], 404);
            }

            return null;
        });

        /* Model tidak ditemukan lewat binding -> 404 JSON yang
           konsisten, bukan halaman error bawaan. */
        $exceptions->render(function (
            ModelNotFoundException $e,
            Request $request
        ) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'Data tidak ditemukan.',
                ], 404);
            }
        });

        /* Rute API yang tidak ada -> 404 JSON, bukan HTML. */
        $exceptions->render(function (
            NotFoundHttpException $e,
            Request $request
        ) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'Data tidak ditemukan.',
                ], 404);
            }
        });
    })->create();
