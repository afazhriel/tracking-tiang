'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  CircleAlert,
  ClipboardList,
  Download,
  Gauge,
  Layers,
  RefreshCw,
  Settings2,
  Square,
  X,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../components/layout/PageHeader'
import { useProject } from '../../lib/project-context'
import { Badge, StatusBadge } from '../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { ProgressBar } from '../../components/ui/progress-bar'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import { Table, TableWrap, Td, Th, Tr } from '../../components/ui/table'
import { ErrorNotice, SkeletonRows, Spinner } from '../../components/ui/states'
import { api, normalizePole, normalizeWorkItem, unwrapList } from '../../lib/api'
import { useCurrentUser } from '../../lib/use-current-user'
import { useProgressSync } from '../../lib/use-progress-sync'
import { useResource } from '../../lib/use-api'
import { statusFromProgress } from '../../lib/status'
import { clampPercent, formatDays, formatNumber, formatPercent } from '../../lib/format'

/**
 * Progres aktual per item.
 *
 * Sumber utama: `WorkItemController@index` kini mengirim `actual_progress`
 * agregat dari seluruh tiang (penyebut sama dengan Kurva S). Bila backend
 * belum mengirim agregat (production lama), halaman jatuh ke sinkronisasi
 * per tiang seperti sebelumnya sehingga tidak ada angka yang dibuat-buat.
 */
function useWorkItemProgress(projectId) {
  const polesLoader = useCallback(
    async () => (projectId ? await api.listPoles(projectId) : null),
    [projectId]
  )

  const { data: polesPayload, error, loading, reload } = useResource(
    polesLoader,
    [projectId],
    { enabled: Boolean(projectId) }
  )

  const poles = useMemo(
    () => unwrapList(polesPayload).map(normalizePole),
    [polesPayload]
  )

  const { store, loadMany, cancel, running, progressInfo } = useProgressSync(projectId)

  const poleIds = useMemo(
    () => poles.map((pole) => pole.id),
    [poles]
  )

  const progressByWorkItem = useMemo(() => {
    const buckets = {}

    for (const pole of poles) {
      const entry = store[pole.id]

      if (!entry) continue

      for (const item of entry.items) {
        if (item.workItemId === null || item.workItemId === undefined) continue

        if (!buckets[item.workItemId]) {
          buckets[item.workItemId] = { sum: 0, count: 0 }
        }

        buckets[item.workItemId].sum += clampPercent(item.progress)
        buckets[item.workItemId].count += 1
      }
    }

    const result = {}

    for (const [workItemId, bucket] of Object.entries(buckets)) {
      result[workItemId] = {
        value: bucket.count ? bucket.sum / bucket.count : null,
        polesWithData: bucket.count,
      }
    }

    return result
  }, [poles, store])

  return {
    poles,
    poleIds,
    error,
    loading,
    reload,
    loadMany,
    cancel,
    running,
    progressInfo,
    progressByWorkItem,
    hasSynced: Object.keys(store).length > 0,
  }
}

function SyncProgressControl({ onSync, onCancel, running, progressInfo }) {
  return (
    <ActionButton
      onClick={running ? onCancel : onSync}
      icon={running ? X : Download}
    >
      {running ? (
        <span className="flex items-center gap-2">
          <Spinner className="h-3.5 w-3.5" />
          Sinkron {progressInfo.done}/{progressInfo.total}
        </span>
      ) : (
        'Sinkronkan progress aktual'
      )}
    </ActionButton>
  )
}

function PekerjaanContent() {
  const { projectId, error: projectError } = useProject()

  const currentUser = useCurrentUser()
  const isAdmin = currentUser?.role === 'admin'

  const itemsLoader = useCallback(async () => {
    if (!projectId) return { items: [], meta: null }

    const payload = await api.listWorkItemsAggregate(projectId)

    return {
      items: unwrapList(payload).map(normalizeWorkItem),
      meta: payload?.meta ?? null,
    }
  }, [projectId])

  const {
    data: itemsData,
    error: itemsError,
    loading: itemsLoading,
    reload: reloadItems,
  } = useResource(itemsLoader, [projectId], { enabled: Boolean(projectId) })

  /* `useResource` mengembalikan `null` sebelum request selesai (dan
     selama projectId masih null), jadi work item selalu dinormalkan
     menjadi array agar tidak ada `.reduce/.filter` pada `null`. */
  const workItems = useMemo(() => itemsData?.items ?? [], [itemsData])

  const hasBackendAggregate = useMemo(
    () => workItems.some((item) => item.actualProgress !== null),
    [workItems]
  )

  /* Penyebut dari backend (target tiang, fallback jumlah tiang). */
  const backendDenominator =
    itemsData?.meta?.progress_denominator ??
    itemsData?.meta?.total_target_poles ??
    null

  const {
    poleIds,
    scopeCount: registeredPoleCount,
    error: polesError,
    loadMany,
    cancel,
    running,
    progressInfo,
    progressByWorkItem,
    hasSynced,
  } = useWorkItemProgress(projectId)

  const scopeCount = hasBackendAggregate && backendDenominator
    ? backendDenominator
    : registeredPoleCount

  const totalWeight = useMemo(
    () => workItems.reduce((total, item) => total + item.weight, 0),
    [workItems]
  )

  const progressValue = useCallback(
    (item) => {
      if (item?.actualProgress !== null && item?.actualProgress !== undefined) {
        return item.actualProgress
      }

      return progressByWorkItem[item?.id]?.value ?? null
    },
    [progressByWorkItem]
  )

  const progressMeta = useCallback(
    (item) => {
      if (item?.actualProgress !== null && item?.actualProgress !== undefined) {
        return {
          polesWithData: item.polesWithProgress,
          scopeCount: backendDenominator ?? registeredPoleCount,
        }
      }

      const entry = progressByWorkItem[item?.id]

      return entry
        ? { polesWithData: entry.polesWithData, scopeCount: registeredPoleCount }
        : null
    },
    [backendDenominator, progressByWorkItem, registeredPoleCount]
  )

  const hasProgressData = itemsData?.meta?.actual_current_percent != null || hasBackendAggregate || hasSynced

  const overallProgress = useMemo(() => {
    if (!hasProgressData) return null

    if (itemsData?.meta?.actual_current_percent != null) return Number(itemsData.meta.actual_current_percent)

    if (hasBackendAggregate) {
      const total = workItems.reduce((sum, item) => {
        return sum + item.weight * clampPercent(item.actualProgress ?? 0)
      }, 0)

      const weight = workItems.reduce((sum, item) => sum + item.weight, 0)

      return weight ? total / weight : null
    }

    const active = workItems.filter(
      (item) => progressByWorkItem[item.id] !== undefined
    )

    if (!active.length) return null

    const total = active.reduce((sum, item) => {
      return sum + item.weight * clampPercent(progressByWorkItem[item.id].value)
    }, 0)

    const weight = active.reduce((sum, item) => sum + item.weight, 0)

    return weight ? total / weight : null
  }, [hasBackendAggregate, hasProgressData, itemsData, progressByWorkItem, workItems])

  const activeCount = workItems.filter((item) => {
    const value = progressValue(item)

    return value !== null && value > 0 && value < 100
  }).length

  const doneCount = workItems.filter((item) => {
    const value = progressValue(item)

    return value !== null && value >= 100
  }).length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project Control"
        title="Pekerjaan"
        subtitle="Pantau progres setiap item pekerjaan pada seluruh proyek."
        actions={
          <>
            <ActionButton href="/kurva-s" icon={BarChart3}>
              Kurva S
            </ActionButton>

            {isAdmin && (
              <ActionButton href="/pekerjaan/pengaturan" icon={Settings2}>
                Pengaturan
              </ActionButton>
            )}

            <SyncProgressControl
              running={running}
              progressInfo={progressInfo}
              onSync={() => loadMany(poleIds)}
              onCancel={cancel}
            />
          </>
        }
      />

      <StatCardGrid>
        <StatCard
          label="Total Work Item"
          value={itemsLoading ? '…' : formatNumber(workItems.length)}
          hint="Item pekerjaan pada project"
          Icon={ClipboardList}
        />

        <StatCard
          label="Progress Keseluruhan"
          value={hasProgressData ? formatPercent(overallProgress) : '—'}
          hint={
            hasProgressData
              ? hasBackendAggregate
                ? `Dari ${formatNumber(scopeCount)} tiang (agregat server)`
                : `Dari ${formatNumber(scopeCount)} tiang tersinkron`
              : 'Belum tersedia'
          }
          Icon={Gauge}
          tone="blue"
        />

        <StatCard
          label="Pekerjaan Aktif"
          value={hasProgressData ? formatNumber(activeCount) : '—'}
          hint={hasProgressData ? 'Progress 1% – 99%' : 'Belum tersedia'}
          Icon={Layers}
          tone="amber"
        />

        <StatCard
          label="Pekerjaan Selesai"
          value={hasProgressData ? formatNumber(doneCount) : '—'}
          hint={hasProgressData ? 'Progress 100%' : 'Belum tersedia'}
          Icon={Square}
          tone="emerald"
        />
      </StatCardGrid>

      {(projectError || itemsError) && (
        <ErrorNotice
          error={projectError || itemsError}
          onRetry={reloadItems}
          title="Data pekerjaan belum dapat dimuat"
        />
      )}

      {polesError && (
        <ErrorNotice
          error={polesError}
          compact
          title="Rujukan tiang gagal dimuat"
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
              <ClipboardList className="h-4 w-4" />
            </div>

            <div>
              <CardTitle>Work Item Project</CardTitle>
              <CardDescription>
                Sumber data: GET /api/projects/{'{id}'}/work-items
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-500/20">
              Total bobot {formatPercent(totalWeight)}
            </Badge>

            <ActionButton onClick={reloadItems} icon={RefreshCw}>
              Muat ulang
            </ActionButton>
          </div>
        </CardHeader>

        <CardContent>
          {itemsLoading ? (
            <SkeletonRows rows={6} />
          ) : workItems.length ? (
            <>
              {/* Mobile: kartu */}
              <div className="space-y-3 lg:hidden">
                {workItems.map((item, index) => {
                  const value = progressValue(item)
                  const status = statusFromProgress(value)
                  const meta = progressMeta(item)

                  return (
                    <Link
                      key={item.id}
                      href={`/pekerjaan/${item.id}`}
                      className="block rounded-card border border-neutral-200 bg-paper p-4 transition-colors hover:border-neutral-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-600">
                            {item.sequence ?? index + 1}
                          </span>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-neutral-900">
                              {item.name}
                            </p>
                            <p className="mt-0.5 text-xs text-neutral-500">
                              Bobot {formatPercent(item.weight)} ·{' '}
                              {formatDays(item.plannedDurationDays)}
                            </p>
                          </div>
                        </div>

                        <StatusBadge size="sm" status={status} />
                      </div>

                      <div className="mt-3">
                        <ProgressBar
                          value={value}
                          size="sm"
                          tone={status.key}
                          label="Progress aktual"
                          showLabel
                        />

                        <p className="mt-2 text-[11px] text-neutral-400">
                          {meta
                            ? `${formatNumber(meta.polesWithData)} dari ${formatNumber(meta.scopeCount)} tiang punya data`
                            : 'Belum ada data progress aktual'}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>

              {/* Desktop: tabel */}
              <div className="hidden lg:block">
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th className="w-14">No</Th>
                        <Th>Nama Pekerjaan</Th>
                        <Th align="right">Bobot</Th>
                        <Th align="right">Durasi</Th>
                        <Th align="center">Periode</Th>
                        <Th className="min-w-[220px]">Progress</Th>
                        <Th align="center">Status</Th>
                        <Th align="right" className="w-16">Detail</Th>
                      </tr>
                    </thead>

                    <tbody>
                      {workItems.map((item, index) => {
                        const value = progressValue(item)
                        const status = statusFromProgress(value)
                        const meta = progressMeta(item)

                        return (
                          <Tr key={item.id}>
                            <Td className="tabular-nums text-neutral-400">
                              {item.sequence ?? index + 1}
                            </Td>

                            <Td>
                              <Link
                                href={`/pekerjaan/${item.id}`}
                                className="font-medium text-neutral-900 transition-colors hover:text-neutral-950"
                              >
                                {item.name}
                              </Link>

                              <p className="mt-0.5 text-[11px] text-neutral-400">
                                {meta
                                  ? `${formatNumber(meta.polesWithData)} dari ${formatNumber(meta.scopeCount)} tiang punya data`
                                  : 'Belum ada data progress aktual'}
                              </p>
                            </Td>

                            <Td align="right" className="tabular-nums">
                              {formatPercent(item.weight)}
                            </Td>

                            <Td align="right" className="tabular-nums text-neutral-500">
                              {formatDays(item.plannedDurationDays)}
                            </Td>

                            <Td align="center" className="text-xs text-neutral-500">
                              {item.plannedStartMonth && item.plannedEndMonth
                                ? `B${item.plannedStartMonth} – B${item.plannedEndMonth}`
                                : '—'}
                            </Td>

                            <Td>
                              <ProgressBar
                                value={value}
                                size="sm"
                                tone={status.key}
                                label="Progress"
                              />
                            </Td>

                            <Td align="center">
                              <StatusBadge size="sm" status={status} />
                            </Td>

                            <Td align="right">
                              <Link
                                href={`/pekerjaan/${item.id}`}
                                aria-label={`Detail ${item.name}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-canvas hover:text-neutral-800"
                              >
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            </Td>
                          </Tr>
                        )
                      })}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>
            </>
          ) : (
            <EmptyState
              icon={CircleAlert}
              title="Belum ada item pekerjaan"
              description="Tambahkan item pekerjaan pada pengaturan agar progres berbobot bisa dihitung."
              action={
                isAdmin && (
                  <ActionButton href="/pekerjaan/pengaturan" variant="primary" icon={Settings2}>
                    Buka Pengaturan
                  </ActionButton>
                )
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catatan Perhitungan</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 text-xs leading-6 text-neutral-500">
          {hasBackendAggregate ? (
            <p>
              Progres aktual tiap item dihitung di server dari tabel{' '}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
                pole_work_progress
              </code>{' '}
              dan dibagi dengan penyebut proyek yang sama dengan Kurva S
              (target jumlah tiang, atau jumlah tiang terdaftar bila target
              belum diatur).
            </p>
          ) : (
            <p>
              Backend belum mengirim progres agregat, sehingga halaman memakai
              data dari{' '}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
                GET /api/projects/{'{project}'}/poles/{'{pole}'}/progress
              </code>
              . Tekan <strong>Sinkronkan progress aktual</strong> untuk
              memuatnya. Tidak ada data progress yang diestimasi.
            </p>
          )}

          <p>
            Bobot, durasi, dan periode item pekerjaan diatur pada halaman{' '}
            <Link
              href="/pekerjaan/pengaturan"
              className="font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              Pengaturan Pekerjaan
            </Link>{' '}
            dan tersimpan di tabel{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              work_items
            </code>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function PekerjaanPage() {
  return (
    <AppShell title="Pekerjaan">
      <PekerjaanContent />
    </AppShell>
  )
}
