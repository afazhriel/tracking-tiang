'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CircleAlert,
  ClipboardList,
  Pencil,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
} from 'lucide-react'

import AppShell from '../../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../../components/layout/PageHeader'
import {
  FormField,
  Modal,
  SubmitButton,
  TextInput,
} from '../../../components/ui/modal'
import { Badge } from '../../../components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { EmptyState } from '../../../components/ui/empty-state'
import { StatCard, StatCardGrid } from '../../../components/ui/stat-card'
import { Table, TableWrap, Td, Th, Tr } from '../../../components/ui/table'
import { ErrorNotice, SkeletonRows } from '../../../components/ui/states'
import { useProject } from '../../../lib/project-context'
import { useCurrentUser } from '../../../lib/use-current-user'
import { api, normalizeWorkItem, unwrapList } from '../../../lib/api'
import { useResource } from '../../../lib/use-api'
import { formatDays, formatPercent } from '../../../lib/format'

const EMPTY_FORM = {
  name: '',
  weight_percent: '',
  sequence: '',
  planned_duration_days: '',
  planned_start_month: '',
  planned_end_month: '',
  is_active: true,
}

/**
 * Bobot sebuah item pekerjaan terhadap total proyek.
 *
 * Backend memvalidasi tiap item 0..100, tetapi penjumlahan seluruh
 * item tidak boleh melewati 100% supaya progres berbobot tetap
 * bermakna. Halaman ini menegakkan aturan itu di sisi klien sebelum
 * request dikirim, dan menandai item yang belum membuat total = 100%.
 */
function toFormValue(value) {
  return value === null || value === undefined ? '' : String(value)
}

function parseNumber(value) {
  if (value === '' || value === null || value === undefined) return null

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

function WorkItemFormModal({
  open,
  onClose,
  projectId,
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

  const weightExceeded = totalAfterSave > 100.0001

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
        errors.name = ['Nama pekerjaan sudah dipakai pada project ini.']
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

    if (weightExceeded) {
      setFormError({
        message: `Total bobot setelah disimpan menjadi ${formatPercent(
          totalAfterSave
        )}, melebihi 100%. Kurangi bobot item lain terlebih dahulu.`,
      })

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
        ? await api.updateWorkItem(projectId, editingId, payload)
        : await api.createWorkItem(projectId, payload)

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
      title={editingId ? 'Ubah Item Pekerjaan' : 'Tambah Item Pekerjaan'}
      description="Bobot, durasi, dan periode dipakai untuk menghitung progres serta Kurva S."
      size="md"
      footer={
        <>
          <ActionButton onClick={onClose}>Batal</ActionButton>

          <SubmitButton
            form="work-item-form"
            loading={saving}
            loadingLabel="Menyimpan..."
            disabled={weightExceeded}
          >
            {editingId ? 'Simpan Perubahan' : 'Tambah Item'}
          </SubmitButton>
        </>
      }
    >
      <form
        id="work-item-form"
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
          htmlFor="work-item-name"
          required
          error={fieldErrors?.name?.[0]}
          hint="Unik per project. Contoh: Pembersihan Lahan."
        >
          <TextInput
            id="work-item-name"
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
            htmlFor="work-item-weight"
            required
            error={fieldErrors?.weight_percent?.[0]}
            hint="0 – 100. Total seluruh item sebaiknya 100%."
          >
            <TextInput
              id="work-item-weight"
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
            htmlFor="work-item-sequence"
            error={fieldErrors?.sequence?.[0]}
            hint="Opsional. Menentukan urutan tampil."
          >
            <TextInput
              id="work-item-sequence"
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
          htmlFor="work-item-duration"
          error={fieldErrors?.planned_duration_days?.[0]}
          hint="Opsional. Lama pengerjaan menurut rencana."
        >
          <TextInput
            id="work-item-duration"
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
            htmlFor="work-item-start"
            error={fieldErrors?.planned_start_month?.[0]}
            hint="Opsional. Bulan ke-berapa proyek dimulai (1 = bulan pertama)."
          >
            <TextInput
              id="work-item-start"
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
            htmlFor="work-item-end"
            error={fieldErrors?.planned_end_month?.[0]}
            hint="Opsional. Dipakai untuk menyusun rencana Kurva S."
          >
            <TextInput
              id="work-item-end"
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
            weightExceeded
              ? 'border-clay-300/70 bg-clay-50 text-clay-700'
              : 'border-neutral-200 bg-canvas text-neutral-500'
          }`}
        >
          Total bobot bila disimpan:{' '}
          <strong className="font-semibold tabular-nums">
            {formatPercent(totalAfterSave)}
          </strong>
          {weightExceeded
            ? ' — melebihi 100%, penyimpanan diblokir.'
            : totalAfterSave !== 100
              ? ' — belum tepat 100%.'
              : ' — sudah tepat 100%.'}
        </div>
      </form>
    </Modal>
  )
}

function PekerjaanSettingsContent() {
  const { projectId, project, reload: reloadProject } = useProject()

  const currentUser = useCurrentUser()
  const isAdmin = currentUser?.role === 'admin'

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const itemsLoader = useCallback(async () => {
    if (!projectId) return { items: [], meta: null }

    const payload = await api.listWorkItems(projectId)

    return {
      items: unwrapList(payload).map(normalizeWorkItem),
      meta: payload?.meta ?? null,
    }
  }, [projectId])

  const {
    data,
    error,
    loading,
    reload: reloadItems,
  } = useResource(itemsLoader, [projectId], { enabled: Boolean(projectId) })

  const workItems = useMemo(() => data?.items ?? [], [data])

  const totalWeight = useMemo(
    () => workItems.reduce((sum, item) => sum + Number(item.weight || 0), 0),
    [workItems]
  )

  const weightBalanced = Math.abs(totalWeight - 100) < 0.0001

  const disabledCount = workItems.filter((item) => item.isActive === false).length

  const refresh = useCallback(() => {
    reloadItems()
    reloadProject?.()
  }, [reloadItems, reloadProject])

  async function handleDelete(workItem) {
    if (!projectId) return

    setDeletingId(workItem.id)
    setDeleteError(null)

    try {
      await api.deleteWorkItem(projectId, workItem.id)

      setDeletingId(null)
      refresh()
    } catch (err) {
      setDeleteError(err)
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project Control"
        title="Pengaturan Pekerjaan"
        subtitle="Kelola jenis item pekerjaan, bobot, durasi, dan periode rencananya. Semua halaman lain mengikuti data ini."
        actions={
          <>
            <ActionButton href="/pekerjaan" icon={ArrowLeft}>
              Daftar Pekerjaan
            </ActionButton>

            <ActionButton
              variant="primary"
              icon={Plus}
              onClick={() => setCreateOpen(true)}
              disabled={!projectId}
            >
              Tambah Item
            </ActionButton>

            {!isAdmin && (
              <Badge className="bg-neutral-100 text-neutral-500 ring-neutral-500/20">
                Hanya admin
              </Badge>
            )}
          </>
        }
      />

      <StatCardGrid columns={3}>
        <StatCard
          label="Total Item Pekerjaan"
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
              : 'Belum tepat 100% — sesuaikan bobot'
          }
          Icon={Scale}
          tone={weightBalanced ? 'sage' : 'ochre'}
        />

        <StatCard
          label="Penyebut Progres"
          value={
            data?.meta?.progress_denominator ?? project?.totalTargetPoles ?? '—'
          }
          hint={
            project?.totalTargetPoles
              ? 'Target jumlah tiang proyek'
              : 'Jumlah tiang terdaftar (target belum diatur)'
          }
          Icon={ClipboardList}
          tone="blue"
        />
      </StatCardGrid>

      {!weightBalanced && workItems.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-card border border-amber-300/70 bg-amber-50/80 px-4 py-3"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />

          <p className="text-xs leading-5 text-amber-800">
            Total bobot saat ini {formatPercent(totalWeight)}. Sesuaikan
            hingga tepat 100% agar progres proyek dan Kurva S merepresentasikan
            seluruh pekerjaan.
          </p>
        </div>
      )}

      {(error || deleteError) && (
        <ErrorNotice
          error={error || deleteError}
          onRetry={error ? reloadItems : undefined}
          title="Data pekerjaan belum dapat dimuat"
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100">
              <ClipboardList className="h-4 w-4" />
            </div>

            <div>
              <CardTitle>Daftar Item Pekerjaan</CardTitle>
              <CardDescription>
                Sumber data: GET /api/projects/{'{id}'}/work-items
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
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditing(item)}
                                aria-label={`Ubah ${item.name}`}
                                title="Ubah"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-canvas hover:text-neutral-800"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDelete(item)}
                                disabled={deletingId === item.id}
                                aria-label={`Hapus ${item.name}`}
                                title="Hapus"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-clay-200 text-clay-600 transition-colors hover:bg-clay-50 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
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
              title="Belum ada item pekerjaan"
              description="Tambahkan item pekerjaan beserta bobotnya. Data ini menjadi dasar progres berbobot dan Kurva S."
              action={
                isAdmin && (
                  <ActionButton
                    variant="primary"
                    icon={Plus}
                    onClick={() => setCreateOpen(true)}
                    disabled={!projectId}
                  >
                    Tambah Item
                  </ActionButton>
                )
              }
            />
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <WorkItemFormModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          projectId={projectId}
          workItem={null}
          existingItems={workItems}
          onSaved={refresh}
        />
      )}

      {editing && (
        <WorkItemFormModal
          key={editing.id}
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          projectId={projectId}
          workItem={editing}
          existingItems={workItems}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

export default function PekerjaanSettingsPage() {
  return (
    <AppShell title="Pengaturan Pekerjaan">
      <PekerjaanSettingsContent />
    </AppShell>
  )
}
