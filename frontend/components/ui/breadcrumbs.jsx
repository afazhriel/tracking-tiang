'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { cn } from '../../lib/utils'

export function Breadcrumbs({ items = [], className }) {
  if (!items.length) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex flex-wrap items-center gap-1 text-xs text-neutral-400', className)}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <span key={item.label} className="flex items-center gap-1">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="transition-colors hover:text-brand-700"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-brand-700' : ''}>
                {item.label}
              </span>
            )}

            {!isLast && <ChevronRight className="h-3 w-3 text-neutral-300" />}
          </span>
        )
      })}
    </nav>
  )
}
