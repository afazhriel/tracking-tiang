<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PoleController extends Controller
{
    public function index(Project $project): JsonResponse
    {
        $poles = $project->poles()
            ->with('region')
            ->orderBy('pole_code')
            ->paginate(100);

        return response()->json($poles);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $validated = $request->validate([
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'province_id' => ['nullable', 'string', 'exists:provinces,id'],
            'regency_id' => ['nullable', 'string', 'exists:regencies,id'],
            'district_id' => ['nullable', 'string', 'exists:districts,id'],
            'village_id' => ['nullable', 'string', 'exists:villages,id'],
            'pole_code' => ['required', 'string', 'max:255'],
            'address' => ['nullable', 'string'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'status' => ['nullable', 'string', 'max:50'],
        ]);

        /*
         * Pastikan hierarchy wilayah konsisten:
         * province -> regency -> district -> village.
         *
         * Setiap level hanya divalidasi terhadap parent
         * apabila kedua ID tersedia.
         */

        if (
            !empty($validated['province_id']) &&
            !empty($validated['regency_id'])
        ) {
            $regencyBelongsToProvince = DB::table('regencies')
                ->where('id', $validated['regency_id'])
                ->where('province_id', $validated['province_id'])
                ->exists();

            if (!$regencyBelongsToProvince) {
                return response()->json([
                    'message' => 'Kabupaten/kota tidak sesuai dengan provinsi.',
                    'errors' => [
                        'regency_id' => [
                            'Kabupaten/kota tidak termasuk dalam provinsi yang dipilih.',
                        ],
                    ],
                ], 422);
            }
        }

        if (
            !empty($validated['regency_id']) &&
            !empty($validated['district_id'])
        ) {
            $districtBelongsToRegency = DB::table('districts')
                ->where('id', $validated['district_id'])
                ->where('regency_id', $validated['regency_id'])
                ->exists();

            if (!$districtBelongsToRegency) {
                return response()->json([
                    'message' => 'Kecamatan tidak sesuai dengan kabupaten/kota.',
                    'errors' => [
                        'district_id' => [
                            'Kecamatan tidak termasuk dalam kabupaten/kota yang dipilih.',
                        ],
                    ],
                ], 422);
            }
        }

        if (
            !empty($validated['district_id']) &&
            !empty($validated['village_id'])
        ) {
            $villageBelongsToDistrict = DB::table('villages')
                ->where('id', $validated['village_id'])
                ->where('district_id', $validated['district_id'])
                ->exists();

            if (!$villageBelongsToDistrict) {
                return response()->json([
                    'message' => 'Desa/kelurahan tidak sesuai dengan kecamatan.',
                    'errors' => [
                        'village_id' => [
                            'Desa/kelurahan tidak termasuk dalam kecamatan yang dipilih.',
                        ],
                    ],
                ], 422);
            }
        }

        $validated['project_id'] = $project->id;

        $pole = Pole::create($validated);

        return response()->json([
            'message' => 'Tiang berhasil dibuat.',
            'data' => $pole->load('region'),
        ], 201);
    }

    public function show(Project $project, Pole $pole): JsonResponse
    {
        abort_unless($pole->project_id === $project->id, 404);

        $pole->load([
            'region',
            'workProgress.workItem',
        ]);

        return response()->json([
            'data' => $pole,
        ]);
    }
}