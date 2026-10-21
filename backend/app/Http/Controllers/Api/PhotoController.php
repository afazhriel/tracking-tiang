<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProgressPhoto;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Menyajikan file foto progress.
 *
 * Route memerlukan Sanctum + active dan policy tiang. Browser mengirim
 * cookie HttpOnly saat memuat gambar; klien native memakai bearer.
 *
 * Tidak butuh `storage:link` maupun location nginx baru: file dibaca
 * langsung dari disk `public` dan disajikan lewat response Laravel.
 */
class PhotoController extends Controller
{
    public function show(string $ulid): BinaryFileResponse
    {
        $photo = ProgressPhoto::where('ulid', $ulid)->firstOrFail();
        $this->authorize('view', $photo->pole);

        $disk = Storage::disk($photo->disk ?: 'public');

        abort_unless($disk->exists($photo->path), 404);

        /*
         * MIME ditentukan server dari isi file, bukan dari nilai yang
         * dikirim klien saat upload. Fallback ke `mime_type` tersimpan
         * hanya bila deteksi gagal.
         */
        $mime = $disk->mimeType($photo->path);
        abort_unless(in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/x-ms-bmp'], true), 415, 'Berkas bukan gambar yang didukung.');

        $response = response()->file($disk->path($photo->path), [
            'Content-Type' => $mime,
            'X-Content-Type-Options' => 'nosniff',
            'Cross-Origin-Resource-Policy' => 'same-origin',
        ]);

        /*
         * `response()->file()` default menandai response `public`.
         * Paksa `private` supaya foto tidak disimpan di cache bersama,
         * dan larang penyimpanan supaya pencabutan izin berlaku berikutnya.
         */
        $response->setPrivate();
        $response->headers->set('Cache-Control', 'private, no-store');

        return $response;
    }
}
