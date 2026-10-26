<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectBaselinePeriod extends Model
{
    protected $fillable = [
        'project_baseline_id',
        'period_number',
        'period_start',
        'period_end',
        'planned_quantity',
    ];

    protected function casts(): array
    {
        return [
            'period_number' => 'integer',
            'period_start' => 'date',
            'period_end' => 'date',
            'planned_quantity' => 'decimal:4',
        ];
    }

    public function baseline(): BelongsTo
    {
        return $this->belongsTo(ProjectBaseline::class, 'project_baseline_id');
    }
}
