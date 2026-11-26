<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'address',
        'phone',
        'email',
        'logo_path',
    ];

    /**
     * logo_url ikut terserialisasi di mana pun organisasi dikirim
     * (mis. bersarang di detail proyek) supaya kop Surat Job / RAB
     * bisa memakai logo tanpa memanggil endpoint organisasi lagi.
     */
    protected $appends = ['logo_url'];

    public function getLogoUrlAttribute(): ?string
    {
        return $this->logoUrl();
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'org_id');
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class, 'org_id');
    }

    /**
     * Admin organisasi ini, atau null bila belum ada.
     *
     * Aturan "satu organisasi satu admin": hanya satu user per
     * organisasi yang boleh ber-role admin. Admin platform (org_id
     * NULL) bukan admin organisasi mana pun.
     */
    public function admin(): ?User
    {
        return $this->users()
            ->where('role', User::ROLE_ADMIN)
            ->where('status', User::STATUS_ACTIVE)
            ->orderBy('id')
            ->first();
    }

    /**
     * URL logo organisasi (kop Surat Job dan cetakan RAB).
     * Disajikan lewat endpoint berizin, bukan URL publik langsung.
     */
    public function logoUrl(): ?string
    {
        if (! $this->logo_path) {
            return null;
        }

        return '/api/organizations/'.$this->id.'/logo';
    }

    /**
     * Bentuk organisasi yang dikirim ke frontend (kop Surat Job,
     * kartu Organisasi di Profil).
     */
    public function toPublicPayload(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'address' => $this->address,
            'phone' => $this->phone,
            'email' => $this->email,
            'logo_url' => $this->logoUrl(),
        ];
    }
}
