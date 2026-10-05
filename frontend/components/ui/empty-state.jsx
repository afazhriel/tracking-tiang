'use client'

import { cn } from '../../lib/utils'
import { Inbox } from 'lucide-react'
import { tone } from '../../lib/theme'

/**
 * Empty state profesional.
 * Dipakai ketika endpoint belum tersedia atau memang tidak ada data.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  hint,
  action,
  className,
  compact = false,
  tone: toneName = 'brand',
}) {
  const resolved = tone(toneName)

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-neutral-300 bg-paper/70 text-center',
        compact ? 'px-5 py-8' : 'px-6 py-14',
        className
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-card ring-1 ring-inset ring-black/5',
          resolved.icon
        )}
      >
        <Icon className="h-5 w-5" />
      </span>

      <h3 className="mt-4 text-sm font-semibold text-neutral-800">{title}</h3>

      {description && (
        <p className="mt-2 max-w-md text-sm leading-6 text-neutral-500">
          {description}
        </p>
      )}

      {hint && (
        <span
          className={cn(
            'mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset',
            resolved.soft
          )}
        >
          {hint}
        </span>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
