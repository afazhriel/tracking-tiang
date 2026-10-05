'use client'

import { cn } from '../../lib/utils'
import { tone } from '../../lib/theme'

const SIZES = {
  sm: 'text-[11px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
}

export function Badge({
  className,
  size = 'md',
  dot = false,
  tone: toneName,
  variant = 'soft',
  children,
  ...props
}) {
  const resolved = toneName ? tone(toneName) : null

  const variants = {
    soft: resolved ? resolved.soft : 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
    solid: resolved
      ? 'bg-brand-600 text-white ring-brand-700/30'
      : 'bg-neutral-900 text-white ring-neutral-900/20',
    outline: resolved
      ? resolved.outline
      : 'border border-neutral-300 bg-transparent text-neutral-600 ring-0',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        SIZES[size] || SIZES.md,
        variants[variant] || variants.soft,
        className
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current"
        />
      )}

      {children}
    </span>
  )
}

export function StatusBadge({ status, className, size = 'md', showDot = true }) {
  return (
    <Badge
      size={size}
      dot={showDot}
      className={cn(status?.badge, className)}
    >
      {status?.label ?? 'Tidak Diketahui'}
    </Badge>
  )
}

/** Badge nada statis — untuk label yang bukan status data. */
export function ToneBadge({ tone: toneName, children, className, ...props }) {
  return (
    <Badge
      tone={toneName}
      dot
      className={className}
      {...props}
    >
      {children}
    </Badge>
  )
}
