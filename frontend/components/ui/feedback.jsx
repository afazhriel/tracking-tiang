'use client'

import { cn } from '../../lib/utils'
import { Spinner } from './states'

export function InlineLoader({ label = 'Memuat...', className }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-3 rounded-card border border-dashed border-neutral-300 bg-paper/70 px-4 py-8 text-sm text-neutral-500',
        className
      )}
    >
      <Spinner />
      {label}
    </div>
  )
}

export function MetricList({ items = [], className }) {
  return (
    <dl className={cn('space-y-2', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between gap-3"
        >
          <dt className="text-xs text-neutral-400">{item.label}</dt>
          <dd className="text-xs font-medium text-neutral-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function SectionNote({ children, className }) {
  return (
    <p className={cn('text-[11px] leading-5 text-neutral-400', className)}>
      {children}
    </p>
  )
}
