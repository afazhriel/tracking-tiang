'use client'

import { useState } from 'react'
import { CircleAlert, Save } from 'lucide-react'

import { api } from '../../lib/api'
import { clampPercent, formatPercent, todayIso } from '../../lib/format'
import { cn } from '../../lib/utils'
import { ProgressBar } from '../ui/progress-bar'
import { ActionButton } from '../layout/PageHeader'
import {
  FormField,
  Modal,
  SelectInput,
  SubmitButton,
  TextArea,
  TextInput,
} from '../ui/modal'

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : ''
}

/**
 * Form update progress satu item pekerjaan pada satu tiang.
 *
 * Menyimpan ke `POST /api/projects/{project}/poles/{pole}/progress`.
 * `ProgressController@store` memakai `updateOrCreate`, jadi:
 *  - `work_item_id` wajib ada di tabel `work_items`;
 *  - `progress_percent` wajib, numeric, 0..100;
 *  - `started_at` / `completed_at` opsional (date);
 *  - `notes` opsional.
 *
 * Setiap simpan menambah satu baris `pole_progress_histories`, jadi
 * form ini adalah "catat realisasi baru", bukan "edit riwayat" —
 * mengikuti semantik backend.
 *
 * State form dipegang komponen `ProgressForm` yang di-mount ulang
 * lewat `key` setiap item berganti. Itu membuat form selalu terisi
 * nilai tersimpan tanpa butuh `useEffect` untuk menyalin state, dan
 * sekaligus membuang input setengah jadi ketika item diganti.
 */
export function UpdateProgressModal({
  open,
  onClose,
  projectId,
  pole,
  workItems,
  currentProgress,
  onSaved,
}) {
  /* Item yang sudah punya progress ditampilkan lebih dulu — membuka
     form untuk memperbarui angka yang sama adalah kasus paling sering. */
  const [workItemId, setWorkItemId] = useState(() => {
    const firstWithProgress = currentProgress?.find((entry) => entry.workItemId)

    if (firstWithProgress) return String(firstWithProgress.workItemId)

    return workItems?.[0]?.id !== undefined ? String(workItems[0].id) : ''
  })

  const existing = currentProgress?.find(
    (entry) => String(entry.workItemId) === String(workItemId)
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Catat Progress — ${pole?.poleCode ?? 'Tiang'}`}
      description="POST /api/projects/{project}/poles/{pole}/progress. Penyimpanan menambah satu entri riwayat baru."
      footer={null}
    >
      <FormField
        label="Item Pekerjaan"
        htmlFor="progress-work-item"
        required
        hint={
          workItems?.length
            ? 'Wajib. Harus item yang terdaftar pada project ini.'
            : 'Project ini belum punya item pekerjaan, jadi form tidak bisa dipakai.'
        }
        className="mb-4"
      >
        <SelectInput
          id="progress-work-item"
          name="work_item_id"
          value={workItemId}
          onChange={(event) => setWorkItemId(event.target.value)}
          disabled={!workItems?.length}
        >
          <option value="">Pilih item pekerjaan</option>

          {workItems?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.sequence ? `${item.sequence}. ` : ''}
              {item.name} (bobot {formatPercent(item.weight, 0)})
            </option>
          ))}
        </SelectInput>
      </FormField>

      {workItemId ? (
        <ProgressForm
          key={workItemId}
          projectId={projectId}
          poleId={pole?.id}
          workItemId={workItemId}
          existing={existing}
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-4 text-xs leading-5 text-neutral-500">
          Pilih item pekerjaan di atas untuk mulai mencatat realisasi.
        </p>
      )}
    </Modal>
  )
}

function ProgressForm({
  projectId,
  poleId,
  workItemId,
  existing,
  onSaved,
  onClose,
}) {
  const [percent, setPercent] = useState(String(existing?.progress ?? 0))
  const [startedAt, setStartedAt] = useState(toDateInput(existing?.startedAt))
  const [completedAt, setCompletedAt] = useState(
    toDateInput(existing?.completedAt)
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [fieldErrors, setFieldErrors] = useState(null)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  const numericPercent = clampPercent(percent)

  const dirty =
    String(existing?.progress ?? 0) !== String(numericPercent) ||
    notes !== (existing?.notes ?? '') ||
    toDateInput(existing?.startedAt) !== startedAt ||
    toDateInput(existing?.completedAt) !== completedAt

  function clearFieldError(field) {
    setFieldErrors((previous) => {
      if (!previous) return previous

      const next = { ...previous }

      delete next[field]

      return Object.keys(next).length ? next : null
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (saving) return

    setSaving(true)
    setFieldErrors(null)
    setFormError(null)

    /* `existing` hanya ada kalau item ini sudah punya progress. Untuk
       update pertama kali `existing` undefined, jadi `Number(undefined)`
       = NaN yang JSON.stringify ubah jadi null dan ditolak backend.
       Yang dikirim harus item yang sedang dipilih di form. */
    const payload = {
      work_item_id: Number(workItemId),
      progress_percent: numericPercent,
    }

    /* Tanggal kosong berarti "tidak diisi" — bukan mengirim null yang
       bisa menghapus nilai lama. Dikosongkan saja lebih aman untuk
       koreksi kesalahan input. */
    if (startedAt) payload.started_at = startedAt
    if (completedAt) payload.completed_at = completedAt
    if (notes.trim()) payload.notes = notes.trim()

    try {
      const response = await api.savePoleProgress(projectId, poleId, payload)

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

  const previewTone =
    numericPercent >= 100 ? 'sage' : numericPercent > 0 ? 'lagoon' : 'sand'

  return (
    <form
      id="update-progress-form"
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
              Progress gagal disimpan
            </p>
            <p className="mt-0.5 text-xs leading-5 text-clay-700">
              {formError.message}
            </p>
          </div>
        </div>
      )}

      <FormField
        label="Realisasi"
        htmlFor="progress-percent"
        required
        error={fieldErrors?.progress_percent?.[0]}
        hint="0 sampai 100. Slider dan ketik angka memakai nilai yang sama."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={numericPercent}
              onChange={(event) => setPercent(event.target.value)}
              aria-label="Geser persentase progress"
              className="h-2 w-full flex-1 cursor-pointer appearance-none rounded-full bg-neutral-200 accent-brand-600"
            />

            <TextInput
              id="progress-percent"
              name="progress_percent"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={percent}
              onChange={(event) => {
                setPercent(event.target.value)
                clearFieldError('progress_percent')
              }}
              invalid={Boolean(fieldErrors?.progress_percent)}
              className="w-24 text-center"
            />

            <span className="text-sm font-medium text-neutral-500">%</span>
          </div>

          <div className="rounded-xl border border-neutral-100 bg-canvas px-3 py-2.5">
            <ProgressBar value={numericPercent} size="xs" tone={previewTone} />

            <p className="mt-2 text-[11px] text-neutral-500">
              {numericPercent >= 100
                ? 'Tercapai penuh. Status tiang ikut berubah lewat perhitungan progress berbobot.'
                : numericPercent > 0
                  ? 'Pekerjaan sedang berjalan.'
                  : 'Belum ada realisasi. Isi tanggal mulai bila pekerjaan sudah dimulai.'}
            </p>
          </div>
        </div>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Mulai"
          htmlFor="progress-started-at"
          error={fieldErrors?.started_at?.[0]}
          hint="Opsional."
        >
          <TextInput
            id="progress-started-at"
            name="started_at"
            type="date"
            max={todayIso()}
            value={startedAt}
            onChange={(event) => {
              setStartedAt(event.target.value)
              clearFieldError('started_at')
            }}
            invalid={Boolean(fieldErrors?.started_at)}
          />
        </FormField>

        <FormField
          label="Selesai"
          htmlFor="progress-completed-at"
          error={fieldErrors?.completed_at?.[0]}
          hint="Isi bila pekerjaan sudah rampung."
        >
          <TextInput
            id="progress-completed-at"
            name="completed_at"
            type="date"
            value={completedAt}
            onChange={(event) => {
              setCompletedAt(event.target.value)
              clearFieldError('completed_at')
            }}
            invalid={Boolean(fieldErrors?.completed_at)}
          />
        </FormField>
      </div>

      <FormField
        label="Catatan Lapangan"
        htmlFor="progress-notes"
        error={fieldErrors?.notes?.[0]}
        hint="Opsional. Keterlambatan, kekurangan material, akses lapangan, atau hal lain yang perlu diketahui supervisor."
      >
        <TextArea
          id="progress-notes"
          name="notes"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value)
            clearFieldError('notes')
          }}
          invalid={Boolean(fieldErrors?.notes)}
          rows={3}
          placeholder="Contoh: pondasi selesai, menunggu approval engineer."
        />
      </FormField>

      <div
        className={cn(
          'sticky bottom-0 z-10 -mx-1 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-paper/95 px-4 py-4 shadow-[0_-8px_20px_rgba(0,0,0,0.06)] backdrop-blur rounded-xl',
          !dirty && 'opacity-70'
        )}
      >
        <p className="text-xs leading-5 text-neutral-500">
          {dirty
            ? 'Menyimpan akan menambah satu baris riwayat progress di backend.'
            : 'Tidak ada perubahan dari nilai yang tersimpan.'}
        </p>

        <div className="flex items-center gap-2">
          <ActionButton onClick={onClose}>Batal</ActionButton>

          <SubmitButton loading={saving} loadingLabel="Menyimpan..." disabled={!dirty}>
            Simpan Progress
          </SubmitButton>
        </div>
      </div>
    </form>
  )
}

/** Tombol pembuka form update progress. */
export function UpdateProgressButton({ onClick, disabled, className }) {
  return (
    <ActionButton
      onClick={onClick}
      icon={Save}
      variant="primary"
      disabled={disabled}
      title={disabled ? 'Project atau item pekerjaan belum siap dimuat' : undefined}
      className={className}
    >
      Catat Progress
    </ActionButton>
  )
}
