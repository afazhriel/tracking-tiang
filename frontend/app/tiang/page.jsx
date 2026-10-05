'use client'

import dynamic from 'next/dynamic'

const TiangPage = dynamic(() => import('./TiangPage'), {
  ssr: false,
})

export default function Page() {
  return <TiangPage />
}