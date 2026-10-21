<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Invitation extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_REVOKED = 'revoked';

    /**
     * Lama berlaku undangan. Undangan yang tidak dipakai dalam 7
     * hari dianggap kedaluwarsa supaya token tidak menggantung
     * selamanya di mailbox.
     */
    public const EXPIRES_IN_HOURS = 168;

    protected $fillable = [
        'email',
        'name',
        'role',
        'team_id',
        'project_id',
        'invited_by',
        'token_hash',
        'expires_at',
        'accepted_at',
        'status',
        'user_id',
    ];

    protected $hidden = [
        'token_hash',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'accepted_at' => 'datetime',
    ];

    /*
     * =========================================================
     * TOKEN
     * =========================================================
     */

    /**
     * Token mentah + hash-nya.
     *
     * Token mentah dikembalikan HANYA untuk dikirim ke penerima.
     * Yang disimpan ke database adalah hash-nya. 64 karakter dari
     * `random_bytes`, bukan `Str::random`, supaya tidak bergantung
     * pada PRNG internal PHP.
     */
    public static function issueToken(): array
    {
        $raw = bin2hex(random_bytes(32));

        return [$raw, self::hashToken($raw)];
    }

    public static function hashToken(string $raw): string
    {
        return hash('sha256', $raw);
    }

    /**
     * Cari undangan dari token mentah user.
     *
     * Token di-hash lebih dulu, lalu dicocokkan ke `token_hash`.
     * Tidak pernah ada perbandingan string mentah terhadap database.
     */
    public static function findByRawToken(string $raw): ?self
    {
        return static::query()
            ->where('token_hash', self::hashToken($raw))
            ->first();
    }

    /*
     * =========================================================
     * STATUS
     * =========================================================
     */

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /**
     * Undangan masih bisa di-accept?
     *
     * Status `pending` + belum lewat tanggal. Baris yang sudah
     * `expired` di database ikut ditolak di sini supaya tidak
     * bergantung pada proses terjadwal untuk kasus yang terlambat.
     */
    public function isAcceptable(): bool
    {
        return $this->status === self::STATUS_PENDING && ! $this->isExpired();
    }

    /**
     * Alasan kenapa undangan tidak bisa dipakai — untuk pesan 403/410
     * yang informatif tanpa membocorkan apa pun.
     */
    public function unusableReason(): ?string
    {
        return match (true) {
            $this->status === self::STATUS_ACCEPTED => 'Undangan sudah pernah digunakan.',
            $this->status === self::STATUS_REVOKED => 'Undangan telah dicabut.',
            $this->status === self::STATUS_EXPIRED || $this->isExpired() => 'Undangan sudah kedaluwarsa.',
            $this->status !== self::STATUS_PENDING => 'Undangan tidak aktif.',
            default => null,
        };
    }

    public function markAccepted(int $userId): void
    {
        $this->forceFill([
            'status' => self::STATUS_ACCEPTED,
            'accepted_at' => now(),
            'user_id' => $userId,
        ])->save();
    }

    public function markExpired(): void
    {
        $this->forceFill(['status' => self::STATUS_EXPIRED])->save();
    }

    public function markRevoked(): void
    {
        $this->forceFill(['status' => self::STATUS_REVOKED])->save();
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    /*
     * =========================================================
     * RELASI
     * =========================================================
     */

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Bentuk yang dikirim ke admin.
     *
     * Sengaja TIDAK menyertakan `token_hash` — admin yang membuat
     * undangan memang sudah menerima token mentahnya di response
     * pembuatan, jadi tidak perlu membacanya lagi dari sini.
     */
    public function toAdminPayload(): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'name' => $this->name,
            'role' => $this->role,
            'role_label' => User::roleLabel($this->role),
            'team_id' => $this->team_id,
            'project_id' => $this->project_id,
            'status' => $this->status,
            'expires_at' => $this->expires_at?->toIso8601String(),
            'accepted_at' => $this->accepted_at?->toIso8601String(),
            'invited_by' => $this->invited_by,
            'user_id' => $this->user_id,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
