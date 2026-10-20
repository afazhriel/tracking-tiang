<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pole;
use App\Models\Project;
use App\Models\Region;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PoleController extends Controller
{
    public function index(Request $request, Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        $validated = $request->validate([
            'province_id' => ['nullable', 'string', 'exists:provinces,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $perPage = (int) ($validated['per_page'] ?? 100);

        $poles = $project->poles()
            ->with(['region', 'province:id,name'])
            ->when(
                $validated['province_id'] ?? null,
                fn ($query, $provinceId) => $query->where('province_id', $provinceId)
            )
            ->when($validated['search'] ?? null, function ($query, $search) {
                $term = '%'.strtolower($search).'%';

                $query->where(function ($inner) use ($term) {
                    $inner->whereRaw('LOWER(pole_code) LIKE ?', [$term])
                        ->orWhereRaw('LOWER(address) LIKE ?', [$term]);
                });
            })
            ->orderBy('province_id')
            ->orderBy('pole_code')
            ->paginate($perPage);

        return response()->json($poles);
    }

    /**
     * Ringkasan jumlah tiang + rata-rata progress per provinsi.
     *
     * Dipakai halaman Tiang untuk grup/filter per provinsi.
     */
    public function summary(Project $project): JsonResponse
    {
        $this->authorize('view', $project);

        /* Satu query: hitung progress berbobot per tiang, lalu
           dikelompokkan per provinsi di PHP. */
        $perPole = DB::table('poles')
            ->leftJoin('pole_work_progress as pwp', 'pwp.pole_id', '=', 'poles.id')
            ->leftJoin('work_items as wi', 'wi.id', '=', 'pwp.work_item_id')
            ->where('poles.project_id', $project->id)
            ->groupBy('poles.id', 'poles.province_id')
            ->select(
                'poles.province_id',
                DB::raw('COALESCE(SUM(pwp.progress_percent * wi.weight_percent / 100), 0) as pole_progress')
            )
            ->get();

        $buckets = [];

        foreach ($perPole as $row) {
            $key = $row->province_id ?? '__none__';

            if (! isset($buckets[$key])) {
                $buckets[$key] = ['count' => 0, 'progress_sum' => 0.0];
            }

            $buckets[$key]['count']++;
            $buckets[$key]['progress_sum'] += (float) $row->pole_progress;
        }

        $assignedIds = array_values(array_filter(
            array_keys($buckets),
            fn ($key) => $key !== '__none__'
        ));

        $provinceNames = $assignedIds === []
            ? collect()
            : DB::table('provinces')->whereIn('id', $assignedIds)->pluck('name', 'id');

        $data = collect($buckets)
            ->map(function ($bucket, $provinceId) use ($provinceNames) {
                $isNone = $provinceId === '__none__';

                return [
                    'province_id' => $isNone ? null : $provinceId,
                    'province_name' => $isNone
                        ? 'Tanpa Provinsi'
                        : ($provinceNames[$provinceId] ?? $provinceId),
                    'pole_count' => $bucket['count'],
                    'avg_progress' => $bucket['count'] > 0
                        ? round($bucket['progress_sum'] / $bucket['count'], 2)
                        : 0.0,
                ];
            })
            ->sortByDesc('pole_count')
            ->values();

        return response()->json([
            'data' => $data,
            'total_poles' => $perPole->count(),
        ]);
    }

    public function store(Request $request, Project $project): JsonResponse
    {
        $this->authorize('create', Pole::class);
        $this->authorize('view', $project);

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
            ! empty($validated['province_id']) &&
            ! empty($validated['regency_id'])
        ) {
            $regencyBelongsToProvince = DB::table('regencies')
                ->where('id', $validated['regency_id'])
                ->where('province_id', $validated['province_id'])
                ->exists();

            if (! $regencyBelongsToProvince) {
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
            ! empty($validated['regency_id']) &&
            ! empty($validated['district_id'])
        ) {
            $districtBelongsToRegency = DB::table('districts')
                ->where('id', $validated['district_id'])
                ->where('regency_id', $validated['regency_id'])
                ->exists();

            if (! $districtBelongsToRegency) {
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
            ! empty($validated['district_id']) &&
            ! empty($validated['village_id'])
        ) {
            $villageBelongsToDistrict = DB::table('villages')
                ->where('id', $validated['village_id'])
                ->where('district_id', $validated['district_id'])
                ->exists();

            if (! $villageBelongsToDistrict) {
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

        /*
         * Wilayah diisi otomatis dari provinsi (nama = provinsi,
         * kode = kode BPS provinsi) supaya detail tiang tidak kosong.
         * Region yang dipilih manual tetap dipakai apa adanya.
         */
        if (empty($validated['region_id']) && ! empty($validated['province_id'])) {
            $region = Region::forProvince($project, $validated['province_id']);

            if ($region !== null) {
                $validated['region_id'] = $region->id;
            }
        }

        /*
         * Pembatasan wilayah: selain admin, user hanya boleh menambah
         * tiang di provinsi yang ditugaskan kepadanya.
         */
        $user = $request->user();

        if ($user && ! $user->isAdmin()) {
            $provinceId = $validated['province_id'] ?? null;

            if (empty($provinceId) || ! $user->canManageProvince($provinceId)) {
                return response()->json([
                    'message' => 'Anda hanya bisa menambah tiang di provinsi yang ditugaskan kepada Anda.',
                    'errors' => [
                        'province_id' => [
                            'Pilih provinsi yang ditugaskan kepada Anda.',
                        ],
                    ],
                ], 422);
            }
        }

        $pole = Pole::create($validated);

        return response()->json([
            'message' => 'Tiang berhasil dibuat.',
            'data' => $pole->load(['region', 'province:id,name']),
        ], 201);
    }

    public function show(Project $project, Pole $pole): JsonResponse
    {
        abort_unless((int) $pole->project_id === (int) $project->id, 404);

        $this->authorize('view', $pole);

        $pole->load([
            'region',
            'province:id,name',
            'workProgress.workItem',
        ]);

        return response()->json([
            'data' => $pole,
        ]);
    }
}
