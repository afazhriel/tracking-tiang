'use client'

import { cn } from '../../lib/utils'
import { accentVars, tone } from '../../lib/theme'

/**
 * Kartu KPI.
 *
 * `tone` memberi karakter lewat tiga hal sekaligus:
 *  1. garis aksen di tepi atas,
 *  2. kotak ikon beraksen,
 *  3. warna angka utama.
 * Efeknya: baris KPI tidak lagi terlihat seperti kotak putih
 * yang disalin lima kali.
 */
export function StatCard({
  label,
  value,
  hint,
  Icon,
  tone: toneName = 'neutral',
  className,
  valueClassName,
  valueTone = false,
}) {
  const resolved = tone(toneName)

  return (
    <div
      style={accentVars(toneName)}
      className={cn(
        'accent-top surface-elevate rounded-card border border-neutral-200 px-4 py-4',
        'transition-shadow duration-200 hover:shadow-lift',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-neutral-500">{label}</p>

        {Icon && (
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              resolved.icon
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      <p
        className={cn(
          'mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight',
          valueTone ? resolved.text : 'text-neutral-900',
          valueClassName
        )}
      >
        {value}
      </p>

      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  )
}

export function StatCardGrid({ className, children, columns = 4 }) {
  const columnClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
  }

  return (
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        columnClass[columns] || columnClass[4],
        className
      )}
    >
      {children}
    </div>
  )
}
