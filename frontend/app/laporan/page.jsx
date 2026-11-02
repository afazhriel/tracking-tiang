'use client'

import dynamic from 'next/dynamic'

const LaporanPage = dynamic(() => import('./LaporanPage'), { ssr: false })

export default function Page() {
  return <LaporanPage />
}
