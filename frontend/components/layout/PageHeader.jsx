'use client'

import Link from 'next/link'

import { cn } from '../../lib/utils'
import { tone } from '../../lib/theme'

/**
 * Header section yang dipakai semua halaman internal.
 *
 * `eyebrow` diberi titik aksen + garis pendek agar kata kunci
 * halaman tidak lagi terbaca sebagai teks abu-abu tanpa bentuk.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  tone: toneName = 'brand',
  className,
}) {
  const resolved = tone(toneName)

  return (
    <section
      className={cn(
        'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-6 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${resolved.from}, ${resolved.to})`,
              }}
            />
            <span style={{ color: resolved.hex }}>{eyebrow}</span>
          </p>
        )}

        <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">{subtitle}</p>
        )}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  )
}

export function ActionButton({
  href,
  onClick,
  children,
  icon: Icon,
  variant = 'outline',
  tone: toneName,
  className,
  disabled = false,
  type = 'button',
  ...props
}) {
  const resolved = tone(toneName)

  const classes = cn(
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:pointer-events-none disabled:opacity-50',
    variant === 'primary'
      ? 'bg-brand-600 text-white shadow-[0_8px_20px_-10px_rgba(201,111,66,.75)] hover:bg-brand-700'
      : variant === 'accent'
        ? resolved.solid
        : variant === 'subtle'
          ? 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'
          : toneName
            ? resolved.outline
            : 'border border-neutral-200 bg-paper text-neutral-700 shadow-card hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
    className
  )

  const content = (
    <>
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        aria-disabled={disabled || undefined}
        className={classes}
        {...props}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={classes}
      {...props}
    >
      {content}
    </button>
  )
}
