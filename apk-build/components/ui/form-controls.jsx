'use client'

import { Search, X } from 'lucide-react'

import { cn } from '../../lib/utils'

export function SearchInput({
  value,
  onChange,
  placeholder = 'Cari...',
  className,
  inputClassName,
  ...props
}) {
  return (
    <div
      className={cn(
        'relative flex h-10 items-center rounded-xl border border-neutral-200 bg-paper transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100',
        className
      )}
    >
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-neutral-400" />

      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-full w-full bg-transparent pl-9 pr-9 text-sm text-neutral-800 outline-none placeholder:text-neutral-400',
          inputClassName
        )}
        {...props}
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Bersihkan pencarian"
          className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

const SELECT_BASE =
  'h-10 w-full appearance-none rounded-xl border border-neutral-200 bg-paper pl-3 pr-8 text-sm text-neutral-700 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

export function SelectField({
  value,
  onChange,
  options,
  label,
  placeholder = 'Semua',
  className,
  id,
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-medium text-neutral-500"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={SELECT_BASE}
        >
          {placeholder && <option value="all">{placeholder}</option>}

          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
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
    </div>
  )
}

export function FilterBar({ className, children }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 rounded-card border border-neutral-200 bg-paper p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4',
        className
      )}
    >
      {children}
    </div>
  )
}

export function SegmentedTabs({ items, value, onChange, className }) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex w-full gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1 sm:w-auto',
        className
      )}
    >
      {items.map((item) => {
        const isActive = item.value === value

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.value)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              isActive
                ? 'bg-paper text-brand-700 shadow-card'
                : 'text-neutral-500 hover:text-neutral-800'
            )}
          >
            {item.label}

            {typeof item.count === 'number' && item.count > 0 && (
              <span
                className={cn(
                  'ml-1.5 tabular-nums',
                  isActive ? 'text-brand-500' : 'text-neutral-400'
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
