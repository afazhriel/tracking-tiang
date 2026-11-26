<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Satu baris riwayat aktivitas proyek untuk peristiwa yang tidak
 * punya tabel histori sendiri: penugasan titik, anggota proyek,
 * pengesahan baseline, dan progres kuantitas.
 *
 * Progres per-tiang tetap dibaca dari `pole_progress_histories`
 * (lebih kaya: item pekerjaan + foto), jadi tidak diduplikasi ke sini.
 */
class ProjectActivity extends Model
{
    public const ACTION_PENUGASAN = 'penugasan';

    public const ACTION_CABUT_PENUGASAN = 'cabut_penugasan';

    public const ACTION_ANGGOTA_TAMBAH = 'anggota_tambah';

    public const ACTION_ANGGOTA_HAPUS = 'anggota_hapus';

    public const ACTION_ANGGOTA_PERAN = 'anggota_peran';

    public const ACTION_BASELINE_SAHKAN = 'baseline_sahkan';

    public const ACTION_PROGRESS_KUANTITAS = 'progress_kuantitas';

    public const ACTION_RAB_BUAT = 'rab_buat';

    public const ACTION_RAB_AJUKAN = 'rab_ajukan';

    public const ACTION_RAB_DISETUJUI = 'rab_disetujui';

    public const ACTION_RAB_DITOLAK = 'rab_ditolak';

    protected $fillable = [
        'project_id',
        'user_id',
        'action',
        'subject_type',
        'subject_id',
        'title',
        'description',
        'data',
    ];

    protected $casts = [
        'data' => 'array',
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
