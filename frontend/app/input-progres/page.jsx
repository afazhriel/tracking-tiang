'use client'

import dynamic from 'next/dynamic'

const InputProgresPage = dynamic(() => import('./InputProgresPage'), { ssr: false })

export default function Page() {
  return <InputProgresPage />
}
