<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Services\AiAssistant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AiChatController extends Controller
{
    public function chat(Request $request, AiAssistant $assistant): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'history' => ['nullable', 'array', 'max:20'],
            'history.*.role' => ['required_with:history', 'string', 'in:user,assistant'],
            'history.*.content' => ['required_with:history', 'string', 'max:4000'],
        ]);

        if (! $assistant->isConfigured()) {
            return response()->json([
                'message' => 'AI belum dikonfigurasi. Minta admin mengisi AI_API_KEY dan AI_BASE_URL di .env backend.',
            ], 503);
        }

        // Proyek yang dipakai untuk konteks: yang dipilih user, kalau
        // tidak ada pakai proyek aktif pertama yang bisa ia akses.
        $projectId = $validated['project_id'] ?? null;

        if ($projectId === null) {
            $ids = $request->user()->accessibleProjectIds();
            $projectId = Project::query()
                ->when($ids !== null, fn ($q) => $q->whereIn('id', $ids))
                ->where('status', 'active')
                ->orderBy('id')
                ->value('id');
        }

        if ($projectId !== null && ! $request->user()->canAccessProject((int) $projectId)) {
            return response()->json(['message' => 'Anda tidak memiliki akses ke proyek ini.'], 403);
        }

        try {
            $reply = $assistant->chat(
                $validated['message'],
                $assistant->projectContext($projectId ? (int) $projectId : null, $request->user()->id),
                $validated['history'] ?? [],
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        }

        return response()->json([
            'data' => [
                'reply' => $reply,
                'project_id' => $projectId,
            ],
        ]);
    }
}
