<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PoleWorkProgress extends Model
{
    use HasFactory;

    protected $table = 'pole_work_progress';

    protected $fillable = [
        'pole_id',
        'work_item_id',
        'progress_percent',
        'started_at',
        'completed_at',
        'notes',
        'updated_by',
    ];

    protected $casts = [
        'progress_percent' => 'decimal:2',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function pole(): BelongsTo
    {
        return $this->belongsTo(Pole::class);
    }

    public function workItem(): BelongsTo
    {
        return $this->belongsTo(WorkItem::class);
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
