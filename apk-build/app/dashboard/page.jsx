'use client'

import dynamic from 'next/dynamic'

/**
 * Auth gate dipusatkan di components/layout/AppShell.jsx
 * sehingga seluruh halaman internal memakai mekanisme yang sama.
 */
const Dashboard = dynamic(() => import('./Dashboard'), {
  ssr: false,
})

export default function DashboardPage() {
  return <Dashboard />
}