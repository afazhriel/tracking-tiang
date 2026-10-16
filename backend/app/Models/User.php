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
     * Admin dan Supervisor tidak dibatasi membership — mereka butuh
     * tampilan seluruh project. PIC dibatasi ke `project_user`.
     */
    public function accessibleProjectIds(): ?array
    {
        if ($this->isAdmin() || $this->isSupervisor()) {
            return null; // null = tidak ada pembatasan
        }

        return DB::table('project_user')
            ->where('user_id', $this->getKey())
            ->pluck('project_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public function canAccessProject(int $projectId): bool
    {
        $ids = $this->accessibleProjectIds();

        if ($ids === null) {
            return true;
        }

        return in_array($projectId, $ids, true);
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
            ->join('team_members', 'team_members.team_id', '=', 'pole_assignments.team_id')
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
     * Bentuk user yang dikirim ke frontend.
     *
     * `role` dan `role_label` sengaja ditambahkan di sini: frontend
     * (`normalizeUser`) sudah membaca kedua field itu, dan menambah
     * key baru tidak mengubah bentuk response yang sudah dipakai.
     */
    public function toAuthPayload(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'role_label' => self::roleLabel($this->role),
            'status' => $this->status,
        ];
    }
}
