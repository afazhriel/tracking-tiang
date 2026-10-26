'use client'

import dynamic from 'next/dynamic'

const ProyekPage = dynamic(() => import('./ProyekPage'), {
  ssr: false,
})

export default function Page() {
  return <ProyekPage />
}
