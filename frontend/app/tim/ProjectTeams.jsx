'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, RefreshCw, UsersRound } from 'lucide-react'
import { api, normalizeTeam, unwrapItem, unwrapList, userRoleLabel } from '../../lib/api'
import { useResource } from '../../lib/use-api'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'

const inputClass = 'h-10 w-full rounded-xl border border-neutral-200 bg-paper px-3 text-sm text-neutral-800 focus:ring-2 focus:ring-brand-100'

function Feedback({ error, message }) {
  if (!error && !message) return null
  return <p role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-clay-300 bg-clay-50 text-clay-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>{error || message}</p>
}

function TeamEditor({ team, projectId, onSaved, onCancel }) {
  const [name, setName] = useState(team?.name ?? '')
  const [code, setCode] = useState(team?.code ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const payload = { name: name.trim(), code: code.trim() || null, project_id: projectId }
      if (team) await api.updateTeam(team.id, payload)
      else await api.createTeam(payload)
      await onSaved()
    } catch (e) { setError(e.message || 'Gagal menyimpan tim.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-neutral-200 bg-canvas p-4">
    <Feedback error={error} />
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs">Nama tim<input autoFocus required maxLength={255} value={name} onChange={e => setName(e.target.value)} className={inputClass} /></label>
      <label className="space-y-1 text-xs">Kode tim (opsional)<input maxLength={255} value={code} onChange={e => setCode(e.target.value)} className={inputClass} /></label>
    </div>
    <div className="flex gap-2"><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Menyimpan…' : 'Simpan tim'}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Batal</Button></div>
  </form>
}

function TeamDetail({ teamId, projectId, onChanged }) {
  const detail = useResource(() => api.getTeam(teamId).then(r => normalizeTeam(unwrapItem(r))), [teamId])
  const assignments = useResource(() => api.teamAssignments(teamId).then(unwrapList), [teamId])
  const [email, setEmail] = useState('')
  const [candidates, setCandidates] = useState([])
  const [memberId, setMemberId] = useState('')
  const [poleSearch, setPoleSearch] = useState('')
  const [poles, setPoles] = useState([])
  const [poleId, setPoleId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(false)
  const team = detail.data
  const manage = team?.canManage === true

  async function run(action, success, refresh = false) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      await action()
      setMessage(success)
      if (refresh) await Promise.all([detail.reload(), assignments.reload(), onChanged()])
    } catch (e) {
      setError(e.message || 'Permintaan gagal. Muat ulang untuk memeriksa hasilnya.')
      if (e.status === 403 || e.status === 404) await onChanged()
    } finally { setBusy(false) }
  }
  if (detail.loading && !team) return <p role="status">Memuat anggota…</p>
  if (detail.error) return <div><Feedback error={detail.error.message} /><Button onClick={detail.reload}>Coba lagi</Button></div>
  if (!team) return null
  const existing = new Set(team.users.map(u => String(u.id)))
  return <div className="space-y-5 border-t border-neutral-100 pt-4">
    <Feedback error={error} message={message} />
    {manage && <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => setEditing(!editing)}>Edit tim</Button>
      <Button variant="outline" disabled={busy} onClick={() => {
        const status = team.status === 'active' ? 'inactive' : 'active'
        if (window.confirm(status === 'inactive' ? 'Nonaktifkan tim? Akses dari tim ini dihentikan. Anggota dan histori tetap tersimpan.' : 'Aktifkan kembali tim beserta akses anggotanya?')) {
          run(() => api.updateTeam(team.id, { status }), 'Status tim diperbarui.', true)
        }
      }}>{team.status === 'active' ? 'Nonaktifkan tim' : 'Aktifkan tim'}</Button>
    </div>}
    {editing && manage && <TeamEditor team={team} projectId={projectId} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await detail.reload(); await onChanged() }} />}
    <section className="space-y-3" aria-label="Anggota tim">
      <h3 className="font-semibold">Anggota · {team.users.length}</h3>
      {!team.users.length && <p className="text-sm text-neutral-500">Belum ada anggota.</p>}
      <ul className="divide-y divide-neutral-100">{team.users.map(user => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="font-medium">{user.name}</p><p className="text-xs text-neutral-500">{user.email} · {userRoleLabel(user.role)} · {user.statusLabel}</p></div>
        {manage && <Button variant="outline" size="sm" disabled={busy} onClick={() => {
          if (window.confirm(`Keluarkan ${user.name}? Akses langsung dan akses dari tim lain tetap berlaku.`)) run(() => api.removeTeamMember(team.id, user.id), 'Anggota dikeluarkan dari tim.', true)
        }}>Keluarkan {user.name}</Button>}
      </li>)}</ul>
      {manage && team.status === 'active' && <div className="space-y-3 rounded-xl bg-canvas p-3">
        <p className="text-xs text-neutral-500">Pilih anggota proyek atau cari pengguna aktif dengan alamat email lengkap. Menambahkan anggota tidak mengubah role akunnya.</p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); run(async () => { setCandidates(unwrapList(await api.teamCandidates(projectId, email.trim()))); setMemberId('') }, 'Daftar kandidat diperbarui.') }}>
          <label className="min-w-48 flex-1 text-xs">Email lengkap (opsional)<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Kosongkan untuk anggota proyek" className={inputClass} /></label>
          <Button type="submit" variant="outline" disabled={busy}>Cari anggota</Button>
        </form>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 text-xs">Kandidat anggota<select value={memberId} onChange={e => setMemberId(e.target.value)} className={inputClass}><option value="">Pilih pengguna aktif</option>{candidates.filter(u => !existing.has(String(u.id))).map(u => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></label>
          <Button disabled={busy || !memberId} onClick={() => run(async () => { await api.addTeamMember(team.id, Number(memberId)); setMemberId('') }, 'Anggota ditambahkan.', true)}>Tambah anggota</Button>
        </div>
      </div>}
    </section>
    <section className="space-y-3" aria-label="Penugasan tim">
      <h3 className="font-semibold">Penugasan tiang</h3>
      {assignments.loading && <p role="status">Memuat penugasan…</p>}
      {assignments.error && <div><Feedback error={assignments.error.message} /><Button onClick={assignments.reload}>Coba lagi</Button></div>}
      {!assignments.loading && !assignments.error && !assignments.data?.length && <p className="text-sm text-neutral-500">Belum ada penugasan yang dapat dilihat. Untuk proyek kuantitas, realisasi tetap melalui menu Proyek.</p>}
      <ul className="divide-y divide-neutral-100">{(assignments.data ?? []).map(assignment => <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p>{assignment.pole?.pole_code ?? 'Tiang'} <Badge tone={assignment.status === 'active' ? 'sage' : 'sand'}>{assignment.status === 'active' ? 'Aktif' : 'Dicabut'}</Badge></p>
          <p className="text-xs text-neutral-500">{assignment.pole?.address || 'Alamat belum diisi'}</p>
          <Link className="text-sm text-brand-600 underline" href={`/tiang/${assignment.pole_id}`}>Buka tiang</Link>
        </div>
        {manage && assignment.status === 'active' && <Button variant="outline" size="sm" disabled={busy || assignment.user_id !== null} onClick={() => {
          if (window.confirm('Cabut penugasan ini? Histori pekerjaan tetap tersimpan.')) run(() => api.revokeTeamPole(team.id, assignment.id), 'Penugasan dicabut.', true)
        }}>{assignment.user_id !== null ? 'Penugasan pengguna (Admin)' : 'Cabut penugasan'}</Button>}
      </li>)}</ul>
      {manage && team.status === 'active' && <div className="space-y-3 rounded-xl bg-canvas p-3">
        <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); run(async () => { setPoles(unwrapList(await api.teamPoleCandidates(team.id, poleSearch))); setPoleId('') }, 'Daftar tiang diperbarui (maksimal 100 hasil).') }}>
          <label className="min-w-48 flex-1 text-xs">Cari kode tiang proyek<input value={poleSearch} onChange={e => setPoleSearch(e.target.value)} className={inputClass} /></label><Button type="submit" variant="outline" disabled={busy}>Cari tiang</Button>
        </form>
        <div className="flex flex-wrap items-end gap-2"><label className="min-w-48 flex-1 text-xs">Tiang untuk ditugaskan<select value={poleId} onChange={e => setPoleId(e.target.value)} className={inputClass}><option value="">Pilih tiang proyek ini</option>{poles.map(p => <option key={p.id} value={p.id}>{p.pole_code}</option>)}</select></label><Button disabled={busy || !poleId} onClick={() => run(async () => { await api.assignTeamPole(team.id, Number(poleId)); setPoleId('') }, 'Tiang ditugaskan ke tim.', true)}>Tugaskan tim</Button></div>
      </div>}
    </section>
  </div>
}

export default function ProjectTeams({ project, currentUser }) {
  const teams = useResource(() => api.listTeams({ projectId: project.id }).then(r => unwrapList(r).map(normalizeTeam)), [project.id])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const manage = currentUser.role === 'admin' || (project.ownerUserId != null && String(project.ownerUserId) === String(currentUser.id))
  const list = (teams.data ?? []).filter(t => (status === 'all' || t.status === status) && `${t.name} ${t.code || ''}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="space-y-5">
    <PageHeader eyebrow={project.code || 'Proyek aktif'} title="Tim Proyek" subtitle={`${project.name} · ${manage ? 'Kelola tim, anggota, dan penugasan.' : 'Lihat tim, anggota, dan penugasan sesuai akses Anda.'}`} />
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1 text-xs">Cari tim<input value={search} onChange={e => setSearch(e.target.value)} className={inputClass} placeholder="Nama atau kode tim" /></label>
      <label className="text-xs">Status<select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}><option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
      <Button variant="outline" disabled={teams.loading} onClick={teams.reload}><RefreshCw size={16} /> Muat ulang</Button>
      {manage && <Button onClick={() => setCreating(!creating)}><Plus size={16} /> Buat tim</Button>}
    </div>
    {creating && manage && <TeamEditor projectId={project.id} onCancel={() => setCreating(false)} onSaved={async () => { setCreating(false); await teams.reload() }} />}
    {teams.loading && <p role="status">Memuat tim proyek…</p>}
    {teams.error && <Feedback error={teams.error.message} />}
    {!teams.loading && !teams.error && !list.length && <EmptyState icon={UsersRound} title="Belum ada tim yang sesuai" description={manage ? 'Buat tim untuk proyek aktif atau ubah filter pencarian.' : 'Tim akan muncul setelah Admin atau pemilik proyek membuatnya.'} />}
    {list.map(team => <Card key={team.id}><CardHeader><div><CardTitle>{team.name}</CardTitle><p className="mt-1 text-xs text-neutral-500">{team.code || 'Tanpa kode'} · {team.usersCount} anggota · {team.status === 'active' ? 'Aktif' : 'Nonaktif'}</p></div><Button variant="outline" onClick={() => setOpenId(openId === team.id ? null : team.id)} aria-expanded={openId === team.id}>{openId === team.id ? 'Tutup detail' : 'Buka tim'}</Button></CardHeader>{openId === team.id && <CardContent><TeamDetail key={team.id} teamId={team.id} projectId={project.id} onChanged={teams.reload} /></CardContent>}</Card>)}
    <p className="text-xs leading-5 text-neutral-500">Admin dan pemilik proyek mengelola tim. Supervisor dan PIC melihat data sesuai akses proyek; PIC membuka tiang sesuai penugasan atau wilayahnya. Menonaktifkan tim menyimpan anggota dan histori.</p>
  </div>
}
