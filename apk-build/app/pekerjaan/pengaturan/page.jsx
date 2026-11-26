'use client'

import dynamic from 'next/dynamic'

const PekerjaanSettingsPage = dynamic(() => import('./PekerjaanSettingsPage'), {
  ssr: false,
})

export default function Page() {
  return <PekerjaanSettingsPage />
}
