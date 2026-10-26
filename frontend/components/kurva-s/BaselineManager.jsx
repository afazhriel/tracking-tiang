'use client'

import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useCurrentUser } from '../../lib/use-current-user'

const dateOnly = (value) => String(value ?? '').slice(0, 10)

const emptyPeriod = (project) => ({
  period_start: dateOnly(project?.start_date),
  period_end: dateOnly(project?.end_date),
  planned_quantity: '',
})

const formatAmount = (value) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(Number(value || 0))

export default function BaselineManager({ projectId, project, onApproved }) {
  const user = useCurrentUser()
  const viewerId =
    user?.id ?? user?.user?.id ?? user?.data?.id ?? null

  const [resolvedOwnerId, setResolvedOwnerId] = useState(null)

  useEffect(() => {
    if (!projectId) return

    let active = true

    api.getProject(projectId)
      .then((response) => {
        const result =
          response?.data?.data ?? response?.data ?? response

        if (active) {
          setResolvedOwnerId(result?.owner_user_id ?? null)
        }
      })
      .catch(() => {
        if (active) setResolvedOwnerId(null)
      })

    return () => { active = false }
  }, [projectId])

  const ownerId =
    project?.owner_user_id ??
    project?.ownerUserId ??
    resolvedOwnerId

  const canManageBaseline =
    user?.role === 'admin' ||
    (
      viewerId != null &&
      ownerId != null &&
      Number(viewerId) === Number(ownerId)
    )

  const [baselines, setBaselines] = useState([])
  const [selection, setSelection] = useState('auto')
  const [periods, setPeriods] = useState([emptyPeriod(project)])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    setSelection('auto')
    setBaselines([])
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    if (!projectId) return

    setLoading(true)
    api.listBaselines(projectId)
      .then((result) => {
        if (!cancelled) {
          const list = Array.isArray(result?.data) ? result.data : []
          setBaselines(list)
          setSelection((current) => current === 'auto'
            ? String((list.find((b) => b.status === 'approved') ?? list[0])?.id ?? 'new')
            : current)
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Gagal memuat baseline.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [projectId, revision])

  const selected = baselines.find((b) => String(b.id) === selection)
  const canEdit = canManageBaseline && (!selected || selected.status === 'draft')
  const target = Number(selected?.target_quantity
      ?? project?.targetQuantity
      ?? project?.target_quantity
      ?? project?.total_target_poles
      ?? 0)
  const total = periods.reduce(
    (sum, period) => sum + Number(period.planned_quantity || 0), 0
  )
  const validTotal = Math.round(total * 10000) === Math.round(target * 10000)
  const savedForm = JSON.stringify({
    notes: selected?.notes ?? '',
    periods: (selected?.periods ?? []).map((p) => ({
      period_start: dateOnly(p.period_start),
      period_end: dateOnly(p.period_end),
      planned_quantity: String(p.planned_quantity),
    })),
  })
  const currentForm = JSON.stringify({ notes, periods })
  const draftChanged = selected?.status === 'draft' && savedForm !== currentForm
  const approved = baselines.find((b) => b.status === 'approved')

  useEffect(() => {
    const selectedBaseline = baselines.find((b) => String(b.id) === selection)

    setNotes(selectedBaseline?.notes ?? '')
    setPeriods(
      selectedBaseline?.periods?.length
        ? selectedBaseline.periods.map((p) => ({
            period_start: dateOnly(p.period_start),
            period_end: dateOnly(p.period_end),
            planned_quantity: String(p.planned_quantity),
          }))
        : [emptyPeriod(project)]
    )
  }, [selection, baselines, project?.start_date, project?.end_date])

  function updatePeriod(index, field, value) {
    setPeriods((previous) => previous.map((period, i) =>
      i === index ? { ...period, [field]: value } : period
    ))
  }

  async function saveDraft() {
    if (!projectId || !canEdit) return

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const payload = {
        notes,
        periods: periods.map((period) => ({
          period_start: period.period_start,
          period_end: period.period_end,
          planned_quantity: period.planned_quantity,
        })),
      }

      const result = selected
        ? await api.updateBaseline(projectId, selected.id, payload)
        : await api.createBaseline(projectId, payload)

      if (result?.data?.id) setSelection(String(result.data.id))
      setRevision((n) => n + 1)
      setMessage('Draf baseline berhasil disimpan.')
    } catch (err) {
      setError(err.message || 'Gagal menyimpan draf.')
    } finally {
      setSaving(false)
    }
  }

  async function approveDraft() {
    if (!selected || selected.status !== 'draft' || !canManageBaseline) return

    if (draftChanged) {
      setError('Simpan perubahan draf terlebih dahulu sebelum pengesahan.')
      return
    }

    if (!validTotal) {
      setError('Total periode harus sama dengan target proyek.')
      return
    }

    if (!window.confirm('Sahkan baseline ini? Setelah disahkan, rencana tidak bisa diedit langsung.')) {
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      await api.approveBaseline(projectId, selected.id)
      setRevision((n) => n + 1)
      setMessage('Baseline berhasil disahkan.')
      onApproved?.()
    } catch (err) {
      setError(err.message || 'Gagal mengesahkan baseline.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Pengaturan Baseline Kurva S
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Target rencana per periode. Pengesahan hanya dapat dilakukan Admin.
        </p>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-neutral-500">Target proyek</p>
          <p className="text-xl font-semibold">{formatAmount(target)} tiang</p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-neutral-500">Total periode</p>
          <p className="text-xl font-semibold">{formatAmount(total)} tiang</p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-neutral-500">Baseline berlaku</p>
          <p className="text-xl font-semibold">
            {approved ? `Versi ${approved.version}` : 'Belum disahkan'}
          </p>
        </div>
      </div>

      {loading && <p className="text-sm text-neutral-500">Memuat baseline…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Versi baseline</span>
        <select
          value={selection}
          onChange={(event) => {
            setSelection(event.target.value)
            setError('')
            setMessage('')
          }}
          className="w-full rounded-lg border border-neutral-300 p-2"
        >
          {selection === 'auto' && <option value="auto">Memuat baseline…</option>}
          {canManageBaseline && <option value="new">Buat draf versi baru</option>}
          {!canManageBaseline && <option value="new">Pilih versi baseline</option>}
          {baselines.map((baseline) => (
            <option key={baseline.id} value={baseline.id}>
              Versi {baseline.version} — {baseline.status}
            </option>
          ))}
        </select>
      </label>

      {canEdit && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Catatan rencana / alasan revisi</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={5000}
            rows={2}
            className="w-full rounded-lg border border-neutral-300 p-2"
          />
        </label>
      )}

      {(selected || canManageBaseline) && (
        <div className="space-y-3">
          <h3 className="font-semibold">Target per periode</h3>
          {periods.map((period, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-neutral-200 p-3 sm:grid-cols-4">
              <label className="text-sm">
                <span className="block pb-1">Periode</span>
                <span className="block py-2 font-medium">#{index + 1}</span>
              </label>
              <label className="text-sm">
                <span className="block pb-1">Mulai</span>
                <input type="date" value={period.period_start}
                  disabled={!canEdit}
                  onChange={(e) => updatePeriod(index, 'period_start', e.target.value)}
                  className="w-full rounded border p-2" />
              </label>
              <label className="text-sm">
                <span className="block pb-1">Selesai</span>
                <input type="date" value={period.period_end}
                  disabled={!canEdit}
                  onChange={(e) => updatePeriod(index, 'period_end', e.target.value)}
                  className="w-full rounded border p-2" />
              </label>
              <label className="text-sm">
                <span className="block pb-1">Rencana Kuantitas</span>
                <input type="number" min="0" step="0.0001"
                  value={period.planned_quantity}
                  disabled={!canEdit}
                  onChange={(e) => updatePeriod(index, 'planned_quantity', e.target.value)}
                  className="w-full rounded border p-2" />
              </label>
              {canEdit && periods.length > 1 && (
                <button type="button"
                  className="text-left text-sm text-red-700"
                  onClick={() => setPeriods((list) => list.filter((_, i) => i !== index))}>
                  Hapus periode ini
                </button>
              )}
            </div>
          ))}

          {canEdit && periods.length < 60 && (
            <button type="button" className="text-sm font-medium text-blue-700"
              onClick={() => setPeriods((list) => [...list, {
                period_start: '',
                period_end: '',
                planned_quantity: '',
              }])}>
              + Tambah periode
            </button>
          )}

          <p className={`text-sm ${validTotal ? 'text-emerald-700' : 'text-amber-700'}`}>
            {validTotal
              ? 'Total target sudah sesuai.'
              : `Selisih terhadap target: ${formatAmount(target - total)} tiang.`}
          </p>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={saving || !projectId}
            onClick={saveDraft}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Memproses…' : selected ? 'Simpan perubahan draf' : 'Simpan draf baru'}
          </button>

          {selected?.status === 'draft' && (
            <button type="button" disabled={saving || !validTotal || draftChanged}
              onClick={approveDraft}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Sahkan baseline
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Baseline yang sudah disahkan tidak dapat diubah langsung.
        Buat versi baru untuk merevisi jadwal. Seluruh target periode
        harus sama dengan target proyek dan tanggalnya harus berurutan.
      </p>
    </section>
  )
}
