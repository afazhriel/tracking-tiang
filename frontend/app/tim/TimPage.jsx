'use client'

import { useMemo, useState } from 'react'
import {
  Ban,
  Check,
  CircleAlert,
  Clock,
  Mail,
  MapPin,
  RefreshCw,
  Send,
  Trash2,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react'

import ProjectTeams from './ProjectTeams'
import { useProject } from '../../lib/project-context'
import AppShell from '../../components/layout/AppShell'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import { Button } from '../../components/ui/button'
import { SearchInput, SelectField } from '../../components/ui/form-controls'
import { Modal, TextInput } from '../../components/ui/modal'
import { Table, TableWrap, Td, Th, Tr } from '../../components/ui/table'
import {
  api,
  USER_ROLES,
  USER_STATUSES,
  normalizeInvitation,
  normalizeUser,
  unwrapList,
  userRoleLabel,
  userStatusTone,
} from '../../lib/api'
import { useCurrentUser } from '../../lib/use-current-user'
import { useResource } from '../../lib/use-api'
import { formatDate, formatNumber } from '../../lib/format'

const INVITATION_STATUS = {
  pending: { label: 'Menunggu', tone: 'ochre' },
  accepted: { label: 'Diterima', tone: 'sage' },
  expired: { label: 'Kedaluwarsa', tone: 'sand' },
  revoked: { label: 'Dicabut', tone: 'clay' },
}

const INPUT_CLASS =
  'h-10 w-full rounded-xl border border-neutral-200 bg-paper px-3 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

function initialsOf(name) {
  return String(name ?? '')
    .trim()
    .charAt(0)
    .toUpperCase() || 'U'
}

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-medium text-neutral-500"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function Notice({ notice, onDismiss }) {
  if (!notice) return null

  const isError = notice.type === 'err'

  return (
    <div
      role="alert"
      className={
        isError
          ? 'flex items-start justify-between gap-3 rounded-card border border-clay-300 bg-clay-50 px-4 py-3 text-sm text-clay-800'
          : 'flex items-start justify-between gap-3 rounded-card border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800'
      }
    >
      <span className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="leading-6 break-all">{notice.message}</span>
      </span>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Tutup notifikasi"
        className="shrink-0 rounded-lg p-1 transition-colors hover:bg-black/5"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function RoleSelect({ user, busy, onChange }) {
  const isBusy = busy === `role-${user.id}`

  return (
    <select
      value={user.role ?? ''}
      disabled={isBusy}
      onChange={(event) => onChange(user, event.target.value)}
      className="h-9 max-w-[11rem] rounded-lg border border-neutral-200 bg-paper px-2 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-50"
    >
      {!user.role && <option value="">Tanpa role</option>}

      {USER_ROLES.map((role) => (
        <option key={role.value} value={role.value}>
          {role.label}
        </option>
      ))}
    </select>
  )
}

function StatusActions({ user, busy, onChangeStatus }) {
  const isBusy = busy === `status-${user.id}`

  return (
    <div className="flex items-center justify-end gap-2">
      {user.status === 'pending' && (
        <Button
          size="sm"
          variant="primary"
          disabled={isBusy}
          onClick={() =>
            onChangeStatus(user, 'active', `${user.name} disetujui.`)
          }
        >
          <Check className="h-3.5 w-3.5" />
          Setujui
        </Button>
      )}

      {user.status !== 'suspended' && (
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() =>
            onChangeStatus(user, 'suspended', `${user.name} dinonaktifkan.`)
          }
        >
          <Ban className="h-3.5 w-3.5" />
          Nonaktifkan
        </Button>
      )}

      {user.status === 'suspended' && (
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() =>
            onChangeStatus(user, 'active', `${user.name} diaktifkan kembali.`)
          }
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Aktifkan
        </Button>
      )}
    </div>
  )
}

/**
 * Penugasan provinsi per user (admin). Supervisor/PIC hanya bisa
 * menambah tiang & mencatat progress di provinsi yang ditugaskan,
 * jadi kontrol ini menentukan cakupan kerja mereka.
 */
function ProvinceAssignModal({ user, provinces, busy, onClose, onSave }) {
  const [selected, setSelected] = useState(
    () => new Set((user.provinces ?? []).map((province) => String(province.id)))
  )
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return provinces

    return provinces.filter((province) =>
      `${province.name} ${province.id}`.toLowerCase().includes(keyword)
    )
  }, [provinces, search])

  function toggle(id) {
    setSelected((previous) => {
      const next = new Set(previous)

      if (next.has(id)) next.delete(id)
      else next.add(id)

      return next
    })
  }

  const saving = busy === `province-${user.id}`

  return (
    <Modal
      open
      onClose={onClose}
      title={`Wilayah untuk ${user.name || 'pengguna'}`}
      description="Pilih provinsi yang boleh dikelola. Admin selalu punya akses ke semua provinsi."
      footer={null}
    >
      <div className="space-y-4">
        <TextInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari provinsi..."
          aria-label="Cari provinsi"
        />

        <div className="max-h-72 divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-xs text-neutral-400">
              Tidak ada provinsi yang cocok.
            </p>
          ) : (
            filtered.map((province) => {
              const checked = selected.has(province.id)

              return (
                <label
                  key={province.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-canvas"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(province.id)}
                    className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-2 focus:ring-brand-100"
                  />

                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">
                    {province.name}
                  </span>
                </label>
              )
            })
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            {formatNumber(selected.size)} provinsi dipilih
          </p>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>

            <Button
              variant="primary"
              disabled={saving}
              onClick={() => onSave(user, [...selected])}
            >
              {saving ? 'Menyimpan...' : 'Simpan Wilayah'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ProvinceCell({ user, disabled, onManage }) {
  if (user.role === 'admin') {
    return (
      <span className="text-xs text-neutral-400">Semua provinsi (admin)</span>
    )
  }

  const provinces = user.provinces ?? []

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {provinces.slice(0, 2).map((province) => (
        <Badge key={province.id ?? province.name} variant="outline">
          {province.name}
        </Badge>
      ))}

      {provinces.length > 2 && (
        <Badge variant="outline">+{provinces.length - 2}</Badge>
      )}

      {provinces.length === 0 && (
        <span className="text-xs text-neutral-400">Belum ditugaskan</span>
      )}

      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={onManage}
        title="Atur provinsi"
      >
        <MapPin className="h-3.5 w-3.5" />
        Atur
      </Button>
    </div>
  )
}

function AdminTimContent({ currentUser }) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState(null)

  const [provinceTarget, setProvinceTarget] = useState(null)


  const [invite, setInvite] = useState({ email: '', name: '', role: 'pic' })

  const usersResource = useResource(
    () =>
      api
        .listUsers({
          role: roleFilter === 'all' ? undefined : roleFilter,
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: search || undefined,
        })
        .then((response) => unwrapList(response).map(normalizeUser)),
    [search, roleFilter, statusFilter],
    { enabled: true }
  )

  const invitationsResource = useResource(
    () =>
      api
        .listInvitations()
        .then((response) => unwrapList(response).map(normalizeInvitation)),
    []
  )

  const provincesResource = useResource(
    () =>
      api
        .listProvinces()
        .then((response) =>
          unwrapList(response).map((province) => ({
            id: String(province.id),
            name: province.name ?? String(province.id),
          }))
        ),
    []
  )

  const users = useMemo(() => usersResource.data ?? [], [usersResource.data])
  const invitations = useMemo(
    () => invitationsResource.data ?? [],
    [invitationsResource.data]
  )
  const allProvinces = useMemo(
    () => provincesResource.data ?? [],
    [provincesResource.data]
  )

  const pendingCount = useMemo(
    () => users.filter((user) => user.status === 'pending').length,
    [users]
  )

  const activeCount = useMemo(
    () => users.filter((user) => user.status === 'active').length,
    [users]
  )

  async function run(key, action, successMessage) {
    setBusy(key)
    setNotice(null)

    try {
      await action()

      if (successMessage) {
        setNotice({ type: 'ok', message: successMessage })
      }

      return true
    } catch (error) {
      setNotice({
        type: 'err',
        message: error?.message || 'Aksi gagal. Coba lagi.',
      })

      return false
    } finally {
      setBusy(null)
    }
  }

  async function changeRole(user, role) {
    if (role === user.role) return

    const ok = await run(
      `role-${user.id}`,
      () => api.updateUser(user.id, { role }),
      `Role ${user.name} diubah ke ${userRoleLabel(role)}.`
    )

    if (ok) usersResource.reload()
  }

  async function changeStatus(user, status, successMessage) {
    if (
      status === 'suspended' &&
      !window.confirm(`Nonaktifkan ${user.name}? Akun tidak bisa login sampai diaktifkan kembali.`)
    ) {
      return
    }

    const ok = await run(
      `status-${user.id}`,
      () => api.updateUserStatus(user.id, status),
      successMessage
    )

    if (ok) usersResource.reload()
  }

  async function saveProvinces(user, provinceIds) {
    const ok = await run(
      `province-${user.id}`,
      () => api.updateUserProvinces(user.id, provinceIds),
      `Wilayah ${user.name} diperbarui.`
    )

    if (ok) {
      usersResource.reload()
      setProvinceTarget(null)
    }
  }

  async function createInvitation() {
    if (!invite.email.trim()) {
      setNotice({ type: 'err', message: 'Email undangan wajib diisi.' })
      return
    }

    setBusy('invite-create')
    setNotice(null)

    try {
      const response = await api.createInvitation({
        email: invite.email.trim(),
        name: invite.name.trim() || null,
        role: invite.role,
      })

      setNotice({
        type: 'ok',
        message: response?.invitation_url
          ? `Undangan dibuat. Link pendaftaran: ${response.invitation_url}`
          : 'Undangan dibuat dan dikirim ke email tujuan.',
      })

      setInvite({ email: '', name: '', role: 'pic' })
      invitationsResource.reload()
    } catch (error) {
      setNotice({
        type: 'err',
        message: error?.message || 'Gagal membuat undangan.',
      })
    } finally {
      setBusy(null)
    }
  }

  async function revokeInvitation(invitation) {
    if (!window.confirm(`Cabut undangan untuk ${invitation.email}?`)) return

    const ok = await run(
      `revoke-${invitation.id}`,
      () => api.revokeInvitation(invitation.id),
      'Undangan dicabut.'
    )

    if (ok) invitationsResource.reload()
  }


  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Akses"
        title="Akun & Undangan"
        subtitle={`Kelola user, role, status akun, dan undangan. Masuk sebagai ${currentUser.roleLabel || 'Pengguna'}.`}
      />

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <StatCardGrid>
        <StatCard
          label="Total User"
          value={formatNumber(users.length)}
          hint="Termasuk akun menunggu"
          Icon={Users}
          tone="brand"
        />
        <StatCard
          label="Menunggu Persetujuan"
          value={formatNumber(pendingCount)}
          hint="Pendaftar mandiri"
          Icon={Clock}
          tone="ochre"
        />
        <StatCard
          label="Aktif"
          value={formatNumber(activeCount)}
          hint="Bisa login"
          Icon={UserCheck}
          tone="sage"
        />

      </StatCardGrid>

      {/* ===================== USERS ===================== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-brand-600" />
            User & Role
          </CardTitle>

          <Button
            variant="outline"
            size="sm"
            disabled={usersResource.loading}
            onClick={() => usersResource.reload()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Muat ulang
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari nama atau email..."
            />

            <SelectField
              value={roleFilter}
              onChange={setRoleFilter}
              placeholder="Semua role"
              options={USER_ROLES.map((role) => ({
                value: role.value,
                label: role.label,
              }))}
            />

            <SelectField
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Semua status"
              options={USER_STATUSES.map((status) => ({
                value: status.value,
                label: status.label,
              }))}
            />
          </div>

          {usersResource.error ? (
            <EmptyState
              icon={CircleAlert}
              tone="clay"
              title="Gagal memuat daftar user"
              description={usersResource.error?.message}
              action={
                <Button variant="outline" onClick={() => usersResource.reload()}>
                  Coba lagi
                </Button>
              }
            />
          ) : !usersResource.loading && users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Tidak ada user yang cocok"
              description="Ubah filter atau kata kunci pencarian untuk melihat user lain."
            />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Pengguna</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th>Tim</Th>
                    <Th>Provinsi</Th>
                    <Th align="right">Aksi</Th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => (
                    <Tr key={user.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-plum-500 to-lagoon-600 text-xs font-medium text-white">
                            {initialsOf(user.name)}
                          </span>

                          <div className="min-w-0">
                            <p className="truncate font-medium text-neutral-800">
                              {user.name || 'Tanpa nama'}
                            </p>
                            <p className="truncate text-xs text-neutral-400">
                              {user.email || '—'}
                            </p>
                          </div>
                        </div>
                      </Td>

                      <Td>
                        <RoleSelect
                          user={user}
                          busy={busy}
                          onChange={changeRole}
                        />
                      </Td>

                      <Td>
                        <Badge tone={userStatusTone(user.status)} dot>
                          {user.statusLabel}
                        </Badge>
                      </Td>

                      <Td>
                        {user.teams.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {user.teams.map((team) => (
                              <Badge key={team.id ?? team.name} variant="outline">
                                {team.name}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </Td>

                      <Td>
                        <ProvinceCell
                          user={user}
                          disabled={provincesResource.loading}
                          onManage={() => setProvinceTarget(user)}
                        />
                      </Td>

                      <Td align="right">
                        <StatusActions
                          user={user}
                          busy={busy}
                          onChangeStatus={changeStatus}
                        />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      {/* ===================== INVITATIONS ===================== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-plum-600" />
            Undangan
          </CardTitle>

          <Badge tone="plum">{formatNumber(invitations.length)} undangan</Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1.2fr_1fr_auto] sm:items-end">
            <Field label="Email" htmlFor="invite-email">
              <input
                id="invite-email"
                type="email"
                value={invite.email}
                onChange={(event) =>
                  setInvite((previous) => ({
                    ...previous,
                    email: event.target.value,
                  }))
                }
                placeholder="nama@perusahaan.com"
                className={INPUT_CLASS}
              />
            </Field>

            <Field label="Nama (opsional)" htmlFor="invite-name">
              <input
                id="invite-name"
                value={invite.name}
                onChange={(event) =>
                  setInvite((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                placeholder="Nama penerima"
                className={INPUT_CLASS}
              />
            </Field>

            <Field label="Role" htmlFor="invite-role">
              <select
                id="invite-role"
                value={invite.role}
                onChange={(event) =>
                  setInvite((previous) => ({
                    ...previous,
                    role: event.target.value,
                  }))
                }
                className={INPUT_CLASS}
              >
                {USER_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </Field>

            <Button
              variant="primary"
              disabled={busy === 'invite-create'}
              onClick={createInvitation}
            >
              <Send className="h-4 w-4" />
              Undang
            </Button>
          </div>

          {invitationsResource.error ? (
            <EmptyState
              icon={CircleAlert}
              tone="clay"
              title="Gagal memuat undangan"
              description={invitationsResource.error?.message}
              action={
                <Button
                  variant="outline"
                  onClick={() => invitationsResource.reload()}
                >
                  Coba lagi
                </Button>
              }
            />
          ) : invitations.length === 0 ? (
            <EmptyState
              compact
              icon={Mail}
              title="Belum ada undangan"
              description="Undangan adalah jalur membuat akun dengan role langsung. Pendaftar mandiri muncul di daftar user sebagai 'Menunggu'."
            />
          ) : (
            <TableWrap>
              <Table className="min-w-[560px]">
                <thead>
                  <tr>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th>Kedaluwarsa</Th>
                    <Th align="right">Aksi</Th>
                  </tr>
                </thead>

                <tbody>
                  {invitations.map((invitation) => {
                    const status =
                      INVITATION_STATUS[invitation.status] ?? {
                        label: invitation.status ?? '—',
                        tone: 'sand',
                      }

                    return (
                      <Tr key={invitation.id}>
                        <Td>
                          <span className="block truncate font-medium text-neutral-800">
                            {invitation.email}
                          </span>
                          {invitation.name && (
                            <span className="block truncate text-xs text-neutral-400">
                              {invitation.name}
                            </span>
                          )}
                        </Td>

                        <Td>{invitation.roleLabel}</Td>

                        <Td>
                          <Badge tone={status.tone} dot>
                            {status.label}
                          </Badge>
                        </Td>

                        <Td>
                          <span className="text-xs text-neutral-500">
                            {invitation.expiresAt
                              ? formatDate(invitation.expiresAt)
                              : '—'}
                          </span>
                        </Td>

                        <Td align="right">
                          {invitation.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy === `revoke-${invitation.id}`}
                              onClick={() => revokeInvitation(invitation)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-clay-600" />
                              Cabut
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      {provinceTarget && (
        <ProvinceAssignModal
          key={provinceTarget.id}
          user={provinceTarget}
          provinces={allProvinces}
          busy={busy}
          onClose={() => setProvinceTarget(null)}
          onSave={saveProvinces}
        />
      )}
    </div>
  )
}

function TimContent() {
  const currentUser = useCurrentUser()
  const { project, projectId, loading, error } = useProject()
  if (loading) return <p role="status">Memuat proyek…</p>
  if (error) return <EmptyState title="Gagal memuat proyek" description={error.message} />
  return <div className="space-y-6">
    {projectId ? <ProjectTeams key={projectId} project={project} currentUser={currentUser} />
      : <EmptyState title="Belum ada proyek yang dapat diakses" description="Buat atau pilih proyek di menu Proyek terlebih dahulu." />}
    {currentUser.role === 'admin' && <details className="rounded-card border border-neutral-200 p-4">
      <summary className="cursor-pointer font-semibold">Administrasi akun & undangan (Admin)</summary>
      <div className="mt-6"><AdminTimContent currentUser={currentUser} /></div>
    </details>}
  </div>
}

export default function TimPage() {
  return (
    <AppShell title="Tim">
      <TimContent />
    </AppShell>
  )
}
