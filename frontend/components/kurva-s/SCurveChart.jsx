'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatPercent, formatSignedPercent } from '../../lib/format'
import { toneHex } from '../../lib/theme'

/**
 * Warna seri diambil dari lib/theme.js, bukan hex hardcode,
 * supaya garis kurva S ikut berubah kalau palet aplikasi berubah.
 *
 * Rencana  = espresso  (netral, "rencana")
 * Realisasi   = lagoon    (warna aksi / data lapangan)
 */
const PLANNED_HEX = toneHex('espresso')
const ACTUAL_HEX = toneHex('lagoon')

const AXIS_TEXT = toneHex('sand')
const GRID_STROKE = '#e7e0d6'

const AXIS_STYLE = {
  fontSize: 11,
  fill: AXIS_TEXT,
}

function CurveTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload ?? {}

  return (
    <div className="rounded-xl border border-neutral-200 bg-paper px-3.5 py-3 shadow-lift">
      <p className="text-xs font-semibold text-neutral-800">{label}</p>

      <ul className="mt-2 space-y-1.5">
        <li className="flex items-center justify-between gap-6 text-xs">
          <span className="flex items-center gap-1.5 text-neutral-500">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: PLANNED_HEX }}
            />
            Rencana
          </span>
          <span className="font-medium tabular-nums text-neutral-800">
            {formatPercent(point.planned)}
          </span>
        </li>

        <li className="flex items-center justify-between gap-6 text-xs">
          <span className="flex items-center gap-1.5 text-neutral-500">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: ACTUAL_HEX }}
            />
            Realisasi
          </span>
          <span className="font-medium tabular-nums text-neutral-800">
            {formatPercent(point.actual)}
          </span>
        </li>

        <li className="flex items-center justify-between gap-6 border-t border-neutral-100 pt-1.5 text-xs">
          <span className="text-neutral-500">Selisih</span>
          <span
            className={`font-medium tabular-nums ${
              point.variance === null
                ? 'text-neutral-400'
                : point.variance >= 0
                  ? 'text-emerald-600'
                  : 'text-rose-600'
            }`}
          >
            {formatSignedPercent(point.variance)}
          </span>
        </li>
      </ul>
    </div>
  )
}

export default function SCurveChart({ series = [], height = 380 }) {
  const hasData = series.some(
    (point) => point.planned !== null || point.actual !== null
  )

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-card border border-dashed border-neutral-300 bg-paper/70"
      >
        <p className="text-sm text-neutral-500">
          Data kurva belum tersedia untuk ditampilkan.
        </p>
      </div>
    )
  }

  const values = series.flatMap(point => [point.planned, point.actual]).filter(Number.isFinite)
  const largest = Math.max(0, ...values)
  const axisMax = largest <= 10 ? 10 : largest <= 20 ? 20 : largest <= 50 ? 50 : 100

  return (
    <div className="w-full">
      <p className="mb-2 text-xs text-neutral-500">Skala 0–{axisMax}% agar perubahan progres mudah terlihat. Target penuh tetap 100%.</p>
      <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={series}
          margin={{ top: 8, right: 12, bottom: 4, left: -12 }}
        >
          <CartesianGrid
            stroke={GRID_STROKE}
            strokeDasharray="3 3"
            vertical={false}
          />

          <XAxis
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: GRID_STROKE }}
            minTickGap={16}
          />

          <YAxis
            domain={[0, axisMax]}
            ticks={[0, axisMax / 2, axisMax]}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}%`}
            width={52}
          />

          <Tooltip
            content={<CurveTooltip />}
            cursor={{ stroke: '#d6cec1', strokeDasharray: '4 4' }}
          />

          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="plainline"
            wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }}
          />

          <Line
            type="stepAfter"
            dataKey="planned"
            name="Rencana"
            stroke={PLANNED_HEX}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />

          <Line
            type="monotone"
            dataKey="actual"
            name="Realisasi"
            stroke={ACTUAL_HEX}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}