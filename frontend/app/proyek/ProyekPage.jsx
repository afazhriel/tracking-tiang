'use client'

import { useEffect, useMemo, useState } from 'react'

import AppShell from '../../components/layout/AppShell'
import QuantityPanel from './QuantityPanel'
import {
  api,
  getStoredUser,
  unwrapItem,
  unwrapList,
} from '../../lib/api'
import { useProject } from '../../lib/project-context'

const emptyForm = {
  name: '',
  code: '',
  start_date: '',
  end_date: '',
  target_quantity: '',
  unit_code: 'unit',
}

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

  const currentUser = useMemo(() => getStoredUser(), [])
  const userId = currentUser?.id
  const rawRole = currentUser?.role
  const role = String(
    typeof rawRole === 'object' ? rawRole?.name : rawRole ?? ''
  ).toLowerCase()
  const isAdmin = role === 'admin'

  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')

  const [detail, setDetail] = useState(null)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState('')
  const [memberId, setMemberId] = useState('')
  const [memberBusy, setMemberBusy] = useState(false)

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

  async function createProject(event) {
    event.preventDefault()
    if (saving) return

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
      await api.addProjectMember(projectId, id)
      await refreshMembers()
      setMemberId('')
      setNotice('Anggota proyek berhasil ditambahkan.')
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
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-12">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Manajemen Proyek
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Buat proyek, pilih proyek aktif, dan atur anggota sesuai hak akses.
          </p>
        </div>

        {notice && (
          <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {notice}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">
              Proyek Saya
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Pilih proyek untuk membuka data dan progres proyek tersebut.
            </p>

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
                  Belum ada proyek yang dapat Anda akses. Buat proyek pertama Anda.
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

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">
              Buat Proyek Baru
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Proyek baru otomatis menjadi milik akun Anda.
            </p>

            <form onSubmit={createProject} className="mt-4 space-y-4">
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

              <Field label="Target Kuantitas Proyek">
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
                <input
                  className={inputClass}
                  required
                  maxLength={32}
                  pattern="[a-z][a-z0-9_]*"
                  value={form.unit_code}
                  onChange={(event) =>
                    updateForm('unit_code', event.target.value.toLowerCase())
                  }
                  placeholder="Contoh: unit, tangki, km, paket"
                />
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
        </div>

        {detail?.progress_source === 'quantity_entries' && (
          <QuantityPanel
            key={projectId}
            projectId={projectId}
            unitCode={detail.unit_code}
            canWrite={canManage}
          />
        )}

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
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
            <div className="mt-4 space-y-4">
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
                          ID {member.id} · {member.email}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={memberBusy || protectedMember}
                        onClick={() => removeMember(member)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {protectedMember ? 'Dilindungi' : 'Cabut Akses'}
                      </button>
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
