'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

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

export default function QuantityPanel({
  projectId,
  startDate = null,
  targetQuantity = null,
  unitCode = 'unit',
  canWrite = false,
}) {
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestKey = useRef(null)

  const reload = useCallback(async () => {
    const result = await api.listProjectQuantities(projectId)

    const page = result?.data
    setItems(Array.isArray(page?.data) ? page.data : [])
    setSummary(result?.summary ?? null)
  }, [projectId])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        await reload()
      } catch (err) {
        if (active) {
          setError(err.message || 'Gagal memuat progres.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [reload])

  function change(setter, value) {
    requestKey.current = null
    setter(value)
    setError('')
    setMessage('')
  }

  /* Tanggal mulai (kalender lokal) dan hari ini (kalender lokal).
     Rentang tanggal hanya dipakai kalau proyek sudah mulai; kalau
     proyek belum mulai, form diganti pemberitahuan, bukan error. */
  const start = String(startDate ?? '').slice(0, 10)
  const today = todayLocal()
  const notStarted = Boolean(start && start > today)
  const minDate = start && !notStarted ? start : undefined

  const current = Number(summary?.actual_current_quantity ?? 0)
  const target = Number(targetQuantity)
  const delta = Number(quantity)
  const validDelta =
    /^-?\d{1,10}(?:\.\d{1,4})?$/.test(quantity) &&
    Number.isFinite(delta) &&
    delta !== 0
  const nextTotal = validDelta ? current + delta : null
  const nextWithin =
    nextTotal !== null &&
    nextTotal >= 0 &&
    (targetQuantity === null || nextTotal <= target)
  const percentOf = (value) =>
    target > 0 ? (value / target) * 100 : 0

  async function submit(event) {
    event.preventDefault()
    if (!canWrite || busy || notStarted) return

    if (!validDelta) {
      setError('Masukkan jumlah selain nol, maksimal empat angka di belakang koma.')
      return
    }
    const next = Math.round((current + delta) * 10000)
    if (next < 0 || (targetQuantity !== null && next > Math.round(target * 10000))) {
      setError(`Total progres harus antara 0 dan target ${targetQuantity} ${unitCode}.`)
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
      if (!requestKey.current) {
        requestKey.current = crypto.randomUUID()
      }

      const payload = {
        quantity_delta: quantity,
        request_key: requestKey.current,
      }

      if (date) {
        // Untuk hari ini, biarkan server mencatat waktu sekarang.
        // Untuk hari sebelumnya, gunakan awal tanggal terpilih.
        if (date !== today) {
          payload.recorded_at = `${date} 00:00:00`
        }
      }

      if (notes.trim()) {
        payload.notes = notes.trim()
      }

      const saved = await api.recordProjectQuantity(projectId, payload)

      // Penyimpanan sudah berhasil: jangan laporkan "gagal simpan" hanya
      // karena pembacaan ulang riwayat terputus sesudah commit database.
      requestKey.current = null
      setQuantity('')
      setDate('')
      setNotes('')
      const savedSummary = saved?.summary ?? null
      const total = Number(
        savedSummary?.actual_current_quantity ?? summary?.actual_current_quantity ?? 0
      )
      const pct = Number(
        savedSummary?.actual_current_percent ??
          (target > 0 ? (total / target) * 100 : 0)
      )
      setMessage(
        `Tersimpan. Total progres sekarang ${total.toLocaleString('id-ID')} dari target ${targetQuantity} ${unitCode} (${pct.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%).`
      )
      try {
        await reload()
      } catch {
        setError('Data sudah tersimpan, tetapi daftar riwayat belum berhasil diperbarui. Muat ulang halaman untuk memeriksa.')
      }
    } catch (err) {
      setError(Object.values(err.fieldErrors ?? {}).flat()[0] || err.message || 'Gagal menyimpan progres.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-900">
        Catat Progres
      </h2>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500">
          Memuat progres...
        </p>
      ) : (
        <div className="mt-4 rounded-xl bg-neutral-50 p-4">
          <p className="text-xs text-neutral-500">
            Progres tercatat
          </p>
          <p className="mt-1 text-xl font-bold text-neutral-900">
            {current.toLocaleString('id-ID')}
            {' '}{unitCode}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {percentOf(current).toLocaleString(
              'id-ID',
              { maximumFractionDigits: 2 }
            )}% dari target proyek
          </p>
        </div>
      )}

      {canWrite && notStarted && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
          Proyek mulai {formatDateId(start)} — progres bisa dicatat mulai tanggal itu.
          {' '}Kalau pekerjaan sudah mulai hari ini,{' '}
          <a href="/proyek" className="font-semibold underline">
            ubah tanggal mulai
          </a>{' '}
          di halaman proyek.
        </div>
      )}

      {canWrite && !notStarted && (
        <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
          <div className="grid gap-3">
            <label className="space-y-1 text-sm font-medium text-neutral-700">
              <span>Jumlah (+ tambah, − koreksi)</span>
              <input
                type="number"
                step="0.0001"
                required
                className={fieldClass}
                value={quantity}
                onChange={(event) =>
                  change(setQuantity, event.target.value)
                }
                placeholder="Contoh: 25"
              />
            </label>

            <label className="space-y-1 text-sm font-medium text-neutral-700">
              <span>Tanggal progres (opsional)</span>
              <input
                type="date"
                min={minDate}
                max={today}
                className={fieldClass}
                value={date}
                onChange={(event) =>
                  change(setDate, event.target.value)
                }
              />
            </label>
          </div>

          <label className="block space-y-1 text-sm font-medium text-neutral-700">
            <span>Catatan (opsional)</span>
            <textarea
              className={fieldClass}
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(event) =>
                change(setNotes, event.target.value)
              }
            />
          </label>

          <p className="text-xs text-neutral-500">
            {validDelta && nextWithin
              ? `Jumlah ini menambah progres — total jadi ${nextTotal.toLocaleString('id-ID')} dari target ${targetQuantity} ${unitCode} (${percentOf(nextTotal).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%).`
              : validDelta
                ? `Total jadi ${nextTotal.toLocaleString('id-ID')} — di luar target, periksa lagi jumlahnya.`
                : `Progres saat ini ${current.toLocaleString('id-ID')} dari target ${targetQuantity} ${unitCode}. Isi jumlah di atas untuk menambah progres.`}
            {' '}Total tidak boleh negatif atau melebihi target. Tanggal kosong memakai hari ini.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {busy ? 'Menyimpan...' : 'Catat Progres'}
          </button>
        </form>
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

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-neutral-900">
          Riwayat Progres
        </h3>

        {!loading && items.length === 0 && (
          <p className="mt-3 text-sm text-neutral-500">
            Belum ada progres yang tercatat.
          </p>
        )}

        <ul className="mt-2 divide-y divide-neutral-100">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">
                  {item.notes || 'Pencatatan jumlah'}
                </p>
                <p className="text-xs text-neutral-500">
                  {String(item.recorded_at || '').replace('T', ' ').slice(0, 19)}
                </p>
              </div>

              <span className="shrink-0 text-sm font-semibold text-neutral-900">
                {Number(item.quantity_delta) > 0 ? '+' : ''}
                {Number(item.quantity_delta).toLocaleString('id-ID')}
                {' '}{item.unit_code}
              </span>
            </li>
          ))}
        </ul>

        {items.length >= 100 && (
          <p className="mt-2 text-xs text-neutral-500">
            Menampilkan maksimal 100 catatan terbaru.
          </p>
        )}
      </div>
    </section>
  )
}
