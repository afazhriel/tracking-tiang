<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProjectBudget extends Model
{
    use HasFactory;

    public const STATUS_DRAF = 'draf';

    public const STATUS_DIAJUKAN = 'diajukan';

    public const STATUS_DISETUJUI = 'disetujui';

    public const STATUS_DITOLAK = 'ditolak';

    public static function statuses(): array
    {
        return [
            self::STATUS_DRAF,
            self::STATUS_DIAJUKAN,
            self::STATUS_DISETUJUI,
            self::STATUS_DITOLAK,
        ];
    }

    public static function statusLabel(?string $status): ?string
    {
        return match ($status) {
            self::STATUS_DRAF => 'Draf',
            self::STATUS_DIAJUKAN => 'Diajukan',
            self::STATUS_DISETUJUI => 'Disetujui',
            self::STATUS_DITOLAK => 'Ditolak',
            default => null,
        };
    }

    protected $fillable = [
        'project_id',
        'title',
        'status',
        'submitted_by',
        'submitted_at',
        'decided_by',
        'decided_at',
        'rejection_note',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
        'decided_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(ProjectBudgetItem::class, 'budget_id')
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    /**
     * RAB yang disetujui terkunci: tidak bisa diedit, diajukan ulang,
     * atau dihapus. Perubahan butuh revisi (salinan draf baru).
     */
    public function isLocked(): bool
    {
        return $this->status === self::STATUS_DISETUJUI;
    }

    /**
     * Boleh diedit: draf dan yang ditolak (diperbaiki lalu diajukan ulang).
     * Yang diajukan menunggu keputusan; yang disetujui terkunci.
     */
    public function isEditable(): bool
    {
        return in_array($this->status, [self::STATUS_DRAF, self::STATUS_DITOLAK], true);
    }

    public function totalAmount(): float
    {
        return (float) $this->items->sum('line_total');
    }

    public function toPayload(): array
    {
        $this->loadMissing(['items', 'submitter:id,name', 'decider:id,name']);

        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'title' => $this->title,
            'status' => $this->status,
            'status_label' => self::statusLabel($this->status),
            'total' => $this->totalAmount(),
            'items' => $this->items->map(fn (ProjectBudgetItem $item) => $item->toPayload())->values()->all(),
            'submitted_by' => $this->submitted_by,
            'submitted_by_name' => $this->submitter?->name,
            'submitted_at' => $this->submitted_at?->toIso8601String(),
            'decided_by' => $this->decided_by,
            'decided_by_name' => $this->decider?->name,
            'decided_at' => $this->decided_at?->toIso8601String(),
            'rejection_note' => $this->rejection_note,
            'is_locked' => $this->isLocked(),
            'is_editable' => $this->isEditable(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
