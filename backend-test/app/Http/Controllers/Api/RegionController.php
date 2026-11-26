<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class RegionController extends Controller
{
    public function provinces(): JsonResponse
    {
        return response()->json(
            DB::table('provinces')
                ->orderBy('name')
                ->get()
        );
    }

    public function regencies(string $province): JsonResponse
    {
        return response()->json(
            DB::table('regencies')
                ->where('province_id', $province)
                ->orderBy('name')
                ->get()
        );
    }

    public function districts(string $regency): JsonResponse
    {
        return response()->json(
            DB::table('districts')
                ->where('regency_id', $regency)
                ->orderBy('name')
                ->get()
        );
    }

    public function villages(string $district): JsonResponse
    {
        return response()->json(
            DB::table('villages')
                ->where('district_id', $district)
                ->orderBy('name')
                ->get()
        );
    }
}
