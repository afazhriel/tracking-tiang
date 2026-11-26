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
        'accent-top surface-elevate rounded-card border border-neutral-200 px-3.5 py-3',
        'transition-shadow duration-200 hover:shadow-lift',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-neutral-500">{label}</p>

        {Icon && (
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              resolved.icon
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      <p
        className={cn(
          'mt-1.5 font-display text-xl font-semibold tabular-nums tracking-tight',
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
  /* Satu susunan di semua lebar layar — sama seperti mobile. */
  const columnClass = {
    2: 'grid-cols-1',
    3: 'grid-cols-1',
    4: 'grid-cols-2',
  }

  return (
    <div
      className={cn(
        'grid gap-3',
        columnClass[columns] || columnClass[4],
        className
      )}
    >
      {children}
    </div>
  )
}
