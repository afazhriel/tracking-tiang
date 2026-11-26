'use client'

import { useEffect, useState } from 'react'

import AppShell from '../../components/layout/AppShell'
import QuantityPanel from './QuantityPanel'
import RabSection from './RabSection'
import {
  api,
  unwrapItem,
  unwrapList,
} from '../../lib/api'
import { useCurrentUser } from '../../lib/use-current-user'
import { useProject } from '../../lib/project-context'

const emptyForm = {
  name: '',
  code: '',
  start_date: '',
  end_date: '',
  target_quantity: '',
  unit_code: 'unit',
  unit_preset: 'unit',
}

/* Satuan yang dihitung per titik lokasi (bukan per jumlah). Dipakai
   untuk menentukan cara pencatatan progres saat proyek dibuat. */
const LOCATION_UNITS = ['pole', 'tangki', 'titik']

const inputClass =
  'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100'

const primaryClass =
  'rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50'

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  )
}

/* Peran anggota di dalam proyek (bukan peran akun): pengelola bisa
   mengatur proyek, pelaksana mencatat progres, pelihat hanya melihat. */
const PROJECT_ROLES = [
  { value: 'pengelola', label: 'Pengelola' },
  { value: 'pelaksana', label: 'Pelaksana' },
  { value: 'pelihat', label: 'Pelihat' },
]

const PROJECT_ROLE_LABELS = Object.fromEntries(
  PROJECT_ROLES.map((role) => [role.value, role.label])
)

function errorMessage(error) {
  return error?.message || 'Permintaan gagal. Silakan coba kembali.'
}

function ProyekContent() {
  const {
    projects,
    projectId,
    selectProject,
    loading,
    error: projectsError,
  } = useProject()

  const currentUser = useCurrentUser()
  const userId = currentUser?.id
  const rawRole = currentUser?.role
  const role = String(
    typeof rawRole === 'object' ? rawRole?.name : rawRole ?? ''
  ).toLowerCase()
  const isAdmin = ['admin', 'supervisor'].includes(role)

  const canCreateProject = isAdmin && !['pending', 'suspended'].includes(currentUser?.status)

  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')

  const [detail, setDetail] = useState(null)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')
  const [memberId, setMemberId] = useState('')
  const [memberRole, setMemberRole] = useState('pelaksana')
  const [memberBusy, setMemberBusy] = useState(false)

  const [editForm, setEditForm] = useState(null)
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const canManage =
    Boolean(detail) &&
    (isAdmin ||
      (userId != null &&
        Number(detail.owner_user_id) === Number(userId)))

  useEffect(() => {
    let active = true

    // Clear stale permissions immediately when the active project changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetail(null)
    setMembers([])
    setMembersError('')
    setMembersLoading(false)

    if (projectId == null) {
      return () => {
        active = false
      }
    }

    async function load() {
      try {
        const project = unwrapItem(await api.getProject(projectId))
        if (!active) return

        setDetail(project)

        const allowed =
          isAdmin ||
          (userId != null &&
            Number(project.owner_user_id) === Number(userId))

        if (!allowed) return

        setMembersLoading(true)

        try {
          const response = await api.listProjectMembers(projectId)
          if (active) setMembers(unwrapList(response))
        } catch (error) {
          if (active) setMembersError(errorMessage(error))
        } finally {
          if (active) setMembersLoading(false)
        }
      } catch (error) {
        if (active) setMembersError(errorMessage(error))
      }
    }

    load()

    return () => {
      active = false
    }
  }, [projectId, userId, isAdmin])

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  function pickUnit(value) {
    setForm((previous) => ({
      ...previous,
      unit_preset: value,
      unit_code: value === 'custom' ? '' : value,
    }))
  }

  const UNIT_PRESETS = ['pole', 'unit', 'tangki', 'paket', 'km', 'titik']

  function openEdit() {
    if (!detail) return
    const preset = UNIT_PRESETS.includes(detail.unit_code)
      ? detail.unit_code
      : 'custom'
    setEditForm({
      name: detail.name ?? '',
      code: detail.code ?? '',
      start_date: detail.start_date ? String(detail.start_date).slice(0, 10) : '',
      end_date: detail.end_date ? String(detail.end_date).slice(0, 10) : '',
      target_quantity:
        detail.target_quantity != null
          ? String(Number(detail.target_quantity))
          : '',
      unit_code: detail.unit_code ?? 'unit',
      unit_preset: preset,
      progress_source: detail.progress_source ?? 'quantity_entries',
      status: detail.status ?? 'active',
    })
    setEditError('')
  }

  function updateEdit(field, value) {
    setEditForm((previous) =>
      previous ? { ...previous, [field]: value } : previous,
    )
  }

  function pickEditUnit(value) {
    setEditForm((previous) =>
      previous
        ? {
            ...previous,
            unit_preset: value,
            unit_code: value === 'custom' ? '' : value,
          }
        : previous,
    )
  }

  async function saveEdit(event) {
    event.preventDefault()
    if (!editForm || editSaving) return
    setEditSaving(true)
    setEditError('')
    try {
      const payload = {
        name: editForm.name.trim(),
        code: editForm.code.trim().toUpperCase(),
        target_quantity: editForm.target_quantity,
        unit_code: editForm.unit_code.trim().toLowerCase(),
        progress_source: editForm.progress_source,
        status: editForm.status,
      }
      if (editForm.start_date) payload.start_date = editForm.start_date
      if (editForm.end_date) payload.end_date = editForm.end_date
      const updated = unwrapItem(await api.updateProject(projectId, payload))
      if (updated) setDetail(updated)
      setEditForm(null)
      setNotice('Proyek berhasil diperbarui.')
    } catch (error) {
      setEditError(errorMessage(error))
    } finally {
      setEditSaving(false)
    }
  }

  async function createProject(event) {
    event.preventDefault()
    if (saving || !canCreateProject) return

    setSaving(true)
    setFormError('')
    setNotice('')

    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
      }

      if (form.start_date) payload.start_date = form.start_date
      if (form.end_date) payload.end_date = form.end_date
      payload.target_quantity = form.target_quantity
      payload.unit_code = form.unit_code.trim().toLowerCase()
      /* Cara pencatatan ditentukan dari satuan: titik lokasi dicatat
         per titik, satuan lain dicatat sebagai jumlah terhadap target. */
      payload.progress_source = LOCATION_UNITS.includes(payload.unit_code)
        ? 'pole_weighted'
        : 'quantity_entries'

      const response = await api.createProject(payload)
      const created = unwrapItem(response)

      if (!created?.id) {
        throw new Error('Proyek dibuat, tetapi ID proyek tidak diterima.')
      }

      setNotice('Proyek berhasil dibuat.')
      selectProject(created.id)
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function refreshMembers() {
    const response = await api.listProjectMembers(projectId)
    setMembers(unwrapList(response))
  }

  async function addMember(event) {
    event.preventDefault()
    const id = Number(memberId)

    if (!Number.isSafeInteger(id) || id <= 0 || memberBusy) return

    setMemberBusy(true)
    setMembersError('')
    setNotice('')

    try {
      await api.addProjectMember(projectId, id, memberRole)
      await refreshMembers()
      setMemberId('')
      setMemberRole('pelaksana')
      setNotice('Anggota proyek berhasil ditambahkan.')
    } catch (error) {
      setMembersError(errorMessage(error))
    } finally {
      setMemberBusy(false)
    }
  }

  async function changeMemberRole(member, role) {
    if (memberBusy) return
    if ((member.project_role ?? 'pelaksana') === role) return

    setMemberBusy(true)
    setMembersError('')

    try {
      await api.updateProjectMemberRole(projectId, member.id, role)
      await refreshMembers()
      setNotice(`Peran ${member.name} diubah menjadi ${PROJECT_ROLE_LABELS[role] ?? role}.`)
    } catch (error) {
      setMembersError(errorMessage(error))
    } finally {
      setMemberBusy(false)
    }
  }

  async function removeMember(member) {
    if (memberBusy) return
    if (!window.confirm(`Cabut akses ${member.name} dari proyek ini?`)) {
      return
    }

    setMemberBusy(true)
    setMembersError('')
    setNotice('')

    try {
      await api.removeProjectMember(projectId, member.id)
      await refreshMembers()
      setNotice('Keanggotaan berhasil dicabut.')
    } catch (error) {
      setMembersError(errorMessage(error))
    } finally {
      setMemberBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 pb-6">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">
            Manajemen Proyek
          </h1>
        </div>

        {notice && (
          <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {notice}
          </p>
        )}

        <div className="grid gap-3">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">
              Proyek Saya
            </h2>

            {projectsError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {errorMessage(projectsError)}
              </p>
            )}

            <div className="mt-4 space-y-2">
              {loading && (
                <p className="text-sm text-neutral-500">Memuat proyek...</p>
              )}

              {!loading && !projects?.length && (
                <p className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">
                  Belum ada proyek yang dapat Anda akses. Admin atau Supervisor dapat membuat proyek dan mengatur akses.
                </p>
              )}

              {projects?.map((project) => {
                const selected = String(project.id) === String(projectId)

                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => selectProject(project.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selected
                        ? 'border-orange-400 bg-orange-50'
                        : 'border-neutral-200 hover:border-orange-300'
                    }`}
                  >
                    <span className="block font-semibold text-neutral-900">
                      {project.name || `Proyek ${project.id}`}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      {project.code || `ID ${project.id}`}
                      {selected ? ' · Proyek aktif' : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {canCreateProject && (<section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">
              Buat Proyek Baru
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Proyek baru otomatis menjadi milik akun Anda.
            </p>

            <form onSubmit={createProject} className="mt-4 space-y-3">
              <Field label="Nama proyek">
                <input
                  className={inputClass}
                  required
                  maxLength={255}
                  value={form.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                  placeholder="Contoh: Pembangunan Jaringan Wilayah 2"
                />
              </Field>

              <Field label="Kode proyek (harus unik)">
                <input
                  className={inputClass}
                  required
                  maxLength={255}
                  value={form.code}
                  onChange={(event) => updateForm('code', event.target.value)}
                  placeholder="Contoh: PRJ-002"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Tanggal mulai">
                  <input
                    type="date"
                    className={inputClass}
                    value={form.start_date}
                    onChange={(event) =>
                      updateForm('start_date', event.target.value)
                    }
                  />
                </Field>

                <Field label="Tanggal selesai">
                  <input
                    type="date"
                    className={inputClass}
                    min={form.start_date || undefined}
                    value={form.end_date}
                    onChange={(event) =>
                      updateForm('end_date', event.target.value)
                    }
                  />
                </Field>
              </div>

              <Field label="Target Jumlah Proyek">
                <input
                  type="number"
                  required
                  min="0.0001"
                  step="0.0001"
                  className={inputClass}
                  value={form.target_quantity}
                  onChange={(event) =>
                    updateForm('target_quantity', event.target.value)
                  }
                  placeholder="Contoh: 1500"
                />
              </Field>
              <Field label="Satuan Proyek">
                <select
                  className={inputClass}
                  value={form.unit_preset}
                  onChange={(event) => pickUnit(event.target.value)}
                >
                  <option value="pole">Tiang</option>
                  <option value="unit">Unit</option>
                  <option value="tangki">Tangki</option>
                  <option value="paket">Paket</option>
                  <option value="km">Kilometer</option>
                  <option value="titik">Lokasi</option>
                  <option value="custom">Lainnya (isi sendiri)</option>
                </select>
                {form.unit_preset === 'custom' && (
                  <input
                    className={`${inputClass} mt-2`}
                    required
                    maxLength={32}
                    pattern="[a-z][a-z0-9_]*"
                    value={form.unit_code}
                    onChange={(event) =>
                      updateForm('unit_code', event.target.value.toLowerCase())
                    }
                    placeholder="Contoh: mesin, gardu, panel"
                  />
                )}
                <p className="mt-1 text-xs text-neutral-500">
                  {LOCATION_UNITS.includes(form.unit_code.trim().toLowerCase())
                    ? 'Progres dicatat per titik lokasi.'
                    : 'Progres dicatat sebagai jumlah terhadap target.'}
                </p>
              </Field>

              {formError && (
                <p role="alert" className="text-sm text-red-700">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className={primaryClass}
              >
                {saving ? 'Menyimpan...' : 'Buat Proyek'}
              </button>
            </form>
          </section>
          )}
        </div>

        {detail?.progress_source === 'quantity_entries' && (
          <QuantityPanel
            key={projectId}
            projectId={projectId}
            startDate={detail.start_date}
            targetQuantity={detail.target_quantity}
            unitCode={detail.unit_code}
            canWrite={canManage}
          />
        )}

        {detail && canManage && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  Pengaturan Proyek
                </h2>
              </div>
              {!editForm && (
                <button
                  type="button"
                  onClick={openEdit}
                  className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Ubah Proyek
                </button>
              )}
            </div>

            {editForm && (
              <form onSubmit={saveEdit} className="mt-5 grid gap-3">
                <Field label="Nama Proyek">
                  <input
                    className={inputClass}
                    required
                    value={editForm.name}
                    onChange={(event) => updateEdit('name', event.target.value)}
                  />
                </Field>
                <Field label="Kode Proyek">
                  <input
                    className={inputClass}
                    required
                    value={editForm.code}
                    onChange={(event) => updateEdit('code', event.target.value)}
                  />
                </Field>
                <Field label="Tanggal Mulai">
                  <input
                    type="date"
                    className={inputClass}
                    value={editForm.start_date}
                    onChange={(event) => updateEdit('start_date', event.target.value)}
                  />
                </Field>
                <Field label="Tanggal Selesai">
                  <input
                    type="date"
                    className={inputClass}
                    value={editForm.end_date}
                    onChange={(event) => updateEdit('end_date', event.target.value)}
                  />
                </Field>
                <Field label="Cara mencatat progres">
                  <div className="grid gap-2">
                    {[
                      { value: 'pole_weighted', title: 'Per lokasi' },
                      { value: 'quantity_entries', title: 'Per jumlah' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateEdit('progress_source', opt.value)}
                        className={`rounded-xl border p-3 text-left text-sm font-semibold transition ${
                          editForm.progress_source === opt.value
                            ? 'border-orange-500 bg-orange-50 text-neutral-900'
                            : 'border-neutral-300 text-neutral-600 hover:border-orange-300'
                        }`}
                      >
                        {opt.title}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Mode hanya dapat diubah selama proyek belum memiliki data
                    lokasi maupun catatan jumlah.
                  </p>
                </Field>
                <Field label="Status Proyek">
                  <select
                    className={inputClass}
                    value={editForm.status}
                    onChange={(event) => updateEdit('status', event.target.value)}
                  >
                    <option value="active">Aktif</option>
                    <option value="draft">Draf</option>
                    {!['active', 'draft'].includes(editForm.status) && (
                      <option value={editForm.status}>{editForm.status}</option>
                    )}
                  </select>
                </Field>
                <Field label="Target Jumlah Proyek">
                  <input
                    type="number"
                    required
                    min="0.0001"
                    step="0.0001"
                    className={inputClass}
                    value={editForm.target_quantity}
                    onChange={(event) =>
                      updateEdit('target_quantity', event.target.value)
                    }
                  />
                </Field>
                <Field label="Satuan Proyek">
                  <select
                    className={inputClass}
                    value={editForm.unit_preset}
                    onChange={(event) => pickEditUnit(event.target.value)}
                  >
                    <option value="pole">Tiang</option>
                    <option value="unit">Unit</option>
                    <option value="tangki">Tangki</option>
                    <option value="paket">Paket</option>
                    <option value="km">Kilometer</option>
                    <option value="titik">Lokasi</option>
                    <option value="custom">Lainnya (isi sendiri)</option>
                  </select>
                  {editForm.unit_preset === 'custom' && (
                    <input
                      className={`${inputClass} mt-2`}
                      required
                      maxLength={32}
                      pattern="[a-z][a-z0-9_]*"
                      value={editForm.unit_code}
                      onChange={(event) =>
                        updateEdit('unit_code', event.target.value.toLowerCase())
                      }
                      placeholder="Contoh: mesin, gardu, panel"
                    />
                  )}
                </Field>

                {editError && (
                  <p role="alert" className="text-sm text-red-700 sm:col-span-2">
                    {editError}
                  </p>
                )}

                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={editSaving} className={primaryClass}>
                    {editSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm(null)}
                    className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {detail && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Surat Job / Perintah Kerja
              </h2>
              <p className="mt-1 max-w-xl text-sm text-neutral-500">
                {detail.progress_source === 'quantity_entries'
                  ? 'Terbitkan surat perintah kerja berisi catatan progres, tim pelaksana, dan progres terakhir — siap dicetak atau disimpan sebagai PDF untuk dibagikan ke tim lapangan.'
                  : 'Terbitkan surat perintah kerja berisi daftar titik lokasi, wilayah, tim pelaksana, dan progres terakhir — siap dicetak atau disimpan sebagai PDF untuk dibagikan ke tim lapangan.'}
              </p>
            </div>
            <a
              href={`/surat-job?proyek=${projectId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Buka Surat Job
            </a>
          </section>
        )}

        {detail && (
          <RabSection projectId={projectId} currentUser={currentUser} />
        )}

        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">
            Kelola Anggota Proyek Aktif
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Penambahan dan pencabutan anggota hanya tersedia untuk pemilik
            proyek atau Admin.
          </p>

          {!projectId && (
            <p className="mt-4 text-sm text-neutral-600">
              Buat atau pilih proyek terlebih dahulu.
            </p>
          )}

          {projectId && !detail && (
            <p className="mt-4 text-sm text-neutral-500">
              Memuat informasi proyek...
            </p>
          )}

          {detail && !canManage && (
            <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">
              Anda dapat mengakses proyek ini, tetapi pengelolaan anggota
              hanya tersedia untuk pemilik atau Admin.
            </p>
          )}

          {canManage && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-neutral-600">
                Pemilik proyek: pengguna ID {detail.owner_user_id}
              </p>

              <form
                onSubmit={addMember}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="min-w-48 flex-1">
                  <Field label="ID pengguna aktif">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      className={inputClass}
                      value={memberId}
                      onChange={(event) => setMemberId(event.target.value)}
                      placeholder="Contoh: 4"
                    />
                  </Field>
                </div>

                <div className="min-w-40">
                  <Field label="Peran di proyek">
                    <select
                      className={inputClass}
                      value={memberRole}
                      onChange={(event) => setMemberRole(event.target.value)}
                    >
                      {PROJECT_ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <button
                  type="submit"
                  disabled={memberBusy}
                  className={primaryClass}
                >
                  Tambah Anggota
                </button>
              </form>

              <p className="text-xs text-neutral-500">
                Gunakan ID akun pengguna yang sudah terdaftar dan aktif.
                Menambahkan anggota tidak mengubah peran akun pengguna.
                Pelaksana mencatat progres, pengelola mengatur proyek,
                pelihat hanya melihat.
              </p>

              {membersError && (
                <p role="alert" className="text-sm text-red-700">
                  {membersError}
                </p>
              )}

              {membersLoading && (
                <p className="text-sm text-neutral-500">
                  Memuat daftar anggota...
                </p>
              )}

              {!membersLoading && members.length === 0 && (
                <p className="text-sm text-neutral-500">
                  Belum ada anggota tambahan yang tercatat.
                </p>
              )}

              <ul className="divide-y divide-neutral-100">
                {members.map((member) => {
                  const protectedMember =
                    Number(member.id) === Number(detail.owner_user_id) ||
                    String(member.role).toLowerCase() === 'admin'

                  return (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-medium text-neutral-900">
                          {member.name}
                        </p>
                        <p className="text-xs text-neutral-500">
                          ID {member.id} · {member.email} ·{' '}
                          {PROJECT_ROLE_LABELS[member.project_role] ?? 'Pelaksana'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Peran ${member.name} di proyek`}
                          className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-xs font-medium text-neutral-700 outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
                          value={member.project_role ?? 'pelaksana'}
                          disabled={memberBusy || protectedMember}
                          onChange={(event) =>
                            changeMemberRole(member, event.target.value)
                          }
                        >
                          {PROJECT_ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={memberBusy || protectedMember}
                          onClick={() => removeMember(member)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {protectedMember ? 'Dilindungi' : 'Cabut Akses'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
    </div>
  )
}

export default function ProyekPage() {
  return (
    <AppShell title="Manajemen Proyek">
      <ProyekContent />
    </AppShell>
  )
}
