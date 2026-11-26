<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\KpiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KpiController extends Controller
{
    public function __construct(private KpiService $kpi) {}

    /**
     * Daftar KPI anggota yang boleh dilihat pengguna login
     * (satu organisasi; admin platform melihat semua organisasi).
     * Aturan lihat ditegakkan server — UI hanya menampilkan hasil.
     */
    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();

        $rows = $this->kpi->visibleUsers($actor)
            ->map(fn (User $user) => $this->kpi->forUserWithIdentity($user))
            ->values();

        return response()->json(['data' => $rows]);
    }

    /**
     * KPI satu user. Diri sendiri selalu boleh; user lain hanya
     * untuk admin/supervisor (organisasi sendiri / semua) dan
     * pic (organisasi sendiri). Selain itu 403.
     */
    public function show(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();

        abort_unless($this->kpi->canView($actor, $user), 403, 'KPI pengguna ini bukan untuk Anda.');

        return response()->json([
            'data' => $this->kpi->forUserWithIdentity($user),
        ]);
    }
}
