<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;
    use HasFactory;
    use Notifiable;

    public const ROLE_ADMIN = 'admin';

    public const ROLE_SUPERVISOR = 'supervisor';

    public const ROLE_PIC = 'pic';

    /**
     * Role untuk user yang mendaftar sendiri lewat `POST /api/register`.
     * Paling rendah (PIC) supaya pendaftaran mandiri tidak langsung
     * memberi akses kelola; admin menaikkan role bila perlu.
     */
    public const DEFAULT_ROLE = self::ROLE_PIC;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_PENDING = 'pending';

    public const STATUS_SUSPENDED = 'suspended';

    /**
     * `role` sengaja TIDAK ada default di sini.
     *
     * Kalau diisi `'pic'`, user yang dibuat lewat jalur lain
     * (seeder, tinker, script restore) diam-diam dapat role tanpa
     * pernah ditunjuk admin. Plus kolom `role` di database nullable,
     * jadi model harus mengeluarkan nilai yang sama supaya tidak
     * ada dua sumber kebenaran.
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'avatar',
        'role',
        'status',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    /*
     * =========================================================
     * ROLE
     * =========================================================
     */

    public function isAdmin(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    public function isSupervisor(): bool
    {
        return $this->role === self::ROLE_SUPERVISOR;
    }

    public function isPic(): bool
    {
        return $this->role === self::ROLE_PIC;
    }

    /**
     * Role yang diketahui aplikasi.
     *
     * Dikembalikan sebagai string, bukan enum, supaya nilai yang
     * tidak dikenal (mis. ditambahkan manual di database) tidak
     * memicu exception saat serialisasi — hanya dianggap tidak punya
     * role, yang berarti tidak mendapat hak akses apa pun.
     */
    public static function roles(): array
    {
        return [self::ROLE_ADMIN, self::ROLE_SUPERVISOR, self::ROLE_PIC];
    }

    public static function statuses(): array
    {
        return [self::STATUS_ACTIVE, self::STATUS_PENDING, self::STATUS_SUSPENDED];
    }

    public static function roleLabel(?string $role): ?string
    {
        return match ($role) {
            self::ROLE_ADMIN => 'Admin',
            self::ROLE_SUPERVISOR => 'Supervisor',
            self::ROLE_PIC => 'PIC Lapangan',
            default => null,
        };
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function isSuspended(): bool
    {
        return $this->status === self::STATUS_SUSPENDED;
    }

    /**
     * `status` NULL (baris lama sebelum migration role/status ada)
     * tetap dianggap aktif supaya user existing tidak terkunci.
     * Hanya `pending` (menunggu persetujuan admin) dan `suspended`
     * yang bukan-aktif.
     */
    public function isActive(): bool
    {
        return ! $this->isSuspended() && ! $this->isPending();
    }

    /*
     * =========================================================
     * RELASI
     * =========================================================
     */

    public function teamMemberships(): HasMany
    {
        return $this->hasMany(TeamMember::class);
    }

    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'team_members')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function projectMemberships(): HasMany
    {
        return $this->hasMany(ProjectUser::class);
    }

    public function projects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class, 'project_user')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function provinces(): BelongsToMany
    {
        return $this->belongsToMany(Province::class, 'province_user')
            ->withTimestamps();
    }

    public function poleAssignments(): HasMany
    {
        return $this->hasMany(PoleAssignment::class);
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(Invitation::class, 'invited_by');
    }

    /*
     * =========================================================
     * AUTHORIZATION HELPER
     * =========================================================
     */

    /**
     * ID project yang boleh diakses user ini.
     *
     * Admin tidak dibatasi. Pengguna lain hanya boleh mengakses
     * proyek miliknya atau proyek tempat ia menjadi anggota.
     */
    public function accessibleProjectIds(): ?array
    {
        // Admin platform tetap memiliki akses administratif global.
        if ($this->isAdmin()) {
            return null;
        }

        $memberIds = DB::table('project_user')
            ->where('user_id', $this->getKey())
            ->pluck('project_id');

        $ownedIds = DB::table('projects')
            ->where('owner_user_id', $this->getKey())
            ->pluck('id');

        return $memberIds
            ->merge($ownedIds)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    public function canAccessProject(int $projectId): bool
    {
        $ids = $this->accessibleProjectIds();

        return $ids === null || in_array($projectId, $ids, true);
    }

    /**
     * ID tiang yang ditugaskan ke user ini.
     *
     * Termasuk penugasan lewat tim, karena tim anggota user tersebut
     * memegang akses atas tiang yang ditugaskan ke tim-nya. Tanpa
     * ini, PIC dalam tim tidak akan bisa apa-apa.
     */
    public function assignedPoleIds(): array
    {
        $direct = DB::table('pole_assignments')
            ->where('status', PoleAssignment::STATUS_ACTIVE)
            ->where('user_id', $this->getKey())
            ->pluck('pole_id');

        $viaTeam = DB::table('pole_assignments')
            ->join('teams', 'teams.id', '=', 'pole_assignments.team_id')
            ->join('team_members', 'team_members.team_id', '=', 'pole_assignments.team_id')
            ->where('teams.status', 'active')
            ->where('pole_assignments.status', PoleAssignment::STATUS_ACTIVE)
            ->where('team_members.user_id', $this->getKey())
            ->pluck('pole_assignments.pole_id');

        return $direct
            ->merge($viaTeam)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    public function isPoleAssignedTo(int $poleId): bool
    {
        return in_array($poleId, $this->assignedPoleIds(), true);
    }

    /**
     * ID provinsi yang boleh dikelola user ini.
     *
     * Admin -> `null` (tidak dibatasi; seluruh provinsi).
     * Selain admin -> daftar province_id dari `province_user`.
     */
    public function managedProvinceIds(): ?array
    {
        if ($this->isAdmin()) {
            return null;
        }

        return DB::table('province_user')
            ->where('user_id', $this->getKey())
            ->pluck('province_id')
            ->all();
    }

    /**
     * Boleh menambah tiang / mencatat progress di provinsi ini?
     *
     * Admin selalu boleh. Selain admin, provinsi wajib diisi dan
     * harus termasuk penugasan mereka.
     */
    public function canManageProvince(?string $provinceId): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        if ($provinceId === null || $provinceId === '') {
            return false;
        }

        return in_array($provinceId, $this->managedProvinceIds(), true);
    }

    /**
     * URL foto profil, atau null kalau belum ada.
     *
     * Disajikan lewat endpoint berizin `GET /api/user/avatar/{user}`.
     * Browser mengirim cookie HttpOnly. URL relatif mempertahankan origin.
     * `?v=` memakai
     * timestamp update supaya foto baru tidak kena cache browser.
     */
    public function avatarUrl(): ?string
    {
        if (! $this->avatar) {
            return null;
        }

        return '/api/user/avatar/'.$this->id.'?v='.($this->updated_at?->getTimestamp() ?? 0);
    }

    /**
     * Bentuk user yang dikirim ke frontend.
     *
     * `role` dan `role_label` sengaja ditambahkan di sini: frontend
     * (`normalizeUser`) sudah membaca kedua field itu, dan menambah
     * key baru tidak mengubah bentuk response yang sudah dipakai.
     *
     * `provinces` dipakai frontend untuk memfilter pilihan wilayah
     * saat menambah tiang (non-admin hanya boleh provinsi yang
     * ditugaskan). Panggilan yang mengembalikan banyak user
     * (mis. UserController@index) WAJIB eager-load `provinces`
     * agar tidak N+1.
     */
    public function toAuthPayload(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'avatar' => $this->avatar,
            'avatar_url' => $this->avatarUrl(),
            'role' => $this->role,
            'role_label' => self::roleLabel($this->role),
            'status' => $this->status,
            'provinces' => $this->provinces
                ->map(fn (Province $province) => [
                    'id' => $province->id,
                    'name' => $province->name,
                ])
                ->values(),
        ];
    }
}
