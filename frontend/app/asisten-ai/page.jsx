'use client'

import dynamic from 'next/dynamic'

const AsistenAiPage = dynamic(() => import('./AsistenAiPage'), {
  ssr: false,
})

export default function Page() {
  return <AsistenAiPage />
}
