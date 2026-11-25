'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

import { cn } from '../../lib/utils'

/**
 * Dialog responsif.
 *
 * Satu komponen untuk dua kebutuhan: `Modal` (desktop) dan
 * `Sheet` (mobile). Keduanya menutup dengan Escape, mengunci scroll
 * body, memindahkan fokus ke panel saat terbuka, dan mengembalikan
 * fokus ke elemen pemicu saat ditutup â€” supaya bisa dioperasikan
 * sepenuhnya dari keyboard.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}) {
  const panelRef = useRef(null)
  const restoreFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement

    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }

      if (event.key !== 'Tab') return

      const focusables = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )

      if (!focusables?.length) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    /* Fokus masuk panel supaya screen reader langsung membaca judul. */
    panelRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)

      const restore = restoreFocusRef.current

      if (restore && typeof restore.focus === 'function') restore.focus()
    }
  }, [onClose, open])

  if (!open) return null

  const widthClass = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-xl',
    lg: 'sm:max-w-3xl',
    xl: 'sm:max-w-5xl',
  }[size]

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Tutup dialog"
        onClick={onClose}
        className="absolute inset-0 bg-espresso-950/45 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-paper shadow-lift outline-none sm:rounded-card',
          widthClass,
          className
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-900">{title}</h2>

            {description && (
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 bg-neutral-50/60 px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/**
 * Field form dengan label, hint, dan pesan error.
 *
 * `error` diambil dari `error.fieldErrors` yang dikirim Laravel 422,
 * sehingga nama field yang sama dengan body request bisa langsung
 * ditandai tanpa mapping manual.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  className,
  children,
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-center gap-1 text-xs font-medium text-neutral-600"
      >
        {label}

        {required && (
          <span aria-hidden="true" className="text-clay-600">
            *
          </span>
        )}
      </label>

      {children}

      {error ? (
        <p className="mt-1.5 text-[11px] leading-5 text-clay-700">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-[11px] text-neutral-400">{hint}</p>
      )}
    </div>
  )
}

const INPUT_BASE =
  'h-10 w-full rounded-xl border bg-paper px-3 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:ring-2'

export function TextInput({ className, invalid, ...props }) {
  return (
    <input
      className={cn(
        INPUT_BASE,
        invalid
          ? 'border-clay-300 focus:border-clay-400 focus:ring-clay-100'
          : 'border-neutral-200 focus:border-brand-400 focus:ring-brand-100',
        className
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

export function TextArea({ className, invalid, rows = 3, ...props }) {
  return (
    <textarea
      rows={rows}
      className={cn(
        INPUT_BASE,
        'h-auto py-2.5 leading-6',
        invalid
          ? 'border-clay-300 focus:border-clay-400 focus:ring-clay-100'
          : 'border-neutral-200 focus:border-brand-400 focus:ring-brand-100',
        className
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

/** Select native â€” ringan dan otomatis benar di semua mobile browser. */
export function SelectInput({ className, invalid, children, ...props }) {
  return (
    <div className="relative">
      <select
        className={cn(
          INPUT_BASE,
          'appearance-none pr-8',
          invalid
            ? 'border-clay-300 focus:border-clay-400 focus:ring-clay-100'
            : 'border-neutral-200 focus:border-brand-400 focus:ring-brand-100',
          className
        )}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>

      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
      >
        <path
          d="M6 8l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

/** Tombol submit/aksi dengan state loading yang mengunci interaksi. */
export function SubmitButton({
  children,
  loading = false,
  loadingLabel,
  disabled,
  className,
  ...props
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white shadow-[0_8px_20px_-10px_rgba(201,111,66,.75)] transition-colors hover:bg-brand-700',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-60',
        className
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}

      {loading ? (loadingLabel ?? 'Menyimpan...') : children}
    </button>
  )
}


