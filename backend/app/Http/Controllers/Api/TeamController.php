<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TeamController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Team::class);

        $query = Team::query()
            ->with(['project:id,name'])
            ->withCount('users')
            ->orderBy('name');

        if ($request->filled('project_id')) {
            $query->where('project_id', $request->integer('project_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        /*
         * Selain admin/supervisor (PIC), daftar hanya menampilkan tim
         * dari project yang boleh diakses — sejalan dengan `TeamPolicy@view`.
         * Tanpa ini, PIC bisa melihat seluruh tim lintas project.
         */
        $user = $request->user();

        if ($user !== null && ! $user->isAdmin() && ! $user->isSupervisor()) {
            $projectIds = $user->accessibleProjectIds() ?? [];

            if ($projectIds === []) {
                $query->whereRaw('1 = 0');
            } else {
                $query->whereIn('project_id', $projectIds);
            }
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Team::class);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:255', 'unique:teams,code'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'status' => ['nullable', 'string', 'max:50'],
        ]);

        $team = Team::create([
            'name' => $validated['name'],
            'code' => $validated['code'] ?? null,
            'project_id' => $validated['project_id'] ?? null,
            'status' => $validated['status'] ?? 'active',
        ]);

        $team->load('project:id,name');

        return response()->json($team, 201);
    }

    public function show(Team $team): JsonResponse
    {
        $this->authorize('view', $team);

        $team->load([
            'project:id,name',
            'users:id,name,email,role,status',
        ]);

        $team->loadCount('users');

        return response()->json($team);
    }

    public function update(Request $request, Team $team): JsonResponse
    {
        $this->authorize('update', $team);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'code' => [
                'sometimes',
                'nullable',
                'string',
                'max:255',
                Rule::unique('teams', 'code')->ignore($team->id),
            ],
            'project_id' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
            'status' => ['sometimes', 'required', 'string', 'max:50'],
        ]);

        $team->update($validated);
        $team->load('project:id,name');
        $team->loadCount('users');

        return response()->json($team);
    }

    public function addMember(
        Request $request,
        Team $team
    ): JsonResponse {
        $this->authorize('manageMembers', $team);

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'role' => ['nullable', 'string', 'max:100'],
        ]);

        $user = User::findOrFail($validated['user_id']);

        $team->users()->syncWithoutDetaching([
            $user->id => [
                'role' => $validated['role'] ?? null,
            ],
        ]);

        $team->load('users:id,name,email,role,status');

        return response()->json($team);
    }

    public function removeMember(
        Team $team,
        User $user
    ): JsonResponse {
        $this->authorize('manageMembers', $team);

        $removed = $team->users()->detach($user->id);

        if ($removed === 0) {
            return response()->json([
                'message' => 'User bukan anggota tim ini.',
            ], 404);
        }

        return response()->json([
            'message' => 'Anggota tim berhasil dihapus.',
        ]);
    }
}
