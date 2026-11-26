<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

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

    /**
     * Unggah logo organisasi (kop Surat Job dan cetakan RAB).
     * Hanya admin organisasi itu sendiri atau admin platform.
     * File disimpan di disk public (org-logos/), bukan base64 di DB.
     * Unggah ulang menggantikan logo lama.
     */
    public function uploadLogo(Request $request, Organization $organization): JsonResponse
    {
        $actor = $request->user();

        $canEdit = $actor->isPlatformAdmin()
            || ($actor->isOrgAdmin() && $actor->org_id === $organization->id);

        if (! $canEdit) {
            abort(403, 'Hanya admin organisasi yang boleh mengubah logo.');
        }

        $validated = $request->validate([
            'logo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        $file = $validated['logo'];
        $extension = strtolower($file->getClientOriginalExtension() ?: 'png');
        $path = "org-logos/org-{$organization->id}.{$extension}";

        if ($organization->logo_path && $organization->logo_path !== $path) {
            Storage::disk('public')->delete($organization->logo_path);
        }

        Storage::disk('public')->putFileAs('org-logos', $file, basename($path));

        $organization->update(['logo_path' => $path]);

        return response()->json([
            'message' => 'Logo organisasi disimpan.',
            'data' => $organization->fresh()->toPublicPayload(),
        ]);
    }

    /**
     * Tampilkan logo organisasi (untuk kop cetakan).
     * Sama seperti melihat organisasi: admin platform atau
     * anggota organisasi itu sendiri.
     */
    public function showLogo(Request $request, Organization $organization): BinaryFileResponse
    {
        $actor = $request->user();

        if (! $actor->isPlatformAdmin() && $actor->org_id !== $organization->id) {
            abort(403, 'Organisasi ini bukan organisasi Anda.');
        }

        abort_unless($organization->logo_path, 404, 'Logo belum diunggah.');

        $disk = Storage::disk('public');

        abort_unless($disk->exists($organization->logo_path), 404, 'Logo tidak ditemukan.');

        $mime = $disk->mimeType($organization->logo_path) ?: 'application/octet-stream';

        return response()->file($disk->path($organization->logo_path), [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }
}
