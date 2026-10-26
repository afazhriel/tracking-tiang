<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\PoleAssignment;
use App\Models\Team;
use App\Services\PoleVisibility;
use App\Services\PoleWorkItems;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TeamAssignmentController extends Controller
{
    public function index(Request $request, Team $team): JsonResponse
    {
        $this->authorize('view', $team);
        $query = $team->poleAssignments()->with('pole:id,project_id,pole_code,address')->orderByDesc('assigned_at');
        if (! $request->user()->can('update', $team)) {
            $query->whereHas('pole', fn ($q) => PoleVisibility::apply($q, $request->user()));
        }

        return response()->json(['data' => $query->get()]);
    }

    public function candidates(Request $request, Team $team): JsonResponse
    {
        $this->authorize('update', $team);
        abort_unless($team->project_id, 422, 'Hubungkan tim ke proyek terlebih dahulu.');
        $values = $request->validate(['search' => ['nullable', 'string', 'max:100']]);

        return response()->json(['data' => Pole::where('project_id', $team->project_id)
            ->when($values['search'] ?? '', fn ($q, $search) => $q->where('pole_code', 'like', '%'.$search.'%'))
            ->orderBy('pole_code')->limit(100)->get(['id', 'pole_code', 'address'])]);
    }

    public function store(Request $request, Team $team, PoleWorkItems $items): JsonResponse
    {
        $this->authorize('update', $team);
        $values = $request->validate(['pole_id' => ['required', 'integer', 'exists:poles,id']]);
        $pole = Pole::findOrFail($values['pole_id']);

        return DB::transaction(function () use ($team, $pole, $items, $request) {
            // Same lock order as the legacy user-assignment endpoint: project, pole, team.
            $items->lock($pole);
            $team = Team::whereKey($team->id)->lockForUpdate()->firstOrFail();
            $this->authorize('update', $team);
            abort_unless($team->status === 'active', 422, 'Tim sedang tidak aktif.');
            abort_unless((int) $team->project_id === (int) $pole->project_id, 422, 'Tim dan tiang harus berasal dari proyek yang sama.');
            $assignment = $team->poleAssignments()->where('pole_id', $pole->id)->first();
            if ($assignment?->status === 'active') {
                return response()->json($assignment);
            }
            // Legacy mixed user/team assignments carry independent user access; never rewrite them here.
            abort_if($assignment?->user_id !== null && $assignment !== null, 409, 'Penugasan lama memiliki target pengguna. Kelola melalui Admin agar akses langsung tetap terjaga.');
            $assignment = PoleAssignment::updateOrCreate(
                ['team_id' => $team->id, 'pole_id' => $pole->id, 'user_id' => null],
                ['assigned_by' => $request->user()->id, 'assigned_at' => now(), 'status' => 'active']
            );

            return response()->json($assignment, 201);
        }, 3);
    }

    public function destroy(Team $team, PoleAssignment $assignment, PoleWorkItems $items): JsonResponse
    {
        $this->authorize('update', $team);
        abort_unless((int) $assignment->team_id === (int) $team->id, 404);

        return DB::transaction(function () use ($team, $assignment, $items) {
            $items->lock(Pole::findOrFail($assignment->pole_id));
            $team = Team::whereKey($team->id)->lockForUpdate()->firstOrFail();
            $this->authorize('update', $team);
            $assignment = $team->poleAssignments()->whereKey($assignment->id)->lockForUpdate()->firstOrFail();
            abort_if($assignment->user_id !== null, 409, 'Penugasan lama memiliki target pengguna. Kelola melalui Admin agar akses langsung tetap terjaga.');
            $assignment->update(['status' => 'revoked']);

            return response()->json(['message' => 'Penugasan dicabut; histori tetap tersimpan.']);
        }, 3);
    }
}
