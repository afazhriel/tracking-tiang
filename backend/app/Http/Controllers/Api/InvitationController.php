<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invitation;
use App\Models\Team;
use App\Models\User;
use App\Services\BrowserSession;
use App\Services\TeamAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * Undangan bermuka akun.
 *
 * TIDAK ADA public registration. `accept` adalah satu-satunya jalan
 * membuat user baru, dan hanya bisa dipanggil dengan token yang
 * exists, belum dipakai, dan belum kedaluwarsa.
 */
class InvitationController extends Controller
{
    /**
     * Admin membuat undangan.
     *
     * Response menyertakan `invitation_url` HANYA kalau sedang
     * development atau mailer masih `log`. Di production dengan SMTP
     * sungguhan, token tidak pernah dikembalikan lewat API — kalau
     * bocor dari response, undangan bisa dipakai orang lain.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'name' => ['nullable', 'string', 'max:255'],
            'role' => ['required', Rule::in(User::roles())],
            'team_id' => ['nullable', 'integer', 'exists:teams,id'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
        ]);

        $email = Str::lower($validated['email']);

        /* Undangan adalah satu-satunya cara membuat user, jadi
           undangan aktif untuk email yang sama harus dicegah di sini
           supaya tidak ada dua token hidup untuk satu mailbox. */
        if (Invitation::pending()->where('email', $email)->exists()) {
            throw ValidationException::withMessages([
                'email' => ['Sudah ada undangan aktif untuk email ini.'],
            ]);
        }

        [$rawToken, $hash] = Invitation::issueToken();

        $invitation = Invitation::create([
            'email' => $email,
            'name' => $validated['name'] ?? null,
            'role' => $validated['role'],
            'team_id' => $validated['team_id'] ?? null,
            'project_id' => $validated['project_id'] ?? null,
            'invited_by' => $request->user()->id,
            'token_hash' => $hash,
            'expires_at' => now()->addHours(Invitation::EXPIRES_IN_HOURS),
            'status' => Invitation::STATUS_PENDING,
        ]);

        $mailSent = $this->sendInvitationMail($invitation, $rawToken);

        $response = [
            'message' => $mailSent
                ? 'Undangan berhasil dibuat dan dikirim ke email tujuan.'
                : 'Undangan berhasil dibuat, tapi email gagal dikirim.',
            'data' => $invitation->toAdminPayload(),
            'mail_sent' => $mailSent,
        ];

        if ($this->shouldExposeInvitationUrl()) {
            $response['invitation_url'] = route('invitations.accept.show', $rawToken);
        }

        return response()->json($response, 201);
    }

    /**
     * Cek undangan tanpa login.
     *
     * Sengaja hanya mengirim field yang dibutuhkan form set password:
     * nama, email, role. Tidak ada `token_hash`, tidak ada `invited_by`
     * yang bisa dipakai untuk enumerasi.
     */
    public function show(string $token): JsonResponse
    {
        $invitation = Invitation::findByRawToken($token);

        if (! $invitation) {
            return response()->json([
                'message' => 'Undangan tidak ditemukan.',
            ], 404);
        }

        $reason = $invitation->unusableReason();

        if ($reason) {
            return response()->json([
                'message' => $reason,
            ], 403);
        }

        return response()->json([
            'data' => [
                'email' => $invitation->email,
                'name' => $invitation->name,
                'role' => $invitation->role,
                'role_label' => User::roleLabel($invitation->role),
                'expires_at' => $invitation->expires_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * Terima undangan → buat akun → token login.
     *
     * Email milik undangan tidak bisa diganti: kalau user boleh
     * menukar email di sini, admin yang mengundang bisa tidak sengaja
     * membuat akun untuk orang yang salah. Yang boleh diubah hanya
     * nama (typo) dan password.
     */
    public function accept(Request $request, string $token): JsonResponse
    {
        $invitation = Invitation::findByRawToken($token);

        if (! $invitation) {
            return response()->json([
                'message' => 'Undangan tidak ditemukan.',
            ], 404);
        }

        $reason = $invitation->unusableReason();

        if ($reason) {
            return response()->json([
                'message' => $reason,
            ], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        return DB::transaction(function () use ($token, $validated, $request) {
            $invitation = Invitation::where('token_hash', Invitation::hashToken($token))->lockForUpdate()->firstOrFail();
            if ($reason = $invitation->unusableReason()) {
                return response()->json(['message' => $reason], 403);
            }
            /* Kalau akun dengan email ini sudah ada, jangan reset
               password-nya — itu jadi celah takeover: siapa pun yang punya
               token (mis. forwarded) bisa mengambil alih akun orang. */
            if (DB::table('users')->where('email', $invitation->email)->exists()) {
                throw ValidationException::withMessages([
                    'email' => ['Email ini sudah terdaftar. Silakan masuk.'],
                ]);
            }

            $user = User::create([
                'name' => $validated['name'],
                'email' => $invitation->email,
                'password' => $validated['password'],
                'role' => $invitation->role,
                'status' => User::STATUS_ACTIVE,
            ]);

            /* Keanggotaan ditambahkan di sini dari undangan, supaya
               akun yang baru dibuat langsung punya akses yang diharapkan
               admin — tanpa perlu langkah manual tambahan. */
            if ($invitation->team_id) {
                $this->attachUserToTeam($user, (int) $invitation->team_id);
            }

            if ($invitation->project_id) {
                DB::table('project_user')->updateOrInsert(
                    ['project_id' => $invitation->project_id, 'user_id' => $user->id],
                    ['role' => $invitation->role, 'created_at' => now(), 'updated_at' => now()],
                );
            }

            $invitation->markAccepted((int) $user->id);

            /* Token dikembalikan di sini supaya user tidak perlu login
               kedua kali setelah accept. Bentuknya sama dengan
               `POST /api/login` supaya frontend bisa memakai satu
               handler untuk keduanya. */
            return app(BrowserSession::class)->login($request, $user->fresh(), 201, ['message' => 'Akun berhasil dibuat.']);
        });
    }

    /**
     * Cabut undangan yang belum dipakai.
     */
    public function destroy(Request $request, int $invitation): JsonResponse
    {
        $this->authorize('create', User::class);

        return DB::transaction(function () use ($invitation) {
            $model = Invitation::whereKey($invitation)->lockForUpdate()->firstOrFail();

            if ($model->status === Invitation::STATUS_ACCEPTED) {
                throw ValidationException::withMessages([
                    'status' => ['Undangan yang sudah dipakai tidak bisa dicabut.'],
                ]);
            }

            $model->markRevoked();

            return response()->json([
                'message' => 'Undangan dicabut.',
                'data' => $model->fresh()->toAdminPayload(),
            ]);
        });
    }

    /**
     * Daftar undangan — untuk halaman "kirim ulang / cabut".
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $invitations = Invitation::with(['team:id,name', 'project:id,name'])
            ->latest('id')
            ->limit(100)
            ->get()
            ->map(fn (Invitation $invitation) => $invitation->toAdminPayload());

        return response()->json(['data' => $invitations]);
    }

    /*
     * =========================================================
     * INTERNAL
     * =========================================================
     */

    /**
     * Mailer `log` hanya menulis isi email ke `storage/logs`, jadi
     * tidak ada yang benar-benar terkirim. Kalau gagal, return
     * `false` — jangan pernah mengklaim terkirim saat tidak.
     */
    private function sendInvitationMail(Invitation $invitation, string $rawToken): bool
    {
        $url = route('invitations.accept.show', $rawToken);

        try {
            Mail::raw(
                'Halo '.($invitation->name ?: $invitation->email).",\n\n"
                .'Anda diundang masuk ke Tracking Tiang dengan role: '
                .(User::roleLabel($invitation->role) ?? $invitation->role).".\n\n"
                ."Selesaikan pendaftaran di:\n{$url}\n\n"
                .'Undangan berlaku sampai: '.$invitation->expires_at->toDayDateTimeString()."\n",
                fn ($message) => $message
                    ->to($invitation->email)
                    ->subject('Undangan akses Tracking Tiang')
            );

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }

    private function shouldExposeInvitationUrl(): bool
    {
        return app()->environment(['local', 'testing'])
            || config('mail.default') === 'log';
    }

    /**
     * Undangan boleh menyebut `team_id`, tapi baris `team_members`
     * baru bisa dibuat setelah ada user-nya. Jadi keanggotaan
     * ditambahkan di `accept`, bukan di `store`.
     */
    private function attachUserToTeam(User $user, int $teamId): void
    {
        $team = Team::whereKey($teamId)->lockForUpdate()->firstOrFail();
        app(TeamAccess::class)->grantProjects($team, $user);
        DB::table('team_members')->updateOrInsert(
            ['team_id' => $teamId, 'user_id' => $user->id],
            ['created_at' => now(), 'updated_at' => now()],
        );
    }
}
