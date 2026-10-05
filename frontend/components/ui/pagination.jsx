'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '../../lib/utils'
import { formatNumber } from '../../lib/format'

const NAV_BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-paper text-neutral-600 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:bg-paper disabled:hover:text-neutral-600'

export function Pagination({ meta, onChange, className }) {
  if (!meta) return null

  const currentPage = meta.current_page ?? 1
  const lastPage = meta.last_page ?? 1
  const total = meta.total ?? 0
  const from = meta.from ?? (total === 0 ? 0 : (currentPage - 1) * (meta.per_page ?? 0) + 1)
  const to = meta.to ?? from

  if (lastPage <= 1) {
    return (
      <p className={cn('text-xs text-neutral-400', className)}>
        Menampilkan {formatNumber(from)}–{formatNumber(to)} dari{' '}
        {formatNumber(total)} data
      </p>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-3 sm:flex-row',
        className
      )}
    >
      <p className="text-xs text-neutral-400">
        Menampilkan {formatNumber(from)}–{formatNumber(to)} dari{' '}
        {formatNumber(total)} data
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onChange?.(currentPage - 1)}
          aria-label="Halaman sebelumnya"
          className={NAV_BUTTON}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-medium tabular-nums text-neutral-600">
          {formatNumber(currentPage)} / {formatNumber(lastPage)}
        </span>

        <button
          type="button"
          disabled={currentPage >= lastPage}
          onClick={() => onChange?.(currentPage + 1)}
          aria-label="Halaman berikutnya"
          className={NAV_BUTTON}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
