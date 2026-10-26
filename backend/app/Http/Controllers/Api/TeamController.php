<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TeamController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Team::class);
        $values = $request->validate([
            'project_id' => ['sometimes', 'required', 'integer', 'exists:projects,id'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
        ]);
        if (isset($values['project_id'])) {
            $this->authorize('view', Project::findOrFail($values['project_id']));
        }
        $user = $request->user();
        $teams = Team::with('project:id,name,owner_user_id')->withCount('users')
            ->when(isset($values['project_id']), fn ($q) => $q->where('project_id', $values['project_id']))
            ->when(isset($values['status']), fn ($q) => $q->where('status', $values['status']))
            ->when(! $user->isAdmin(), fn ($q) => $q->whereIn('project_id', $user->accessibleProjectIds() ?? []))
            ->orderBy('name')->get();
        $teams->each(fn ($team) => $team->setAttribute('can_manage', $user->can('update', $team)));

        return response()->json($teams);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Team::class);
        $values = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:255', 'unique:teams,code'],
            'project_id' => ['required', 'integer', 'exists:projects,id'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
        ]);

        return DB::transaction(function () use ($values) {
            $project = Project::whereKey($values['project_id'])->lockForUpdate()->firstOrFail();
            $this->authorize('update', $project);
            $team = Team::create([...$values, 'status' => $values['status'] ?? 'active']);

            return $this->detail($team, 201);
        }, 3);
    }

    public function show(Team $team): JsonResponse
    {
        $this->authorize('view', $team);

        return $this->detail($team);
    }

    public function update(Request $request, Team $team): JsonResponse
    {
        $this->authorize('update', $team);
        $values = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => ['sometimes', 'nullable', 'string', 'max:255', Rule::unique('teams', 'code')->ignore($team->id)],
            'project_id' => ['sometimes', 'required', 'integer', 'exists:projects,id'],
            'status' => ['sometimes', 'required', Rule::in(['active', 'inactive'])],
        ]);

        return DB::transaction(function () use ($team, $values) {
            $team = Team::whereKey($team->id)->lockForUpdate()->firstOrFail();
            $this->authorize('update', $team);
            if (isset($values['project_id']) && (int) $values['project_id'] !== (int) $team->project_id) {
                $this->authorize('update', Project::findOrFail($values['project_id']));
                abort_if($team->poleAssignments()->where('status', 'active')->exists(), 409, 'Cabut penugasan aktif sebelum memindahkan proyek tim. Histori tetap disimpan.');
            }
            $team->update($values);

            return $this->detail($team);
        }, 3);
    }

    /** Project-scoped directory; outside users require an exact email, never global browsing. */
    public function candidates(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);
        $values = $request->validate(['email' => ['sometimes', 'required', 'email', 'max:255']]);
        $users = User::query()->where(fn ($q) => $q->whereNull('status')->orWhere('status', 'active'));
        if (isset($values['email'])) {
            $users->whereRaw('LOWER(email) = ?', [strtolower($values['email'])]);
        } else {
            $users->where(function ($q) use ($project) {
                $q->where('id', $project->owner_user_id)
                    ->orWhereHas('projectMemberships', fn ($q) => $q->where('project_id', $project->id))
                    ->orWhereHas('teams', fn ($q) => $q->where('project_id', $project->id));
            });
        }

        return response()->json(['data' => $users->orderBy('name')->limit(100)->get(['id', 'name', 'email', 'role', 'status'])]);
    }

    public function addMember(Request $request, Team $team): JsonResponse
    {
        $this->authorize('manageMembers', $team);
        $values = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'role' => ['nullable', 'string', 'max:100'],
        ]);

        return DB::transaction(function () use ($team, $values) {
            $team = Team::whereKey($team->id)->lockForUpdate()->firstOrFail();
            $this->authorize('manageMembers', $team);
            abort_unless($team->status === 'active', 422, 'Aktifkan tim sebelum menambahkan anggota.');
            $user = User::findOrFail($values['user_id']);
            abort_unless($user->isActive(), 422, 'Hanya pengguna aktif yang dapat ditambahkan.');
            $team->users()->syncWithoutDetaching([$user->id => ['role' => $values['role'] ?? null]]);

            return $this->detail($team);
        }, 3);
    }

    public function removeMember(Team $team, User $user): JsonResponse
    {
        $this->authorize('manageMembers', $team);

        return DB::transaction(function () use ($team, $user) {
            $team = Team::whereKey($team->id)->lockForUpdate()->firstOrFail();
            $this->authorize('manageMembers', $team);
            abort_unless($team->users()->detach($user->id), 404, 'User bukan anggota tim ini.');

            return response()->json([
                'message' => 'Anggota dikeluarkan. Akses langsung dan akses dari tim lain tetap berlaku.',
                'project_access_remaining' => $team->project_id !== null && $user->canAccessProject((int) $team->project_id),
            ]);
        }, 3);
    }

    private function detail(Team $team, int $status = 200): JsonResponse
    {
        $team->load(['project:id,name,owner_user_id', 'users:id,name,email,role,status'])->loadCount('users');
        $team->setAttribute('can_manage', request()->user()->can('update', $team));

        return response()->json($team, $status);
    }
}
