'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  MailCheck,
  MapPin,
  TriangleAlert,
  UserPlus,
} from 'lucide-react'

import { api, ApiError } from '../../../lib/api'

/**
 * Kartu pendaftaran mandiri (self sign-up).
 *
 * Berbeda dari login: akun TIDAK langsung aktif. Backend membuat
 * user dengan status `pending`, jadi setelah submit yang tampil
 * adalah pesan "menunggu persetujuan admin" — bukan redirect ke
 * dashboard. Gambar ulang alurnya bukan sekadar styling supaya
 * user tidak mengira sudah bisa langsung masuk.
 */
export function Component() {
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState(null)
  const [done, setDone] = useState(false)

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    setLoading(true)
    setError('')
    setFieldErrors(null)

    try {
      await api.register(form)
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors)
      }

      setError(err?.message || 'Pendaftaran gagal. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const fieldError = (field) =>
    fieldErrors?.[field]?.[0] ? (
      <p className="mt-1 text-xs text-clay-700">{fieldErrors[field][0]}</p>
    ) : null

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-espresso-950 px-6 py-16">
      <Link
        href="/"
        className="absolute left-6 top-6 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-espresso-200/70 transition-colors hover:bg-espresso-800/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke beranda
      </Link>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-40 h-[30rem] w-[30rem] rounded-full bg-brand-600/25 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-52 -right-24 h-[32rem] w-[32rem] rounded-full bg-lagoon-600/20 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="grid-paper pointer-events-none absolute inset-0 opacity-[.07]"
      />

      <p className="absolute right-6 top-6 hidden font-mono text-[10px] uppercase tracking-[0.2em] text-espresso-300/50 sm:block">
        auth / 03
      </p>

      <div className="w-full max-w-[26rem]">
        <div className="accent-top relative overflow-hidden rounded-card border border-espresso-700/80 bg-paper/95 p-7 shadow-lift [--accent-from:var(--color-brand-400)] [--accent-to:var(--color-lagoon-500)] sm:p-8">
          {done ? (
            <div className="flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-lagoon-500 to-lagoon-700 text-white shadow-[0_10px_24px_-12px_rgba(54,119,138,.9)]">
                <MailCheck className="h-6 w-6" />
              </span>

              <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-neutral-900">
                Pendaftaran terkirim
              </h1>

              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Akun Anda dibuat dengan status <strong>menunggu persetujuan</strong>.
                Admin perlu mengaktifkan akun sebelum Anda bisa masuk.
              </p>

              <Link
                href="/login"
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white shadow-[0_10px_26px_-12px_rgba(201,111,66,.85)] transition-all hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                Kembali ke halaman masuk
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_10px_24px_-12px_rgba(201,111,66,.9)]">
                  <MapPin className="h-6 w-6" />
                </span>

                <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-neutral-900">
                  Buat akun baru
                </h1>

                <p className="mt-2 text-sm text-neutral-500">
                  Daftar untuk mengakses Tracking Tiang. Akun akan
                  diaktifkan oleh admin.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                <div>
                  <label
                    htmlFor="register-name"
                    className="mb-1.5 block text-xs font-medium text-neutral-600"
                  >
                    Nama lengkap
                  </label>

                  <input
                    id="register-name"
                    type="text"
                    placeholder="Nama Anda"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    required
                    autoComplete="name"
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-canvas px-3.5 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />

                  {fieldError('name')}
                </div>

                <div>
                  <label
                    htmlFor="register-email"
                    className="mb-1.5 block text-xs font-medium text-neutral-600"
                  >
                    Email
                  </label>

                  <input
                    id="register-email"
                    type="email"
                    placeholder="nama@perusahaan.com"
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-canvas px-3.5 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />

                  {fieldError('email')}
                </div>

                <div>
                  <label
                    htmlFor="register-password"
                    className="mb-1.5 block text-xs font-medium text-neutral-600"
                  >
                    Password
                  </label>

                  <div className="relative">
                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimal 8 karakter"
                      value={form.password}
                      onChange={(e) => update('password', e.target.value)}
                      required
                      autoComplete="new-password"
                      className="h-11 w-full rounded-xl border border-neutral-200 bg-canvas px-3.5 pr-11 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                    />

                    <button
                      type="button"
                      aria-label={
                        showPassword
                          ? 'Sembunyikan password'
                          : 'Tampilkan password'
                      }
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {fieldError('password')}
                </div>

                <div>
                  <label
                    htmlFor="register-password-confirmation"
                    className="mb-1.5 block text-xs font-medium text-neutral-600"
                  >
                    Konfirmasi password
                  </label>

                  <input
                    id="register-password-confirmation"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Ulangi password"
                    value={form.password_confirmation}
                    onChange={(e) =>
                      update('password_confirmation', e.target.value)
                    }
                    required
                    autoComplete="new-password"
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-canvas px-3.5 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </div>

                {error && !fieldErrors && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-clay-300 bg-clay-50 px-3.5 py-3 text-xs leading-5 text-clay-800"
                  >
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white shadow-[0_10px_26px_-12px_rgba(201,111,66,.85)] transition-all hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      Daftar
                      <UserPlus className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-5 text-center text-xs text-neutral-500">
                Sudah punya akun?{' '}
                <Link
                  href="/login"
                  className="font-medium text-brand-700 underline-offset-4 hover:underline"
                >
                  Masuk di sini
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-espresso-300/70">
          Tracking Tiang · Project Control System
        </p>
      </div>
    </main>
  )
}
