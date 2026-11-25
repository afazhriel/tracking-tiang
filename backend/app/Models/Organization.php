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
    ];

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
        ];
    }
}
