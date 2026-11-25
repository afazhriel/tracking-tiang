'use client'
import dynamic from 'next/dynamic'
const Screen = dynamic(() => import('../[id]/PekerjaanDetailPage.jsx'), { ssr: false })
export default function Page() { return <Screen /> }
