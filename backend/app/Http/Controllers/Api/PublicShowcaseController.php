<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\Project;
use Illuminate\Http\JsonResponse;

/**
 * Etalase publik untuk landing page.
 *
 * Hanya mengembalikan data yang memang ditampilkan ke pengunjung:
 * proyek aktif (nama, kode, status, target, tanggal) dan titik tiang
 * yang punya koordinat (kode, alamat, status). Tidak ada data pengguna,
 * anggota tim, atau detail internal proyek di sini.
 */
class PublicShowcaseController extends Controller
{
    public function show(): JsonResponse
    {
        $project = Project::query()
            ->where('status', 'active')
            ->orderByDesc('updated_at')
            ->first()
            ?? Project::query()->orderByDesc('updated_at')->first();

        if (! $project) {
            return response()->json(['data' => null]);
        }

        $poles = Pole::query()
            ->where('project_id', $project->id)
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->orderBy('id')
            ->get(['id', 'project_id', 'pole_code', 'address', 'latitude', 'longitude', 'status']);

        return response()->json([
            'data' => [
                'project' => [
                    'id' => $project->id,
                    'name' => $project->name,
                    'code' => $project->code,
                    'status' => $project->status,
                    'start_date' => optional($project->start_date)->toDateString(),
                    'end_date' => optional($project->end_date)->toDateString(),
                    'total_target_poles' => $project->total_target_poles,
                    'poles_count' => Pole::query()->where('project_id', $project->id)->count(),
                ],
                'poles' => $poles,
            ],
        ]);
    }
}
