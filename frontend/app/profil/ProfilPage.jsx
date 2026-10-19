'use client'

import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import {
  Camera,
  CheckCircle2,
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
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { EmptyState } from '../../components/ui/empty-state'
import {
  FormField,
  SubmitButton,
  TextInput,
} from '../../components/ui/modal'
import { ErrorNotice } from '../../components/ui/states'
import {
  AUTH_CHANGED_EVENT,
  USER_KEY,
  api,
  clearAuth,
  normalizeUser,
  setStoredUser,
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

/**
 * Pesan error per-field dari respons 422 Laravel.
 *
 * `ApiError.fieldErrors` berbentuk `{ email: ['...'] }` — ambil
 * elemen pertama, karena backend selalu mengirim array walaupun
 * isinya satu pesan.
 */
function firstFieldError(fieldErrors, field) {
  const value = fieldErrors?.[field]

  if (Array.isArray(value)) return value[0] ?? null

  return typeof value === 'string' ? value : null
}

function SuccessNotice({ children }) {
  if (!children) return null

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-emerald-300/70 bg-emerald-50/80 px-4 py-3"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />

      <p className="text-xs leading-5 text-emerald-900">{children}</p>
    </div>
  )
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
 * Kontrol foto profil: tampil sebagai gambar bila ada, inisial kalau
 * belum. Hasil upload ditulis ulang ke localStorage lewat
 * `setStoredUser` supaya kartu identitas dan menu bar atas ikut
 * berubah tanpa reload.
 */
function AvatarControls({ user, project }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleFileChange(event) {
    const file = event.target.files?.[0]

    /* Reset nilai input supaya memilih file yang sama setelahnya
       tetap memicu `change` event. */
    event.target.value = ''

    if (!file || busy) return

    setBusy(true)
    setError(null)

    try {
      const response = await api.updateAvatar(file)

      if (response?.data) setStoredUser(response.data)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (busy) return

    setBusy(true)
    setError(null)

    try {
      const response = await api.removeAvatar()

      if (response?.data) setStoredUser(response.data)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl font-semibold text-neutral-900">
          {user?.name ?? 'Nama belum tersedia'}
        </h2>

        {user?.roleLabel ? (
          <Badge tone="lagoon">
            <ShieldCheck className="h-3 w-3" />
            {user.roleLabel}
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={handleFileChange}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="h-3.5 w-3.5" />
          {busy ? 'Mengirim…' : user?.avatarUrl ? 'Ganti foto' : 'Unggah foto'}
        </Button>

        {user?.avatarUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={handleRemove}
          >
            Hapus foto
          </Button>
        )}

        <span className="text-[11px] text-neutral-400">JPG/PNG/WebP, maks 2 MB</span>
      </div>

      <ErrorNotice
        error={error}
        compact
        title="Foto profil tidak tersimpan"
        className="mt-3"
      />

      {project && (
        <p className="mt-3 text-xs text-neutral-400">
          Sesi ini aktif pada project{' '}
          <strong className="text-neutral-700">{project.name}</strong>
          {project.code ? ` (${project.code})` : ''}. Ganti project lewat
          selector di bar atas halaman.
        </p>
      )}
    </div>
  )
}

/**
 * Form ubah nama / email / nomor telepon.
 *
 * `current_password` hanya dikirim kalau email benar-benar berubah —
 * backend menuntutnya sebagai pengganti verifikasi email (mail di
 * server hanya `log`, tidak ada inbox yang bisa menerima tautan).
 */
function ProfileForm({ user }) {
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saved, setSaved] = useState(false)

  const emailChanged =
    (email ?? '').trim().toLowerCase() !== (user?.email ?? '').trim().toLowerCase()

  async function handleSubmit(event) {
    event.preventDefault()

    if (saving) return

    setSaving(true)
    setError(null)
    setFieldErrors({})
    setSaved(false)

    try {
      const payload = {
        name: (name ?? '').trim(),
        email: (email ?? '').trim(),
        phone: (phone ?? '').trim(),
      }

      if (emailChanged) {
        payload.current_password = currentPassword
      }

      const response = await api.updateProfile(payload)
      const data = response?.data

      if (data) {
        /* Tulis ke localStorage (menu bar / kartu identitas ikut
           ter-update) DAN isi ulang field dari respons server,
           supaya hasil simpan adalah nilai yang tampil. */
        setStoredUser(data)
        setName(data.name ?? '')
        setEmail(data.email ?? '')
        setPhone(data.phone ?? '')
      }

      setCurrentPassword('')
      setSaved(true)
    } catch (caught) {
      setError(caught)
      setFieldErrors(caught?.fieldErrors ?? {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ubah Profil</CardTitle>
        <CardDescription>
          Perubahan disimpan ke akun Anda dan langsung tampil di seluruh halaman.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ErrorNotice
            error={error}
            compact
            title="Perubahan tidak tersimpan"
          />

          <SuccessNotice>
            Profil berhasil diperbarui.
          </SuccessNotice>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Nama lengkap"
              htmlFor="profile-name"
              required
              error={firstFieldError(fieldErrors, 'name')}
            >
              <TextInput
                id="profile-name"
                name="name"
                value={name}
                autoComplete="name"
                invalid={Boolean(firstFieldError(fieldErrors, 'name'))}
                onChange={(event) => setName(event.target.value)}
              />
            </FormField>

            <FormField
              label="Nomor telepon"
              htmlFor="profile-phone"
              hint="Opsional, contoh 081234567890."
              error={firstFieldError(fieldErrors, 'phone')}
            >
              <TextInput
                id="profile-phone"
                name="phone"
                inputMode="tel"
                value={phone}
                autoComplete="tel"
                invalid={Boolean(firstFieldError(fieldErrors, 'phone'))}
                onChange={(event) => setPhone(event.target.value)}
              />
            </FormField>
          </div>

          <FormField
            label="Email"
            htmlFor="profile-email"
            required
            error={firstFieldError(fieldErrors, 'email')}
            hint={
              emailChanged
                ? 'Ganti email butuh konfirmasi password di bawah.'
                : undefined
            }
          >
            <TextInput
              id="profile-email"
              name="email"
              type="email"
              value={email}
              autoComplete="email"
              invalid={Boolean(firstFieldError(fieldErrors, 'email'))}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>

          {emailChanged && (
            <FormField
              label="Password saat ini"
              htmlFor="profile-current-password"
              required
              error={firstFieldError(fieldErrors, 'current_password')}
              hint="Wajib karena aplikasi ini tidak mengirim email verifikasi."
            >
              <TextInput
                id="profile-current-password"
                name="current_password"
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                invalid={Boolean(firstFieldError(fieldErrors, 'current_password'))}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </FormField>
          )}

          <div className="flex items-center gap-3">
            <SubmitButton loading={saving} loadingLabel="Menyimpan…">
              Simpan perubahan
            </SubmitButton>

            {saved && !saving && (
              <span className="text-xs text-emerald-700">Tersimpan.</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/**
 * Form ganti password: password lama + password baru berkonfirmasi.
 * Token perangkat ini tetap hidup — mengeluarkan perangkat lain ada
 * tombolnya di kartu Keamanan Sesi.
 */
function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    if (saving) return

    setSaving(true)
    setError(null)
    setFieldErrors({})
    setSaved(false)

    try {
      await api.updatePassword({
        current_password: currentPassword,
        password,
        password_confirmation: confirmation,
      })

      setCurrentPassword('')
      setPassword('')
      setConfirmation('')
      setSaved(true)
    } catch (caught) {
      setError(caught)
      setFieldErrors(caught?.fieldErrors ?? {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ganti Password</CardTitle>
        <CardDescription>
          Password baru berlaku seketika. Perangkat ini tetap masuk; perangkat
          lain bisa dikeluarkan lewat tombol di kartu Keamanan Sesi.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ErrorNotice error={error} compact title="Password tidak diganti" />

          <SuccessNotice> Password berhasil diganti. </SuccessNotice>

          <FormField
            label="Password saat ini"
            htmlFor="password-current"
            required
            error={firstFieldError(fieldErrors, 'current_password')}
          >
            <TextInput
              id="password-current"
              name="current_password"
              type="password"
              value={currentPassword}
              autoComplete="current-password"
              invalid={Boolean(firstFieldError(fieldErrors, 'current_password'))}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Password baru"
              htmlFor="password-new"
              required
              hint="Minimal 8 karakter."
              error={firstFieldError(fieldErrors, 'password')}
            >
              <TextInput
                id="password-new"
                name="password"
                type="password"
                value={password}
                autoComplete="new-password"
                invalid={Boolean(firstFieldError(fieldErrors, 'password'))}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>

            <FormField
              label="Ulangi password baru"
              htmlFor="password-confirmation"
              required
              error={firstFieldError(fieldErrors, 'password_confirmation')}
            >
              <TextInput
                id="password-confirmation"
                name="password_confirmation"
                type="password"
                value={confirmation}
                autoComplete="new-password"
                invalid={Boolean(
                  firstFieldError(fieldErrors, 'password_confirmation')
                )}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </FormField>
          </div>

          <div className="flex items-center gap-3">
            <SubmitButton loading={saving} loadingLabel="Menyimpan…">
              Ganti password
            </SubmitButton>

            {saved && !saving && (
              <span className="text-xs text-emerald-700">Tersimpan.</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ProfilContent() {
  const { user, hasUser } = useStoredUser()
  const { project } = useProject()
  const [signingOut, setSigningOut] = useState(false)
  const [signingOutAll, setSigningOutAll] = useState(false)

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

  /* Versi "semua perangkat": token dicabut server-side juga untuk
     request ini, jadi sesi lokal pasti tidak berharga lagi. */
  async function handleLogoutAll() {
    if (signingOutAll) return

    setSigningOutAll(true)

    try {
      await api.logoutAll()
    } catch {
      /* Gagal mencabut (offline / 500) tetap diikuti logout lokal —
         mempertahankan token yang mungkin masih hidup justru risiko. */
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
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-plum-500 to-lagoon-600 text-xl font-semibold text-white shadow-card"
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              user?.initials ?? '?'
            )}
          </span>

          <AvatarControls user={user} project={project} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileForm user={user} />
        <PasswordForm />
      </div>

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
                  : 'Belum diisi — bisa ditambahkan lewat form Ubah Profil.'
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
            <Field label="Project Aktif" value={project?.name} />
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
                  Tombol <strong>Keluar</strong> menutup sesi perangkat ini
                  saja; tombol <strong>Keluar semua perangkat</strong> mencabut
                  seluruh token di seluruh perangkat.
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

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ActionButton
                onClick={handleLogout}
                icon={LogOut}
                variant="primary"
              >
                Keluar dari akun ini
              </ActionButton>

              <ActionButton
                onClick={handleLogoutAll}
                icon={ShieldCheck}
                disabled={signingOutAll}
              >
                {signingOutAll ? 'Mencabut token…' : 'Keluar semua perangkat'}
              </ActionButton>
            </div>
          </CardContent>
        </Card>
      </div>

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
