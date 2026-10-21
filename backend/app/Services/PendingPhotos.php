<?php

namespace App\Services;

use App\Exceptions\PhotoStorageFailed;
use App\Models\ProgressPhoto;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class PendingPhotos
{
    private array $paths = [];

    public function store(UploadedFile $file, string $directory): string
    {
        $name = Str::ulid().'.'.($file->guessExtension() ?? 'bin');
        $path = $directory.'/'.$name;
        // Track before writing, including partially written files when an adapter returns false.
        $this->paths[] = $path;
        try {
            $disk = Storage::disk('media');
            if ($disk->putFileAs($directory, $file, $name) !== $path
                || ! $disk->exists($path) || $disk->size($path) !== $file->getSize()) {
                throw new PhotoStorageFailed;
            }
        } catch (Throwable) {
            throw new PhotoStorageFailed;
        }

        return $path;
    }

    public function discardUnreferenced(): void
    {
        foreach ($this->paths as $path) {
            $this->discardIfUnreferenced($path, 'media');
        }
    }

    public function discardRetiredAvatar(?string $path): void
    {
        if ($path !== null && (str_starts_with($path, 'avatars/') || str_starts_with($path, 'private-media/avatars/'))) {
            $this->discardIfUnreferenced($path, self::avatarDisk($path));
        }
    }

    public static function avatarDisk(string $path): string
    {
        return str_starts_with($path, 'private-media/avatars/') ? 'media' : 'public';
    }

    private function discardIfUnreferenced(string $path, string $disk): void
    {
        try {
            // A commit/network error can have an uncertain outcome. Retain files if the
            // database is unavailable or any committed metadata still references them.
            if (ProgressPhoto::where('path', $path)->where(fn ($query) => $query->where('disk', $disk)->when($disk === 'public', fn ($query) => $query->orWhereNull('disk')))->exists() || User::where('avatar', $path)->exists()) {
                return;
            }
            if (! Storage::disk($disk)->delete($path)) {
                Log::warning('Unreferenced upload cleanup deferred.');
            }
        } catch (Throwable) {
            Log::warning('Upload cleanup deferred; reference/storage status could not be confirmed.');
        }
    }
}
