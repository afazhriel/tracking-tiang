'use client'

import { CircleAlert, TrendingUp } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'
import { Button } from '../../components/ui/button'
import { api, normalizeKpi, unwrapList } from '../../lib/api'
import { useCurrentUser } from '../../lib/use-current-user'
import { useResource } from '../../lib/use-api'
import { formatNumber, formatPercent } from '../../lib/format'

function KpiNumbers({ kpi }) {
  const items = [
    { label: 'Lokasi ditugaskan', value: formatNumber(kpi.assigned) },
    { label: 'Selesai', value: formatNumber(kpi.done) },
    { label: 'Rata-rata progres', value: formatPercent(kpi.avgProgress, 1) },
    { label: 'Tepat waktu', value: formatNumber(kpi.onTime) },
    { label: 'Terlambat', value: formatNumber(kpi.late), alert: kpi.late > 0 },
    { label: 'Catatan progres', value: formatNumber(kpi.progressRecords) },
  ]

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl bg-canvas px-3 py-2"
        >
          <p className="text-xs text-neutral-500">{item.label}</p>
          <p
            className={
              item.alert
                ? 'mt-0.5 text-lg font-semibold text-clay-700'
                : 'mt-0.5 text-lg font-semibold text-neutral-900'
            }
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function KpiCard({ row, isSelf }) {
  return (
    <div
      className={
        isSelf
          ? 'rounded-xl border border-brand-300 bg-brand-50/50 p-3'
          : 'rounded-xl border border-neutral-200 p-3'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-neutral-900">
          {isSelf ? 'Anda' : (row.user?.name ?? '—')}
        </p>

        {isSelf && <Badge tone="brand">KPI saya</Badge>}

        {row.user?.roleLabel && (
          <Badge variant="outline">{row.user.roleLabel}</Badge>
        )}

        {!isSelf && row.user?.email && (
          <span className="truncate text-xs text-neutral-400">
            {row.user.email}
          </span>
        )}
      </div>

      <KpiNumbers kpi={row} />
    </div>
  )
}

/**
 * KPI per user di halaman Tim.
 *
 * Aturan lihat ditegakkan server (`GET /api/kpi`): user biasa hanya
 * mendapat baris dirinya sendiri, PIC mendapat semua anggota
 * organisasinya, admin/supervisor mendapat semua. UI hanya
 * menampilkan apa yang dikembalikan server — KPI sendiri selalu
 * paling atas.
 */
export default function KpiSection() {
  const currentUser = useCurrentUser()

  const kpiResource = useResource(
    () =>
      api.listKpi().then((response) => unwrapList(response).map(normalizeKpi)),
    []
  )

  const rows = kpiResource.data ?? []
  const selfRow = rows.find((row) => Number(row.user?.id) === Number(currentUser?.id))
  const otherRows = rows.filter((row) => Number(row.user?.id) !== Number(currentUser?.id))
  const ordered = selfRow ? [selfRow, ...otherRows] : rows

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand-600" />
          {rows.length <= 1 ? 'KPI Saya' : 'KPI Tim'}
        </CardTitle>

        <Button
          variant="outline"
          size="sm"
          disabled={kpiResource.loading}
          onClick={() => kpiResource.reload()}
        >
          Muat ulang
        </Button>
      </CardHeader>

      <CardContent>
        {kpiResource.error ? (
          <EmptyState
            icon={CircleAlert}
            tone="clay"
            title="Gagal memuat KPI"
            description={kpiResource.error?.message}
            action={
              <Button variant="outline" onClick={() => kpiResource.reload()}>
                Coba lagi
              </Button>
            }
          />
        ) : kpiResource.loading ? (
          <p className="text-sm text-neutral-500">Memuat KPI…</p>
        ) : ordered.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="Belum ada KPI"
            description="Belum ada anggota aktif di organisasi ini."
          />
        ) : (
          <div className="space-y-3">
            {ordered.map((row) => (
              <KpiCard
                key={row.user?.id ?? 'self'}
                row={row}
                isSelf={Number(row.user?.id) === Number(currentUser?.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
