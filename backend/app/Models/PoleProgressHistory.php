<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PoleProgressHistory extends Model
{
    protected $fillable = [
        'pole_id',
        'work_item_id',
        'progress_percent',
        'recorded_at',
        'recorded_by',
        'notes',
    ];

    protected $casts = [
        'progress_percent' => 'decimal:2',
        'recorded_at' => 'datetime',
    ];

    public function pole(): BelongsTo
    {
        return $this->belongsTo(Pole::class);
    }

    public function workItem(): BelongsTo
    {
        return $this->belongsTo(WorkItem::class);
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
