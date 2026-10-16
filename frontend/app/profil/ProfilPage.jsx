'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import {
  CircleAlert,
  Fingerprint,
  Info,
  KeyRound,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { ActionButton, PageHeader } from '../../components/layout/PageHeader'
import { useProject } from '../../lib/project-context'
import { Badge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import {
  AUTH_CHANGED_EVENT,
  USER_KEY,
  api,
  clearAuth,
  normalizeUser,
} from '../../lib/api'

/* User juga dibaca lewat external store supaya halaman ikut
   berubah kalau user logout dari tab lain. */
function subscribe(callback) {
  window.addEventListener('storage', callback)
  window.addEventListener(AUTH_CHANGED_EVENT, callback)

  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(AUTH_CHANGED_EVENT, callback)
  }
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(USER_KEY)
  } catch {
    return null
  }
}

function getServerSnapshot() {
  return null
}

function useStoredUser() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  /* `normalizeUser(null)` tetap mengembalikan object supaya komponen
     lain tidak perlu cek null di setiap field. Karena itu `hasUser`
     dihitung terpisah dari isi raw — inilah yang membedakan "user ada
     tapi responsnya kosong" dari "belum login sama sekali". */
  return useMemo(() => {
    const parsed = raw ? safeParse(raw) : null

    return {
      user: normalizeUser(parsed),
      hasUser: Boolean(parsed),
    }
  }, [raw])
}

function safeParse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function Field({ label, value, mono = false, hint }) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <p className="text-[11px] text-neutral-400">{label}</p>

      <p
        className={`mt-0.5 break-words text-sm font-medium text-neutral-800 ${
          mono ? 'tabular-nums' : ''
        }`}
      >
        {value ?? '—'}
      </p>

      {hint && <p className="mt-1 text-[11px] text-neutral-400">{hint}</p>}
    </div>
  )
}

/**
 * Kebutuhan backend untuk setiap aksi profil.
 *
 * `routes/api.php` saat ini hanya punya `POST /login` dan resource
 * project. Tidak ada endpoint user, jadi daftar ini bukan alleviate
 * — justru supaya jelas mana yang masih harus dibuat di Laravel.
 */
const MISSING_ENDPOINTS = [
  {
    action: 'Ubah nama / telepon',
    endpoint: 'PUT /api/user/profile',
    note: 'Menyimpan perubahan profil dan mengembalikan user terbaru.',
  },
  {
    action: 'Ubah email',
    endpoint: 'PUT /api/user/profile',
    note: 'Ideally accompanied verifikasi email baru.',
  },
  {
    action: 'Ganti password',
    endpoint: 'PUT /api/user/password',
    note: 'Butuh password lama + konfirmasi password baru.',
  },
  {
    action: 'Masukkan detail foto / avatar',
    endpoint: 'POST /api/user/avatar',
    note: 'Upload multipart lalu simpan URL avatar di user.',
  },
  {
    action: 'Keluar dari semua perangkat',
    endpoint: 'POST /api/logout-all',
    note: 'Membatalkan seluruh token milik user ini.',
  },
]

function ProfilContent() {
  const { user, hasUser } = useStoredUser()
  const { project } = useProject()
  const [signingOut, setSigningOut] = useState(false)

  const displayName = user?.name ?? null
  const roleLabel = user?.roleLabel ?? null

  /* Hapus token di server dulu, baru storage lokal. Kalau hanya
     `clearAuth()`, tokennya tetap hidup di Sanctum sampai kedaluwarsa —
     siapa pun yang punya salinannya masih bisa memakai. User yang
     sudah tidak bisa logout dari server (offline, 500) tetap
     dilogoutkan di sisi client, karena membekukan user di aplikasi
     lebih buruk daripada satu token sisa. */
  async function handleLogout() {
    if (signingOut) return

    setSigningOut(true)

    try {
      await api.logout()
    } catch {
      /* Token mungkin sudah invalid atau server tidak bisa dijangkau.
         tetap lanjut: yang penting sesi lokal bersih. */
    }

    clearAuth()
    window.location.href = '/login'
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Akun"
        title="Profil"
        subtitle="Data akun yang sedang dipakai pada sesi ini, plus tindakan keamanan yang tersedia."
        actions={
          <ActionButton
            onClick={handleLogout}
            icon={LogOut}
            disabled={signingOut}
          >
            {signingOut ? 'Keluar…' : 'Keluar'}
          </ActionButton>
        }
      />

      <Card>
        <CardContent className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-plum-500 to-lagoon-600 text-xl font-semibold text-white shadow-card"
          >
            {user?.initials ?? '?'}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold text-neutral-900">
                {displayName ?? 'Nama belum tersedia'}
              </h2>

              {roleLabel ? (
                <Badge tone="lagoon">
                  <ShieldCheck className="h-3 w-3" />
                  {roleLabel}
                </Badge>
              ) : (
                <Badge className="bg-neutral-100 text-neutral-500 ring-neutral-500/20">
                  Role belum dikirim backend
                </Badge>
              )}
            </div>

            <p className="mt-1 break-words text-sm text-neutral-500">
              {user?.email ?? 'Email belum tersedia pada response login.'}
            </p>

            {project && (
              <p className="mt-3 text-xs text-neutral-400">
                Sesi ini aktif pada project{' '}
                <strong className="text-neutral-700">{project.name}</strong>
                {project.code ? ` (${project.code})` : ''}. Ganti project lewat
                selector di bar atas halaman.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informasi Akun</CardTitle>
            <CardDescription>
              Bersumber dari response <code>POST /api/login</code>, disimpan di
              browser saat login.
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="ID User" value={user?.id} mono />
            <Field label="Nama" value={displayName} />
            <Field label="Email" value={user?.email} mono />
            <Field
              label="Nomor Telepon"
              value={user?.phone}
              hint={
                user?.phone
                  ? undefined
                  : 'Backend belum mengirim field ini pada response login.'
              }
            />
            <Field
              label="Role"
              value={roleLabel}
              hint={
                roleLabel
                  ? undefined
                  : 'Dikirim backend sebagai `role` atau `role_name`.'
              }
            />
            <Field
              label="Project Aktif"
              value={project?.name}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Keamanan Sesi</CardTitle>
            <CardDescription>
              Token bearer disimpan di localStorage dan dikirim sebagai header
              <code className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
                Authorization
              </code>
              pada setiap request.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-canvas p-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />

              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800">
                  Token tersimpan di perangkat ini
                </p>
                <p className="mt-0.5 text-xs leading-5 text-neutral-500">
                  Menghapus token berarti keluar dari sesi pada perangkat ini
                  saja. Backend belum menyediakan pencabutan token jarak jauh.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-canvas p-3">
              <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />

              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800">
                  Autentikasi berbasis token
                </p>
                <p className="mt-0.5 text-xs leading-5 text-neutral-500">
                  Belum ada verifikasi sesi dari server saat halaman dibuka —
                  halaman internal hanya memeriksa keberadaan token. Request API
                  yang ditolak backend (401) akan tampil sebagai error notice.
                </p>
              </div>
            </div>

            <ActionButton onClick={handleLogout} icon={LogOut} variant="primary">
              Keluar dari akun ini
            </ActionButton>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fitur yang Menunggu Endpoint</CardTitle>
          <CardDescription>
            Edit profil, ganti password, dan upload avatar belum bisa
            disimpan — backend belum punya endpoint-nya.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50/80 px-4 py-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />

            <p className="text-xs leading-5 text-amber-900">
              Form edit sengaja tidak ditampilkan. Menampilkan form yang tidak
              bisa menyimpan apa pun akan menipu user — datanya terlihat
              tersimpan padahal hilang begitu halaman di-refresh.
            </p>
          </div>

          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {MISSING_ENDPOINTS.map((item) => (
              <li
                key={item.endpoint + item.action}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800">
                    {item.action}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {item.note}
                  </p>
                </div>

                <code className="shrink-0 self-start rounded-lg bg-neutral-100 px-2 py-1 text-[11px] text-neutral-600 sm:self-auto">
                  {item.endpoint}
                </code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {!hasUser && (
        <EmptyState
          icon={Info}
          title="Data user tidak ditemukan di perangkat ini"
          description="Session token tersedia tapi data user tidak tersimpan. Keluar lalu login kembali untuk mengisi ulang."
          tone="ochre"
          action={
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white"
            >
              <User className="h-4 w-4" />
              Login ulang
            </Link>
          }
        />
      )}
    </div>
  )
}

export default function ProfilPage() {
  return (
    <AppShell title="Profil">
      <ProfilContent />
    </AppShell>
  )
}
