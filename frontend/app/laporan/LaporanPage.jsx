'use client'

import Link from 'next/link'
import { Activity, ArrowUpRight, BarChart3, ClipboardList, MapPin } from 'lucide-react'
import AppShell from '../../components/layout/AppShell'
import { useProject } from '../../lib/project-context'

const reports = [
  { href: '/kurva-s', title: 'Lihat Kemajuan', subtitle: 'Target, realisasi, dan Kurva S proyek aktif', icon: BarChart3 },
  { href: '/pekerjaan', title: 'Rincian Pekerjaan', subtitle: 'Daftar tahapan dan pencapaian pekerjaan', icon: ClipboardList },
  { href: '/aktivitas', title: 'Riwayat Aktivitas', subtitle: 'Perubahan dan catatan progres yang tercatat', icon: Activity },
  { href: '/tiang', title: 'Lokasi dan Tiang', subtitle: 'Peta, lokasi, dan informasi setiap tiang', icon: MapPin },
]

function ReportContent() {
  const { project, projectId } = useProject()
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-paper p-5 shadow-card sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Informasi proyek</p>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900 sm:text-3xl">Laporan</h1>
        <p className="mt-2 text-sm text-neutral-600">Buka hasil pekerjaan tanpa mengubah data tersimpan.</p>
        {projectId && <p className="mt-3 text-sm font-semibold text-neutral-800">Proyek aktif: {project?.name || 'Memuat...'}</p>}
      </div>
      {!projectId && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Belum ada proyek aktif. <Link className="font-semibold underline" href="/proyek">Pilih proyek dahulu.</Link>
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map(({ href, title, subtitle, icon: Icon }) => (
          <Link key={href} href={href} className="group flex min-h-36 items-start gap-4 rounded-2xl border border-neutral-200 bg-paper p-5 shadow-card transition hover:border-brand-300 hover:shadow-lift">
            <div className="rounded-xl bg-brand-50 p-3 text-brand-700"><Icon className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-neutral-900">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">{subtitle}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-neutral-400 group-hover:text-brand-600" />
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function LaporanPage() {
  return <AppShell title="Laporan"><ReportContent /></AppShell>
}
