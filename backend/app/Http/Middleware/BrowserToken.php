<?php

namespace App\Http\Middleware;

use App\Services\BrowserSession;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class BrowserToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $cookie = $request->cookie(BrowserSession::COOKIE);
        $browser = app(BrowserSession::class)->isBrowser($request);
        // A cross-site form cannot send the custom client header. Origin is
        // checked as well; SameSite alone is not sufficient for sibling sites.
        if (! $request->isMethodSafe() && ($browser || ($cookie && ! $request->bearerToken()))) {
            $origins = [$request->getSchemeAndHttpHost(), rtrim((string) config('app.url'), '/')];
            abort_unless($browser && in_array($request->header('Origin'), $origins, true), 419, 'Sesi tidak dapat diverifikasi. Muat ulang halaman.');
        }
        if ($cookie && ! $request->headers->has('Authorization')) {
            $request->headers->set('Authorization', 'Bearer '.$cookie);
        }
        $response = $next($request);
        if ($request->user() || $browser) {
            $response->headers->set('Cache-Control', 'private, no-store');
        }

        return $response;
    }
}
