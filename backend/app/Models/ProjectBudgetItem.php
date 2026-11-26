<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectBudgetItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'budget_id',
        'name',
        'category',
        'volume',
        'unit',
        'unit_price',
        'line_total',
        'sort_order',
    ];

    protected $casts = [
        'volume' => 'decimal:4',
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
    ];

    public function budget(): BelongsTo
    {
        return $this->belongsTo(ProjectBudget::class, 'budget_id');
    }

    /**
     * Total baris selalu dihitung server (volume x harga satuan),
     * tidak pernah dipercaya dari kiriman klien.
     */
    public static function lineTotal(float $volume, float $unitPrice): float
    {
        return round($volume * $unitPrice, 2);
    }

    public function toPayload(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'category' => $this->category,
            'volume' => (float) $this->volume,
            'unit' => $this->unit,
            'unit_price' => (float) $this->unit_price,
            'line_total' => (float) $this->line_total,
        ];
    }
}
