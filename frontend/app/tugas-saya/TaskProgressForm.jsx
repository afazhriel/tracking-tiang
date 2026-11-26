'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  api,
  normalizeProject,
  normalizeWorkItem,
  normalizeWorkProgress,
  unwrapItem,
  unwrapList,
} from '../../lib/api'
import { formatPercent } from '../../lib/format'

const fieldClass =
  'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100'

function todayLocal() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatDateId(isoDate) {
  const [y, m, d] = String(isoDate).split('-')
  if (!y || !m || !d) return String(isoDate)
  return `${d}/${m}/${y}`
}

function clampPercent(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 0
  return Math.min(100, Math.max(0, amount))
}

/* Form catat progres inline di baris tugas — lokasinya sudah
   diketahui (tugas yang ditugaskan ke user), jadi tidak ada
   pencarian lokasi. Disimpan tanpa pindah halaman. */
export default function TaskProgressForm({
  projectId,
  pole,
  startDate = null,
  unitLabel = 'Lokasi',
  unitLower = 'lokasi',
  onSaved = null,
}) {
  const [workItems, setWorkItems] = useState([])
  const [progressEntries, setProgressEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [poleError, setPoleError] = useState('')
  const [workItemId, setWorkItemId] = useState('')
  const [percent, setPercent] = useState('0')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [projectStart, setProjectStart] = useState(startDate ?? null)

  /* Tanggal mulai proyek dipakai untuk pemberitahuan "belum mulai"
     dan batas tanggal. Kalau tidak dikirim sebagai prop, ambil dari
     detail proyek. */
  useEffect(() => {
    if (startDate) {
      setProjectStart(startDate)
      return undefined
    }
    let active = true
    api.getProject(projectId)
      .then((payload) => {
        if (active) {
          setProjectStart(normalizeProject(unwrapItem(payload)).startDate ?? null)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [projectId, startDate])

  const start = String(projectStart ?? '').slice(0, 10)
  const today = todayLocal()
  const notStarted = Boolean(start && start > today)
  const minDate = start && !notStarted ? start : undefined

  /* Muat item pekerjaan dan progres lokasi ini. */
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setPoleError('')
      try {
        const [itemsPayload, progressPayload] = await Promise.all([
          api.listPoleWorkItems(projectId, pole.id),
          api.getPoleProgress(projectId, pole.id),
        ])
        if (!active) return
        const items = unwrapList(itemsPayload).map(normalizeWorkItem)
        const entries = unwrapList(progressPayload).map(normalizeWorkProgress)
        setWorkItems(items)
        setProgressEntries(entries)
        const firstWithProgress = entries.find((entry) => entry.workItemId)
        const first = firstWithProgress
          ? String(firstWithProgress.workItemId)
          : items[0]?.id !== undefined && items[0]?.id !== null
            ? String(items[0].id)
            : ''
        setWorkItemId(first)
      } catch (err) {
        if (active) setPoleError(err.message || 'Gagal memuat detail lokasi.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [projectId, pole.id])

  const existing = useMemo(
    () =>
      progressEntries.find(
        (entry) => String(entry.workItemId) === String(workItemId)
      ) ?? null,
    [progressEntries, workItemId]
  )

  /* Persentase awal mengikuti nilai yang sudah tercatat untuk item ini. */
  useEffect(() => {
    setPercent(String(existing?.progress ?? 0))
  }, [workItemId, existing?.progress])

  const numericPercent = clampPercent(percent)
  const selectedItem = workItems.find(
    (item) => String(item.id) === String(workItemId)
  )

  async function submit(event) {
    event.preventDefault()
    if (busy || notStarted || !workItemId) return

    const amount = Number(percent)
    if (String(percent).trim() === '' || !Number.isFinite(amount) || amount < 0 || amount > 100) {
      setError('Masukkan persentase antara 0 dan 100.')
      return
    }
    if (date) {
      if (date > today) {
        setError('Tanggal tidak boleh di masa depan. Kosongkan tanggal untuk memakai hari ini.')
        return
      }
      if (start && date < start) {
        setError(`Tanggal tidak boleh sebelum proyek mulai (${formatDateId(start)}).`)
        return
      }
    }

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const payload = {
        work_item_id: Number(workItemId),
        progress_percent: numericPercent,
      }
      if (date && date !== today) payload.recorded_at = `${date} 00:00:00`
      if (notes.trim()) payload.notes = notes.trim()

      const saved = await api.savePoleProgress(projectId, pole.id, payload)
      const poleProgress = Number(saved?.pole_progress ?? NaN)
      const itemName = selectedItem?.name ?? 'item pekerjaan'
      setMessage(
        `Tersimpan. ${pole.poleCode} — ${itemName}: ${numericPercent}%.` +
          (Number.isFinite(poleProgress)
            ? ` Progres lokasi ini sekarang ${poleProgress.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%.`
            : '')
      )
      setNotes('')
      setDate('')
      const refreshed = await api.getPoleProgress(projectId, pole.id)
      setProgressEntries(unwrapList(refreshed).map(normalizeWorkProgress))
      if (onSaved) onSaved()
    } catch (err) {
      setError(
        Object.values(err.fieldErrors ?? {}).flat()[0] ||
          err.message ||
          'Gagal menyimpan progres.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-sm font-semibold text-neutral-900">Catat progres</p>

      {notStarted && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
          Proyek mulai {formatDateId(start)} — progres bisa dicatat mulai tanggal itu.
          {' '}Kalau pekerjaan sudah mulai hari ini,{' '}
          <a href="/proyek" className="font-semibold underline">
            ubah tanggal mulai
          </a>{' '}
          di halaman proyek.
        </div>
      )}

      {poleError && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
          {poleError}
        </p>
      )}

      {!notStarted && (
        loading ? (
          <p className="mt-3 text-sm text-neutral-500">Memuat item pekerjaan lokasi ini...</p>
        ) : workItems.length === 0 ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Lokasi ini belum punya item pekerjaan. Tambah item di{' '}
            <Link href="/pekerjaan" className="font-semibold underline">
              halaman Pekerjaan
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-3" noValidate>
            <label className="block space-y-1 text-sm font-medium text-neutral-700">
              <span>Item pekerjaan</span>
              <select
                className={fieldClass}
                value={workItemId}
                onChange={(event) => {
                  setWorkItemId(event.target.value)
                  setError('')
                  setMessage('')
                }}
              >
                <option value="">Pilih item pekerjaan</option>
                {workItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sequence ? `${item.sequence}. ` : ''}
                    {item.name} (bobot {formatPercent(item.weight, 0)})
                  </option>
                ))}
              </select>
            </label>

            {workItemId && (
              <>
                <div className="space-y-1">
                  <label htmlFor={`pole-percent-${pole.id}`} className="text-sm font-medium text-neutral-700">
                    Persentase progres
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id={`pole-percent-${pole.id}`}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={numericPercent}
                      onChange={(event) => setPercent(event.target.value)}
                      className="h-2 flex-1 accent-orange-600"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={percent}
                      onChange={(event) => setPercent(event.target.value)}
                      className="w-20 rounded-xl border border-neutral-300 px-2 py-2 text-sm text-neutral-900"
                    />
                    <span className="text-sm text-neutral-600">%</span>
                  </div>
                  {existing && (
                    <p className="text-xs text-neutral-500">
                      Saat ini {selectedItem?.name ?? 'item ini'} di {pole.poleCode}: {existing.progress}%.
                    </p>
                  )}
                </div>

                <div className="grid gap-3">
                  <label className="space-y-1 text-sm font-medium text-neutral-700">
                    <span>Tanggal progres (opsional)</span>
                    <input
                      type="date"
                      min={minDate}
                      max={today}
                      className={fieldClass}
                      value={date}
                      onChange={(event) => {
                        setDate(event.target.value)
                        setError('')
                        setMessage('')
                      }}
                    />
                  </label>

                  <label className="space-y-1 text-sm font-medium text-neutral-700">
                    <span>Catatan (opsional)</span>
                    <input
                      type="text"
                      maxLength={2000}
                      className={fieldClass}
                      value={notes}
                      onChange={(event) => {
                        setNotes(event.target.value)
                        setError('')
                        setMessage('')
                      }}
                      placeholder="Contoh: pengecoran selesai"
                    />
                  </label>
                </div>

                <p className="text-xs text-neutral-500">
                  Tanggal kosong memakai hari ini. Foto bisa ditambah dari{' '}
                  <Link href={`/tiang/${pole.id}`} className="font-semibold underline">
                    detail lokasi
                  </Link>
                  .
                </p>

                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {busy ? 'Menyimpan...' : 'Simpan progres'}
                </button>
              </>
            )}
          </form>
        )
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm text-green-700">
          {message}
        </p>
      )}
    </div>
  )
}
