<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Foto dokumentasi yang dilampirkan pada catatan progress tiang.
 *
 * URL sengaja dikembalikan RELATIF (`/api/photos/{ulid}`) supaya
 * mengikuti origin yang sedang dipakai frontend (proxy Next ke
 * backend) dan tidak bergantung pada `APP_URL`.
 */
class ProgressPhoto extends Model
{
    protected $fillable = [
        'ulid',
        'pole_id',
        'work_item_id',
        'progress_history_id',
        'disk',
        'path',
        'original_name',
        'mime_type',
        'size',
        'uploaded_by',
    ];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $photo): void {
            if (empty($photo->ulid)) {
                $photo->ulid = (string) Str::ulid();
            }
        });
    }

    public function pole(): BelongsTo
    {
        return $this->belongsTo(Pole::class);
    }

    public function workItem(): BelongsTo
    {
        return $this->belongsTo(WorkItem::class);
    }

    public function progressHistory(): BelongsTo
    {
        return $this->belongsTo(PoleProgressHistory::class, 'progress_history_id');
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function url(): string
    {
        return '/api/photos/'.$this->ulid;
    }

    public function toPayload(): array
    {
        return [
            'id' => $this->id,
            'url' => $this->url(),
            'original_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'size' => $this->size,
        ];
    }
}
