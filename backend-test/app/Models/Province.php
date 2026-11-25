<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Master provinsi (PK string, lihat migrasi wilayah Indonesia).
 *
 * Dipakai untuk penugasan wilayah ke user (`province_user`) dan
 * untuk menampilkan nama provinsi pada daftar tiang.
 */
class Province extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'latitude',
        'longitude',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
        ];
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'province_user')
            ->withTimestamps();
    }
}
