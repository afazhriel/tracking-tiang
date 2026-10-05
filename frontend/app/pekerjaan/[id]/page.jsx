'use client'

import dynamic from 'next/dynamic'

const PekerjaanDetailPage = dynamic(() => import('./PekerjaanDetailPage'), {
  ssr: false,
})

export default function Page() {
  return <PekerjaanDetailPage />
}