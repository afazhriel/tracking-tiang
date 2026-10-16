'use client'

import dynamic from 'next/dynamic'

const ProfilPage = dynamic(() => import('./ProfilPage'), {
  ssr: false,
})

export default function Page() {
  return <ProfilPage />
}
