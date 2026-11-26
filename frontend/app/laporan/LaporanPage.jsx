'use client'

import Link from 'next/link'
import { Activity, ArrowUpRight, BarChart3, ClipboardList, MapPin } from 'lucide-react'
import AppShell from '../../components/layout/AppShell'
import { PageHeader } from '../../components/layout/PageHeader'
import { useProject } from '../../lib/project-context'
import { projectUnitLabel } from '../../lib/unit-label'

function ReportContent() {
  const { project, projectId } = useProject()
  const isQuantity = project?.progressSource === 'quantity_entries'
  const reports = [
    { href: '/kurva-s', title: 'Lihat Kemajuan', subtitle: 'Target, progres, dan Kurva S proyek aktif', icon: BarChart3 },
    { href: '/pekerjaan', title: 'Rincian Pekerjaan', subtitle: 'Daftar tahapan dan pencapaian pekerjaan', icon: ClipboardList },
    { href: '/aktivitas', title: 'Riwayat Aktivitas', subtitle: 'Perubahan dan catatan progres yang tercatat', icon: Activity },
    isQuantity
      ? { href: '/tugas-saya', title: 'Tugas saya', subtitle: 'Catat progres dan lihat tugas Anda.', icon: MapPin }
      : { href: '/tiang', title: `Lokasi dan ${projectUnitLabel(project)}`, subtitle: `Peta, lokasi, dan informasi setiap ${projectUnitLabel(project)}.`, icon: MapPin },
  ]
  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader title="Laporan" />
      {!projectId && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Belum ada proyek aktif. <Link className="font-semibold underline" href="/proyek">Pilih proyek dahulu.</Link>
        </p>
      )}
      <div className="grid gap-3">
        {reports.map(({ href, title, subtitle, icon: Icon }) => (
          <Link key={href} href={href} className="group flex min-h-28 items-start gap-3 rounded-2xl border border-neutral-200 bg-paper p-4 shadow-card transition hover:border-brand-300 hover:shadow-lift">
            <div className="rounded-xl bg-brand-50 p-2.5 text-brand-700"><Icon className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-neutral-900">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-500">{subtitle}</p>
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
