'use client'

import dynamic from 'next/dynamic'

import { cn } from '../../lib/utils'
import { Spinner } from '../ui/states'

const TiangMap = dynamic(() => import('./TiangMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-card border border-neutral-200 bg-neutral-100">
      <span className="flex items-center gap-2 text-xs text-neutral-400">
        <Spinner />
        Menyiapkan peta...
      </span>
    </div>
  ),
})

/**
 * Wrapper agar Leaflet hanya dirender di browser (tidak SSR).
 */
export default function MapPanel({ className, ...props }) {
  return (
    <div className={cn('overflow-hidden', className)}>
      <TiangMap {...props} />
    </div>
  )
}