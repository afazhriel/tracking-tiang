<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Pole extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'region_id',
        'province_id',
        'regency_id',
        'district_id',
        'village_id',
        'pole_code',
        'address',
        'latitude',
        'longitude',
        'status',
    ];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function region(): BelongsTo
    {
        return $this->belongsTo(Region::class);
    }

    public function province(): BelongsTo
    {
        return $this->belongsTo(Province::class, 'province_id');
    }

    public function photos(): HasMany
    {
        return $this->hasMany(ProgressPhoto::class);
    }

    public function workProgress(): HasMany
    {
        return $this->hasMany(PoleWorkProgress::class);
    }
}
