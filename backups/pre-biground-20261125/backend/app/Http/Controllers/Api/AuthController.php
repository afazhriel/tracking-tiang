<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\BrowserSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
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
        /* Email disimpan lowercase (lihat `register`/invitation), jadi
           input di-lowercase dulu supaya "Budi@x.com" tetap menemukan
           akun yang tersimpan sebagai "budi@x.com". */
        $request->merge(['email' => Str::lower((string) $request->input('email'))]);

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

        /* Status dicek SETELAH password benar, supaya pesan "menunggu
           persetujuan" / "dinonaktifkan" tidak bocor ke orang yang
           belum membuktikan kepemilikan akun. */
        if ($user->isSuspended()) {
            throw ValidationException::withMessages([
                'email' => ['Akun ini sedang dinonaktifkan. Hubungi admin.'],
            ]);
        }

        if ($user->isPending()) {
            throw ValidationException::withMessages([
                'email' => ['Akun Anda masih menunggu persetujuan admin.'],
            ]);
        }

        // Browser opts into an HttpOnly cookie; existing native clients retain
        // the bearer response. Logout revokes only the token used by that call.
        return app(BrowserSession::class)->login($request, $user);
    }

    /**
     * Pendaftaran mandiri (self sign-up).
     *
     * Berbeda dari `POST /api/invitations/{token}/accept` — di sana
     * admin yang mengundang dan akun langsung aktif — pendaftar
     * sendiri TIDAK langsung mendapat akses:
     *
     *   - role  : `User::DEFAULT_ROLE` (pic), paling rendah.
     *   - status: `pending`, menunggu persetujuan admin.
     *
     * Tidak ada token yang dikembalikan: akun `pending` belum bisa
     * login, jadi mengirim token di sini hanya menyesatkan.
     */
    public function register(Request $request): JsonResponse
    {
        $request->merge(['email' => Str::lower((string) $request->input('email'))]);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
            'role' => User::DEFAULT_ROLE,
            'status' => User::STATUS_PENDING,
        ]);

        return response()->json([
            'message' => 'Pendaftaran berhasil. Akun Anda menunggu persetujuan admin sebelum bisa masuk.',
            'user' => $user->toAuthPayload(),
        ], 201);
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

        return app(BrowserSession::class)->forget(response()->json([
            'message' => 'Berhasil keluar.',
        ]));
    }

    public function browserSession(Request $request, BrowserSession $sessions): JsonResponse
    {
        return $sessions->migrate($request);
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
