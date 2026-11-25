'use client'

import dynamic from 'next/dynamic'

const AktivitasPage = dynamic(() => import('./AktivitasPage'), {
  ssr: false,
})

export default function Page() {
  return <AktivitasPage />
}