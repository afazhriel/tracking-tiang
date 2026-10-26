<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProjectBaseline extends Model
{
    protected $fillable = [
        'project_id',
        'version',
        'unit_code',
        'target_quantity',
        'start_date',
        'end_date',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'target_quantity' => 'decimal:4',
            'start_date' => 'date',
            'end_date' => 'date',
            'approved_at' => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function periods(): HasMany
    {
        return $this->hasMany(ProjectBaselinePeriod::class)
            ->orderBy('period_number');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
