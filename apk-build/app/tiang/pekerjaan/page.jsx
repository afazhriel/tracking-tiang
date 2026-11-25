'use client'
import dynamic from 'next/dynamic'
const Screen = dynamic(() => import('../[id]/pekerjaan/PekerjaanTiangPage.jsx'), { ssr: false })
export default function Page() { return <Screen /> }
