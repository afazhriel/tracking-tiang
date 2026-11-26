'use client'

import dynamic from 'next/dynamic'

const SuratJobPage = dynamic(() => import('./SuratJobPage'), {
  ssr: false,
})

export default function Page() {
  return <SuratJobPage />
}
