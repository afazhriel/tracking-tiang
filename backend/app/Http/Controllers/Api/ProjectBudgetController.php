<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectActivity;
use App\Models\ProjectBudget;
use App\Models\ProjectBudgetItem;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProjectBudgetController extends Controller
{
    public function __construct(private NotificationService $notifications, private ActivityLogger $activity) {}

    public function index(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $budgets = ProjectBudget::query()
            ->where('project_id', $project->id)
            ->with(['items', 'submitter:id,name', 'decider:id,name'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ProjectBudget $budget) => $budget->toPayload());

        return response()->json(['data' => $budgets]);
    }

    public function show(Project $project, ProjectBudget $budget): JsonResponse
    {
        $this->authorize('view', $project);
        abort_unless((int) $budget->project_id === (int) $project->id, 404);

        return response()->json(['data' => $budget->toPayload()]);
    }

    /**
     * Buat draf RAB baru. Anggota proyek yang boleh mencatat progres
     * (pengelola/pelaksana; admin/supervisor/pemilik selalu boleh).
     * Pelihat tidak bisa — RAB adalah catatan proyek.
     */
    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('recordProgress', $project);

        $data = $this->validateBudget($request);

        $budget = DB::transaction(function () use ($request, $project, $data) {
            $budget = ProjectBudget::create([
                'project_id' => $project->id,
                'title' => $data['title'] ?? null,
                'status' => ProjectBudget::STATUS_DRAF,
            ]);

            $this->syncItems($budget, $data['items']);

            $this->activity->log(
                $project,
                $request->user(),
                ProjectActivity::ACTION_RAB_BUAT,
                'Draf RAB dibuat',
                'Draf RAB "'.($budget->title ?: 'RAB').'" dibuat.',
                'budget',
                $budget->id,
                ['budget_id' => $budget->id]
            );

            return $budget;
        });

        return response()->json([
            'message' => 'Draf RAB dibuat.',
            'data' => $budget->fresh()->toPayload(),
        ], 201);
    }

    /**
     * Ubah draf (atau RAB yang ditolak, untuk diperbaiki).
     * RAB yang diajukan menunggu keputusan; yang disetujui terkunci.
     */
    public function update(Request $request, Project $project, ProjectBudget $budget): JsonResponse
    {
        $this->authorize('recordProgress', $project);
        abort_unless((int) $budget->project_id === (int) $project->id, 404);
        abort_unless($budget->isEditable(), 422, $budget->isLocked()
            ? 'RAB yang sudah disetujui tidak bisa diubah. Buat revisi (draf baru) bila perlu perubahan.'
            : 'RAB yang sudah diajukan tidak bisa diubah sebelum ada keputusan.');

        $data = $this->validateBudget($request);

        DB::transaction(function () use ($budget, $data) {
            $budget->update(['title' => $data['title'] ?? null]);
            $this->syncItems($budget, $data['items']);
        });

        return response()->json([
            'message' => 'Draf RAB diperbarui.',
            'data' => $budget->fresh()->toPayload(),
        ]);
    }

    public function destroy(Request $request, Project $project, ProjectBudget $budget): JsonResponse
    {
        $this->authorize('recordProgress', $project);
        abort_unless((int) $budget->project_id === (int) $project->id, 404);
        abort_unless($budget->isEditable(), 422, 'RAB ini tidak bisa dihapus (sudah diajukan/disetujui).');

        $budget->delete();

        return response()->json(['message' => 'RAB dihapus.']);
    }

    /**
     * Ajukan draf (atau RAB yang ditolak, setelah diperbaiki)
     * ke supervisor/admin. Kabari para penyetuju proyek.
     */
    public function submit(Request $request, Project $project, ProjectBudget $budget): JsonResponse
    {
        $this->authorize('recordProgress', $project);
        abort_unless((int) $budget->project_id === (int) $project->id, 404);
        abort_unless($budget->isEditable(), 422, 'RAB ini tidak bisa diajukan (sudah diajukan/disetujui).');
        abort_if($budget->items()->count() === 0, 422, 'RAB kosong — isi dulu minimal satu item.');

        $actor = $request->user();

        DB::transaction(function () use ($project, $budget, $actor) {
            $budget->update([
                'status' => ProjectBudget::STATUS_DIAJUKAN,
                'submitted_by' => $actor->id,
                'submitted_at' => now(),
                'decided_by' => null,
                'decided_at' => null,
                'rejection_note' => null,
            ]);

            $this->activity->log(
                $project,
                $actor,
                ProjectActivity::ACTION_RAB_AJUKAN,
                'RAB diajukan',
                'RAB "'.($budget->title ?: 'RAB').'" diajukan untuk disetujui.',
                'budget',
                $budget->id,
                ['budget_id' => $budget->id]
            );

            foreach ($this->approvers($project) as $approver) {
                if ((int) $approver->id === (int) $actor->id) {
                    continue;
                }

                $this->notifications->send(
                    (int) $approver->id,
                    $project->id,
                    'rab',
                    "RAB diajukan di {$project->name}",
                    "{$actor->name} mengajukan RAB \"".($budget->title ?: 'RAB').'" — menunggu persetujuan.',
                    '/proyek',
                    ['project_id' => $project->id, 'budget_id' => $budget->id]
                );
            }
        });

        return response()->json([
            'message' => 'RAB diajukan ke supervisor.',
            'data' => $budget->fresh()->toPayload(),
        ]);
    }

    /**
     * Setujui / tolak RAB yang diajukan. Hanya admin/supervisor
     * yang punya akses ke proyek ini (supervisor organisasi lain
     * tidak bisa). Keputusan dikabari ke pengaju.
     */
    public function decide(Request $request, Project $project, ProjectBudget $budget): JsonResponse
    {
        $actor = $request->user();

        abort_unless(
            $actor->canAdminister() && $actor->canAccessProject((int) $project->id),
            403,
            'Hanya supervisor/admin proyek ini yang boleh memutuskan RAB.'
        );
        abort_unless((int) $budget->project_id === (int) $project->id, 404);
        abort_unless($budget->status === ProjectBudget::STATUS_DIAJUKAN, 422, 'Hanya RAB yang diajukan yang bisa diputuskan.');

        $data = $request->validate([
            'decision' => ['required', 'string', Rule::in([ProjectBudget::STATUS_DISETUJUI, ProjectBudget::STATUS_DITOLAK])],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        if ($data['decision'] === ProjectBudget::STATUS_DITOLAK && empty(trim((string) ($data['note'] ?? '')))) {
            return response()->json([
                'message' => 'Alasan penolakan wajib diisi.',
                'errors' => ['note' => ['Alasan penolakan wajib diisi.']],
            ], 422);
        }

        DB::transaction(function () use ($project, $budget, $data, $actor) {
            $budget->update([
                'status' => $data['decision'],
                'decided_by' => $actor->id,
                'decided_at' => now(),
                'rejection_note' => $data['decision'] === ProjectBudget::STATUS_DITOLAK
                    ? trim((string) $data['note'])
                    : null,
            ]);

            $approved = $data['decision'] === ProjectBudget::STATUS_DISETUJUI;

            $this->activity->log(
                $project,
                $actor,
                $approved ? ProjectActivity::ACTION_RAB_DISETUJUI : ProjectActivity::ACTION_RAB_DITOLAK,
                $approved ? 'RAB disetujui' : 'RAB ditolak',
                'RAB "'.($budget->title ?: 'RAB').'" '.($approved ? 'disetujui.' : 'ditolak: '.trim((string) $data['note'])),
                'budget',
                $budget->id,
                ['budget_id' => $budget->id]
            );

            if ($budget->submitted_by && (int) $budget->submitted_by !== (int) $actor->id) {
                $this->notifications->send(
                    (int) $budget->submitted_by,
                    $project->id,
                    'rab',
                    $approved
                        ? "RAB disetujui di {$project->name}"
                        : "RAB ditolak di {$project->name}",
                    $approved
                        ? 'RAB "'.($budget->title ?: 'RAB')."\" disetujui oleh {$actor->name}."
                        : 'RAB "'.($budget->title ?: 'RAB')."\" ditolak oleh {$actor->name}: ".trim((string) $data['note']),
                    '/proyek',
                    ['project_id' => $project->id, 'budget_id' => $budget->id]
                );
            }
        });

        return response()->json([
            'message' => $data['decision'] === ProjectBudget::STATUS_DISETUJUI
                ? 'RAB disetujui dan terkunci.'
                : 'RAB ditolak — pengaju bisa memperbaiki dan mengajukan ulang.',
            'data' => $budget->fresh()->toPayload(),
        ]);
    }

    /**
     * Buat revisi: salin RAB (biasanya yang disetujui) menjadi
     * draf baru dengan item yang sama, siap diubah dan diajukan ulang.
     */
    public function duplicate(Request $request, Project $project, ProjectBudget $budget): JsonResponse
    {
        $this->authorize('recordProgress', $project);
        abort_unless((int) $budget->project_id === (int) $project->id, 404);

        $copy = DB::transaction(function () use ($budget) {
            $copy = ProjectBudget::create([
                'project_id' => $budget->project_id,
                'title' => ($budget->title ?: 'RAB').' (Revisi)',
                'status' => ProjectBudget::STATUS_DRAF,
            ]);

            foreach ($budget->items as $item) {
                ProjectBudgetItem::create([
                    'budget_id' => $copy->id,
                    'name' => $item->name,
                    'category' => $item->category,
                    'volume' => $item->volume,
                    'unit' => $item->unit,
                    'unit_price' => $item->unit_price,
                    'line_total' => $item->line_total,
                    'sort_order' => $item->sort_order,
                ]);
            }

            return $copy;
        });

        return response()->json([
            'message' => 'Revisi dibuat sebagai draf baru.',
            'data' => $copy->fresh()->toPayload(),
        ], 201);
    }

    /**
     * Penyetuju RAB: admin/supervisor aktif yang punya akses
     * ke proyek ini (organisasi yang sama; admin platform semua).
     */
    private function approvers(Project $project): array
    {
        return User::query()
            ->whereIn('role', [User::ROLE_ADMIN, User::ROLE_SUPERVISOR])
            ->where('status', User::STATUS_ACTIVE)
            ->get()
            ->filter(fn (User $user) => $user->canAccessProject((int) $project->id))
            ->values()
            ->all();
    }

    private function validateBudget(Request $request): array
    {
        return $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.name' => ['required', 'string', 'max:255'],
            'items.*.category' => ['nullable', 'string', 'max:100'],
            'items.*.volume' => ['required', 'numeric', 'gt:0', 'lt:100000000000'],
            'items.*.unit' => ['required', 'string', 'max:32'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0', 'lt:1000000000000000'],
        ]);
    }

    private function syncItems(ProjectBudget $budget, array $items): void
    {
        $budget->items()->delete();

        foreach (array_values($items) as $order => $item) {
            $volume = (float) $item['volume'];
            $unitPrice = (float) $item['unit_price'];

            ProjectBudgetItem::create([
                'budget_id' => $budget->id,
                'name' => $item['name'],
                'category' => $item['category'] ?? null,
                'volume' => $volume,
                'unit' => $item['unit'],
                'unit_price' => $unitPrice,
                'line_total' => ProjectBudgetItem::lineTotal($volume, $unitPrice),
                'sort_order' => $order,
            ]);
        }
    }
}
