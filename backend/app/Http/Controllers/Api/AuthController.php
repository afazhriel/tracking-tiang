<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Auth berbasis Sanctum.
 *
 * CATATAN PENTING — jangan deploy file ini tanpa membandingkan dengan
 * versi yang sudah jalan di production.
 *
 * Endpoint `POST /api/login`, `POST /api/logout`, dan `GET /api/me`
 * SUDAH ADA di production. Bentuk response di bawah sengaja
 * dipertahankan persis seperti yang dibaca frontend sekarang:
 *
 *   login -> { "token": "...", "user": { ... } }
 *
 * `sign-in-card-2.jsx` membaca `data.token` dan `data.user` langsung
 * di level atas. Kalau dibungkus `{ data: ... }`, login frontend
 * langsung rusak karena `data.token` jadi undefined.
 */
class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:255'],
        ]);

        $user = User::where('email', $credentials['email'])->first();

        /*
         * Satu pesan untuk "email tidak ada" dan "password salah" —
         * kalau dibedakan, endpoint ini jadi alat untuk menebak email
         * mana yang terdaftar.
         */
        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => [__('auth.failed')],
            ]);
        }

        /* User lama dibuat sebelum kolom `status` ada, jadi
           `isActive()` yang dipakai: anything selain 'suspended'
           dianggap aktif. Ini mencegah user existing terkunci oleh
           migration baru. */
        if (! $user->isActive()) {
            throw ValidationException::withMessages([
                'email' => ['Akun ini sedang dinonaktifkan. Hubungi admin.'],
            ]);
        }

        /* Token dibuat ulang setiap login. Ini yang bikin
           `POST /api/logout` benar-benar revoke sesi: token lama
           ikut terhapus dari database. */
        $token = $user->createToken($credentials['device_name'] ?? 'web')->plainTextToken;

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user->toAuthPayload(),
        ]);
    }

    /**
     * Revoke HANYA token yang sedang dipakai.
     *
     * `$request->user()->currentAccessToken()->delete()` ditambah
     * `->delete()` dari token yang sedang aktif — bukan
     * `tokens()->delete()` yang akan mencabut semua perangkat.
     */
    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        $user?->currentAccessToken()?->delete();

        return response()->json([
            'message' => 'Berhasil keluar.',
        ]);
    }

    /**
     * Profil user yang sedang login.
     *
     * Field `role`/`role_label`/`status` ditambahkan —
     * `normalizeUser()` di frontend sudah anticipating keduanya.
     *
     * Bentuk response sengaja ganda: field ada di level atas (bentuk
     * yang kemungkinan dipakai versi production sebelumnya) DAN
     * di dalam `data` (bentuk `unwrapItem()` di frontend baca).
     * Duplikasi ini menjaga kompatibilitas sampai bentuk production
     * yang asli bisa dipastikan. Setelah itu, `data` boleh dihapus.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        $payload = $user->toAuthPayload() + [
            'teams' => $user->teams()->get(['teams.id', 'teams.name', 'teams.code'])
                ->map(fn ($team) => [
                    'id' => $team->id,
                    'name' => $team->name,
                    'code' => $team->code,
                ]),
            'projects' => $user->projects()->get(['projects.id', 'projects.name', 'projects.code'])
                ->map(fn ($project) => [
                    'id' => $project->id,
                    'name' => $project->name,
                    'code' => $project->code,
                ]),
        ];

        return response()->json($payload + ['data' => $payload]);
    }
}
