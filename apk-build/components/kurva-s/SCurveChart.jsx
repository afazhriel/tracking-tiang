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
 * Planned  = espresso  (netral, "rencana")
 * Actual   = lagoon    (warna aksi / data lapangan)
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
            Planned
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
            Actual
          </span>
          <span className="font-medium tabular-nums text-neutral-800">
            {formatPercent(point.actual)}
          </span>
        </li>

        <li className="flex items-center justify-between gap-6 border-t border-neutral-100 pt-1.5 text-xs">
          <span className="text-neutral-500">Variance</span>
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

  return (
    <div style={{ height }} className="w-full">
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
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
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
            name="Planned"
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
            name="Actual"
            stroke={ACTUAL_HEX}
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: ACTUAL_HEX, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}