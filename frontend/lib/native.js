'use client'

/**
 * Penanda lingkungan native (APK/IPA) dan origin backend untuk WebView.
 *
 * KENAPA ADA
 * ----------
 * Di browser, seluruh panggilan API lewat origin yang sama (`/api/*`)
 * dan di-proxy oleh Next.js. Di aplikasi native (Capacitor) masalahnya
 * berbeda: aset frontend dibundel lokal, jadi `location.origin` adalah
 * `https://localhost` atau `capacitor://localhost` — BUKAN domain
 * backend. Kalau `/api/*` dipanggil apa adanya, request mengenai
 * server statis lokal dan gagal.
 *
 * Solusinya: di native, API memanggil origin backend secara langsung.
 * Nilainya bisa ditimpa lewat build-time env `NEXT_PUBLIC_API_ORIGIN`
 * supaya build staging tidak perlu mengedit file ini.
 *
 * Catatan: origin ini TIDAK boleh diakhiri garis miring, karena
 * pemakaiannya selalu `${origin}${path}`.
 */

import { Capacitor } from '@capacitor/core'

/** Origin backend default untuk aplikasi native (produksi). */
const DEFAULT_NATIVE_ORIGIN = 'https://pjl.ituiot.com'

/**
 * Origin dari build-time env. `process.env.NEXT_PUBLIC_*` diganti
 * literal oleh Next.js saat build, jadi aman diakses dari browser.
 */
const ENV_ORIGIN = String(process.env.NEXT_PUBLIC_API_ORIGIN || '')
  .trim()
  .replace(/\/+$/, '')

/** Origin yang dipakai saat berjalan di WebView native, atau null di browser. */
export function getNativeOrigin() {
  if (typeof window === 'undefined') return null

  if (!Capacitor.isNativePlatform()) return null

  return ENV_ORIGIN || DEFAULT_NATIVE_ORIGIN
}
