'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CircleAlert,
  Gauge,
  MapPin,
  Minus,
  RefreshCw,
  Target,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../components/layout/PageHeader'
import { detailHref } from '../../lib/native'
import { useProject } from '../../lib/project-context'
import SCurveChart from '../../components/kurva-s/SCurveChart'
import CurveVarianceTable from '../../components/kurva-s/CurveVarianceTable'
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

  const polesLoader = useCallback(
    async () => (projectId ? await api.listPoles(projectId) : null),
    [projectId]
  )

  const {
    data: curve,
    error,
    loading,
    reload,
  } = useResource(curveLoader, [projectId], { enabled: Boolean(projectId) })

  const {
    data: polesPayload,
    loading: polesLoading,
  } = useResource(polesLoader, [projectId], { enabled: Boolean(projectId) })

  const summary = useMemo(() => (curve ? summarizeCurve(curve) : null), [curve])

  const poles = useMemo(
    () => polesPayload?.data ? polesPayload.data.map((p) => ({
      id: p.id,
      poleCode: p.pole_code,
      address: p.address,
      regionName: p.region?.name,
      hasCoordinate: p.latitude !== null && p.longitude !== null,
    })) : [],
    [polesPayload]
  )

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

      {/* Kurva S per Tiang - Clickable Cards */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
              <MapPin className="h-4 w-4" />
            </div>

            <div>
              <CardTitle>Kurva S per Tiang</CardTitle>
              <CardDescription>
                Klik tiang untuk melihat detail dan kurva S individual
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {polesLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 w-full rounded-xl bg-neutral-100" />
              ))}
            </div>
          ) : poles.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {poles.map((pole) => (
                <Link
                  key={pole.id}
                  href={detailHref('/tiang', pole.id)}
                  className="group rounded-xl border border-neutral-200 bg-paper p-4 transition-all hover:border-brand-300 hover:bg-brand-50 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">
                        {pole.poleCode}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500 truncate">
                        {pole.address ?? 'Alamat belum diisi'}
                      </p>
                      {pole.regionName && (
                        <p className="mt-1 text-xs text-neutral-400">
                          <MapPin className="inline h-3 w-3" />
                          {pole.regionName}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-medium text-neutral-500">
                        {pole.hasCoordinate ? 'Berkoordinat' : 'Tanpa koordinat'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                        <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                        Detail
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MapPin}
              compact
              title="Belum ada data tiang"
              description="Tiang akan muncul di sini setelah ditambahkan ke project."
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
          <CurveVarianceTable
            series={summary?.series ?? []}
            loading={loading}
          />
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