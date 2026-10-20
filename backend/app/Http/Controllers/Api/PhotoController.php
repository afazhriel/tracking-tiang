<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProgressPhoto;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Menyajikan file foto progress.
 *
 * Route ini PUBLIC (di luar auth) karena tag `<img>` di browser tidak
 * bisa mengirim header Authorization. URL memakai ULID acak yang
 * tidak bisa ditebak, jadi berfungsi seperti "capability URL".
 *
 * Tidak butuh `storage:link` maupun location nginx baru: file dibaca
 * langsung dari disk `public` dan disajikan lewat response Laravel.
 */
class PhotoController extends Controller
{
    public function show(string $ulid): BinaryFileResponse
    {
        $photo = ProgressPhoto::where('ulid', $ulid)->firstOrFail();

        $disk = Storage::disk($photo->disk ?: 'public');

        abort_unless($disk->exists($photo->path), 404);

        /*
         * MIME ditentukan server dari isi file, bukan dari nilai yang
         * dikirim klien saat upload. Fallback ke `mime_type` tersimpan
         * hanya bila deteksi gagal.
         */
        $mime = $disk->mimeType($photo->path)
            ?: ($photo->mime_type ?: 'application/octet-stream');

        $response = response()->file($disk->path($photo->path), [
            'Content-Type' => $mime,
            'X-Content-Type-Options' => 'nosniff',
        ]);

        /*
         * `response()->file()` default menandai response `public`.
         * Paksa `private` supaya foto tidak disimpan di cache bersama,
         * lalu beri TTL pendek.
         */
        $response->setPrivate();
        $response->setMaxAge(3600);

        return $response;
    }
}
