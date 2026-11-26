'use client'
import dynamic from 'next/dynamic'
const Screen = dynamic(() => import('../[id]/TiangDetailPage.jsx'), { ssr: false })
export default function Page() { return <Screen /> }
