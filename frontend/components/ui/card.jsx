'use client'

import { cn } from '../../lib/utils'
import { accentVars, tone } from '../../lib/theme'

/**
 * Kartu = permukaan utama aplikasi.
 *
 * `tone` memberi garis aksen 3px di tepi atas sehingga sekumpulan
 * kartu bisa dibedakan nadanya tanpa menambah kotak dekoratif.
 */
export function Card({ className, children, tone: toneName, ...props }) {
  return (
    <div
      style={toneName ? accentVars(toneName) : undefined}
      className={cn(
        'surface-elevate rounded-card border border-neutral-200',
        toneName && 'accent-top',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 border-b border-neutral-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h2
      className={cn('text-base font-semibold text-neutral-900', className)}
      {...props}
    >
      {children}
    </h2>
  )
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p
      className={cn('text-sm text-neutral-500', className)}
      {...props}
    >
      {children}
    </p>
  )
}

export function CardContent({ className, children, ...props }) {
  return (
    <div
      className={cn('px-4 py-4 sm:px-5 sm:py-5', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Judul section dengan ikon kotak beraksen.
 * Menggantikan pola `h-9 w-9 rounded-xl bg-neutral-100` yang
 * diulang di tujuh halaman — sekarang warnanya bisa varies.
 */
export function CardHeading({ Icon, title, description, tone: toneName = 'brand', className }) {
  const resolved = tone(toneName)

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          resolved.icon
        )}
      >
        {Icon && <Icon className="h-4 w-4" />}
      </div>

      <div className="min-w-0">
        <CardTitle>{title}</CardTitle>

        {description && <CardDescription>{description}</CardDescription>}
      </div>
    </div>
  )
}
