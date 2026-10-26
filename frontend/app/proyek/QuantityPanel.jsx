'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

const fieldClass =
  'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100'

export default function QuantityPanel({
  projectId,
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
          setError(err.message || 'Gagal memuat realisasi kuantitas.')
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
  }

  async function submit(event) {
    event.preventDefault()
    if (!canWrite || busy) return

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
        const current = new Date()

        const today = [
          current.getFullYear(),
          String(current.getMonth() + 1).padStart(2, '0'),
          String(current.getDate()).padStart(2, '0'),
        ].join('-')

        // Untuk hari ini, biarkan server mencatat waktu sekarang.
        // Untuk hari sebelumnya, gunakan awal tanggal terpilih.
        if (date !== today) {
          payload.recorded_at = `${date} 00:00:00`
        }
      }

      if (notes.trim()) {
        payload.notes = notes.trim()
      }

      await api.recordProjectQuantity(projectId, payload)
      await reload()

      requestKey.current = null
      setQuantity('')
      setDate('')
      setNotes('')
      setMessage('Realisasi kuantitas berhasil dicatat.')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan realisasi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-900">
        Realisasi Kuantitas
      </h2>

      <p className="mt-1 text-sm text-neutral-500">
        Catat realisasi atau koreksi proyek dalam satuan {unitCode}.
        Perubahan akan memengaruhi Kurva S aktual.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500">
          Memuat realisasi...
        </p>
      ) : (
        <div className="mt-4 rounded-xl bg-neutral-50 p-4">
          <p className="text-xs text-neutral-500">
            Kuantitas terealisasi
          </p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">
            {Number(summary?.actual_current_quantity ?? 0).toLocaleString('id-ID')}
            {' '}{unitCode}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {Number(summary?.actual_current_percent ?? 0).toLocaleString(
              'id-ID',
              { maximumFractionDigits: 2 }
            )}% dari target proyek
          </p>
        </div>
      )}

      {canWrite && (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-neutral-700">
              <span>Kuantitas (+ realisasi, − koreksi)</span>
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
              <span>Tanggal realisasi (opsional)</span>
              <input
                type="date"
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

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {busy ? 'Menyimpan...' : 'Catat Realisasi'}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm text-green-700">
          {message}
        </p>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-neutral-900">
          Riwayat Realisasi
        </h3>

        {!loading && items.length === 0 && (
          <p className="mt-3 text-sm text-neutral-500">
            Belum ada realisasi yang tercatat.
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
                  {item.notes || 'Pencatatan kuantitas'}
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
