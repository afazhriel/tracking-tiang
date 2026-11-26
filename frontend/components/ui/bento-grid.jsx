'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Button } from './button'
import { tone } from '../../lib/theme'

export function BentoGrid({ children, className }) {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-1 gap-3',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Kartu pintasan modul.
 *
 * Satu kartu satu nada (`tone`): garis aksen atas, warna ikon, dan
 * tombol. Tidak ada lagi kabut warna di belakang teks — teks selalu
 * duduk di latar kertas polos supaya kontrasnya aman dan terbaca.
 * Tombol aksi selalu terlihat (bukan muncul saat hover) supaya
 * jelas di layar sentuh dan alurnya langsung kebaca.
 */
export function BentoCard({
  name,
  className,
  Icon,
  description,
  href = '#',
  cta = 'Buka',
  footer,
  tone: toneName = 'brand',
}) {
  const resolved = tone(toneName)

  return (
    <div
      className={cn(
        'group accent-top surface-elevate relative flex flex-col overflow-hidden rounded-card border border-neutral-200',
        'shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
        className
      )}
      style={{
        '--accent-from': resolved.from,
        '--accent-to': resolved.to,
      }}
    >
      <div className="pointer-events-none relative z-10 flex flex-col gap-1 p-5 pb-1.5">
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-card ring-1 ring-inset ring-black/5',
            resolved.icon
          )}
        >
          <Icon className="h-5 w-5" />
        </span>

        <h3 className="mt-3 font-display text-lg font-semibold text-neutral-900">
          {name}
        </h3>

        <p className="max-w-lg text-sm leading-6 text-neutral-600">
          {description}
        </p>
      </div>

      <div className="pointer-events-none relative z-10 mt-auto flex w-full flex-wrap items-center gap-3 p-5 pt-4">
        <Button
          variant="accent"
          tone={toneName}
          asChild
          size="sm"
          className="pointer-events-auto"
        >
          <Link href={href}>
            {cta}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>

        {footer}
      </div>

      <Link
        href={href}
        aria-label={`${cta} ${name}`}
        className="absolute inset-0 z-0"
      >
        <span className="sr-only">{name}</span>
      </Link>

      <div className="pointer-events-none absolute inset-0 z-10 transition-all duration-300 group-hover:bg-black/[.02]" />
    </div>
  )
}
