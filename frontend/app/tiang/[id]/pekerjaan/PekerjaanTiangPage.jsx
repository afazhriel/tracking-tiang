'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  CircleAlert,
  ClipboardList,
  Pencil,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
  Wand2,
} from 'lucide-react'

import AppShell from '../../../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../../../components/layout/PageHeader'
import {
  FormField,
  Modal,
  SubmitButton,
  TextInput,
} from '../../../../components/ui/modal'
import { Badge } from '../../../../components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card'
import { EmptyState } from '../../../../components/ui/empty-state'
import { StatCard, StatCardGrid } from '../../../../components/ui/stat-card'
import { Table, TableWrap, Td, Th, Tr } from '../../../../components/ui/table'
import { ErrorNotice, SkeletonRows } from '../../../../components/ui/states'
import { useProject } from '../../../../lib/project-context'
import {
  api,
  normalizePole,
  normalizeWorkItem,
  unwrapList,
} from '../../../../lib/api'
import { useResource } from '../../../../lib/use-api'
import { formatDays, formatPercent } from '../../../../lib/format'

const EMPTY_FORM = {
  name: '',
  weight_percent: '',
  sequence: '',
  planned_duration_days: '',
  planned_start_month: '',
  planned_end_month: '',
  is_active: true,
}

function toFormValue(value) {
  return value === null || value === undefined ? '' : String(value)
}

function parseNumber(value) {
  if (value === '' || value === null || value === undefined) return null

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

/**
 * Form item pekerjaan khusus satu tiang.
 *
 * Backend menormalisasi bobot seluruh item tiang agar total 100% setiap
 * kali item disimpan, jadi bobot yang diisi dibaca sebagai bobot relatif.
 */
function PoleWorkItemFormModal({
  open,
  onClose,
  projectId,
  poleId,
  workItem,
  existingItems,
  onSaved,
}) {
  const editingId = workItem?.id ?? null

  const [form, setForm] = useState(() =>
    workItem
      ? {
          name: workItem.name ?? '',
          weight_percent: toFormValue(workItem.weight),
          sequence: toFormValue(workItem.sequence),
          planned_duration_days: toFormValue(workItem.plannedDurationDays),
          planned_start_month: toFormValue(workItem.plannedStartMonth),
          planned_end_month: toFormValue(workItem.plannedEndMonth),
          is_active: workItem.isActive !== false,
        }
      : EMPTY_FORM
  )

  const [fieldErrors, setFieldErrors] = useState(null)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  const weightValue = parseNumber(form.weight_percent)

  const totalAfterSave = useMemo(() => {
    const otherTotal = existingItems
      .filter((item) => String(item.id) !== String(editingId))
      .reduce((sum, item) => sum + Number(item.weight || 0), 0)

    return otherTotal + (weightValue ?? 0)
  }, [editingId, existingItems, weightValue])

  const balanced = Math.abs(totalAfterSave - 100) < 0.0001
  const scaleFactor = totalAfterSave > 0 ? 100 / totalAfterSave : null

  function update(field) {
    return (event) => {
      const value =
        field === 'is_active' ? event.target.checked : event.target.value

      setForm((previous) => ({ ...previous, [field]: value }))

      setFieldErrors((previous) => {
        if (!previous || !previous[field]) return previous

        const next = { ...previous }

        delete next[field]

        return Object.keys(next).length ? next : null
      })
    }
  }

  function validate() {
    const errors = {}
    const name = form.name.trim()

    if (!name) {
      errors.name = ['Nama pekerjaan wajib diisi.']
    } else {
      const duplicate = existingItems.some(
        (item) =>
          String(item.id) !== String(editingId) &&
          item.name?.trim().toLowerCase() === name.toLowerCase()
      )

      if (duplicate) {
        errors.name = ['Nama pekerjaan sudah dipakai pada tiang ini.']
      }
    }

    if (weightValue === null) {
      errors.weight_percent = ['Bobot wajib diisi berupa angka.']
    } else if (weightValue < 0 || weightValue > 100) {
      errors.weight_percent = ['Bobot harus di antara 0 sampai 100.']
    }

    return { errors, name }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (saving) return

    const { errors, name } = validate()

    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      setFormError(null)

      return
    }

    setSaving(true)
    setFieldErrors(null)
    setFormError(null)

    const payload = {
      name,
      weight_percent: weightValue,
      sequence: parseNumber(form.sequence),
      planned_duration_days: parseNumber(form.planned_duration_days),
      planned_start_month: parseNumber(form.planned_start_month),
      planned_end_month: parseNumber(form.planned_end_month),
      is_active: Boolean(form.is_active),
    }

    try {
      const response = editingId
        ? await api.updatePoleWorkItem(projectId, poleId, editingId, payload)
        : await api.createPoleWorkItem(projectId, poleId, payload)

      setSaving(false)
      onSaved?.(response?.data ?? null)
      onClose()
    } catch (error) {
      if (error?.isUnprocessable && error.fieldErrors) {
        setFieldErrors(error.fieldErrors)
      } else {
        setFormError(error)
      }

      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingId ? 'Ubah Item Tiang' : 'Tambah Item Tiang'}
      description="Item ini hanya berlaku untuk tiang ini. Bobot otomatis dinormalisasi agar total 100%."
      size="md"
      footer={
        <>
          <ActionButton onClick={onClose}>Batal</ActionButton>

          <SubmitButton
            form="pole-work-item-form"
            loading={saving}
            loadingLabel="Menyimpan..."
          >
            {editingId ? 'Simpan Perubahan' : 'Tambah Item'}
          </SubmitButton>
        </>
      }
    >
      <form
        id="pole-work-item-form"
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-clay-300/70 bg-clay-50 px-4 py-3"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-clay-700" />

            <div>
              <p className="text-sm font-medium text-clay-800">
                Item pekerjaan gagal disimpan
              </p>
              <p className="mt-0.5 text-xs leading-5 text-clay-700">
                {formError.message}
              </p>
            </div>
          </div>
        )}

        <FormField
          label="Nama Pekerjaan"
          htmlFor="pole-work-item-name"
          required
          error={fieldErrors?.name?.[0]}
          hint="Unik per tiang. Contoh: Pembersihan Lahan."
        >
          <TextInput
            id="pole-work-item-name"
            name="name"
            value={form.name}
            onChange={update('name')}
            invalid={Boolean(fieldErrors?.name)}
            maxLength={255}
            required
            autoComplete="off"
            placeholder="Pembersihan Lahan"
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Bobot (%)"
            htmlFor="pole-work-item-weight"
            required
            error={fieldErrors?.weight_percent?.[0]}
            hint="0 – 100. Total seluruh item tiang otomatis dinormalisasi ke 100%."
          >
            <TextInput
              id="pole-work-item-weight"
              name="weight_percent"
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              max={100}
              value={form.weight_percent}
              onChange={update('weight_percent')}
              invalid={Boolean(fieldErrors?.weight_percent)}
              placeholder="10"
            />
          </FormField>

          <FormField
            label="Urutan"
            htmlFor="pole-work-item-sequence"
            error={fieldErrors?.sequence?.[0]}
            hint="Opsional. Menentukan urutan tampil."
          >
            <TextInput
              id="pole-work-item-sequence"
              name="sequence"
              type="number"
              inputMode="numeric"
              min={0}
              value={form.sequence}
              onChange={update('sequence')}
              invalid={Boolean(fieldErrors?.sequence)}
              placeholder="1"
            />
          </FormField>
        </div>

        <FormField
          label="Durasi Rencana (hari)"
          htmlFor="pole-work-item-duration"
          error={fieldErrors?.planned_duration_days?.[0]}
          hint="Opsional. Lama pengerjaan menurut rencana."
        >
          <TextInput
            id="pole-work-item-duration"
            name="planned_duration_days"
            type="number"
            inputMode="numeric"
            min={0}
            value={form.planned_duration_days}
            onChange={update('planned_duration_days')}
            invalid={Boolean(fieldErrors?.planned_duration_days)}
            placeholder="14"
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Bulan Mulai"
            htmlFor="pole-work-item-start"
            error={fieldErrors?.planned_start_month?.[0]}
            hint="Opsional. Bulan ke-berapa (1 = bulan pertama)."
          >
            <TextInput
              id="pole-work-item-start"
              name="planned_start_month"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={form.planned_start_month}
              onChange={update('planned_start_month')}
              invalid={Boolean(fieldErrors?.planned_start_month)}
              placeholder="1"
            />
          </FormField>

          <FormField
            label="Bulan Selesai"
            htmlFor="pole-work-item-end"
            error={fieldErrors?.planned_end_month?.[0]}
            hint="Opsional. Periode selesai menurut rencana."
          >
            <TextInput
              id="pole-work-item-end"
              name="planned_end_month"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={form.planned_end_month}
              onChange={update('planned_end_month')}
              invalid={Boolean(fieldErrors?.planned_end_month)}
              placeholder="2"
            />
          </FormField>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-canvas px-4 py-3">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={update('is_active')}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-brand-600"
          />

          <span className="text-xs leading-5 text-neutral-600">
            <span className="block font-medium text-neutral-800">
              Item aktif
            </span>
            Item nonaktif tetap tersimpan beserta riwayat progresnya, namun
            tidak ditampilkan sebagai pekerjaan berjalan.
          </span>
        </label>

        <div
          className={`rounded-xl border px-4 py-3 text-xs leading-5 ${
            balanced
              ? 'border-neutral-200 bg-canvas text-neutral-500'
              : 'border-amber-300/70 bg-amber-50 text-amber-800'
          }`}
        >
          Total bobot sementara:{' '}
          <strong className="font-semibold tabular-nums">
            {formatPercent(totalAfterSave)}
          </strong>

          {balanced ? (
            ' — sudah tepat 100%.'
          ) : scaleFactor !== null ? (
            <>
              {' — saat disimpan, seluruh item tiang dinormalisasi ke 100% '}
              <span className="tabular-nums">
                (faktor ×{scaleFactor.toFixed(3)})
              </span>
              .
            </>
          ) : (
            ' — akan dibagi rata otomatis agar total 100%.'
          )}
        </div>
      </form>
    </Modal>
  )
}

function PekerjaanTiangContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  /* Di browser: path `/tiang/{id}/pekerjaan`. Di APK (ekspor statis):
     query `/tiang/detail/pekerjaan?pole={id}` — lihat `poleWorkHref`
     di lib/native.js. */
  const poleId = params?.id ?? searchParams?.get('pole') ?? null
  const { projectId } = useProject()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [applying, setApplying] = useState(false)

  const enabled = Boolean(projectId && poleId)

  const poleLoader = useCallback(async () => {
    if (!enabled) return null

    const payload = await api.getPole(projectId, poleId)

    return payload?.data ?? null
  }, [enabled, projectId, poleId])

  const { data: rawPole } = useResource(poleLoader, [projectId, poleId], {
    enabled,
  })

  const pole = useMemo(
    () => (rawPole ? normalizePole(rawPole) : null),
    [rawPole]
  )

  const itemsLoader = useCallback(async () => {
    if (!enabled) return { items: [], meta: null }

    const payload = await api.listPoleWorkItems(projectId, poleId)

    return {
      items: unwrapList(payload).map(normalizeWorkItem),
      meta: payload?.meta ?? null,
    }
  }, [enabled, projectId, poleId])

  const {
    data,
    error,
    loading,
    reload: reloadItems,
  } = useResource(itemsLoader, [projectId, poleId], { enabled })

  const workItems = useMemo(() => data?.items ?? [], [data])
  const canManage = data?.meta?.can_manage === true

  const totalWeight = useMemo(
    () => workItems.reduce((sum, item) => sum + Number(item.weight || 0), 0),
    [workItems]
  )

  const weightBalanced = Math.abs(totalWeight - 100) < 0.0001
  const disabledCount = workItems.filter((item) => item.isActive === false).length

  async function handleDelete(workItem) {
    if (!enabled || !canManage) return

    setDeletingId(workItem.id)
    setActionError(null)

    try {
      await api.deletePoleWorkItem(projectId, poleId, workItem.id)
      setDeletingId(null)
      reloadItems()
    } catch (err) {
      setActionError(err)
      setDeletingId(null)
    }
  }

  async function handleApplyTemplate() {
    if (!enabled || !canManage || applying) return

    setApplying(true)
    setActionError(null)

    try {
      await api.applyPoleTemplate(projectId, poleId)
      setApplying(false)
      reloadItems()
    } catch (err) {
      setActionError(err)
      setApplying(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Item Tiang"
        title={pole ? `Item Pekerjaan ${pole.poleCode}` : 'Item Pekerjaan Tiang'}
        subtitle="Kelola item pekerjaan khusus tiang ini. Item di sini independen dari tiang lain dan menjadi dasar progres tiang."
        actions={
          <>
            <ActionButton href={`/tiang/${poleId}`} icon={ArrowLeft}>
              Detail Tiang
            </ActionButton>

            <ActionButton
              variant="primary"
              icon={Plus}
              onClick={() => setCreateOpen(true)}
              disabled={!enabled || !canManage}
            >
              Tambah Item
            </ActionButton>

            {!loading && !canManage && (
              <Badge className="bg-neutral-100 text-neutral-500 ring-neutral-500/20">
                Hanya lihat
              </Badge>
            )}
          </>
        }
      />

      <StatCardGrid columns={3}>
        <StatCard
          label="Total Item Tiang"
          value={loading ? '…' : String(workItems.length)}
          hint={
            disabledCount
              ? `${disabledCount} item nonaktif`
              : 'Seluruh item aktif'
          }
          Icon={ClipboardList}
        />

        <StatCard
          label="Total Bobot"
          value={loading ? '…' : formatPercent(totalWeight)}
          hint={
            weightBalanced
              ? 'Sudah tepat 100%'
              : 'Belum 100% — disesuaikan otomatis saat menyimpan'
          }
          Icon={Scale}
          tone={weightBalanced ? 'sage' : 'ochre'}
        />

        <StatCard
          label="Item dari Template"
          value={
            loading
              ? '…'
              : String(workItems.filter((item) => item.sourceItemId || item.poleId === null).length)
          }
          hint="Item yang berasal dari template project"
          Icon={ClipboardList}
          tone="blue"
        />
      </StatCardGrid>

      {data?.meta?.needs_reconciliation && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Sebagian progres lama masih memakai daftar pekerjaan sebelumnya. Catatan dan foto tetap tersedia.
          Terapkan template untuk menyelaraskan; konflik progres akan ditampilkan tanpa menghapus catatan.
        </div>
      )}

      {(error || actionError) && (
        <ErrorNotice
          error={error || actionError}
          onRetry={error ? reloadItems : undefined}
          title={
            error ? 'Data item tiang belum dapat dimuat' : 'Permintaan gagal'
          }
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
              <ClipboardList className="h-4 w-4" />
            </div>

            <div>
              <CardTitle>Daftar Item Pekerjaan Tiang</CardTitle>
              <CardDescription>
                Perubahan daftar ini hanya berlaku untuk tiang yang dipilih.
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                weightBalanced
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                  : 'bg-amber-50 text-amber-800 ring-amber-600/25'
              }
            >
              Total bobot {formatPercent(totalWeight)}
            </Badge>

            <ActionButton
              onClick={handleApplyTemplate}
              icon={Wand2}
              disabled={applying || loading || !canManage}
            >
              {applying ? 'Menerapkan...' : 'Terapkan Template'}
            </ActionButton>

            <ActionButton onClick={reloadItems} icon={RefreshCw}>
              Muat ulang
            </ActionButton>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <SkeletonRows rows={5} />
          ) : workItems.length ? (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-14">No</Th>
                    <Th>Nama Pekerjaan</Th>
                    <Th align="right">Bobot</Th>
                    <Th align="right">Durasi</Th>
                    <Th align="center">Periode</Th>
                    <Th align="center">Sumber</Th>
                    <Th align="center">Status</Th>
                    <Th align="right" className="w-28">
                      Aksi
                    </Th>
                  </tr>
                </thead>

                <tbody>
                  {workItems.map((item, index) => (
                    <Tr key={item.id}>
                      <Td className="tabular-nums text-neutral-400">
                        {item.sequence ?? index + 1}
                      </Td>

                      <Td>
                        <span className="font-medium text-neutral-900">
                          {item.name}
                        </span>
                      </Td>

                      <Td align="right" className="tabular-nums">
                        {formatPercent(item.weight)}
                      </Td>

                      <Td align="right" className="tabular-nums text-neutral-500">
                        {formatDays(item.plannedDurationDays)}
                      </Td>

                      <Td align="center" className="text-xs text-neutral-500">
                        {item.plannedStartMonth && item.plannedEndMonth
                          ? `B${item.plannedStartMonth} – B${item.plannedEndMonth}`
                          : '—'}
                      </Td>

                      <Td align="center">
                        <Badge
                          className={
                            (item.sourceItemId || item.poleId === null)
                              ? 'bg-lagoon-50 text-lagoon-700 ring-lagoon-600/20'
                              : 'bg-neutral-100 text-neutral-500 ring-neutral-500/20'
                          }
                        >
                          {item.sourceItemId || item.poleId === null ? 'Template' : 'Khusus'}
                        </Badge>
                      </Td>

                      <Td align="center">
                        <Badge
                          className={
                            item.isActive === false
                              ? 'bg-neutral-100 text-neutral-500 ring-neutral-400/30'
                              : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                          }
                        >
                          {item.isActive === false ? 'Nonaktif' : 'Aktif'}
                        </Badge>
                      </Td>

                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditing(item)}
                            disabled={!canManage}
                            aria-label={`Ubah ${item.name}`}
                            title="Ubah"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-canvas hover:text-neutral-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            disabled={deletingId === item.id || !canManage}
                            aria-label={`Hapus ${item.name}`}
                            title="Hapus"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-clay-200 text-clay-600 transition-colors hover:bg-clay-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="Belum ada item pekerjaan di tiang ini"
              description="Tambahkan item khusus tiang ini, atau terapkan template pekerjaan dari project agar tiang memakai daftar item standar."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <ActionButton
                    variant="primary"
                    icon={Plus}
                    onClick={() => setCreateOpen(true)}
                    disabled={!enabled || !canManage}
                  >
                    Tambah Item
                  </ActionButton>

                  <ActionButton
                    icon={Wand2}
                    onClick={handleApplyTemplate}
                    disabled={applying}
                  >
                    {applying ? 'Menerapkan...' : 'Terapkan Template'}
                  </ActionButton>
                </div>
              }
            />
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <PoleWorkItemFormModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          projectId={projectId}
          poleId={poleId}
          workItem={null}
          existingItems={workItems}
          onSaved={reloadItems}
        />
      )}

      {editing && (
        <PoleWorkItemFormModal
          key={editing.id}
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          projectId={projectId}
          poleId={poleId}
          workItem={editing}
          existingItems={workItems}
          onSaved={reloadItems}
        />
      )}

      <p className="text-xs text-neutral-400">
        Ingin mengubah template project? Buka{' '}
        <Link
          href="/pekerjaan/pengaturan"
          className="font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          Pengaturan Pekerjaan
        </Link>
        .
      </p>
    </div>
  )
}

export default function PekerjaanTiangPage() {
  /* Suspense wajib karena `useSearchParams()` di dalam konten — tanpa
     ini build static export menolak. */
  return (
    <AppShell title="Item Pekerjaan Tiang">
      <Suspense fallback={null}>
        <PekerjaanTiangContent />
      </Suspense>
    </AppShell>
  )
}
