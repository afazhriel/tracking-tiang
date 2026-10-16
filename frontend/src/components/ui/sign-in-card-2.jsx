'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LogIn,
  MapPin,
  TriangleAlert,
} from 'lucide-react'

/**
 * Kartu login.
 *
* Sebelumnya 100% inline style dengan glow ungu (#7c3aed) yang
       * tidak nyambung dengan aplikasi. Sekarang memakai palet yang sama
 * dengan dashboard: kertas hangat, aksen terracotta, satu sentuhan
 * lagoon untuk penanda "data".
 *
 * Logika auth tidak diubah: token tetap disimpan di localStorage
 * dengan key yang sama, lalu full-reload ke /dashboard.
 */
export function Component() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.message || 'Login gagal.')
        return
      }

      localStorage.setItem('tracking_tiang_token', data.token)
      localStorage.setItem(
        'tracking_tiang_user',
        JSON.stringify(data.user)
      )

      window.location.href = '/dashboard'
    } catch (err) {
      console.error(err)
      setError('Tidak dapat terhubung ke server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-espresso-950 px-6 py-16">
      {/* Kembali ke landing page: keluar dari konteks login, jadi
          dibuat kecil dan redup di pojok, bukan tombol utama. */}
      <Link
        href="/"
        className="absolute left-6 top-6 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-espresso-200/70 transition-colors hover:bg-espresso-800/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke beranda
      </Link>

      {/* Latar: dua kabut warna + jejak grid, mengikuti pola landing page. */}
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

      {/* Penanda konteks: "auth / 02" supaya jelas halaman ini
        kelanjutan dari landing, tanpa menambah navigasi lain. */}
      <p className="absolute right-6 top-6 hidden font-mono text-[10px] uppercase tracking-[0.2em] text-espresso-300/50 sm:block">
        auth / 02
      </p>

      <div className="w-full max-w-[26rem]">
        <div className="accent-top relative overflow-hidden rounded-card border border-espresso-700/80 bg-paper/95 p-7 shadow-lift [--accent-from:var(--color-brand-400)] [--accent-to:var(--color-lagoon-500)] sm:p-8">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_10px_24px_-12px_rgba(201,111,66,.9)]">
              <MapPin className="h-6 w-6" />
            </span>

            <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-neutral-900">
              Selamat datang kembali
            </h1>

            <p className="mt-2 text-sm text-neutral-500">
              Masuk untuk melanjutkan ke Tracking Tiang.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-7 space-y-4"
          >
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-xs font-medium text-neutral-600"
              >
                Email
              </label>

              <input
                id="login-email"
                type="email"
                placeholder="nama@perusahaan.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 w-full rounded-xl border border-neutral-200 bg-canvas px-3.5 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-xs font-medium text-neutral-600"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
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
            </div>

            {error && (
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
                  Masuk
                  <LogIn className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-espresso-300/70">
          Tracking Tiang · Project Control System
        </p>
      </div>
    </main>
  )
}