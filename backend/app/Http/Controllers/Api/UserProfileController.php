<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\BrowserSession;
use App\Services\PendingPhotos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

/**
 * Profil user yang sedang login.
 *
 * Semua operasi menempel pada `$request->user()` — tidak ada `User`
 * dari route parameter, jadi tidak ada jalan untuk menyentuh akun
 * orang lain walaupun route-nya terbuka.
 *
 * Kontrak endpoint ini dicatat lebih dulu di frontend
 * (`ProfilPage.jsx` → `MISSING_ENDPOINTS`):
 *
 *   PUT    /api/user/profile    nama, email, no. HP
 *   PUT    /api/user/password   password lama + password baru
 *   POST   /api/user/avatar     upload foto profil
 *   DELETE /api/user/avatar     hapus foto profil
 *   POST   /api/logout-all      cabut seluruh token perangkat
 */
class UserProfileController extends Controller
{
    /**
     * Profil terkini (bentuk sama dengan `GET /api/me`).
     *
     * Dipakai frontend untuk menyinkronkan isi localStorage setelah
     * edit, tanpa harus logout-login.
     */
    public function show(Request $request): JsonResponse
    {
        $payload = $request->user()->toAuthPayload();

        return response()->json($payload + ['data' => $payload]);
    }

    /**
     * Ubah nama, email, dan nomor telepon.
     *
     * Ganti email meminta `current_password`: aplikasi ini tidak
     * punya verifikasi email (MAIL_MAILER=log), jadi tanpa konfirmasi
     * password satu kesalahan ketik bisa memindahkan kepemilikan akun
     * ke alamat yang tidak ada yang bisa menerima. Email dinormalkan
     * huruf kecil, sama seperti `register`.
     */
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'phone' => ['nullable', 'string', 'max:32'],
        ], [
            'name.required' => 'Nama wajib diisi.',
            'email.required' => 'Email wajib diisi.',
            'email.email' => 'Format email tidak valid.',
            'email.unique' => 'Email sudah dipakai oleh akun lain.',
            'phone.max' => 'Nomor telepon maksimal 32 karakter.',
        ]);

        $emailChanged = Str::lower($validated['email']) !== Str::lower((string) $user->email);

        if ($emailChanged) {
            $request->validate([
                'current_password' => ['required', 'current_password'],
            ], [
                'current_password.required' => 'Masukkan password Anda untuk mengganti email.',
                'current_password.current_password' => 'Password Anda tidak sesuai.',
            ]);
        }

        $user->update([
            'name' => $validated['name'],
            'email' => Str::lower($validated['email']),
            'phone' => $validated['phone'] ?? null,
        ]);

        $payload = $user->fresh()->toAuthPayload();

        return response()->json([
            'message' => 'Profil berhasil diperbarui.',
            'data' => $payload,
        ]);
    }

    /**
     * Ganti password.
     *
     * `current_password` divalidasi Laravel terhadap user yang sedang
     * login. Token yang aktif TIDAK dicabut: setelah ganti password,
     * perangkat ini tetap masuk, sedangkan perangkat lain bisa
     * dikeluarkan lewat `POST /api/logout-all`.
     */
    public function updatePassword(Request $request): JsonResponse
    {
        $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ], [
            'current_password.required' => 'Password lama wajib diisi.',
            'current_password.current_password' => 'Password lama tidak sesuai.',
            'password.required' => 'Password baru wajib diisi.',
            'password.confirmed' => 'Konfirmasi password baru tidak sama.',
            'password.min' => 'Password baru minimal 8 karakter.',
        ]);

        $request->user()->update([
            'password' => $request->input('password'),
        ]);

        return response()->json([
            'message' => 'Password berhasil diganti.',
        ]);
    }

    /**
     * Upload foto profil.
     *
     * MIME ditentukan dari isi file oleh rule `image`, dan nama file
     * dibuat dari ULID + ekstensi hasil deteksi isi (`guessExtension`),
     * bukan nama yang dikirim klien. File lama dihapus setelah file
     * baru tersimpan, supaya kegagalan di tengah tidak menghilangkan
     * foto yang masih dipakai.
     */
    public function updateAvatar(Request $request, PendingPhotos $uploads): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', 'image', 'max:2048'],
        ], [
            'avatar.required' => 'Pilih foto terlebih dahulu.',
            'avatar.image' => 'File harus berupa gambar (JPG, PNG, atau WebP).',
            'avatar.max' => 'Ukuran foto maksimal 2 MB.',
        ]);

        try {
            $path = $uploads->store($request->file('avatar'), 'private-media/avatars');
            [$user, $previous] = DB::transaction(function () use ($request, $path) {
                $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
                $previous = $user->avatar;
                $user->update(['avatar' => $path]);

                return [$user, $previous];
            });
        } catch (Throwable $exception) {
            $uploads->discardUnreferenced();
            throw $exception;
        }
        $uploads->discardRetiredAvatar($previous);

        $payload = $user->fresh()->toAuthPayload();

        return response()->json([
            'message' => 'Foto profil berhasil diperbarui.',
            'data' => $payload,
        ]);
    }

    /**
     * Hapus foto profil (kembali ke inisial nama).
     */
    public function destroyAvatar(Request $request, PendingPhotos $uploads): JsonResponse
    {
        [$user, $previous] = DB::transaction(function () use ($request) {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $previous = $user->avatar;
            $user->update(['avatar' => null]);

            return [$user, $previous];
        });
        $uploads->discardRetiredAvatar($previous);

        $payload = $user->fresh()->toAuthPayload();

        return response()->json([
            'message' => 'Foto profil dihapus.',
            'data' => $payload,
        ]);
    }

    /**
     * Menyajikan file avatar.
     *
     * Sanctum + active, hanya pemilik atau admin/supervisor.
     * Browser mengirim cookie HttpOnly; response tidak boleh dicache.
     */
    public function showAvatar(User $user): BinaryFileResponse
    {
        abort_unless(
            (int) request()->user()->id === (int) $user->id
                || request()->user()->isAdmin(),
            403
        );
        abort_unless($user->avatar, 404);

        $disk = Storage::disk(PendingPhotos::avatarDisk($user->avatar));

        abort_unless($disk->exists($user->avatar), 404);

        $mime = $disk->mimeType($user->avatar) ?: 'application/octet-stream';
        abort_unless(in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/x-ms-bmp'], true), 415, 'Berkas bukan gambar yang didukung.');

        $response = response()->file($disk->path($user->avatar), [
            'Content-Type' => $mime,
            'X-Content-Type-Options' => 'nosniff',
            'Cross-Origin-Resource-Policy' => 'same-origin',
        ]);

        $response->setPrivate();
        $response->headers->set('Cache-Control', 'private, no-store');

        return $response;
    }

    /**
     * Cabut SELURUH token user ini, termasuk yang dipakai request ini.
     *
     * Ini lawan dari `POST /api/logout` yang hanya menghapus satu
     * token. Setelah endpoint ini, semua perangkat (termasuk yang ini)
     * harus login ulang.
     */
    public function logoutAll(Request $request): JsonResponse
    {
        $request->user()->tokens()->delete();

        return app(BrowserSession::class)->forget(response()->json([
            'message' => 'Berhasil keluar dari semua perangkat.',
        ]));
    }
}
