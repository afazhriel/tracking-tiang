<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\PoleAssignment;
use App\Models\ProjectUser;
use App\Models\Team;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\PoleWorkItems;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PoleAssignmentController extends Controller
{
    public function __construct(private PoleWorkItems $items, private NotificationService $notifications) {}

    public function index(User $user): JsonResponse
    {
        abort_unless($this->isAdmin(request()), 403, 'Forbidden.');

        $assignments = PoleAssignment::query()
            ->where('user_id', $user->id)
            ->where('status', PoleAssignment::STATUS_ACTIVE)
            ->with([
                'pole:id,project_id,pole_code,address',
                'team:id,name,code',
                'assigner:id,name,email',
            ])
            ->orderByDesc('assigned_at')
            ->get();

        return response()->json($assignments);
    }

    public function store(Request $request, User $user): JsonResponse
    {
        abort_unless($this->isAdmin($request), 403, 'Forbidden.');

        $validated = $request->validate([
            'pole_id' => ['required', 'integer', 'exists:poles,id'],
            'team_id' => ['nullable', 'integer', 'exists:teams,id'],
        ]);

        $pole = Pole::findOrFail($validated['pole_id']);
        $team = isset($validated['team_id'])
            ? Team::findOrFail($validated['team_id'])
            : null;

        return DB::transaction(function () use ($request, $user, $pole, $team) {
            $this->items->lock($pole);
            $team = $team ? Team::whereKey($team->id)->lockForUpdate()->firstOrFail() : null;
            abort_if($team && $team->status !== 'active', 422, 'Team sedang tidak aktif.');
            abort_if($team && $team->project_id !== null && (int) $team->project_id !== (int) $pole->project_id, 422, 'Tim dan tiang harus berasal dari proyek yang sama.');
            $existing = PoleAssignment::where('pole_id', $pole->id)->where('user_id', $user->id)->first();
            abort_if($team && PoleAssignment::where('pole_id', $pole->id)->where('team_id', $team->id)->when($existing, fn ($q) => $q->where('id', '!=', $existing->id))->exists(), 409, 'Tim sudah ditugaskan ke tiang ini.');
            $assignment = PoleAssignment::updateOrCreate(
                ['pole_id' => $pole->id, 'user_id' => $user->id],
                ['team_id' => $team?->id, 'assigned_by' => $request->user()->id, 'assigned_at' => Carbon::now(), 'status' => PoleAssignment::STATUS_ACTIVE]
            );
            $recipients = collect([$user]);
            foreach ($recipients as $member) {
                ProjectUser::firstOrCreate(['project_id' => $pole->project_id, 'user_id' => $member->id], ['role' => $member->role]);
            }
            if ($user->isActive()) {
                $this->notifications->send($user->id, $pole->project_id, 'sistem', "Anda ditugaskan ke {$pole->pole_code}", 'Tiang ini kini menjadi bagian dari tugas lapangan Anda.', "/tiang/{$pole->id}", ['pole_id' => $pole->id]);
            }
            $assignment->load(['pole:id,project_id,pole_code,address', 'user:id,name,email,role,status', 'team:id,name,code', 'assigner:id,name,email']);

            return response()->json($assignment, $existing ? 200 : 201);
        });
    }

    public function destroy(
        Request $request,
        User $user,
        Pole $pole
    ): JsonResponse {
        abort_unless($this->isAdmin($request), 403, 'Forbidden.');

        $assignment = PoleAssignment::query()
            ->where('pole_id', $pole->id)
            ->where('user_id', $user->id)
            ->where('status', PoleAssignment::STATUS_ACTIVE)
            ->first();

        if (! $assignment) {
            return response()->json([
                'message' => 'Assignment aktif tidak ditemukan.',
            ], 404);
        }

        $assignment->update([
            'status' => PoleAssignment::STATUS_REVOKED,
        ]);

        return response()->json([
            'message' => 'Assignment berhasil dicabut.',
        ]);
    }

    private function isAdmin(Request $request): bool
    {
        return $request->user()?->isAdmin() === true;
    }
}
