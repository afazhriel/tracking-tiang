'use client'

import dynamic from 'next/dynamic'

const TimPage = dynamic(() => import('./TimPage'), {
  ssr: false,
})

export default function Page() {
  return <TimPage />
}
