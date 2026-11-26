<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectUser extends Model
{
    use HasFactory;

    /**
     * Peran anggota di dalam satu proyek (bukan role akun global).
     * - pengelola: mengatur anggota + mencatat progres
     * - pelaksana: mencatat progres di titik/proyeknya
     * - pelihat: hanya melihat, tidak mencatat
     * Anggota lama tanpa peran dianggap pelaksana.
     */
    public const ROLE_PENGELOLA = 'pengelola';

    public const ROLE_PELAKSANA = 'pelaksana';

    public const ROLE_PELIHAT = 'pelihat';

    public static function roles(): array
    {
        return [self::ROLE_PENGELOLA, self::ROLE_PELAKSANA, self::ROLE_PELIHAT];
    }

    public static function roleLabel(?string $role): ?string
    {
        return match ($role) {
            self::ROLE_PENGELOLA => 'Pengelola',
            self::ROLE_PELAKSANA => 'Pelaksana',
            self::ROLE_PELIHAT => 'Pelihat',
            default => null,
        };
    }

    protected $table = 'project_user';

    protected $fillable = [
        'project_id',
        'user_id',
        'role',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
