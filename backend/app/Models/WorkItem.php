<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkItem extends Model
{
    protected $fillable = [
        'project_id',
        'pole_id',
        'source_item_id',
        'name',
        'weight_percent',
        'sequence',
        'planned_duration_days',
        'is_active',
        'planned_start_month',
        'planned_end_month',
    ];

    protected $casts = [
        'weight_percent' => 'decimal:2',
        'planned_duration_days' => 'integer',
        'planned_start_month' => 'integer',
        'planned_end_month' => 'integer',
        'is_active' => 'boolean',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function pole(): BelongsTo
    {
        return $this->belongsTo(Pole::class);
    }

    /**
     * Item template asal salinan milik tiang (NULL untuk item template).
     */
    public function sourceItem(): BelongsTo
    {
        return $this->belongsTo(self::class, 'source_item_id');
    }

    /**
     * Salinan item ini pada tiap tiang.
     */
    public function copies(): HasMany
    {
        return $this->hasMany(self::class, 'source_item_id');
    }

    public function poleProgress(): HasMany
    {
        return $this->hasMany(PoleWorkProgress::class);
    }

    public static function templates(): Builder
    {
        return static::query()->whereNull('pole_id');
    }

    public function isTemplate(): bool
    {
        return $this->pole_id === null;
    }
}
