'use client'

import { useState } from 'react'

import { CircleAlert, FileText, Printer } from 'lucide-react'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Modal, TextInput } from '../../components/ui/modal'
import { api, normalizeBudget, unwrapList } from '../../lib/api'
import { useResource } from '../../lib/use-api'
import { formatDate, formatNumber } from '../../lib/format'

const STATUS_TONE = {
  draf: 'sand',
  diajukan: 'ochre',
  disetujui: 'sage',
  ditolak: 'clay',
}

function fmtRp(value) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return 'Rp0'
  return `Rp${number.toLocaleString('id-ID')}`
}

function lineTotal(item) {
  const volume = Number(item.volume) || 0
  const price = Number(item.unitPrice) || 0
  return Math.round(volume * price * 100) / 100
}

function emptyItem() {
  return { name: '', category: '', volume: '', unit: '', unitPrice: '' }
}

function BudgetForm({ budget, projectId, onClose, onSaved }) {
  const [title, setTitle] = useState(budget?.title ?? '')
  const [items, setItems] = useState(
    budget?.items?.length
      ? budget.items.map((item) => ({
          name: item.name ?? '',
          category: item.category ?? '',
          volume: String(item.volume ?? ''),
          unit: item.unit ?? '',
          unitPrice: String(item.unitPrice ?? ''),
        }))
      : [emptyItem()]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const total = items.reduce((sum, item) => sum + lineTotal(item), 0)

  function updateItem(index, field, value) {
    setItems((previous) =>
      previous.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }

  function removeItem(index) {
    setItems((previous) => previous.filter((_, i) => i !== index))
  }

  async function save(event) {
    event.preventDefault()
    setError('')

    const cleaned = items.map((item) => ({
      name: String(item.name ?? '').trim(),
      category: String(item.category ?? '').trim() || null,
      volume: Number(item.volume),
      unit: String(item.unit ?? '').trim(),
      unit_price: Number(item.unitPrice),
    }))

    if (cleaned.length === 0) {
      setError('Isi dulu minimal satu item.')
      return
    }
    if (cleaned.some((item) => !item.name)) {
      setError('Nama item wajib diisi.')
      return
    }
    if (cleaned.some((item) => !Number.isFinite(item.volume) || item.volume <= 0)) {
      setError('Volume harus angka lebih dari 0.')
      return
    }
    if (cleaned.some((item) => !item.unit)) {
      setError('Satuan wajib diisi.')
      return
    }
    if (cleaned.some((item) => !Number.isFinite(item.unit_price) || item.unit_price < 0)) {
      setError('Harga satuan harus angka 0 atau lebih.')
      return
    }

    setSaving(true)
    try {
      const payload = { title: title.trim() || null, items: cleaned }
      if (budget) {
        await api.updateBudget(budget.projectId, budget.id, payload)
      } else {
        await api.createBudget(projectId, payload)
      }
      onSaved()
    } catch (err) {
      setError(err?.message || 'Gagal menyimpan RAB.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={budget ? 'Ubah RAB' : 'RAB baru'}
      description="Total tiap baris dihitung otomatis (volume × harga satuan)."
    >
      <form onSubmit={save} className="space-y-3">
        <TextInput
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Judul RAB (opsional)"
          aria-label="Judul RAB"
        />

        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="space-y-2 rounded-xl border border-neutral-200 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-neutral-500">
                  Item {index + 1}
                </p>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-xs font-medium text-clay-700 hover:underline"
                  >
                    Hapus
                  </button>
                )}
              </div>

              <TextInput
                value={item.name}
                onChange={(event) => updateItem(index, 'name', event.target.value)}
                placeholder="Nama item *"
                aria-label={`Nama item ${index + 1}`}
              />

              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  value={item.category}
                  onChange={(event) => updateItem(index, 'category', event.target.value)}
                  placeholder="Kategori (opsional)"
                  aria-label={`Kategori item ${index + 1}`}
                />
                <TextInput
                  value={item.unit}
                  onChange={(event) => updateItem(index, 'unit', event.target.value)}
                  placeholder="Satuan * (contoh: kg, m, paket)"
                  aria-label={`Satuan item ${index + 1}`}
                />
                <TextInput
                  value={item.volume}
                  onChange={(event) => updateItem(index, 'volume', event.target.value)}
                  placeholder="Volume *"
                  inputMode="decimal"
                  aria-label={`Volume item ${index + 1}`}
                />
                <TextInput
                  value={item.unitPrice}
                  onChange={(event) => updateItem(index, 'unitPrice', event.target.value)}
                  placeholder="Harga satuan (Rp) *"
                  inputMode="decimal"
                  aria-label={`Harga satuan item ${index + 1}`}
                />
              </div>

              <p className="text-right text-xs text-neutral-500">
                Total baris: <span className="font-medium text-neutral-800">{fmtRp(lineTotal(item))}</span>
              </p>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setItems((previous) => [...previous, emptyItem()])}
        >
          + Tambah item
        </Button>

        <p className="text-right text-sm font-semibold text-neutral-900">
          Total RAB: {fmtRp(total)}
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan RAB'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function DecideBox({ budget, onDone, onCancel }) {
  const [decision, setDecision] = useState('disetujui')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (decision === 'ditolak' && !note.trim()) {
      setError('Alasan penolakan wajib diisi.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.decideBudget(budget.projectId, budget.id, decision, note.trim() || null)
      onDone()
    } catch (err) {
      setError(err?.message || 'Gagal memutuskan RAB.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-neutral-200 bg-canvas p-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDecision('disetujui')}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${decision === 'disetujui' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-neutral-300 text-neutral-600'}`}
        >
          Setujui
        </button>
        <button
          type="button"
          onClick={() => setDecision('ditolak')}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${decision === 'ditolak' ? 'border-clay-600 bg-clay-50 text-clay-800' : 'border-neutral-300 text-neutral-600'}`}
        >
          Tolak
        </button>
      </div>

      {decision === 'ditolak' && (
        <TextInput
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Alasan penolakan *"
          aria-label="Alasan penolakan"
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={saving} onClick={save}>
          {saving ? 'Menyimpan…' : 'Simpan keputusan'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Batal
        </Button>
      </div>
    </div>
  )
}

/**
 * RAB pengajuan per proyek.
 *
 * Draf dibuat + diajukan anggota proyek, diputuskan supervisor/admin.
 * Yang disetujui terkunci — perubahan lewat revisi (draf baru).
 * Aturan ditegakkan server; UI menampilkan tombol sesuai peran akun.
 */
export default function RabSection({ projectId, currentUser }) {
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deciding, setDeciding] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(null)

  const role = String(
    typeof currentUser?.role === 'object'
      ? currentUser?.role?.name
      : currentUser?.role ?? ''
  ).toLowerCase()
  const canDecide = ['admin', 'supervisor'].includes(role)

  const budgetsResource = useResource(
    () =>
      api
        .listBudgets(projectId)
        .then((response) => unwrapList(response).map(normalizeBudget)),
    [projectId]
  )

  const budgets = budgetsResource.data ?? []

  async function run(key, action, successMessage) {
    setBusy(key)
    setNotice(null)
    try {
      await action()
      if (successMessage) setNotice({ type: 'ok', message: successMessage })
      budgetsResource.reload()
      return true
    } catch (error) {
      setNotice({ type: 'err', message: error?.message || 'Aksi gagal. Coba lagi.' })
      return false
    } finally {
      setBusy(null)
    }
  }

  function printHref(budget) {
    return `/rab?proyek=${projectId}&rab=${budget.id}`
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
            <FileText className="h-5 w-5 text-brand-600" />
            RAB Proyek
          </h2>
          <p className="mt-1 max-w-xl text-sm text-neutral-500">
            Anggaran diajukan anggota proyek, disetujui supervisor. Yang
            disetujui terkunci — revisi jadi draf baru.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            setCreating(true)
          }}
        >
          + Buat RAB
        </Button>
      </div>

      {notice && (
        <p
          role="alert"
          className={
            notice.type === 'err'
              ? 'mt-3 rounded-xl border border-clay-300 bg-clay-50 px-3 py-2 text-sm text-clay-800'
              : 'mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
          }
        >
          {notice.message}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {budgetsResource.error ? (
          <EmptyState
            icon={CircleAlert}
            tone="clay"
            title="Gagal memuat RAB"
            description={budgetsResource.error?.message}
            action={
              <Button variant="outline" onClick={() => budgetsResource.reload()}>
                Coba lagi
              </Button>
            }
          />
        ) : budgetsResource.loading ? (
          <p className="text-sm text-neutral-500">Memuat RAB…</p>
        ) : budgets.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Belum ada RAB"
            description="Buat draf RAB pertama untuk proyek ini, lalu ajukan ke supervisor."
          />
        ) : (
          budgets.map((budget) => (
            <article
              key={budget.id}
              className="rounded-xl border border-neutral-200 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">
                    {budget.title || 'RAB'}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {formatNumber(budget.items.length)} item
                    {budget.submittedByName
                      ? ` · Diajukan oleh ${budget.submittedByName}${budget.submittedAt ? `, ${formatDate(budget.submittedAt)}` : ''}`
                      : ''}
                    {budget.decidedByName
                      ? ` · Diputuskan oleh ${budget.decidedByName}${budget.decidedAt ? `, ${formatDate(budget.decidedAt)}` : ''}`
                      : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[budget.status] ?? 'sand'}>
                    {budget.statusLabel ?? budget.status}
                  </Badge>
                  <span className="text-sm font-semibold text-neutral-900">
                    {fmtRp(budget.total)}
                  </span>
                </div>
              </div>

              {budget.status === 'ditolak' && budget.rejectionNote && (
                <p className="mt-2 rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-800">
                  Alasan ditolak: {budget.rejectionNote}
                </p>
              )}

              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-neutral-500">
                      <th className="py-1 pr-2 font-medium">Item</th>
                      <th className="py-1 pr-2 font-medium">Volume</th>
                      <th className="py-1 pr-2 font-medium">Harga satuan</th>
                      <th className="py-1 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budget.items.map((item) => (
                      <tr key={item.id ?? item.name} className="border-t border-neutral-100">
                        <td className="py-1.5 pr-2">
                          {item.name}
                          {item.category && (
                            <span className="block text-xs text-neutral-400">
                              {item.category}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2">
                          {formatNumber(item.volume)} {item.unit}
                        </td>
                        <td className="py-1.5 pr-2">{fmtRp(item.unitPrice)}</td>
                        <td className="py-1.5 text-right">{fmtRp(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={printHref(budget)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Cetak
                </a>

                {budget.isEditable && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(budget)}
                    >
                      Ubah
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy === `submit-${budget.id}`}
                      onClick={() =>
                        run(
                          `submit-${budget.id}`,
                          () => api.submitBudget(projectId, budget.id),
                          'RAB diajukan ke supervisor.'
                        )
                      }
                    >
                      Ajukan
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === `delete-${budget.id}`}
                      onClick={() => {
                        if (!window.confirm('Hapus RAB ini?')) return
                        run(
                          `delete-${budget.id}`,
                          () => api.deleteBudget(projectId, budget.id),
                          'RAB dihapus.'
                        )
                      }}
                    >
                      Hapus
                    </Button>
                  </>
                )}

                {budget.status === 'diajukan' && canDecide && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDeciding((current) =>
                        current?.id === budget.id ? null : budget
                      )
                    }
                  >
                    Putuskan
                  </Button>
                )}

                {budget.status === 'diajukan' && !canDecide && (
                  <span className="self-center text-xs text-neutral-500">
                    Menunggu persetujuan supervisor.
                  </span>
                )}

                {budget.isLocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === `dup-${budget.id}`}
                    onClick={() =>
                      run(
                        `dup-${budget.id}`,
                        () => api.duplicateBudget(projectId, budget.id),
                        'Revisi dibuat sebagai draf baru.'
                      )
                    }
                  >
                    Buat revisi
                  </Button>
                )}
              </div>

              {deciding?.id === budget.id && (
                <DecideBox
                  budget={budget}
                  onDone={() => {
                    setDeciding(null)
                    budgetsResource.reload()
                  }}
                  onCancel={() => setDeciding(null)}
                />
              )}
            </article>
          ))
        )}
      </div>

      {(creating || editing) && (
        <BudgetForm
          budget={editing}
          projectId={projectId}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            budgetsResource.reload()
          }}
        />
      )}
    </section>
  )
}
