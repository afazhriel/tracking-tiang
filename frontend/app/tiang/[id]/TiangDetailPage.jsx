"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CircleAlert,
  ClipboardList,
  Clock,
  History,
  MapPin,
} from "lucide-react";

import AppShell from "../../../components/layout/AppShell";
import { useProject } from "../../../lib/project-context";
import MapPanel from "../../../components/tiang/MapPanel";
import {
  UpdateProgressButton,
  UpdateProgressModal,
} from "../../../components/tiang/UpdateProgressModal";
import { Badge, StatusBadge } from "../../../components/ui/badge";
import { Breadcrumbs } from "../../../components/ui/breadcrumbs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { EmptyState } from "../../../components/ui/empty-state";
import { ProgressBar } from "../../../components/ui/progress-bar";
import {
  ErrorNotice,
  Skeleton,
  SkeletonRows,
} from "../../../components/ui/states";
import {
  api,
  normalizePole,
  normalizeWorkProgress,
  unwrapList,
} from "../../../lib/api";
import { useResource } from "../../../lib/use-api";
import { resolveStatus } from "../../../lib/status";
import {
  formatCoordinate,
  formatDate,
  formatDateTime,
  formatPercent,
} from "../../../lib/format";

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p
        className={`mt-0.5 text-sm font-medium text-neutral-800 ${mono ? "tabular-nums" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Isi halaman detail.
 *
 * Sengaja dipisah dari komponen export: `useProject()` hanya
 * boleh dipanggil di dalam `ProjectProvider`, dan provider itu
 * disediakan oleh `AppShell`. Kalau hook-nya dipanggil di
 * komponen yang sama yang merender `AppShell`, provider belum
 * ada saat render pertama sehingga lempar error.
 */
function TiangDetailContent() {
  const params = useParams();
  const poleId = params?.id ?? null;
  const { projectId, project } = useProject();
  const [progressOpen, setProgressOpen] = useState(false);

  const poleLoader = useCallback(async () => {
    if (!projectId || !poleId) return null;

    const payload = await api.getPole(projectId, poleId);

    return payload?.data ?? null;
  }, [poleId, projectId]);

  const progressLoader = useCallback(async () => {
    if (!projectId || !poleId) return null;

    return await api.getPoleProgress(projectId, poleId);
  }, [poleId, projectId]);

  const activityLoader = useCallback(async () => {
    if (!projectId || !poleId) return null;
    return await api.getPoleActivities(projectId, poleId);
  }, [poleId, projectId]);
  const enabled = Boolean(projectId && poleId);

  const {
    data: rawPole,
    error: poleError,
    loading: poleLoading,
    reload: reloadPole,
  } = useResource(poleLoader, [projectId, poleId], { enabled });

  const {
    data: progressPayload,
    error: progressError,
    loading: progressLoading,
    reload: reloadProgress,
  } = useResource(progressLoader, [projectId, poleId], { enabled });

  const {
    data: activityPayload,
    error: activityError,
    loading: activityLoading,
    reload: reloadActivities,
  } = useResource(activityLoader, [projectId, poleId], { enabled });
  const pole = useMemo(
    () => (rawPole ? normalizePole(rawPole) : null),
    [rawPole],
  );

  const workProgress = useMemo(
    () => unwrapList(progressPayload).map(normalizeWorkProgress),
    [progressPayload],
  );

  const weightedProgress =
    progressPayload?.pole_progress === null ||
    progressPayload?.pole_progress === undefined
      ? null
      : Number(progressPayload.pole_progress);

  /* Gabungkan item pekerjaan yang dikonfigurasi pada project dengan
     progress tersimpan. Tujuannya: setiap tahap pekerjaan tetap
     terlihat meski belum ada realisasi (ditampilkan 0%), bukan hilang
     dari daftar. */
  const mergedStages = useMemo(() => {
    const configured = project?.workItems ?? [];
    const byId = new Map(
      workProgress.map((entry) => [String(entry.workItemId), entry]),
    );

    const rows = configured.map((workItem) => {
      const entry = byId.get(String(workItem.id));

      return {
        id: workItem.id,
        workItemId: workItem.id,
        workItem: entry?.workItem ?? workItem,
        progress: entry ? entry.progress : 0,
        startedAt: entry?.startedAt ?? null,
        completedAt: entry?.completedAt ?? null,
        notes: entry?.notes ?? null,
        hasData: Boolean(entry),
      };
    });

    const configuredIds = new Set(configured.map((item) => String(item.id)));

    for (const entry of workProgress) {
      if (configuredIds.has(String(entry.workItemId))) continue;

      rows.push({ ...entry, hasData: true });
    }

    return rows;
  }, [project, workProgress]);

  const status = resolveStatus(pole?.status, weightedProgress);

  /* Tanggal paling baru yang benar-benar ada di data progress. */
  const lastUpdated = useMemo(() => {
    const stamps = workProgress
      .flatMap((item) => [item.completedAt, item.startedAt])
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);

    if (!stamps.length) return null;

    return new Date(Math.max(...stamps)).toISOString();
  }, [workProgress]);

  const mappedPole = useMemo(() => {
    if (!pole) return [];

    return pole.hasCoordinate ? [pole] : [];
  }, [pole]);

  useEffect(() => {
    if (!pole) return;

    if (typeof document !== "undefined") {
      document.title = `${pole.poleCode} · Monitoring Tiang`;
    }
  }, [pole]);

  if (!enabled) {
    return (
      <div className="space-y-6">
        <PageNotice />
        <ErrorNotice
          error={{
            message:
              "Project belum dapat dimuat sehingga detail tiang tidak bisa ditampilkan.",
          }}
          title="Project belum siap"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageNotice />

      {poleError && (
        <ErrorNotice
          error={poleError}
          onRetry={reloadPole}
          title="Detail tiang gagal dimuat"
        />
      )}

      {poleLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 w-full lg:col-span-2" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      ) : !pole ? (
        <EmptyState
          icon={CircleAlert}
          title="Tiang tidak ditemukan"
          description={`Tiang dengan id ${poleId} tidak tersedia pada project ini.`}
          action={
            <Link
              href="/tiang"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke daftar tiang
            </Link>
          }
        />
      ) : (
        <>
          <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Breadcrumbs
                items={[
                  { label: "Dashboard", href: "/dashboard" },
                  { label: "Tiang", href: "/tiang" },
                  { label: pole.poleCode },
                ]}
              />

              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {pole.poleCode}
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                {pole.address || "Alamat belum diisi pada data tiang."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />

              {project?.name && (
                <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-500/20">
                  {project.name}
                </Badge>
              )}

              <UpdateProgressButton
                onClick={() => setProgressOpen(true)}
                disabled={
                  poleLoading ||
                  progressLoading ||
                  !project?.workItems?.length
                }
              />

              <Link
                href="/tiang"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 bg-paper px-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-canvas"
              >
                <ArrowLeft className="h-4 w-4" />
                Daftar Tiang
              </Link>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
                      <MapPin className="h-4 w-4" />
                    </div>

                    <div>
                      <CardTitle>Identitas & Lokasi</CardTitle>
                      <CardDescription>
                        Data utama titik tiang dari database
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailRow label="Kode Tiang" value={pole.poleCode} />
                    <DetailRow
                      label="Wilayah"
                      value={pole.region?.name ?? "—"}
                    />
                    <DetailRow
                      label="Kode Wilayah"
                      value={pole.region?.code ?? "—"}
                    />
                    <DetailRow
                      label="Latitude"
                      value={formatCoordinate(pole.latitude)}
                      mono
                    />
                    <DetailRow
                      label="Longitude"
                      value={formatCoordinate(pole.longitude)}
                      mono
                    />
                    <DetailRow label="Status" value={status.label} />
                  </div>

                  <MapPanel
                    className="h-[300px] w-full sm:h-[340px]"
                    poles={mappedPole}
                    selectedId={pole.id}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
                      <ClipboardList className="h-4 w-4" />
                    </div>

                    <div>
                      <CardTitle>Progress Pekerjaan</CardTitle>
                      <CardDescription>
                        Realisasi per item pekerjaan pada tiang ini
                      </CardDescription>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-[11px] text-neutral-400">
                      Progress berbobot
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-neutral-900">
                      {progressLoading ? "…" : formatPercent(weightedProgress)}
                    </p>
                  </div>
                </CardHeader>

                <CardContent>
                  {progressError ? (
                    <ErrorNotice
                      error={progressError}
                      onRetry={reloadProgress}
                      compact
                      title="Progress gagal dimuat"
                    />
                  ) : progressLoading ? (
                    <SkeletonRows rows={4} />
                  ) : mergedStages.length ? (
                    <div className="space-y-4">
                      <ProgressBar
                        value={weightedProgress}
                        size="md"
                        label="Total progress berbobot"
                        showLabel
                      />

                      <div className="space-y-3">
                        {mergedStages.map((item) => (
                          <div
                            key={item.id ?? `${item.workItemId}`}
                            className="rounded-xl border border-neutral-100 p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Link
                                href={`/pekerjaan/${item.workItemId}`}
                                className="text-sm font-medium text-neutral-800 transition-colors hover:text-neutral-950"
                              >
                                {item.workItem?.name ??
                                  `Item #${item.workItemId}`}
                              </Link>

                              <span className="text-xs font-medium tabular-nums text-neutral-600">
                                {formatPercent(item.progress)}
                              </span>
                            </div>

                            <div className="mt-2">
                              <ProgressBar
                                value={item.progress}
                                size="xs"
                                label="Progress"
                              />
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400">
                              {item.startedAt && (
                                <span>Mulai: {formatDate(item.startedAt)}</span>
                              )}

                              {item.completedAt && (
                                <span>
                                  Selesai: {formatDate(item.completedAt)}
                                </span>
                              )}

                              {item.notes && (
                                <span className="text-neutral-500">
                                  {item.notes}
                                </span>
                              )}

                              {!item.hasData && (
                                <span>Belum ada realisasi</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={ClipboardList}
                      compact
                      title="Belum ada item pekerjaan"
                      description="Project ini belum memiliki item pekerjaan. Tambahkan item pada halaman Pengaturan Pekerjaan agar realisasi per tahap bisa dicatat."
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
                      <History className="h-4 w-4" />
                    </div>

                    <div>
                      <CardTitle>Timeline Aktivitas</CardTitle>
                      <CardDescription>
                        Riwayat perubahan progress tiang
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {activityLoading ? (
                    <SkeletonRows />
                  ) : activityError ? (
                    <ErrorNotice
                      error={activityError}
                      onRetry={reloadActivities}
                      title="Gagal memuat timeline"
                    />
                  ) : !Array.isArray(activityPayload?.data) || activityPayload.data.length === 0 ? (
                    <EmptyState
                      icon={Clock}
                      compact
                      title="Belum ada riwayat aktivitas"
                      description="Riwayat akan muncul setelah progress pekerjaan diperbarui."
                    />
                  ) : (
                    <div className="space-y-4">
                      {activityPayload.data.map((activity) => (
                        <div
                          key={activity.id}
                          className="relative border-l-2 border-neutral-200 pl-4 pb-3 last:pb-0"
                        >
                          <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" />
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-neutral-800">
                              {activity.work_item_name || "Pekerjaan"}
                            </p>
                            <Badge>{formatPercent(activity.progress_percent)}</Badge>
                          </div>
                          {activity.notes && (
                            <p className="mt-1 text-sm text-neutral-600">
                              {activity.notes}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400">
                            {activity.recorded_at && (
                              <span>{formatDateTime(activity.recorded_at)}</span>
                            )}
                            {activity.recorded_by && (
                              <span>Dicatat oleh {activity.recorded_by}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Progress Keseluruhan</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <span className="text-xs text-neutral-400">Realisasi</span>
                    <span className="text-3xl font-semibold tabular-nums text-neutral-900">
                      {progressLoading ? "…" : formatPercent(weightedProgress)}
                    </span>
                  </div>

                  <ProgressBar value={weightedProgress} size="md" />

                  <dl className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <dt className="text-neutral-400">Item terkonfigurasi</dt>
                      <dd className="font-medium text-neutral-700">
                        {mergedStages.length}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between">
                      <dt className="text-neutral-400">Item punya realisasi</dt>
                      <dd className="font-medium text-neutral-700">
                        {workProgress.length}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between">
                      <dt className="text-neutral-400">Item selesai (100%)</dt>
                      <dd className="font-medium text-neutral-700">
                        {
                          mergedStages.filter(
                            (item) => Number(item.progress) >= 100,
                          ).length
                        }
                      </dd>
                    </div>

                    <div className="flex items-center justify-between">
                      <dt className="text-neutral-400">Update terakhir</dt>
                      <dd className="font-medium text-neutral-700">
                        {lastUpdated ? formatDateTime(lastUpdated) : "—"}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
                      <Camera className="h-4 w-4" />
                    </div>

                    <div>
                      <CardTitle>Dokumentasi</CardTitle>
                      <CardDescription>Foto lapangan</CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <EmptyState
                    icon={Camera}
                    compact
                    title="Belum ada dokumentasi"
                    description="Backend belum menyediakan endpoint foto/dokumentasi per tiang."
                    hint="Ready for API integration"
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          {progressOpen && (
            <UpdateProgressModal
              open={progressOpen}
              onClose={() => setProgressOpen(false)}
              projectId={projectId}
              pole={pole}
              workItems={project?.workItems ?? []}
              currentProgress={workProgress}
              onSaved={() => reloadProgress()}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function TiangDetailPage() {
  return (
    <AppShell title="Detail Tiang">
      <TiangDetailContent />
    </AppShell>
  );
}

function PageNotice() {
  return (
    <p className="text-xs text-neutral-400">
      Halaman detail tiang memakai endpoint
      <code className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
        GET /api/projects/{"{id}"}/poles/{"{pole}"}
      </code>
      dan
      <code className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
        GET /api/projects/{"{id}"}/poles/{"{pole}"}/progress
      </code>
    </p>
  );
}
