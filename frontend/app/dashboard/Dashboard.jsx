'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileText,
  Globe2,
  Layers,
  MapPin,
  RefreshCw,
  Users,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { useProject } from '../../lib/project-context'
import {
  BentoCard,
  BentoGrid,
} from '../../components/ui/bento-grid'
import { Badge, StatusBadge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardHeading,
} from '../../components/ui/card'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import { ProgressBar } from '../../components/ui/progress-bar'
import { EmptyState } from '../../components/ui/empty-state'
import { ErrorNotice } from '../../components/ui/states'
import { accentVars, tone } from '../../lib/theme'
import { cn } from '../../lib/utils'
import { api } from '../../lib/api'
import { useResource } from '../../lib/use-api'
import { summarizeCurve } from '../../lib/curve'
import { resolveStatus } from '../../lib/status'
import {
  formatDate,
  formatDays,
  formatNumber,
  formatPercent,
} from '../../lib/format'

/**
 * Metrik kecil di dalam kartu ringkasan.
 *
 * Dulu enam kotak abu-abu-identik. Sekarang setiap metrik punya
 * nada sendiri sehingga urutan data mudah dipindai mata.
 */
function MiniMetric({ label, value, tone: toneName }) {
  const resolved = tone(toneName)

  return (
    <div
      style={accentVars(toneName)}
      className={cn(
        'accent-top rounded-xl border border-neutral-200/80 bg-paper px-4 py-3',
        resolved.hover
      )}
    >
      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: resolved.hex }}
        />
        {label}
      </p>

      <p className="mt-1.5 font-display text-base font-semibold tabular-nums text-neutral-900">
        {value}
      </p>
    </div>
  )
}

function DashboardContent() {
  const { project, projectId, regions, workItems, polesCount } = useProject()

  const curveLoader = useCallback(
    async () => (projectId ? await api.getCurve(projectId) : null),
    [projectId]
  )

  const {
    data: curve,
    error: curveError,
    loading: curveLoading,
    reload: reloadCurve,
  } = useResource(curveLoader, [projectId], { enabled: Boolean(projectId) })

  const summary = curve ? summarizeCurve(curve) : null

  const totalTargetPoles = project?.totalTargetPoles ?? null
  const registeredPoles = polesCount ?? null

  const periodIndex =
    summary?.currentPeriod !== null && summary?.currentPeriod !== undefined
      ? `B${summary.currentPeriod}`
      : '—'

  const projectStatus = resolveStatus(project?.status)
  const actualProgress = summary?.actualProgress ?? null

  const features = [
    {
      Icon: MapPin,
      name: 'Monitoring Tiang',
      description:
        'Pantau lokasi dan kondisi seluruh titik tiang dalam satu tampilan.',
      href: '/tiang',
      cta: 'Lihat tiang',
      tone: 'lagoon',
      footer: (
        <Badge size="sm" tone="lagoon" className="pointer-events-auto">
          {formatNumber(registeredPoles)} terdaftar
        </Badge>
      ),
      className: 'lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3',
    },
    {
      Icon: ClipboardList,
      name: 'Progress Pekerjaan',
      description:
        'Lihat pekerjaan dan perkembangan pelaksanaan proyek secara ringkas.',
      href: '/pekerjaan',
      cta: 'Lihat pekerjaan',
      tone: 'sage',
      footer: (
        <Badge size="sm" tone="sage" className="pointer-events-auto">
          {formatNumber(workItems.length)} item
        </Badge>
      ),
      className: 'lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-4',
    },
    {
      Icon: BarChart3,
      name: 'Kurva S',
      description:
        'Bandingkan rencana dan aktual perkembangan proyek.',
      href: '/kurva-s',
      cta: 'Buka Kurva S',
      tone: 'ochre',
      footer: summary?.variance !== null && summary?.variance !== undefined ? (
        <Badge
          size="sm"
          tone={summary.variance >= 0 ? 'sage' : 'clay'}
          className="pointer-events-auto"
        >
          Deviasi {formatPercent(summary.variance, 2)}
        </Badge>
      ) : null,
      className: 'lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-2',
    },
    {
      Icon: Users,
      name: 'Tim Lapangan',
      description:
        'Akses informasi tim dan aktivitas pelaksanaan lapangan.',
      href: '/aktivitas',
      cta: 'Lihat aktivitas',
      tone: 'plum',
      className: 'lg:col-start-3 lg:col-end-4 lg:row-start-2 lg:row-end-4',
    },
  ]

  const weightTotal = workItems.reduce((total, item) => total + Number(item.weight_percent || 0), 0)
  const durationMonths =
    project?.startDate && project?.endDate
      ? Math.max(
          1,
          Math.round(
            (new Date(project.endDate) - new Date(project.startDate)) /
              (1000 * 60 * 60 * 24 * 30.44)
          )
        )
      : null

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-neutral-500">
            <CalendarDays className="h-4 w-4 text-brand-600" />
            {project?.startDate
              ? `${formatDate(project.startDate)} — ${
                  project.endDate ? formatDate(project.endDate) : '…'
                }`
              : 'Periode proyek belum tersedia'}
          </p>

          <h2 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            {project?.name ?? 'Tracking Tiang'}
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">
            Satu tempat untuk memantau lokasi, pekerjaan, progres, aktivitas, dan
            perkembangan proyek.
          </p>
        </div>

        <StatCardGrid columns={4} className="sm:max-w-2xl xl:w-[46rem]">
          <StatCard
            label="Tiang"
            value={formatNumber(registeredPoles)}
            Icon={MapPin}
            tone="lagoon"
            valueTone
          />

          <StatCard
            label="Progress"
            value={curveLoading ? '…' : formatPercent(actualProgress)}
            Icon={BarChart3}
            tone="sage"
            valueTone
          />

          <StatCard
            label="Periode"
            value={periodIndex}
            Icon={CalendarDays}
            tone="ochre"
            valueTone
          />

          <div
            style={accentVars('plum')}
            className="accent-top surface-elevate rounded-card border border-neutral-200 px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium text-neutral-500">Status</p>

              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-plum-50 text-plum-700">
                <Activity className="h-4 w-4" />
              </span>
            </div>

            <StatusBadge
              size="sm"
              status={projectStatus}
              className="mt-2"
            />
          </div>
        </StatCardGrid>
      </section>

      {curveError && (
        <ErrorNotice
          error={curveError}
          onRetry={reloadCurve}
          title="Data kurva S belum dapat dimuat"
        />
      )}

      <BentoGrid className="lg:grid-rows-3">
        {features.map((feature) => (
          <BentoCard
            key={feature.name}
            {...feature}
          />
        ))}
      </BentoGrid>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" tone="brand">
          <CardHeader>
            <CardHeading
              Icon={FileText}
              title="Ringkasan Proyek"
              description="Informasi utama project tracking"
              tone="brand"
            />

            <Link
              href="/kurva-s"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-paper px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              Analisa kurva
            </Link>
          </CardHeader>

          <CardContent>
            {project ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <MiniMetric
                    label="Kode Project"
                    value={project.code ?? '—'}
                    tone="ochre"
                  />
                  <MiniMetric
                    label="Target Tiang"
                    value={`${formatNumber(totalTargetPoles)} titik`}
                    tone="lagoon"
                  />
                  <MiniMetric
                    label="Durasi"
                    value={durationMonths ? `${formatNumber(durationMonths)} bulan` : '—'}
                    tone="plum"
                  />
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <MiniMetric
                    label="Item Pekerjaan"
                    value={`${formatNumber(workItems.length)} item`}
                    tone="sage"
                  />
                  <MiniMetric
                    label="Wilayah"
                    value={`${formatNumber(regions.length)} wilayah`}
                    tone="brand"
                  />
                  <MiniMetric
                    label="Total Bobot"
                    value={
                      workItems.length ? formatPercent(weightTotal, 2) : '—'
                    }
                    tone="clay"
                  />
                </div>

                <div className="mt-5">
                  <ProgressBar
                    value={actualProgress}
                    label="Realisasi progress keseluruhan"
                    showLabel
                    size="md"
                  />
                </div>
              </>
            ) : (
              <EmptyState
                icon={Layers}
                compact
                title="Data project belum tersedia"
                description="Informasi ringkasan akan tampil otomatis setelah endpoint /api/projects dapat diakses."
              />
            )}
          </CardContent>
        </Card>

        <div className="accent-top relative col-span-3 lg:col-span-1 flex flex-col justify-between overflow-hidden rounded-card border border-espresso-800 bg-espresso-900 p-6 text-espresso-50 shadow-[0_18px_40px_-24px_rgba(43,32,24,.8)] [--accent-from:var(--color-lagoon-400)] [--accent-to:var(--color-brand-400)]">
          {/* Kabut lagoon: satu-satunya ungu/kolom dingin di halaman
              ini, dipakai untuk menandai panel "monitoring". */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-lagoon-500/25 blur-3xl"
          />

          <div
            aria-hidden="true"
            className="grid-paper pointer-events-none absolute inset-0 opacity-[.18]"
          />

          <div className="relative">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-card bg-lagoon-500/15 text-lagoon-300 ring-1 ring-inset ring-lagoon-400/30">
              <Globe2 className="h-5 w-5" />
            </span>

            <h3 className="mt-8 font-display text-lg font-semibold">
              Monitoring Lapangan
            </h3>

            <p className="mt-2 max-w-md text-sm leading-6 text-espresso-200/80">
              Data lapangan terhubung ke dashboard sehingga perkembangan proyek
              lebih mudah dipantau.
            </p>
          </div>

          <div className="relative mt-auto pt-6">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-espresso-300/70">
              <span aria-hidden="true" className="h-1.5 w-6 rounded-full bg-brand-400" />
              Progres terbaru
            </p>

            <ul className="mt-3 space-y-2 text-sm text-espresso-100/90">
              <li>
                <Link
                  href="/tiang"
                  className="inline-flex items-center gap-2 transition-colors hover:text-white"
                >
                  <MapPin className="h-3.5 w-3.5 text-lagoon-300" />
                  {formatNumber(registeredPoles)} titik tiang terdaftar
                </Link>
              </li>
              <li>
                <Link
                  href="/pekerjaan"
                  className="inline-flex items-center gap-2 transition-colors hover:text-white"
                >
                  <ClipboardList className="h-3.5 w-3.5 text-lagoon-300" />
                  {formatNumber(workItems.length)} item pekerjaan
                </Link>
              </li>
              <li>
                <Link
                  href="/aktivitas"
                  className="inline-flex items-center gap-2 transition-colors hover:text-white"
                >
                  <Activity className="h-3.5 w-3.5 text-lagoon-300" />
                  Riwayat aktivitas lapangan
                </Link>
              </li>
            </ul>

            <button
              type="button"
              onClick={reloadCurve}
              className="mt-6 inline-flex h-9 items-center gap-2 rounded-xl bg-paper/10 px-3 text-xs font-medium text-white ring-1 ring-inset ring-paper/20 transition-colors hover:bg-paper/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Muat ulang data
            </button>

            <p className="mt-4 text-xs text-espresso-300/60">
              Durasi rencana:{' '}
              {durationMonths ? `${formatNumber(durationMonths)} bulan` : formatDays(null)}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function Dashboard() {
  return (
    <AppShell title="Dashboard">
      <DashboardContent />
    </AppShell>
  )
}