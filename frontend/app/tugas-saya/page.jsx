'use client'

import dynamic from 'next/dynamic'

const TugasSayaPage = dynamic(() => import('./TugasSayaPage'), {
  ssr: false,
})

export default function Page() {
  return <TugasSayaPage />
}
