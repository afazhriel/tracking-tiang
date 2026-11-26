'use client'

import dynamic from 'next/dynamic'

const KurvaSPage = dynamic(() => import('./KurvaSPage'), {
  ssr: false,
})

export default function Page() {
  return <KurvaSPage />
}