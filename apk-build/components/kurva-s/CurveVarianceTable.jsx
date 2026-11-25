'use client'

import { BarChart3 } from 'lucide-react'

import { Badge } from '../ui/badge'
import { EmptyState } from '../ui/empty-state'
import { Skeleton } from '../ui/states'
import { Table, TableWrap, Td, Th, Tr } from '../ui/table'
import { formatPercent, formatSignedPercent } from '../../lib/format'

function varianceClassName(variance) {
  if (variance === null || variance === undefined) return 'text-neutral-400'

  return variance >= 0 ? 'text-emerald-600' : 'text-rose-600'
}

/**
 * Tabel rincian Kurva S per periode: rencana, realisasi, dan variance.
 *
 * Dipakai bersama oleh halaman Kurva S proyek dan kartu Kurva S per
 * tiang di halaman detail tiang, supaya tampilan keduanya konsisten.
 */
export default function CurveVarianceTable({
  series = [],
  loading = false,
  emptyTitle = 'Tabel kurva kosong',
  emptyDescription = 'Belum ada periode rencana maupun realisasi yang dapat ditampilkan.',
}) {
  if (loading) {
    return <Skeleton className="h-64 w-full" />
  }

  if (!series.length) {
    return (
      <EmptyState
        icon={BarChart3}
        compact
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <>
      {/* Mobile */}
      <div className="space-y-2 lg:hidden">
        {series.map((point) => (
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
                  className={`text-xs font-medium tabular-nums ${varianceClassName(
                    point.variance
                  )}`}
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
              {series.map((point) => (
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
                    className={`tabular-nums ${varianceClassName(point.variance)}`}
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
  )
}
