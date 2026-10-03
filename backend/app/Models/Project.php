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
        'status',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
    ];

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
}
