<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkItem extends Model
{
    protected $fillable = [
        'project_id',
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

    public function poleProgress(): HasMany
    {
        return $this->hasMany(PoleWorkProgress::class);
    }
}
