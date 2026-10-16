'use client'

import { useCallback, useMemo } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CircleAlert,
  Gauge,
  Minus,
  RefreshCw,
  Target,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../components/layout/PageHeader'
import { useProject } from '../../lib/project-context'
import SCurveChart from '../../components/kurva-s/SCurveChart'
import { Badge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import { ProgressBar } from '../../components/ui/progress-bar'
import { Table, TableWrap, Td, Th, Tr } from '../../components/ui/table'
import { ErrorNotice, Skeleton } from '../../components/ui/states'
import { api } from '../../lib/api'
import { useResource } from '../../lib/use-api'
import { summarizeCurve } from '../../lib/curve'
import {
  formatDate,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from '../../lib/format'

function VarianceIcon({ variance }) {
  if (variance === null || variance === undefined) {
    return <Minus className="h-4 w-4" />
  }

  if (variance > 0) return <ArrowUpRight className="h-4 w-4" />
  if (variance < 0) return <ArrowDownRight className="h-4 w-4" />

  return <Minus className="h-4 w-4" />
}

function varianceTone(variance) {
  if (variance === null || variance === undefined) {
    return 'bg-neutral-100 text-neutral-500 ring-neutral-500/20'
  }

  if (variance > 0) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
  if (variance < 0) return 'bg-rose-50 text-rose-700 ring-rose-600/20'

  return 'bg-neutral-100 text-neutral-600 ring-neutral-500/20'
}

function KurvaSContent() {
  const { projectId, error: projectError } = useProject()

  const curveLoader = useCallback(
    async () => (projectId ? await api.getCurve(projectId) : null),
    [projectId]
  )

  const {
    data: curve,
    error,
    loading,
    reload,
  } = useResource(curveLoader, [projectId], { enabled: Boolean(projectId) })

  const summary = useMemo(() => (curve ? summarizeCurve(curve) : null), [curve])

  const variance = summary?.variance ?? null
  const varianceToneClass = varianceTone(variance)

  const currentPeriodLabel = useMemo(() => {
    if (!summary?.currentPeriod) return '—'

    return `Bulan ke-${summary.currentPeriod}${
      summary.totalMonths ? ` dari ${summary.totalMonths}` : ''
    }`
  }, [summary])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project Control"
        title="Kurva S"
        subtitle="Perbandingan rencana dan realisasi progres proyek."
        actions={
          <>
            <ActionButton
              href="/pekerjaan"
              icon={BarChart3}
            >
              Pekerjaan
            </ActionButton>

            <ActionButton
              onClick={reload}
              icon={RefreshCw}
            >
              Muat ulang
            </ActionButton>
          </>
        }
      />

      {(projectError || error) && (
        <ErrorNotice
          error={projectError || error}
          onRetry={reload}
          title="Data kurva S belum dapat dimuat"
        />
      )}

      <StatCardGrid>
        <StatCard
          label="Planned Progress"
          value={loading ? '…' : formatPercent(summary?.plannedProgress ?? null)}
          hint={
            summary?.lastPlannedDate
              ? `sampai ${formatDate(summary.lastPlannedDate)}`
              : 'Belum ada rencana'
          }
          Icon={Target}
        />

        <StatCard
          label="Actual Progress"
          value={loading ? '…' : formatPercent(summary?.actualProgress ?? null)}
          hint={
            summary?.lastActualDate
              ? `terakhir ${formatDate(summary.lastActualDate)}`
              : 'Belum ada realisasi'
          }
          Icon={Gauge}
          tone="blue"
        />

        <StatCard
          label="Variance"
          value={loading ? '…' : formatSignedPercent(variance)}
          hint={
            variance === null
              ? 'Butuh data rencana & realisasi'
              : variance >= 0
                ? 'Realisasi di atas rencana'
                : 'Realisasi di bawah rencana'
          }
          Icon={
            variance !== null && variance !== undefined ? VarianceIcon : Gauge
          }
          tone={variance !== null && variance < 0 ? 'rose' : 'emerald'}
        />

        <StatCard
          label="Current Period"
          value={loading ? '…' : currentPeriodLabel}
          hint={
            curve?.project?.end_date
              ? `project ends ${formatDate(curve.project.end_date)}`
              : 'Periode berjalan'
          }
          Icon={CalendarDays}
          tone="amber"
        />
      </StatCardGrid>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
              <BarChart3 className="h-4 w-4" />
            </div>

            <div>
              <CardTitle>Planned vs Actual</CardTitle>
              <CardDescription>
                Sumber data: GET /api/projects/{'{id}'}/curve
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-500/20">
              {formatNumber(curve?.registered_poles ?? null)} tiang terdaftar
            </Badge>

            <Badge className={varianceToneClass}>
              <span className="mr-0.5 inline-flex">
                <VarianceIcon variance={variance} />
              </span>
              {formatSignedPercent(variance)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {loading ? (
            <Skeleton className="h-[380px] w-full" />
          ) : summary?.hasPlanned || summary?.hasActual ? (
            <>
              <SCurveChart
                series={summary.series}
                height={380}
              />

              <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-6 border-t-2 border-dashed border-neutral-900" />
                  Planned (rencana)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-6 bg-blue-600" />
                  Actual (realisasi)
                </span>
                <span className="ml-auto text-neutral-400">
                  {summary.hasActual
                    ? `Actual berisi ${formatNumber(
                        curve?.actual_curve?.length ?? 0
                      )} titik data`
                    : 'Actual belum memiliki data'}
                </span>
              </div>

              <div className="hidden sm:block">
                <div className="mb-3">
                  <ProgressBar
                    value={summary.actualProgress}
                    label="Posisi realisasi saat ini"
                    showLabel
                    size="md"
                  />
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={CircleAlert}
              title="Data kurva belum tersedia"
              description={`Endpoint /api/projects/${projectId ?? '{id}'}/curve belum mengembalikan planned_curve maupun actual_curve.`}
              hint="Ready for API integration"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
              <CalendarDays className="h-4 w-4" />
            </div>

            <div>
              <CardTitle>Tabel Kurva</CardTitle>
              <CardDescription>
                Rincian rencana, realisasi, dan deviasi per periode
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : summary?.series?.length ? (
            <>
              {/* Mobile */}
              <div className="space-y-2 lg:hidden">
                {summary.series.map((point) => (
                  <div
                    key={point.date}
                    className="rounded-xl border border-neutral-100 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-900">
                        {point.label}
                      </span>
                      {point.month && (
                        <Badge
                          size="sm"
                          className="bg-neutral-100 text-neutral-500 ring-neutral-500/20"
                        >
                          Bulan {point.month}
                        </Badge>
                      )}
                    </div>

                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-canvas py-2">
                        <dt className="text-[10px] text-neutral-400">Planned</dt>
                        <dd className="text-xs font-medium tabular-nums text-neutral-800">
                          {formatPercent(point.planned)}
                        </dd>
                      </div>

                      <div className="rounded-lg bg-canvas py-2">
                        <dt className="text-[10px] text-neutral-400">Actual</dt>
                        <dd className="text-xs font-medium tabular-nums text-neutral-800">
                          {formatPercent(point.actual)}
                        </dd>
                      </div>

                      <div className="rounded-lg bg-canvas py-2">
                        <dt className="text-[10px] text-neutral-400">Variance</dt>
                        <dd
                          className={`text-xs font-medium tabular-nums ${
                            point.variance === null
                              ? 'text-neutral-400'
                              : point.variance >= 0
                                ? 'text-emerald-600'
                                : 'text-rose-600'
                          }`}
                        >
                          {formatSignedPercent(point.variance)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden lg:block">
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Periode</Th>
                        <Th align="right">Planned</Th>
                        <Th align="right">Actual</Th>
                        <Th align="right">Variance</Th>
                        <Th align="right">Rencana Bulan Ini</Th>
                      </tr>
                    </thead>

                    <tbody>
                      {summary.series.map((point) => (
                        <Tr key={point.date}>
                          <Td>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-neutral-900">
                                {point.label}
                              </span>
                              {point.month && (
                                <Badge
                                  size="sm"
                                  className="bg-neutral-100 text-neutral-500 ring-neutral-500/20"
                                >
                                  B{point.month}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-neutral-400">
                              {point.date}
                            </p>
                          </Td>

                          <Td align="right" className="tabular-nums">
                            {formatPercent(point.planned)}
                          </Td>

                          <Td align="right" className="tabular-nums">
                            {formatPercent(point.actual)}
                          </Td>

                          <Td
                            align="right"
                            className={`tabular-nums ${
                              point.variance === null
                                ? 'text-neutral-400'
                                : point.variance >= 0
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                            }`}
                          >
                            {formatSignedPercent(point.variance)}
                          </Td>

                          <Td align="right" className="tabular-nums text-neutral-500">
                            {formatPercent(point.monthlyPlanned)}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>
            </>
          ) : (
            <EmptyState
              icon={BarChart3}
              compact
              title="Tabel kurva kosong"
              description="Belum ada periode rencana maupun realisasi yang dapat ditampilkan."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function KurvaSPage() {
  return (
    <AppShell title="Kurva S">
      <KurvaSContent />
    </AppShell>
  )
}