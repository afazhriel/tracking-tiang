<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\PoleAssignment;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class PoleAssignmentController extends Controller
{
    public function index(User $user): JsonResponse
    {
        abort_unless($this->isAdmin(request()), 403, 'Forbidden.');

        $assignments = PoleAssignment::query()
            ->where('user_id', $user->id)
            ->where('status', PoleAssignment::STATUS_ACTIVE)
            ->with([
                'pole:id,project_id,name,code',
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

        if ($team && $team->status !== 'active') {
            return response()->json([
                'message' => 'Team sedang tidak aktif.',
            ], 422);
        }

        $existing = PoleAssignment::query()
            ->where('pole_id', $pole->id)
            ->where('user_id', $user->id)
            ->first();

        if ($existing) {
            $existing->update([
                'team_id' => $team?->id,
                'assigned_by' => $request->user()->id,
                'assigned_at' => Carbon::now(),
                'status' => PoleAssignment::STATUS_ACTIVE,
            ]);

            $assignment = $existing;
        } else {
            $assignment = PoleAssignment::create([
                'pole_id' => $pole->id,
                'user_id' => $user->id,
                'team_id' => $team?->id,
                'assigned_by' => $request->user()->id,
                'assigned_at' => Carbon::now(),
                'status' => PoleAssignment::STATUS_ACTIVE,
            ]);
        }

        $assignment->load([
            'pole:id,project_id,name,code',
            'user:id,name,email,role,status',
            'team:id,name,code',
            'assigner:id,name,email',
        ]);

        return response()->json($assignment, $existing ? 200 : 201);
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
