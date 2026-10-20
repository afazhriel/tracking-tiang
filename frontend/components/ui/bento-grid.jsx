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
        /* Tinggi kartu dulu dipaku 22rem di SEMUA ukuran layar. Di
           ponsel itu berarti setiap pintasan setinggi ±352px — hanya
           satu kartu terlihat per layar dan halaman terasa kosong.
           Sekarang: tinggi otomatis di mobile (`auto-rows-[13rem]`
           masih memberi bentuk bento yang seragam), baru dipaku
           22rem dan dibagi 3 kolom sejak `lg`. */
        'grid w-full auto-rows-[13rem] grid-cols-1 gap-4',
        'sm:auto-rows-[15rem]',
        'lg:auto-rows-[22rem] lg:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Kartu bento untuk pintasan modul.
 *
 * Setiap kartu punya nada sendiri (`tone`): garis aksen, warna ikon,
 * dan kabut latar yang bergerak saat hover. Inilah sumber
 * keragaman warna di dashboard — tanpa memecah design system.
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
        'group accent-top surface-elevate relative col-span-3 flex flex-col justify-between overflow-hidden rounded-card border border-neutral-200',
        'shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
        className
      )}
      style={{
        '--accent-from': resolved.from,
        '--accent-to': resolved.to,
      }}
    >
      {/* Kabut warna: memberi kedalaman tanpa menambah elemen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-60 blur-2xl transition-all duration-500 group-hover:opacity-90 group-hover:scale-110"
        style={{ backgroundColor: resolved.hex }}
      />

      {/* Jejak teknis tipis: ditegaskan agar terasa seperti
          papan kontrol, bukan kartu promosi. */}
      <div
        aria-hidden="true"
        className="grid-paper pointer-events-none absolute inset-0 opacity-35"
      />

      <div className="pointer-events-none relative z-10 flex flex-col gap-1 p-5 transition-all duration-300 sm:p-6 lg:group-hover:-translate-y-10">
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-card ring-1 ring-inset ring-black/5',
            resolved.icon
          )}
        >
          <Icon className="h-6 w-6" />
        </span>

        <h3 className="mt-4 font-display text-xl font-semibold text-neutral-900">
          {name}
        </h3>

        <p className="max-w-lg text-sm leading-6 text-neutral-500">
          {description}
        </p>
      </div>

      {/* Aksi kartu.
          Sebelumnya panel ini `absolute bottom-0 translate-y-10
          opacity-0` dan hanya muncul saat `group-hover`. Perangkat
          sentuh tidak punya hover, jadi tombol "Lihat tiang" dan
          badge TIDAK PERNAH bisa diklik di ponsel.
          Sekarang statis (selalu terlihat) di layar kecil, dan baru
          memakai animasi hover sejak `lg` tempat kursor memang ada. */}
      <div className="relative z-10 flex w-full flex-wrap items-center gap-3 px-5 pb-5 sm:px-6 sm:pb-6 lg:pointer-events-none lg:absolute lg:bottom-0 lg:translate-y-10 lg:p-4 lg:opacity-0 lg:transition-all lg:duration-300 lg:group-hover:translate-y-0 lg:group-hover:opacity-100">
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
