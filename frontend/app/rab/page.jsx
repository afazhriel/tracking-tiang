'use client'

import dynamic from 'next/dynamic'

const RabPrintPage = dynamic(() => import('./RabPrintPage'), {
  ssr: false,
})

export default function Page() {
  return <RabPrintPage />
}
