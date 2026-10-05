'use client'

import dynamic from 'next/dynamic'

const NotifikasiPage = dynamic(() => import('./NotifikasiPage'), {
  ssr: false,
})

export default function Page() {
  return <NotifikasiPage />
}