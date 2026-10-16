<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Membatasi route ke role tertentu.
 *
 * Dipakai sebagai alias `role` di route, misal:
 *
 *   Route::middleware('role:admin')->group(...)
 *
 * Alias-nya menerima lebih dari satu role
 * (`role:admin,supervisor`) dan satisfied kalau user punya salah
 * satu. Route bisa dikunci ke role yang tidak ada di daftar
 * `User::roles()` — hasilnya 403 untuk semua orang, bukan error.
 */
class EnsureUserHasRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $allowed = array_intersect($roles, User::roles());

        if (! in_array($user->role, $allowed, true)) {
            return response()->json([
                'message' => 'Forbidden.',
            ], 403);
        }

        return $next($request);
    }
}
