'use client'

import dynamic from 'next/dynamic'

const TiangDetailPage = dynamic(() => import('./TiangDetailPage'), {
  ssr: false,
})

export default function Page() {
  return <TiangDetailPage />
}