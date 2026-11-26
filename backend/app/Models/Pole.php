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
        'due_date',
    ];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'work_items_customized_at' => 'datetime',
        'due_date' => 'date',
    ];

    /**
     * Status titik diturunkan dari progres (bukan status manual):
     * 0% Belum mulai, 1–99% Berjalan, 100% Selesai.
     */
    public const STATUS_BELUM = 'belum';

    public const STATUS_JALAN = 'jalan';

    public const STATUS_SELESAI = 'selesai';

    public static function statusLabel(string $key): string
    {
        return match ($key) {
            self::STATUS_SELESAI => 'Selesai',
            self::STATUS_JALAN => 'Berjalan',
            default => 'Belum mulai',
        };
    }

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

    public function workItems(): HasMany
    {
        return $this->hasMany(WorkItem::class);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(PoleAssignment::class);
    }

    public function activeAssignments(): HasMany
    {
        return $this->assignments()->where('status', PoleAssignment::STATUS_ACTIVE);
    }

    /**
     * Progress tertimbang 0–100 dari item pekerjaan aktif
     * (rumus yang sama dengan ProgressController).
     */
    public function progressPercent(): float
    {
        $this->loadMissing('workProgress.workItem');

        $progress = $this->workProgress
            ->filter(fn ($item) => (bool) $item->workItem?->is_active)
            ->sum(fn ($item) => ((float) $item->workItem->weight_percent * (float) $item->progress_percent) / 100);

        return round($progress, 2);
    }

    public function statusKey(): string
    {
        $progress = $this->progressPercent();

        if ($progress >= 100) {
            return self::STATUS_SELESAI;
        }

        if ($progress > 0) {
            return self::STATUS_JALAN;
        }

        return self::STATUS_BELUM;
    }

    /**
     * Terlambat = ada tenggat yang sudah lewat (kalender WIB)
     * sementara progres belum 100%.
     */
    public function isOverdue(): bool
    {
        if (! $this->due_date || $this->progressPercent() >= 100) {
            return false;
        }

        return $this->due_date->toDateString() < now('Asia/Jakarta')->toDateString();
    }

    /**
     * Data kartu titik untuk frontend: progres + status turunan +
     * tenggat + PIC yang ditugaskan. Dipakai daftar titik, detail
     * titik, dan halaman "Tugas saya".
     */
    public function cardPayload(): array
    {
        $statusKey = $this->statusKey();

        return [
            'progress_percent' => $this->progressPercent(),
            'status_key' => $statusKey,
            'status_label' => self::statusLabel($statusKey),
            'is_overdue' => $this->isOverdue(),
            'due_date' => $this->due_date?->toDateString(),
            'assigned_users' => $this->activeAssignments->map(fn ($assignment) => [
                'id' => $assignment->user_id,
                'name' => $assignment->user?->name,
                'team_id' => $assignment->team_id,
                'team_name' => $assignment->team?->name,
                'assigned_at' => $assignment->assigned_at?->toIso8601String(),
            ])->values()->all(),
        ];
    }
}
