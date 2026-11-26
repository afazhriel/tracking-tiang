<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectActivity;
use App\Models\User;

/**
 * Pencatat riwayat aktivitas proyek (satu baris per peristiwa).
 * Dipakai untuk penugasan, anggota, baseline, dan progres kuantitas —
 * peristiwa yang tidak punya tabel histori sendiri.
 */
class ActivityLogger
{
    public function log(
        Project $project,
        ?User $actor,
        string $action,
        string $title,
        ?string $description = null,
        ?string $subjectType = null,
        ?int $subjectId = null,
        array $data = []
    ): ProjectActivity {
        return ProjectActivity::create([
            'project_id' => $project->id,
            'user_id' => $actor?->id,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'title' => mb_substr($title, 0, 255),
            'description' => $description,
            'data' => $data ?: null,
        ]);
    }
}
