"use client";

import CurveBasisNotice from '../../../components/kurva-s/CurveBasisNotice'

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
  BarChart3,
  CalendarClock,
  Camera,
  CircleAlert,
  ClipboardList,
  Clock,
  History,
  ListChecks,
  MapPin,
  User,
  UserPlus,
} from "lucide-react";

import AppShell from "../../../components/layout/AppShell";
import { useCurrentUser } from "../../../lib/use-current-user";
import { useProject } from "../../../lib/project-context";
import { projectUnitLabel, projectUnitLower } from "../../../lib/unit-label";
import MapPanel from "../../../components/tiang/MapPanel";
import SCurveChart from "../../../components/kurva-s/SCurveChart";
import CurveVarianceTable from "../../../components/kurva-s/CurveVarianceTable";
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
  normalizePhoto,
  normalizePole,
  normalizeWorkItem,
  normalizeWorkProgress,
  unwrapList,
} from "../../../lib/api";
import { useResource } from "../../../lib/use-api";
import { resolveStatus } from "../../../lib/status";
import { summarizeCurve } from "../../../lib/curve";
import {
  formatCoordinate,
  formatDate,
  formatDateTime,
  formatPercent,
  formatSignedPercent,
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

function varianceTone(variance) {
  if (variance === null || variance === undefined) {
    return "bg-neutral-100 text-neutral-500 ring-neutral-500/20";
  }

  if (variance > 0) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (variance < 0) return "bg-rose-50 text-rose-700 ring-rose-600/20";

  return "bg-neutral-100 text-neutral-600 ring-neutral-500/20";
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
  const unitName = projectUnitLabel(project);
  const unitLower = projectUnitLower(project);

  /* PIC & tenggat (gaya Asana). */
  const currentUser = useCurrentUser();
  const isAdmin = ["admin", "supervisor"].includes(currentUser?.role);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState(null);
  const [dueDate, setDueDate] = useState(null);
  const [dueBusy, setDueBusy] = useState(false);
  const [dueError, setDueError] = useState(null);
  const [actionNotice, setActionNotice] = useState("");

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
  }, [projectId, poleId]);

  /* Item pekerjaan milik tiang ini (independen per tiang). Item ini yang
     menjadi sumber realisasi/progress, bukan template project. */
  const workItemsLoader = useCallback(async () => {
    if (!projectId || !poleId) return null;

    const payload = await api.listPoleWorkItems(projectId, poleId);

    return unwrapList(payload).map(normalizeWorkItem);
  }, [projectId, poleId]);
  const enabled = Boolean(projectId && poleId);

  const curveLoader = useCallback(async () => {
    if (!projectId || !poleId) return null;

    return await api.getPoleCurve(projectId, poleId);
  }, [projectId, poleId]);

  /* Anggota proyek — kandidat PIC (hanya dimuat untuk admin/supervisor). */
  const membersLoader = useCallback(async () => {
    if (!projectId || !isAdmin) return null;

    return unwrapList(await api.listProjectMembers(projectId));
  }, [projectId, isAdmin]);

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

  const {
    data: poleWorkItems,
    error: workItemsError,
    loading: workItemsLoading,
    reload: reloadWorkItems,
  } = useResource(workItemsLoader, [projectId, poleId], { enabled });

  const {
    data: curvePayload,
    error: curveError,
    loading: curveLoading,
    reload: reloadCurve,
  } = useResource(curveLoader, [projectId, poleId], { enabled });

  const { data: members } = useResource(membersLoader, [projectId, isAdmin], {
    enabled: Boolean(projectId && isAdmin),
  });

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

  /* Dokumentasi foto progress tiang (dilampirkan saat catat progress). */
  const photos = useMemo(
    () =>
      Array.isArray(progressPayload?.photos)
        ? progressPayload.photos.map(normalizePhoto)
        : [],
    [progressPayload],
  );

  /* Gabungkan item pekerjaan tiang ini dengan progress tersimpan.
     Tujuannya: setiap tahap pekerjaan tetap terlihat meski belum ada
     realisasi (ditampilkan 0%), bukan hilang dari daftar. */
  const mergedStages = useMemo(() => {
    const configured = poleWorkItems ?? [];
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
  }, [poleWorkItems, workProgress]);

  const status = resolveStatus(pole?.status, weightedProgress);

  /* PIC hanya boleh mencatat progres di titik yang ditugaskan ke
     dirinya; admin/supervisor selalu boleh. */
  const isAssignedToMe =
    isAdmin ||
    (pole?.assignedUsers ?? []).some(
      (user) => String(user.id) === String(currentUser?.id)
    );

  const dueValue = dueDate ?? pole?.dueDate ?? "";

  const assignCandidates = useMemo(() => {
    const assignedIds = new Set(
      (pole?.assignedUsers ?? []).map((user) => String(user.id))
    );

    return (members ?? []).filter(
      (member) => !assignedIds.has(String(member.id))
    );
  }, [members, pole?.assignedUsers]);

  async function handleAssign(event) {
    event.preventDefault();

    if (!assignUserId || assignBusy) return;

    setAssignBusy(true);
    setAssignError(null);
    setActionNotice("");

    try {
      await api.assignPoleToUser(assignUserId, poleId);
      setAssignUserId("");
      setActionNotice("PIC berhasil ditugaskan.");
      reloadPole();
    } catch (err) {
      setAssignError(err);
    } finally {
      setAssignBusy(false);
    }
  }

  async function handleRevoke(user) {
    if (assignBusy) return;
    if (!window.confirm(`Cabut penugasan ${user.name} di ${pole?.poleCode}?`)) return;

    setAssignBusy(true);
    setAssignError(null);
    setActionNotice("");

    try {
      await api.revokePoleFromUser(user.id, poleId);
      setActionNotice("Penugasan dicabut.");
      reloadPole();
    } catch (err) {
      setAssignError(err);
    } finally {
      setAssignBusy(false);
    }
  }

  async function handleSaveDueDate() {
    if (dueBusy) return;

    setDueBusy(true);
    setDueError(null);
    setActionNotice("");

    try {
      await api.updatePole(projectId, poleId, {
        due_date: dueValue === "" ? null : dueValue,
      });
      setDueDate(null);
      setActionNotice("Tenggat disimpan.");
      reloadPole();
    } catch (err) {
      setDueError(err);
    } finally {
      setDueBusy(false);
    }
  }

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

  const curveSummary = useMemo(() => {
    if (!curvePayload) return null;
    return summarizeCurve(curvePayload);
  }, [curvePayload]);

  const mappedPole = useMemo(() => {
    if (!pole) return [];

    return pole.hasCoordinate ? [pole] : [];
  }, [pole]);

  useEffect(() => {
    if (!pole) return;

    if (typeof document !== "undefined") {
      document.title = `${pole.poleCode} · Monitoring ${unitName}`;
    }
  }, [pole]);

  if (!enabled) {
    return (
      <div className="space-y-3">
        <PageNotice />
        <ErrorNotice
          error={{
            message:
              `Proyek belum dapat dimuat sehingga detail ${unitLower} tidak bisa ditampilkan.`,
          }}
          title="Project belum siap"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageNotice />

      {poleError && (
        <ErrorNotice
          error={poleError}
          onRetry={reloadPole}
          title={`Detail ${unitLower} gagal dimuat`}
        />
      )}

      {poleLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <div className="grid gap-3">
            <Skeleton className="h-72 w-full lg:col-span-2" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      ) : !pole ? (
        <EmptyState
          icon={CircleAlert}
          title={`${unitName} tidak ditemukan`}
          description={`${unitName} dengan id ${poleId} tidak tersedia pada proyek ini.`}
          action={
            <Link
              href="/tiang"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke daftar {unitLower}
            </Link>
          }
        />
      ) : (
        <>
          <section className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Breadcrumbs
                items={[
                  { label: "Dashboard", href: "/dashboard" },
                  { label: unitName, href: "/tiang" },
                  { label: pole.poleCode },
                ]}
              />

              <h2 className="mt-1.5 text-lg font-semibold tracking-tight sm:text-xl">
                {pole.poleCode}
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                {pole.address || `Alamat belum diisi pada data ${unitLower}.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />

              {project?.name && (
                <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-500/20">
                  {project.name}
                </Badge>
              )}

              {/* Progres dicatat dari Tugas saya — satu tempat, bukan
                  form terpisah di halaman ini. */}
              {isAssignedToMe ? (
                <Link
                  href={`/tugas-saya?lokasi=${poleId}`}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-orange-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
                >
                  <ClipboardList className="h-4 w-4" />
                  Catat progres
                </Link>
              ) : (
                <span className="text-xs text-neutral-400">
                  Lokasi ini belum ditugaskan ke Anda — progres dicatat dari Tugas saya
                </span>
              )}

              <Link
                href={`/tiang/${poleId}/pekerjaan`}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 bg-paper px-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-canvas"
              >
                <ListChecks className="h-4 w-4" />
                Kelola Pekerjaan
              </Link>

              <Link
                href="/tiang"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 bg-paper px-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-canvas"
              >
                <ArrowLeft className="h-4 w-4" />
                Daftar Tiang
              </Link>
            </div>
          </section>

          <div className="grid gap-3">
            <div className="space-y-3 lg:col-span-2">
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

                <CardContent className="space-y-3">
                  <div className="grid gap-3">
                    <DetailRow label="Kode Tiang" value={pole.poleCode} />
                    <DetailRow
                      label="Wilayah"
                      value={pole.region?.name ?? "Belum ditentukan"}
                    />
                    <DetailRow
                      label="Kode Wilayah"
                      value={pole.region?.code ?? "Belum ditentukan"}
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
                    className="h-[260px] w-full sm:h-[300px]"
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
                        Progres per item pekerjaan pada tiang ini
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
                  {progressError || workItemsError ? (
                    <ErrorNotice
                      error={progressError || workItemsError}
                      onRetry={() => {
                        reloadProgress();
                        reloadWorkItems();
                      }}
                      compact
                      title="Progress gagal dimuat"
                    />
                  ) : progressLoading || workItemsLoading ? (
                    <SkeletonRows rows={4} />
                  ) : mergedStages.length ? (
                    <div className="space-y-3">
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
                                <span>Belum ada progres</span>
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
                      title="Belum ada item pekerjaan di tiang ini"
                      description="Tiang ini belum memiliki item pekerjaan. Tambahkan item khusus tiang ini, atau terapkan template pekerjaan project."
                      action={
                        <Link
                          href={`/tiang/${poleId}/pekerjaan`}
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-neutral-900 px-3 text-sm font-medium text-white"
                        >
                          <ListChecks className="h-4 w-4" />
                          Kelola Pekerjaan
                        </Link>
                      }
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
                      <BarChart3 className="h-4 w-4" />
                    </div>

                    <div className="flex-1">
                      <CardTitle>Kurva S Tiang</CardTitle>
                      <CardDescription>
                        Rencana khusus tiang ini dibanding progresnya
                      </CardDescription>
                    </div>

                    {(curveSummary?.hasPlanned || curveSummary?.hasActual) && (
                      <Badge className={varianceTone(curveSummary.variance)}>
                        {formatSignedPercent(curveSummary.variance)}
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <CurveBasisNotice curve={curvePayload} />
                  {curveLoading ? (
                    <Skeleton className="h-[280px] w-full" />
                  ) : curveError ? (
                    <ErrorNotice
                      error={curveError}
                      onRetry={reloadCurve}
                      title="Data kurva S tiang gagal dimuat"
                    />
                  ) : curveSummary?.hasPlanned || curveSummary?.hasActual ? (
                    <>
                      <SCurveChart series={curveSummary.series} height={290} />

                      <dl className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-canvas p-3 text-center">
                          <dt className="text-[11px] text-neutral-400">
                            Rencana
                          </dt>
                          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-800">
                            {formatPercent(curveSummary.plannedProgress)}
                          </dd>
                        </div>

                        <div className="rounded-xl bg-canvas p-3 text-center">
                          <dt className="text-[11px] text-neutral-400">
                            Progres
                          </dt>
                          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-800">
                            {formatPercent(curveSummary.actualProgress)}
                          </dd>
                        </div>

                        <div className="rounded-xl bg-canvas p-3 text-center">
                          <dt className="text-[11px] text-neutral-400">
                            Selisih
                          </dt>
                          <dd
                            className={`mt-0.5 text-sm font-semibold tabular-nums ${
                              curveSummary.variance === null
                                ? "text-neutral-500"
                                : curveSummary.variance >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                            }`}
                          >
                            {formatSignedPercent(curveSummary.variance)}
                          </dd>
                        </div>
                      </dl>

                      <details className="rounded-xl border border-neutral-200 p-3">
                          <summary className="cursor-pointer text-sm font-medium text-neutral-700">Tampilkan rincian angka</summary>
                          <div className="mt-3"><CurveVarianceTable series={curveSummary.series} /></div>
                        </details>
                    </>
                  ) : (
                    <EmptyState
                      icon={BarChart3}
                      compact
                      title="Kurva S tiang belum tersedia"
                      description="Tambahkan item pekerjaan dengan bulan rencana, lalu catat progres untuk menampilkan kurva S tiang ini."
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
                    <div className="space-y-3">
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
                          {Array.isArray(activity.photos) &&
                            activity.photos.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {activity.photos.map((photo, index) => (
                                  <a
                                    key={photo.id ?? `${photo.url}-${index}`}
                                    href={photo.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={photo.original_name ?? "Buka foto"}
                                    className="block overflow-hidden rounded-lg border border-neutral-200"
                                  >
                                    <img
                                      src={photo.url}
                                      alt={photo.original_name ?? `Dokumentasi ${index + 1}`}
                                      loading="lazy"
                                      className="h-14 w-14 object-cover"
                                    />
                                  </a>
                                ))}
                              </div>
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

            <div className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle>Progress Keseluruhan</CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-end justify-between">
                    <span className="text-xs text-neutral-400">Progres</span>
                    <span className="text-xl font-semibold tabular-nums text-neutral-900">
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
                      <dt className="text-neutral-400">Item punya progres</dt>
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
                      <User className="h-4 w-4" />
                    </div>

                    <div>
                      <CardTitle>PIC & Tenggat</CardTitle>
                      <CardDescription>Siapa yang mengerjakan lokasi ini</CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {pole.assignedUsers.length ? (
                    <ul className="space-y-2">
                      {pole.assignedUsers.map((user) => (
                        <li
                          key={user.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-canvas p-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-neutral-800">
                              {user.name}
                            </p>
                            <p className="text-[11px] text-neutral-400">
                              {user.teamName
                                ? `Tim ${user.teamName}`
                                : "Penugasan langsung"}
                            </p>
                          </div>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleRevoke(user)}
                              disabled={assignBusy}
                              className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Cabut
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      Belum ada PIC. Lokasi ini belum ditugaskan ke siapa pun.
                    </p>
                  )}

                  {isAdmin && (
                    <form onSubmit={handleAssign} className="space-y-2">
                      <label
                        htmlFor="assign-pic"
                        className="block text-xs font-medium text-neutral-500"
                      >
                        Tugaskan PIC
                      </label>

                      <div className="flex gap-2">
                        <select
                          id="assign-pic"
                          value={assignUserId}
                          onChange={(event) => setAssignUserId(event.target.value)}
                          disabled={assignBusy}
                          className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-orange-500 disabled:opacity-50"
                        >
                          <option value="">Pilih anggota proyek…</option>
                          {assignCandidates.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="submit"
                          disabled={!assignUserId || assignBusy}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          <UserPlus className="h-4 w-4" />
                          Tugaskan
                        </button>
                      </div>

                      <p className="text-[11px] text-neutral-400">
                        PIC harus anggota proyek dulu — tambah di halaman Proyek.
                      </p>
                    </form>
                  )}

                  <div className="border-t border-neutral-100 pt-3">
                    <label
                      htmlFor="pole-due-date"
                      className="block text-xs font-medium text-neutral-500"
                    >
                      Tenggat
                    </label>

                    <div className="mt-1.5 flex gap-2">
                      <input
                        id="pole-due-date"
                        type="date"
                        value={dueValue}
                        onChange={(event) => setDueDate(event.target.value)}
                        disabled={!isAdmin || dueBusy}
                        className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-orange-500 disabled:opacity-50"
                      />

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={handleSaveDueDate}
                          disabled={dueBusy}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          <CalendarClock className="h-4 w-4" />
                          Simpan
                        </button>
                      )}
                    </div>

                    {pole.isOverdue && (
                      <p className="mt-1.5 text-[11px] font-medium text-rose-600">
                        Tenggat sudah lewat dan lokasi belum selesai.
                      </p>
                    )}
                  </div>

                  {(assignError || dueError) && (
                    <p role="alert" className="text-sm text-red-700">
                      {(assignError || dueError)?.message ??
                        "Permintaan gagal. Silakan coba kembali."}
                    </p>
                  )}

                  {actionNotice && (
                    <p className="text-sm text-emerald-700">{actionNotice}</p>
                  )}
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
                  {progressLoading ? (
                    <SkeletonRows rows={2} />
                  ) : photos.length ? (
                    <div className="grid grid-cols-2 gap-2">
                      {photos.map((photo, index) => (
                        <a
                          key={photo.id ?? `${photo.url}-${index}`}
                          href={photo.url}
                          target="_blank"
                          rel="noreferrer"
                          title={photo.originalName ?? "Buka foto"}
                          className="group relative block overflow-hidden rounded-xl border border-neutral-200 bg-canvas"
                        >
                          <img
                            src={photo.url}
                            alt={photo.originalName ?? `Dokumentasi ${index + 1}`}
                            loading="lazy"
                            className="h-28 w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Camera}
                      compact
                      title="Belum ada dokumentasi"
                      description="Foto akan muncul di sini setelah progres dicatat dengan lampiran foto."
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
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
