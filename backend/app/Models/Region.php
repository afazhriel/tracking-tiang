<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Region extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'name',
        'code',
    ];

    /**
     * Region otomatis untuk sebuah provinsi.
     *
     * Nama diambil dari master provinsi, kode memakai kode BPS provinsi
     * (mis. "32"). Di-scope per project mengikuti unique `project_id`+`code`.
     */
    public static function forProvince(Project $project, ?string $provinceId): ?self
    {
        if (empty($provinceId)) {
            return null;
        }

        $province = DB::table('provinces')->where('id', $provinceId)->first();

        if ($province === null) {
            return null;
        }

        return static::firstOrCreate(
            [
                'project_id' => $project->id,
                'code' => (string) $province->id,
            ],
            [
                'name' => $province->name,
            ]
        );
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function poles(): HasMany
    {
        return $this->hasMany(Pole::class);
    }
}
