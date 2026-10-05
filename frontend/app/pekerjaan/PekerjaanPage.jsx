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
  Square,
  X,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../components/layout/PageHeader'
import { useProject } from '../../components/layout/ProjectProvider'
import { Badge, StatusBadge } from '../../components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { ProgressBar } from '../../components/ui/progress-bar'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import { Table, TableWrap, Td, Th, Tr } from '../../components/ui/table'
import { ErrorNotice, SkeletonRows, Spinner } from '../../components/ui/states'
import { api, normalizePole, normalizeWorkItem, unwrapList } from '../../lib/api'
import { useProgressSync } from '../../lib/use-progress-sync'
import { useResource } from '../../lib/use-api'
import { statusFromProgress } from '../../lib/status'
import { clampPercent, formatDays, formatNumber, formatPercent } from '../../lib/format'

/**
 * Progress aktual per item pekerjaan dihitung dari endpoint yang
 * tersedia: /poles/{pole}/progress untuk tiap tiang pada halaman
 * poles yang sedang dimuat. Tidak ada angka yang diinventarisasi.
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

  const scopeCount = poles.length

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
    scopeCount,
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

  const itemsLoader = useCallback(
    async () =>
      projectId
        ? unwrapList(await api.listWorkItems(projectId)).map(normalizeWorkItem)
        : [],
    [projectId]
  )

  const {
    data: workItemsData,
    error: itemsError,
    loading: itemsLoading,
    reload: reloadItems,
  } = useResource(itemsLoader, [projectId], { enabled: Boolean(projectId) })

  /* `useResource` mengembalikan `null` sebelum request selesai (dan
     selama projectId masih null), jadi work item selalu dinormalkan
     menjadi array agar tidak ada `.reduce/.filter` pada `null`. */
  const workItems = useMemo(() => workItemsData ?? [], [workItemsData])

  const {
    poleIds,
    scopeCount,
    error: polesError,
    loadMany,
    cancel,
    running,
    progressInfo,
    progressByWorkItem,
    hasSynced,
  } = useWorkItemProgress(projectId)

  const totalWeight = useMemo(
    () => workItems.reduce((total, item) => total + item.weight, 0),
    [workItems]
  )

  const progressValue = useCallback(
    (workItemId) => progressByWorkItem[workItemId]?.value ?? null,
    [progressByWorkItem]
  )

  const overallProgress = useMemo(() => {
    if (!hasSynced) return null

    const active = workItems.filter(
      (item) => progressByWorkItem[item.id] !== undefined
    )

    if (!active.length) return null

    const total = active.reduce((sum, item) => {
      return sum + item.weight * clampPercent(progressByWorkItem[item.id].value)
    }, 0)

    const weight = active.reduce((sum, item) => sum + item.weight, 0)

    return weight ? total / weight : null
  }, [hasSynced, progressByWorkItem, workItems])

  const activeCount = workItems.filter(
    (item) => {
      const value = progressValue(item.id)

      return value !== null && value > 0 && value < 100
    }
  ).length

  const doneCount = workItems.filter((item) => {
    const value = progressValue(item.id)

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
            <ActionButton
              href="/kurva-s"
              icon={BarChart3}
            >
              Kurva S
            </ActionButton>

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
          value={hasSynced ? formatPercent(overallProgress) : '—'}
          hint={
            hasSynced
              ? `Dari ${formatNumber(scopeCount)} tiang tersinkron`
              : 'Belum disinkronkan'
          }
          Icon={Gauge}
          tone="blue"
        />

        <StatCard
          label="Pekerjaan Aktif"
          value={hasSynced ? formatNumber(activeCount) : '—'}
          hint={hasSynced ? 'Progress 1% – 99%' : 'Belum disinkronkan'}
          Icon={Layers}
          tone="amber"
        />

        <StatCard
          label="Pekerjaan Selesai"
          value={hasSynced ? formatNumber(doneCount) : '—'}
          hint={hasSynced ? 'Progress 100%' : 'Belum disinkronkan'}
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
                  const value = progressValue(item.id)
                  const status = statusFromProgress(value)
                  const meta = progressByWorkItem[item.id]

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

                        <StatusBadge
                          size="sm"
                          status={status}
                        />
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
                            ? `${formatNumber(meta.polesWithData)} dari ${formatNumber(scopeCount)} tiang punya data`
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
                        const value = progressValue(item.id)
                        const status = statusFromProgress(value)
                        const meta = progressByWorkItem[item.id]

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
                                  ? `${formatNumber(meta.polesWithData)} dari ${formatNumber(scopeCount)} tiang punya data`
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
                              <StatusBadge
                                size="sm"
                                status={status}
                              />
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
              description={`Endpoint /api/projects/${projectId ?? '{id}'}/work-items belum mengembalikan data work item.`}
              hint="Ready for API integration"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catatan Perhitungan</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 text-xs leading-6 text-neutral-500">
          <p>
            Progress aktual per item pekerjaan dihitung dari endpoint yang
            sudah tersedia, yaitu{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              GET /api/projects/{'{project}'}/poles/{'{pole}'}/progress
            </code>{' '}
            untuk setiap tiang pada halaman{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
              GET /api/projects/{'{project}'}/poles
            </code>
            . Nilai dirata-ratakan dari tiang yang memiliki data progress
            untuk item tersebut.
          </p>
          <p>
            Tekan <strong>Sinkronkan progress aktual</strong> untuk memuat data
            tersebut. Tidak ada data progress yang diestimasi atau dibuat di
            sisi frontend.
          </p>
          <p>
            Bobot, durasi, dan periode item pekerjaan berasal langsung dari
            tabel <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">work_items</code>.
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