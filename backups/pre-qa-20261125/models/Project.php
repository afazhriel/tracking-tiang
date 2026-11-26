<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'start_date',
        'end_date',
        'total_target_poles',
        'target_quantity',
        'unit_code',
        'progress_source',
        'status',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'target_quantity' => 'decimal:4',
    ];

    protected static function booted(): void
    {
        static::creating(function (Project $project): void {
            // Old pole projects can be created without a quantity target.
            // Keep them on the historical weighted calculation; quantity
            // projects created with a target retain the new calculation.
            // An explicitly selected source always wins.
            if ($project->progress_source === null) {
                $project->progress_source = $project->target_quantity !== null
                    ? 'quantity_entries'
                    : 'pole_weighted';
            }
        });
    }

    public function regions(): HasMany
    {
        return $this->hasMany(Region::class);
    }

    public function poles(): HasMany
    {
        return $this->hasMany(Pole::class);
    }

    public function workItems(): HasMany
    {
        return $this->hasMany(WorkItem::class);
    }

    /**
     * Penyebut (denominator) untuk menghitung progres global proyek.
     *
     * Aturan ini dipakai bersama oleh WorkItemController dan
     * CurveController supaya progres yang ditampilkan di semua
     * halaman konsisten:
     *
     * - Utamakan `total_target_poles` bila diisi.
     * - Bila belum diisi (0/null), pakai jumlah tiang yang terdaftar
     *   supaya progres tidak selalu nol hanya karena target kosong.
     *
     * Tiang yang belum punya progres otomatis bernilai 0%.
     */
    public function progressDenominator(): int
    {
        $target = (int) ($this->total_target_poles ?? 0);

        if ($target > 0) {
            return $target;
        }

        return (int) $this->poles()->count();
    }
}
