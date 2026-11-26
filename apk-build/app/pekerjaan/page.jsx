'use client'

import dynamic from 'next/dynamic'

const PekerjaanPage = dynamic(() => import('./PekerjaanPage'), {
  ssr: false,
})

export default function Page() {
  return <PekerjaanPage />
}