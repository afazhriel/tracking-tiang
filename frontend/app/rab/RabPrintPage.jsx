'use client'

import { useEffect, useState } from 'react'

import { api, normalizeBudget } from '../../lib/api'

function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtRp(value) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return 'Rp0'
  return `Rp${number.toLocaleString('id-ID')}`
}

export default function RabPrintPage() {
  const [params, setParams] = useState(null)
  const [project, setProject] = useState(null)
  const [budget, setBudget] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setParams({ proyek: q.get('proyek'), rab: q.get('rab') })
    const t = setTimeout(() => {
      try {
        if (!window.localStorage.getItem('tracking_tiang_user')) {
          window.location.href = '/login'
        }
      } catch {
        /* abaikan */
      }
    }, 800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!params) return
    if (!params.proyek || !params.rab) {
      setError('Parameter proyek atau RAB tidak ditemukan. Buka halaman ini dari daftar RAB proyek.')
      setLoading(false)
      return
    }

    let alive = true

    ;(async () => {
      try {
        const [projRes, budgetRes] = await Promise.all([
          api.getProject(params.proyek),
          api.getBudget(params.proyek, params.rab),
        ])
        if (!alive) return
        setProject(projRes?.data ?? projRes)
        setBudget(normalizeBudget(budgetRes?.data ?? budgetRes))
      } catch (err) {
        if (alive) setError(err?.message || 'Gagal memuat RAB.')
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [params])

  const org = project?.organization ?? null
  const now = new Date()

  return (
    <div className="min-h-screen bg-neutral-100 py-4 text-neutral-900">
      <style>{`@media print { @page { size: A4; margin: 16mm; } }`}</style>

      <div className="mx-auto mb-4 flex max-w-[840px] flex-wrap items-center gap-2 px-4 print:hidden">
        <a
          href="/proyek"
          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
        >
          ← Kembali ke Proyek
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
        >
          Cetak / Simpan PDF
        </button>
      </div>

      <div className="mx-auto max-w-[840px] bg-white p-8 shadow print:shadow-none sm:p-10">
        {loading && <p className="text-sm text-neutral-500">Memuat RAB…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && project && budget && (
          <>
            {/* Kop — logo + nama organisasi pemilik proyek. */}
            <header className="text-center">
              {org?.logoUrl && (
                <img
                  src={org.logoUrl}
                  alt={`Logo ${org.name ?? 'organisasi'}`}
                  className="mx-auto mb-3 h-16 w-auto object-contain"
                />
              )}
              <p className="text-xl font-bold tracking-[0.2em] text-neutral-900">
                {(org?.name ?? 'Tracking Pekerjaan').toUpperCase()}
              </p>
              {(org?.address || org?.phone || org?.email) && (
                <p className="mt-1 text-sm text-neutral-600">
                  {[org?.address, org?.phone, org?.email]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <p className="mt-1 text-xs text-neutral-500">
                Sistem Monitoring Pekerjaan — pjl.ituiot.com
              </p>
              <div className="mt-4 border-b-4 border-double border-neutral-800" />
            </header>

            <div className="mt-4 text-center">
              <h1 className="text-lg font-bold uppercase text-neutral-900 underline">
                Rencana Anggaran Biaya
              </h1>
              <p className="mt-2 text-sm text-neutral-800">
                Proyek: <span className="font-semibold">{project.name} ({project.code})</span>
              </p>
              <p className="mt-1 text-sm text-neutral-800">
                {budget.title || 'RAB'} · Status: <span className="font-semibold">{budget.statusLabel ?? budget.status}</span>
              </p>
              <p className="mt-1 text-sm text-neutral-800">
                {fmtDate(now.toISOString())}
              </p>
            </div>

            <section className="mt-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-neutral-800 text-left">
                    <th className="py-2 pr-2">No</th>
                    <th className="py-2 pr-2">Item</th>
                    <th className="py-2 pr-2 text-right">Volume</th>
                    <th className="py-2 pr-2 text-right">Harga satuan</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {budget.items.map((item, index) => (
                    <tr key={item.id ?? index} className="border-b border-neutral-200">
                      <td className="py-2 pr-2">{index + 1}</td>
                      <td className="py-2 pr-2">
                        {item.name}
                        {item.category && (
                          <span className="block text-xs text-neutral-500">
                            {item.category}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        {Number(item.volume).toLocaleString('id-ID')} {item.unit}
                      </td>
                      <td className="py-2 pr-2 text-right">{fmtRp(item.unitPrice)}</td>
                      <td className="py-2 text-right">{fmtRp(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={4} className="py-2 pr-2 text-right">Total</td>
                    <td className="py-2 text-right">{fmtRp(budget.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            {budget.status === 'ditolak' && budget.rejectionNote && (
              <p className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm">
                Alasan ditolak: {budget.rejectionNote}
              </p>
            )}

            <section className="mt-10 grid grid-cols-2 gap-6 text-sm">
              <div>
                <p>Diajukan oleh,</p>
                <p className="mt-1 text-neutral-600">
                  {budget.submittedAt ? fmtDate(budget.submittedAt) : '—'}
                </p>
                <div className="mt-20 border-b border-neutral-400" />
                <p className="mt-1 text-center text-neutral-500">
                  ( {budget.submittedByName ?? 'Nama jelas'} )
                </p>
              </div>
              <div>
                <p>Disetujui oleh,</p>
                <p className="mt-1 text-neutral-600">
                  {budget.decidedAt ? fmtDate(budget.decidedAt) : '—'}
                </p>
                <div className="mt-20 border-b border-neutral-400" />
                <p className="mt-1 text-center text-neutral-500">
                  ( {budget.decidedByName ?? 'Nama jelas'} )
                </p>
              </div>
            </section>

            <footer className="mt-10 border-t border-neutral-200 pt-3 text-[11px] leading-relaxed text-neutral-400">
              RAB ini diterbitkan oleh {org?.name ?? 'Tracking Pekerjaan'} melalui
              Tracking Pekerjaan (pjl.ituiot.com) pada{' '}
              {now.toLocaleString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              WIB.
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
