<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectActivity;
use App\Services\ActivityLogger;
use App\Services\NotificationService;
use App\Services\ProjectQuantityProgress;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectQuantityEntryController extends Controller
{
    public function __construct(private NotificationService $notifications, private ActivityLogger $activity) {}
    public function index(
        Project $project,
        ProjectQuantityProgress $progress
    ): JsonResponse {
        $this->authorize('view', $project);

        abort_unless(
            $project->progress_source === 'quantity_entries',
            422,
            'Proyek ini tidak mencatat progres per jumlah.'
        );

        return response()->json([
            'data' => DB::table('project_quantity_entries')
                ->where('project_id', $project->id)
                ->orderByDesc('recorded_at')
                ->orderByDesc('id')
                ->paginate(100),
            'summary' => $progress->state($project),
        ]);
    }

    public function store(
        Request $request,
        Project $project,
        ProjectQuantityProgress $progress
    ): JsonResponse {
        // Anggota proyek dengan peran pengelola/pelaksana boleh mencatat;
        // pelihat tidak. Admin/Supervisor/pemilik proyek selalu boleh.
        $this->authorize('recordProgress', $project);

        $data = $request->validate([
            'quantity_delta' => [
                'required',
                'numeric',
                'regex:/^-?\d{1,10}(\.\d{1,4})?$/D',
            ],
            'recorded_at' => [
                'nullable',
                'date_format:Y-m-d H:i:s',
            ],
            'request_key' => [
                'required',
                'string',
                'regex:/^[A-Za-z0-9:_-]{8,100}$/D',
            ],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $delta = ProjectQuantityProgress::scaled(
            $data['quantity_delta']
        );

        abort_if($delta === 0, 422, 'Perubahan jumlah tidak boleh nol.');

        // Fingerprint mengikat satu request_key ke seluruh payload.
        // Normalisasi angka memastikan 20 dan 20.0000 setara.
        $fingerprint = hash('sha256', json_encode([
            'quantity_delta_scaled' => $delta,
            'recorded_at' => $data['recorded_at'] ?? null,
            'notes' => $data['notes'] ?? null,
        ], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use (
            $request,
            $project,
            $progress,
            $data,
            $fingerprint
        ) {
            $locked = Project::query()
                ->whereKey($project->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->authorize('recordProgress', $locked);

            abort_unless(
                $locked->progress_source === 'quantity_entries',
                422,
                'Proyek ini tidak mencatat progres per jumlah.'
            );

            $previous = DB::table('project_quantity_entries')
                ->where('project_id', $locked->id)
                ->where('request_key', $data['request_key'])
                ->first();

            if ($previous) {
                abort_unless(
                    is_string($previous->request_fingerprint)
                    && hash_equals(
                        $previous->request_fingerprint,
                        $fingerprint
                    ),
                    409,
                    'Kunci permintaan sudah dipakai untuk payload berbeda.'
                );

                return response()->json([
                    'message' => 'Permintaan sudah pernah dicatat.',
                    'data' => $previous,
                    'summary' => $progress->state($locked),
                ]);
            }

            // Tanggal dinilai menurut kalender Asia/Jakarta (zona waktu
            // pengguna), bukan UTC: tanggal hari ini di WIB sempat ditolak
            // sebagai "masa depan" sebelum pukul 07:00 WIB, dan tanggal
            // kosong yang disimpan dini hari dicatat sebagai kemarin.
            $timezone = 'Asia/Jakarta';
            $recordedAt = isset($data['recorded_at'])
                ? Carbon::parse($data['recorded_at'], $timezone)
                : now($timezone);
            $recordedDate = $recordedAt->copy()
                ->setTimezone($timezone)
                ->toDateString();
            $today = now($timezone)->toDateString();

            abort_if(
                $recordedDate > $today,
                422,
                'Tanggal progres tidak boleh di masa depan.'
            );

            abort_if(
                $locked->start_date &&
                $recordedDate < $locked->start_date->toDateString(),
                422,
                'Progres tidak boleh dicatat sebelum tanggal mulai proyek.'
            );

            $id = DB::table('project_quantity_entries')
                ->insertGetId([
                    'project_id' => $locked->id,
                    'quantity_delta' => $data['quantity_delta'],
                    'unit_code' => $locked->unit_code,
                    'recorded_at' => $recordedAt,
                    'recorded_by' => $request->user()->id,
                    'request_key' => $data['request_key'],
                    'request_fingerprint' => $fingerprint,
                    'notes' => $data['notes'] ?? null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

            // Penghitungan ulang seluruh timeline mendeteksi koreksi
            // mundur yang menyebabkan saldo historis negatif/berlebih.
            // Jika tidak valid, transaksi otomatis dibatalkan.
            try {
                $summary = $progress->state($locked);
            } catch (\DomainException $e) {
                abort(422, $e->getMessage());
            }

            // Kabari anggota proyek lain + catat ke riwayat aktivitas.
            // (Jalur replay request_key di atas tidak sampai ke sini,
            // jadi satu pencatatan = satu notifikasi.)
            $actor = $request->user();
            $total = $summary['actual_current_quantity'] ?? null;
            $percent = $summary['actual_current_percent'] ?? null;
            $deltaLabel = ((float) $data['quantity_delta'] > 0 ? '+' : '').$data['quantity_delta'];
            $description = "{$actor->name} mencatat {$deltaLabel} {$locked->unit_code}"
                .($total !== null
                    ? " — total {$total} dari target {$locked->target_quantity} ({$percent}%)."
                    : '.');
            $this->notifications->sendToProjectMembers(
                $locked,
                'progress',
                "Progress {$locked->name} diperbarui",
                $description,
                '/proyek',
                ['project_id' => $locked->id, 'quantity_delta' => (float) $data['quantity_delta']],
                $actor->id
            );
            $this->activity->log(
                $locked,
                $actor,
                ProjectActivity::ACTION_PROGRESS_KUANTITAS,
                "Progress {$locked->name} diperbarui",
                $description,
                'project',
                $locked->id,
                ['project_id' => $locked->id, 'quantity_delta' => (float) $data['quantity_delta']]
            );

            return response()->json([
                'message' => 'Progres berhasil dicatat.',
                'data' => DB::table('project_quantity_entries')
                    ->where('id', $id)
                    ->first(),
                'summary' => $summary,
            ], 201);
        }, 3);
    }
}
