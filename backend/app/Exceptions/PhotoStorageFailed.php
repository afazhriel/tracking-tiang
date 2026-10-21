<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class PhotoStorageFailed extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json([
            'message' => 'Foto gagal disimpan. Perubahan belum disimpan; silakan coba lagi.',
            'saved' => false,
        ], 503);
    }
}
