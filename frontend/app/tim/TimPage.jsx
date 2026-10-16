'use client'

import { useMemo, useSyncExternalStore } from 'react'
import Link from 'next/link'
import {
  CircleAlert,
  FolderKanban,
  Mail,
  MapPin,
  Route,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'

import AppShell from '../../components/layout/AppShell'
import { PageHeader } from '../../components/layout/PageHeader'
import { useProject } from '../../lib/project-context'
import { Badge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardHeading,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import { StatCard, StatCardGrid } from '../../components/ui/stat-card'
import {
  AUTH_CHANGED_EVENT,
  USER_KEY,
  getStoredUser,
  normalizeUser,
} from '../../lib/api'
import { formatNumber } from '../../lib/format'

/**
 * Peran yang dipakai UI.
 *
 * Kolom `role` pada tabel `users` di backend tidak ada, jadi daftar
 * ini murni definisi tampilan. Nilai `backendField` menjelaskan
 * apa yang harus dikirim backend untuk mengaktifkan peran tsb.
 */
const ROLES = [
  {
    key: 'admin',
    label: 'Admin',
    tone: 'brand',
    backendField: 'admin',
    scope: 'Semua project',
    description:
      'Kelola project, master data tiang, item pekerjaan beserta bobot, wilayah, user, tim, dan hak akses.',
    capabilities: [
      'Tambah & import data tiang',
      'Atur item pekerjaan dan bobot Kurva S',
      'Kelola wilayah, user, tim, dan role',
      'Pantau seluruh progress proyek',
    ],
  },
  {
    key: 'supervisor',
    label: 'Supervisor / Monitoring',
    tone: 'lagoon',
    backendField: 'supervisor',
    scope: 'Project / area yang ditugaskan',
    description:
      'Pantau peta dan progress secara read-only, lalu terima catatan lapangan untuk area dalam wewenangnya.',
    capabilities: [
      'Lihat peta seluruh project',
      'Lihat detail & progress tiang',
      'Analisa Kurva S dan deviasi',
      'Tidak dapat mengubah master data',
    ],
  },
  {
    key: 'pic',
    label: 'PIC / Lapangan',
    tone: 'sage',
    backendField: 'pic',
    scope: 'Tiang yang ditugaskan',
    description:
      'Kerjakan tiang yang ditugaskan: perbarui progress per item pekerjaan, tulis catatan kendala, dan lengkapi dokumentasi.',
    capabilities: [
      'Update progress pekerjaan',
      'Catat kendala lapangan',
      'Lihat tiang sendiri',
      'Tidak dapat melihat project lain',
    ],
  },
]

/**
 * Endpoint yang dibutuhkan halaman ini.
 *
 * `routes/api.php` tidak punya route user/team sama sekali, jadi
 * tabel di bawah adalah spesifikasi, bukan request yang sedang
 * dicoba. Halaman tidak menembak URL yang belum ada.
 */
const REQUIRED_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/users',
    purpose: 'Daftar user beserta role dan status aktif',
  },
  {
    method: 'POST',
    path: '/api/users',
    purpose: 'Menambah user baru',
  },
  {
    method: 'PUT',
    path: '/api/users/{user}',
    purpose: 'Mengubah role, nama, dan status user',
  },
  {
    method: 'GET',
    path: '/api/teams',
    purpose: 'Daftar tim beserta anggota dan area cakupan',
  },
  {
    method: 'POST',
    path: '/api/teams',
    purpose: 'Membuat tim dan menambah anggotanya',
  },
  {
    method: 'PUT',
    path: '/api/teams/{team}',
    purpose: 'Mengubah anggota tim dan area cakupan',
  },
  {
    method: 'POST',
    path: '/api/poles/{pole}/assign',
    purpose: 'Menugaskan PIC ke sebuah tiang',
  },
]

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

/* Harus fungsi yang sama antar render, bukan arrow inline —
   `useSyncExternalStore` membandingkan hasilnya dengan `Object.is`. */
function getServerSnapshot() {
  return null
}

function TimContent() {
  const { project, projectId, regions, workItems } = useProject()

  const rawUser = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const currentUser = useMemo(() => {
    if (!rawUser) return normalizeUser(getStoredUser())

    try {
      return normalizeUser(JSON.parse(rawUser))
    } catch {
      return normalizeUser(null)
    }
  }, [rawUser])

  const currentRoleKey = useMemo(() => {
    const value = String(currentUser?.role ?? '')
      .trim()
      .toLowerCase()

    if (!value) return null

    return (
      ROLES.find((role) => value.includes(role.key))?.key ?? 'unmapped'
    )
  }, [currentUser])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Akses"
        title="Tim & Hak Akses"
        subtitle="Pembagian peran Admin, Supervisor, dan PIC beserta cakupan area kerjanya."
      />

      <StatCardGrid>
        <StatCard
          label="Peran Didefinisikan"
          value={ROLES.length}
          hint="Admin, Supervisor, PIC"
          Icon={ShieldCheck}
          tone="brand"
        />

        <StatCard
          label="Wilayah Terdaftar"
          value={formatNumber(regions.length)}
          hint="Dari GET /api/projects/{id}"
          Icon={MapPin}
          tone="lagoon"
        />

        <StatCard
          label="Item Pekerjaan"
          value={formatNumber(workItems.length)}
          hint="Basis pembobotan Kurva S"
          Icon={Route}
          tone="ochre"
        />

        <StatCard
          label="Peran Anda"
          value={
            currentRoleKey ? ROLES.find((r) => r.key === currentRoleKey)?.label : '—'
          }
          hint={
            currentRoleKey === 'unmapped'
              ? 'Role tidak ada di daftar'
              : 'Dari response POST /api/login'
          }
          Icon={UserCog}
          tone="plum"
        />
      </StatCardGrid>

      {currentUser && !currentUser.role && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-card border border-amber-300/70 bg-amber-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />

            <div>
              <p className="text-sm font-semibold text-amber-900">
                Response login tidak menyertakan role
              </p>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">
                User ini login dengan <strong>{currentUser.email ?? 'email tidak tersedia'}</strong>,
                tapi field <code>role</code> tidak dikirim backend. Menentukan
                hak akses dari sisi frontend justru rawan — UI akan
                menampilkan peran yang berbeda dari yang berlaku di server.
              </p>
            </div>
          </div>

          <Link
            href="/profil"
            className="inline-flex h-9 shrink-0 items-center justify-center self-start rounded-xl bg-paper px-3 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-300 transition-colors hover:bg-amber-100 sm:self-auto"
          >
            Lihat detail akun
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {ROLES.map((role) => {
          const isCurrent = role.key === currentRoleKey

          return (
            <Card
              key={role.key}
              tone={role.tone}
              className={isCurrent ? 'ring-2 ring-brand-200' : undefined}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{role.label}</CardTitle>

                    <p className="mt-1 text-xs text-neutral-500">{role.scope}</p>
                  </div>

                  {isCurrent && (
                    <Badge tone="brand">
                      <ShieldCheck className="h-3 w-3" />
                      Anda
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-neutral-600">
                  {role.description}
                </p>

                <ul className="space-y-2">
                  {role.capabilities.map((capability) => (
                    <li
                      key={capability}
                      className="flex items-start gap-2 text-xs leading-5 text-neutral-600"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300"
                      />
                      {capability}
                    </li>
                  ))}
                </ul>

                <div className="rounded-xl border border-dashed border-neutral-200 bg-canvas px-3 py-2">
                  <p className="text-[11px] text-neutral-400">
                    Nilai pada kolom <code>role</code> di backend
                  </p>
                  <code className="mt-0.5 block text-xs font-medium text-neutral-700">
                    {role.backendField}
                  </code>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardHeading
            Icon={Users}
            title="Daftar User & Tim"
            description="Menunggu endpoint user/team"
            tone="clay"
          />
        </CardHeader>

        <CardContent>
          <EmptyState
            icon={Users}
            title="Belum ada endpoint user dan tim"
            description="Backend belum menyediakan route untuk membaca daftar user, membuat tim, atau menetapkan role. Tidak ada daftar user yang ditampilkan di halaman ini karena mengisinya dengan data contoh akan menyesatkan — user akan mengira tim itu sungguhan ada."
            hint="Perlu 7 endpoint baru di routes/api.php"
            action={
              <a
                href="#endpoint-tim"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
              >
                <FolderKanban className="h-4 w-4" />
                Lihat kebutuhan endpoint
              </a>
            }
          />
        </CardContent>
      </Card>

      <Card id="endpoint-tim">
        <CardHeader>
          <CardHeading
            Icon={FolderKanban}
            title="Kebutuhan Endpoint Tim & Akses"
            description="Spesifikasi supaya halaman ini bisa diisi dengan data nyata"
            tone="ochre"
          />

          {project && (
            <Badge className="bg-neutral-100 text-neutral-600 ring-neutral-500/20">
              Project ID {projectId}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {REQUIRED_ENDPOINTS.map((endpoint) => (
              <li
                key={`${endpoint.method} ${endpoint.path}`}
                className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800">
                    {endpoint.purpose}
                  </p>
                </div>

                <span className="flex shrink-0 items-center gap-1.5 self-start sm:self-auto">
                  <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
                    {endpoint.method}
                  </span>

                  <code className="text-[11px] text-neutral-600">
                    {endpoint.path}
                  </code>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-canvas px-4 py-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />

            <p className="text-xs leading-5 text-neutral-500">
              Setelah endpoint tersedia, daftar user di atas bisa diisi langsung.
              Filter yang dipakai: role, status aktif, dan project — sehingga
              Supervisor hanya melihat area yang ditugaskan dan PIC hanya melihat
              tiang miliknya sendiri.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function TimPage() {
  return (
    <AppShell title="Tim">
      <TimContent />
    </AppShell>
  )
}
