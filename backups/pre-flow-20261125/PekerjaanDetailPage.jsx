'use client'

import { useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  ClipboardList,
  Download,
  MapPin,
  RefreshCw,
  X,
} from 'lucide-react'

import AppShell from '../../../components/layout/AppShell'
import { useProject } from '../../../lib/project-context'
import { Badge, StatusBadge } from '../../../components/ui/badge'
import { Breadcrumbs } from '../../../components/ui/breadcrumbs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { ProgressBar } from '../../../components/ui/progress-bar'
import { StatCard, StatCardGrid } from '../../../components/ui/stat-card'
import { InlineLoader, SectionNote } from '../../../components/ui/feedback'
import { ErrorNotice } from '../../../components/ui/states'
import { api, normalizePole, normalizeWorkItem, unwrapList } from '../../../lib/api'
import { useProgressSync } from '../../../lib/use-progress-sync'
import { useResource } from '../../../lib/use-api'
import { statusFromProgress } from '../../../lib/status'
import {
  clampPercent,
  formatDays,
  formatNumber,
  formatPercent,
} from '../../../lib/format'

function Row({ label, value, mono = false }) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p
        className={`mt-0.5 text-sm font-medium text-neutral-800 ${mono ? 'tabular-nums' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * Isi halaman detail pekerjaan.
 *
 * Dipisah dari komponen export supaya `useProject()` dipanggil
 * di dalam `ProjectProvider` yang dimiliki `AppShell`, bukan
 * di komponen yang sama yang merendernya.
 */
function PekerjaanDetailContent() {
  const params = useParams()
  const workItemId = params?.id ?? null
  const { projectId, project } = useProject()

  const enabled = Boolean(projectId && workItemId)

  const itemLoader = useCallback(async () => {
    if (!enabled) return null

    const payload = await api.getWorkItem(projectId, workItemId)

    return payload?.data ?? null
  }, [enabled, projectId, workItemId])

  const {
    data: rawItem,
    error: itemError,
    loading: itemLoading,
    reload: reloadItem,
  } = useResource(itemLoader, [projectId, workItemId], { enabled })

  const workItem = useMemo(
    () => (rawItem ? normalizeWorkItem(rawItem) : null),
    [rawItem]
  )

  /* Riwayat progress item ini sepanjang proyek (dari endpoint kurva
     yang sama dengan halaman Kurva S) - ditampilkan sebagai konteks. */
  const curveLoader = useCallback(
    async () => (projectId ? await api.getCurve(projectId) : null),
    [projectId]
  )

  const { data: curve } = useResource(curveLoader, [projectId], {
    enabled: Boolean(projectId),
  })

  /* Daftar tiang terkait: daftar tiang project, lalu progress per item
     diambil dari endpoint progress yang sudah ada. */
  const polesLoader = useCallback(
    async () => (projectId ? await api.listPoles(projectId) : null),
    [projectId]
  )

  const {
    data: polesPayload,
    error: polesError,
    loading: polesLoading,
    reload: reloadPoles,
  } = useResource(polesLoader, [projectId], { enabled: Boolean(projectId) })

  const poles = useMemo(
    () => unwrapList(polesPayload).map(normalizePole),
    [polesPayload]
  )

  const { store, loadMany, cancel, running, progressInfo } =
    useProgressSync(projectId)

  const relatedPoles = useMemo(() => {
    const rows = poles.map((pole) => {
      const entry = store[pole.id]
      const item = entry?.items?.find(
        (candidate) => candidate.workItemId === workItemId
      )

      return {
        pole,
        progress: item ? clampPercent(item.progress) : null,
        startedAt: item?.startedAt ?? null,
        completedAt: item?.completedAt ?? null,
        notes: item?.notes ?? null,
      }
    })

    return rows
  }, [poles, store, workItemId])

  const stats = useMemo(() => {
    const values = relatedPoles
      .map((row) => row.progress)
      .filter((value) => value !== null)

    if (!values.length) {
      return { average: null, done: 0, inProgress: 0, touched: values.length }
    }

    const average = values.reduce((sum, value) => sum + value, 0) / values.length

    return {
      average,
      done: values.filter((value) => value >= 100).length,
      inProgress: values.filter((value) => value > 0 && value < 100).length,
      touched: values.length,
    }
  }, [relatedPoles])

  useEffect(() => {
    if (!workItem) return

    document.title = `${workItem.name} · Pekerjaan`
  }, [workItem])

  const periodLabel =
    workItem?.plannedStartMonth && workItem?.plannedEndMonth
      ? `Bulan ${workItem.plannedStartMonth} – Bulan ${workItem.plannedEndMonth}`
      : '—'

  const plannedMonths = useMemo(() => {
    if (!workItem?.plannedStartMonth || !workItem?.plannedEndMonth) return 0

    return workItem.plannedEndMonth - workItem.plannedStartMonth + 1
  }, [workItem])

  const monthlyPlannedWeight =
    plannedMonths && workItem ? workItem.weight / plannedMonths : null

  const totalRegistered = polesPayload?.meta?.total ?? null

  return (
    <>
      <div className="space-y-6">
        <p className="text-xs text-neutral-400">
          Sumber data:{' '}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
            GET /api/projects/{'{id}'}/work-items/{'{workItem}'}
          </code>
          . Riwayat rencana diambil dari endpoint kurva S yang sama.
        </p>

        {itemError && (
          <ErrorNotice
            error={itemError}
            onRetry={reloadItem}
            title="Detail pekerjaan gagal dimuat"
          />
        )}

        {itemLoading ? (
          <InlineLoader label="Memuat detail pekerjaan..." />
        ) : !workItem ? (
          <EmptyState
            icon={CircleAlert}
            title="Item pekerjaan tidak ditemukan"
            description={`Work item dengan id ${workItemId} tidak tersedia pada project ini.`}
            action={
              <Link
                href="/pekerjaan"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali ke daftar pekerjaan
              </Link>
            }
          />
        ) : (
          <>
            <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <Breadcrumbs
                  items={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Pekerjaan', href: '/pekerjaan' },
                    { label: workItem.name },
                  ]}
                />

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {workItem.name}
                  </h2>

                  <StatusBadge status={statusFromProgress(stats.average)} />
                </div>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                  Bobot {formatPercent(workItem.weight)} terhadap total pekerjaan
                  {workItem.plannedDurationDays
                    ? ` · durasi rencana ${formatDays(workItem.plannedDurationDays)}`
                    : ''}
                  .
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {project?.name && (
                  <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-500/20">
                    {project.name}
                  </Badge>
                )}

                <Link
                  href="/pekerjaan"
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 bg-paper px-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-canvas"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Daftar Pekerjaan
                </Link>
              </div>
            </section>

            <StatCardGrid>
              <StatCard
                label="Bobot Pekerjaan"
                value={formatPercent(workItem.weight)}
                hint="Terhadap total bobot project"
                Icon={ClipboardList}
              />

              <StatCard
                label="Periode Rencana"
                value={periodLabel}
                hint={
                  monthlyPlannedWeight
                    ? `${formatPercent(monthlyPlannedWeight)} per bulan`
                    : 'Periode belum diatur'
                }
                Icon={CalendarDays}
                tone="blue"
              />

              <StatCard
                label="Progress Aktual"
                value={
                  running
                    ? `${progressInfo.done}/${progressInfo.total}`
                    : formatPercent(stats.average)
                }
                hint={
                  stats.touched
                    ? `Rata-rata ${formatNumber(stats.touched)} tiang`
                    : 'Belum ada data progress'
                }
                Icon={Download}
                tone="emerald"
              />

              <StatCard
                label="Tiang Selesai"
                value={formatNumber(stats.done)}
                hint={`${formatNumber(stats.inProgress)} masih dikerjakan`}
                Icon={MapPin}
                tone="amber"
              />
            </StatCardGrid>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
                        <ClipboardList className="h-4 w-4" />
                      </div>

                      <div>
                        <CardTitle>Rencana & Realisasi</CardTitle>
                        <CardDescription>
                          Progres item pekerjaan ini pada periode proyek
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Row
                        label="Nama Pekerjaan"
                        value={workItem.name}
                      />
                      <Row
                        label="Bobot"
                        value={formatPercent(workItem.weight)}
                        mono
                      />
                      <Row
                        label="Durasi Rencana"
                        value={formatDays(workItem.plannedDurationDays)}
                      />
                      <Row
                        label="Urutan (Sequence)"
                        value={workItem.sequence ?? '—'}
                        mono
                      />
                      <Row
                        label="Bulan Mulai"
                        value={workItem.plannedStartMonth
                          ? `B${workItem.plannedStartMonth}`
                          : '—'}
                        mono
                      />
                      <Row
                        label="Bulan Selesai"
                        value={workItem.plannedEndMonth
                          ? `B${workItem.plannedEndMonth}`
                          : '—'}
                        mono
                      />
                      <Row
                        label="Status Aktif"
                        value={
                          workItem.isActive === null
                            ? '—'
                            : workItem.isActive
                              ? 'Aktif'
                              : 'Nonaktif'
                        }
                      />
                      <Row
                        label="Progress Aktual"
                        value={formatPercent(stats.average)}
                        mono
                      />
                    </div>

                    <div>
                      <ProgressBar
                        value={stats.average}
                        size="md"
                        label="Progress aktual (rata-rata tiang)"
                        showLabel
                      />
                    </div>

                    {curve?.planned_curve?.length ? (
                      <div className="rounded-card border border-neutral-100 p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                          Kontribusi rencana per bulan
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {curve.planned_curve
                            .filter((point) => point.month >= (workItem.plannedStartMonth ?? 1) &&
                              point.month <= (workItem.plannedEndMonth ?? 0))
                            .map((point) => (
                              <div
                                key={point.month}
                                className="rounded-xl bg-canvas p-3"
                              >
                                <p className="text-[11px] text-neutral-400">
                                  Bulan {point.month}
                                </p>
                                <p className="mt-0.5 text-sm font-medium tabular-nums text-neutral-800">
                                  {formatPercent(
                                    Number(point.monthly_percent) * (workItem.weight / 100)
                                  )}
                                </p>
                              </div>
                            ))}
                        </div>

                        <SectionNote>
                          Nilai di atas adalah kontribusi bobot item ini terhadap
                          progres rencana proyek tiap bulan, dihitung dari
                          <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 text-[10px] text-neutral-500">
                            planned_curve
                          </code>
                          pada endpoint kurva S.
                        </SectionNote>
                      </div>
                    ) : (
                      <EmptyState
                        icon={CalendarDays}
                        compact
                        title="Rencana bulanan belum tersedia"
                        description="Endpoint kurva S belum mengembalikan data rencana untuk project ini."
                        hint="Ready for API integration"
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
                        <MapPin className="h-4 w-4" />
                      </div>

                      <div>
                        <CardTitle>Tiang Terkait</CardTitle>
                        <CardDescription>
                          {totalRegistered
                            ? `${formatNumber(totalRegistered)} tiang terdaftar pada project`
                            : 'Daftar tiang project'}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          running ? cancel() : loadMany(poles.map((pole) => pole.id))
                        }
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 bg-paper px-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-canvas"
                      >
                        {running ? (
                          <>
                            <X className="h-3.5 w-3.5" />
                            Batal {progressInfo.done}/{progressInfo.total}
                          </>
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" />
                            Muat progress tiang
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={reloadPoles}
                        aria-label="Muat ulang daftar tiang"
                        title="Muat ulang daftar tiang"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:bg-canvas"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent>
                    {polesError ? (
                      <ErrorNotice
                        error={polesError}
                        onRetry={reloadPoles}
                        compact
                        title="Daftar tiang gagal dimuat"
                      />
                    ) : polesLoading ? (
                      <InlineLoader label="Memuat daftar tiang..." />
                    ) : !poles.length ? (
                      <EmptyState
                        icon={MapPin}
                        compact
                        title="Belum ada tiang terdaftar"
                        description="Tidak ada tiang pada project ini sehingga detail per tiang tidak dapat ditampilkan."
                      />
                    ) : stats.touched === 0 ? (
                      <EmptyState
                        icon={MapPin}
                        compact
                        title="Progress tiang belum dimuat"
                        description="Backend menyediakan endpoint progress per tiang, namun belum ada endpoint ringkasan progress per work item. Tekan “Muat progress tiang” untuk mengambil data asli dari API."
                        hint="Ready for API integration"
                      />
                    ) : (
                      <div className="space-y-2">
                        {relatedPoles
                          .filter((row) => row.progress !== null)
                          .map((row) => {
                            const status = statusFromProgress(row.progress)

                            return (
                              <Link
                                key={row.pole.id}
                                href={`/tiang/${row.pole.id}`}
                                className="block rounded-xl border border-neutral-100 p-3 transition-colors hover:border-neutral-200 hover:bg-canvas"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="truncate text-sm font-medium text-neutral-900">
                                      {row.pole.poleCode}
                                    </span>
                                    <span className="hidden truncate text-xs text-neutral-500 sm:inline">
                                      {row.pole.region?.name ?? '—'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium tabular-nums text-neutral-700">
                                      {formatPercent(row.progress)}
                                    </span>
                                    <StatusBadge
                                      size="sm"
                                      status={status}
                                      showDot={false}
                                    />
                                  </div>
                                </div>

                                <div className="mt-2">
                                  <ProgressBar
                                    value={row.progress}
                                    size="xs"
                                    tone={status.key}
                                  />
                                </div>
                              </Link>
                            )
                          })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Progress History</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {curve?.actual_curve?.length ? (
                      <>
                        <div className="flex items-end justify-between">
                          <span className="text-xs text-neutral-400">
                            Realisasi proyek
                          </span>
                          <span className="text-2xl font-semibold tabular-nums text-neutral-900">
                            {formatPercent(curve.actual_current_percent)}
                          </span>
                        </div>

                        <ul className="space-y-2">
                          {curve.actual_curve
                            .slice(-8)
                            .reverse()
                            .map((point) => (
                              <li
                                key={point.date}
                                className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2"
                              >
                                <span className="text-xs text-neutral-500">
                                  {point.date}
                                </span>
                                <span className="text-xs font-medium tabular-nums text-neutral-800">
                                  {formatPercent(point.progress_percent)}
                                </span>
                              </li>
                            ))}
                        </ul>

                        <p className="text-[11px] leading-5 text-neutral-400">
                          Riwayat di atas adalah realisasi progres proyek
                          keseluruhan dari endpoint kurva S, bukan per item
                          pekerjaan.
                        </p>
                      </>
                    ) : (
                      <EmptyState
                        icon={CalendarDays}
                        compact
                        title="Riwayat belum tersedia"
                        description="Endpoint kurva S belum mengembalikan data actual curve."
                        hint="Ready for API integration"
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Endpoint</CardTitle>
                  </CardHeader>

                  <CardContent>
                    <ul className="space-y-2 text-[11px] leading-5 text-neutral-500">
                      {[
                        `/api/projects/{project}/work-items/${workItem.id}`,
                        `/api/projects/{project}/poles`,
                        `/api/projects/{project}/poles/{pole}/progress`,
                        `/api/projects/{project}/curve`,
                      ].map((path) => (
                        <li
                          key={path}
                          className="break-all rounded-lg bg-canvas px-3 py-2 font-mono text-neutral-600"
                        >
                          {path}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default function PekerjaanDetailPage() {
  return (
    <AppShell title="Detail Pekerjaan">
      <PekerjaanDetailContent />
    </AppShell>
  )
}