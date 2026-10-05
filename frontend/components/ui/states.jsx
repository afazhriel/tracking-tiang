'use client'

import { CircleAlert, RefreshCw, ServerCrash } from 'lucide-react'

import { cn } from '../../lib/utils'
import { tone } from '../../lib/theme'

function resolveMessage(error) {
  if (!error) return 'Permintaan gagal.'

  if (error.isNetworkError) return error.message

  if (error.isNotFound) {
    return 'Endpoint belum tersedia pada backend Laravel.'
  }

  return error.message || 'Permintaan gagal.'
}

/**
 * Notice ringan untuk kegagalan request.
 *
 * Sengaja memakai nada oker, bukan merah menyala: halaman tetap
 * terasa tenang (project control room) namun tetap jujur soal
 * kondisi sistem.
 */
export function ErrorNotice({
  error,
  onRetry,
  className,
  compact = false,
  title = 'Gagal memuat data',
}) {
  if (!error) return null

  const resolved = tone('ochre')

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-card border border-amber-300/70 bg-amber-50/80 sm:flex-row sm:items-center sm:justify-between',
        compact ? 'px-4 py-3' : 'px-4 py-4 sm:px-5',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper',
            resolved.icon
          )}
        >
          {error.isNetworkError ? (
            <ServerCrash className="h-4 w-4" />
          ) : (
            <CircleAlert className="h-4 w-4" />
          )}
        </span>

        <div>
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-amber-800">{resolveMessage(error)}</p>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-paper px-3 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-300 transition-colors hover:bg-amber-100 sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Coba lagi
        </button>
      )}
    </div>
  )
}

export function Skeleton({ className }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-gradient-to-r from-neutral-100 via-neutral-200/70 to-neutral-100',
        className
      )}
    />
  )
}

export function SkeletonRows({ rows = 4, className }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-16 w-full"
        />
      ))}
    </div>
  )
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  )
}

export function Spinner({ className }) {
  return (
    <span
      role="status"
      aria-label="Memuat"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-brand-600',
        className
      )}
    />
  )
}
