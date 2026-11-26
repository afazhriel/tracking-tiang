<?php

namespace App\Services;

use App\Models\Pole;
use App\Models\PoleAssignment;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * KPI per user, dihitung dari data nyata saja:
 * titik yang ditugaskan, progresnya, tenggatnya, dan catatan
 * progres yang dibuat user itu sendiri.
 *
 * Aturan lihat (ditegakkan di sini + di controller):
 * - diri sendiri: selalu boleh
 * - admin/supervisor: semua user (admin platform: semua organisasi;
 *   admin/supervisor organisasi: organisasinya sendiri)
 * - pic: semua anggota organisasinya
 * - selain itu: hanya diri sendiri
 */
class KpiService
{
    /**
     * Bolehkan $actor melihat KPI $target?
     */
    public function canView(User $actor, User $target): bool
    {
        if ((int) $actor->id === (int) $target->id) {
            return true;
        }

        if ($actor->canAdminister()) {
            if ($actor->isPlatformAdmin()) {
                return true;
            }

            return $actor->org_id !== null && (int) $actor->org_id === (int) $target->org_id;
        }

        if ($actor->isPic()) {
            return $actor->org_id !== null && (int) $actor->org_id === (int) $target->org_id;
        }

        return false;
    }

    /**
     * User yang KPI-nya boleh dilihat $actor (untuk daftar KPI Tim).
     * Urutan nama; hanya user aktif (KPI user nonaktif tidak berarti).
     */
    public function visibleUsers(User $actor): Collection
    {
        $query = User::query()
            ->where('status', User::STATUS_ACTIVE)
            ->orderBy('name')
            ->orderBy('id');

        if ($actor->isPlatformAdmin()) {
            return $query->get();
        }

        if ($actor->canAdminister() || $actor->isPic()) {
            return $query->where('org_id', $actor->org_id)->get();
        }

        return $query->whereKey($actor->id)->get();
    }

    /**
     * KPI satu user, lintas proyek dalam organisasinya.
     * Admin platform (org NULL) dihitung lintas semua proyek.
     */
    public function forUser(User $target): array
    {
        $poleIds = $target->assignedPoleIds();

        $poles = Pole::query()
            ->whereIn('id', $poleIds)
            ->when($target->org_id !== null, function ($query) use ($target) {
                $query->whereHas('project', fn ($q) => $q->where('org_id', $target->org_id));
            })
            ->with('workProgress.workItem')
            ->get();

        $assigned = $poles->count();
        $done = 0;
        $late = 0;
        $progressSum = 0.0;

        foreach ($poles as $pole) {
            $progress = $pole->progressPercent();
            $progressSum += $progress;

            if ($progress >= 100) {
                $done++;
            }

            if ($pole->isOverdue()) {
                $late++;
            }
        }

        $avg = $assigned > 0 ? round($progressSum / $assigned, 1) : 0.0;

        // Catatan progres yang dibuat user ini (tiang + jumlah),
        // dibatasi proyek dalam organisasinya.
        $poleRecords = DB::table('pole_progress_histories as h')
            ->join('poles as p', 'p.id', '=', 'h.pole_id')
            ->join('projects as pr', 'pr.id', '=', 'p.project_id')
            ->where('h.recorded_by', $target->id)
            ->when($target->org_id !== null, fn ($q) => $q->where('pr.org_id', $target->org_id))
            ->count();

        $quantityRecords = DB::table('project_quantity_entries as e')
            ->join('projects as pr', 'pr.id', '=', 'e.project_id')
            ->where('e.recorded_by', $target->id)
            ->when($target->org_id !== null, fn ($q) => $q->where('pr.org_id', $target->org_id))
            ->count();

        return [
            'assigned' => $assigned,
            'done' => $done,
            'avg_progress' => $avg,
            'on_time' => $assigned - $late,
            'late' => $late,
            'progress_records' => $poleRecords + $quantityRecords,
        ];
    }

    public function forUserWithIdentity(User $target): array
    {
        return [
            'user' => [
                'id' => $target->id,
                'name' => $target->name,
                'email' => $target->email,
                'role' => $target->role,
                'role_label' => User::roleLabel($target->role),
            ],
            'kpi' => $this->forUser($target),
        ];
    }
}
