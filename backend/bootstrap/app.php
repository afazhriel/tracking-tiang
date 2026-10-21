<?php

use App\Http\Middleware\EnsureUserHasRole;
use App\Http\Middleware\EnsureUserIsActive;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
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
    })->create();
