<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Menolak user yang statusnya `suspended`.
 *
 * `auth:sanctum` hanya membuktikan "token ini valid" — tidak
 * mengecek apakah akunnya masih boleh dipakai. Tanpa middleware ini,
 * suspend jadi tidak berefek: token lama yang dicuri tetap bisa
 * dipakai sampai kedaluwarsa.
 *
 * Dijalankan setelah `auth:sanctum`, jadi selalu ada
 * `$request->user()`.
 */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->isActive()) {
            /* 403, bukan 401. Token-nya sah — akunnya yang dinonaktifkan. */
            return response()->json([
                'message' => 'Akun Anda sedang dinonaktifkan. Hubungi admin.',
            ], 403);
        }

        return $next($request);
    }
}
