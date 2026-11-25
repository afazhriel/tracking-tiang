'use client'

import { cn } from '../../lib/utils'
import { clampPercent, formatPercent } from '../../lib/format'
import { tone } from '../../lib/theme'

const HEIGHTS = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2.5',
}

export function ProgressBar({
  value,
  tone: toneName,
  size = 'sm',
  className,
  trackClassName,
  showLabel = false,
  label,
}) {
  const hasValue =
    value !== null && value !== undefined && Number.isFinite(Number(value))
  const percent = hasValue ? clampPercent(value) : 0

  /* Default-nya terracotta: warna progres adalah aksi utama di
     aplikasi ini, jadi tidak boleh berupa abu-abu. */
  const resolved = tone(toneName || 'brand')

  return (
    <div className={cn('w-full', className)}>
      {(showLabel || label !== undefined) && (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-xs text-neutral-500">{label}</span>
          <span className="text-xs font-medium tabular-nums text-neutral-700">
            {hasValue ? formatPercent(percent) : '—'}
          </span>
        </div>
      )}

      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-neutral-100 ring-1 ring-inset ring-neutral-200/70',
          HEIGHTS[size] || HEIGHTS.sm,
          trackClassName
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasValue ? percent : undefined}
        aria-label={typeof label === 'string' ? label : 'Progress'}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            hasValue ? resolved.bar : 'bg-neutral-200',
            !hasValue && 'w-0'
          )}
          style={
            hasValue
              ? { width: `${percent}%`, backgroundColor: resolved.hex }
              : undefined
          }
        />
      </div>
    </div>
  )
}
