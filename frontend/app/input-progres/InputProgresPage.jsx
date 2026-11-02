'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight, ClipboardCheck, Info, ListChecks, RefreshCw } from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import QuantityPanel from '../proyek/QuantityPanel'
import { api, unwrapItem } from '../../lib/api'
import { useProject } from '../../lib/project-context'
import { useResource } from '../../lib/use-api'
import { useCurrentUser } from '../../lib/use-current-user'

function InputProgresContent() {
  const { project, projectId, projects, selectProject, loading: loadingProject } = useProject()
  const currentUser = useCurrentUser()
  const loadDetail = useCallback(
    () => (projectId ? api.getProject(projectId).then(response => ({ projectId: String(projectId), response })) : Promise.resolve(null)),
    [projectId]
  )
  const { data, error, loading, reload } = useResource(loadDetail, [projectId], {
    enabled: Boolean(projectId),
  })
  const detail = useMemo(() => (data?.projectId === String(projectId) ? unwrapItem(data.response) : null), [data, projectId])
  const role = String(currentUser?.role ?? '').toLowerCase()
  const ownerId = detail?.owner_user_id
  const canWrite = Boolean(detail) &&
    !['pending', 'suspended'].includes(currentUser?.status) &&
    (role === 'admin' || role === 'supervisor' ||
      (currentUser?.id != null && ownerId != null && String(currentUser.id) === String(ownerId)))
  const mode = detail?.progress_source || null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-paper p-5 shadow-card sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Pencatatan lapangan</p>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900 sm:text-3xl">Input Progres</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Pilih proyek, catat pekerjaan yang benar-benar selesai, lalu lihat hasilnya di laporan.
        </p>
        {projects.length > 0 && (
          <label className="mt-5 block max-w-lg text-sm font-medium text-neutral-700">
            Proyek yang dikerjakan
            <select
              aria-label="Pilih proyek aktif"
              className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm"
              value={projectId ?? ''}
              onChange={(event) => selectProject(event.target.value)}
            >
              {!projectId && <option value="">Pilih proyek</option>}
              {projects.map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        )}
        {projectId && (
          <p className="mt-3 text-sm font-medium text-neutral-700">
            Proyek aktif: {detail?.name || project?.name || 'Memuat...'}
          </p>
        )}
      </div>

      {!projectId && !loadingProject && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Belum ada proyek yang dapat dipilih. Buka menu Proyek terlebih dahulu.
          <Link href="/proyek" className="ml-2 font-semibold underline">Buka Proyek</Link>
        </div>
      )}

      {projectId && (loading || error) && (
        <div className="rounded-xl border border-neutral-200 bg-paper p-4 text-sm">
          {loading ? 'Memeriksa jenis proyek dan hak akses...' : (
            <div className="flex flex-wrap items-center gap-3">
              <span role="alert" className="text-rose-700">Tidak dapat memuat detail proyek. Form belum dibuka agar tidak salah mencatat.</span>
              <button type="button" onClick={reload} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2">
                <RefreshCw size={14} /> Coba lagi
              </button>
            </div>
          )}
        </div>
      )}

      {detail && mode === 'quantity_entries' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-lagoon-200 bg-lagoon-50 p-4 text-sm text-lagoon-900">
            <div className="flex items-start gap-2">
              <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Proyek ini memakai <strong>realisasi berdasarkan jumlah</strong>. Masukkan tambahan
                jumlah positif; koreksi menggunakan angka negatif. Setiap pencatatan masuk riwayat.
              </p>
            </div>
          </div>
          {!canWrite && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">
              Anda dapat membaca riwayat, tetapi pencatatan hanya tersedia untuk pengelola proyek yang aktif.
            </p>
          )}
          <QuantityPanel
            key={String(projectId)}
            projectId={projectId}
            unitCode={detail.unit_code || 'unit'}
            canWrite={canWrite}
          />
          <Link href="/kurva-s" className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white">
            Lihat Kemajuan <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {detail && mode === 'pole_weighted' && (
        <div className="rounded-2xl border border-neutral-200 bg-paper p-5 shadow-card sm:p-7">
          <div className="flex items-center gap-3">
            <ListChecks className="h-6 w-6 text-brand-600" />
            <h2 className="text-lg font-bold">Catat realisasi tiang</h2>
          </div>
          <p className="mt-2 text-sm text-neutral-600">
            Progres dicatat per tiang dan jenis pekerjaan, bukan melalui formulir jumlah.
          </p>
          <ol className="mt-4 space-y-3 text-sm text-neutral-700">
            <li className="rounded-xl bg-neutral-50 px-4 py-3"><strong>1.</strong> Pilih tiang di daftar lokasi.</li>
            <li className="rounded-xl bg-neutral-50 px-4 py-3"><strong>2.</strong> Buka detail tiang dan tekan <strong>Catat Realisasi</strong>.</li>
            <li className="rounded-xl bg-neutral-50 px-4 py-3"><strong>3.</strong> Isi persentase, waktu, catatan/foto, lalu simpan.</li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/tiang" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white">
              Pilih Tiang <ArrowRight size={16} />
            </Link>
            <Link href="/kurva-s" className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold">
              Lihat Kemajuan
            </Link>
          </div>
        </div>
      )}

      {detail && mode !== 'quantity_entries' && mode !== 'pole_weighted' && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Jenis pencatatan proyek belum dapat dipastikan. Form tidak diaktifkan agar tidak salah input.
            Periksa pengaturan di <Link href="/proyek" className="font-semibold underline">menu Proyek</Link>.
          </p>
        </div>
      )}
    </div>
  )
}

export default function InputProgresPage() {
  return <AppShell title="Input Progres"><InputProgresContent /></AppShell>
}
