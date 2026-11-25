<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrganizationController extends Controller
{
    /**
     * Lihat organisasi sendiri (atau organisasi mana pun bagi admin
     * platform). Data ini yang tampil di kop Surat Job.
     */
    public function show(Request $request, Organization $organization): JsonResponse
    {
        $actor = $request->user();

        if (! $actor->isPlatformAdmin() && $actor->org_id !== $organization->id) {
            abort(403, 'Organisasi ini bukan organisasi Anda.');
        }

        return response()->json([
            'data' => $organization->toPublicPayload(),
        ]);
    }

    /**
     * Ubah data organisasi (nama, alamat, telepon, email).
     *
     * Hanya admin organisasi itu sendiri atau admin platform.
     * Nama harus tetap unik — nama PT inilah identitas kop surat.
     */
    public function update(Request $request, Organization $organization): JsonResponse
    {
        $actor = $request->user();

        $canEdit = $actor->isPlatformAdmin()
            || ($actor->isOrgAdmin() && $actor->org_id === $organization->id);

        if (! $canEdit) {
            abort(403, 'Hanya admin organisasi yang boleh mengubah data organisasi.');
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('organizations', 'name')->ignore($organization->id)],
            'address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
        ]);

        $organization->fill($validated)->save();

        return response()->json([
            'message' => 'Data organisasi berhasil diperbarui.',
            'data' => $organization->fresh()->toPublicPayload(),
        ]);
    }
}
