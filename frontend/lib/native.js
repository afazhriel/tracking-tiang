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

/**
 * True saat berjalan di dalam APK/IPA (WebView Capacitor), false di browser.
 *
 * Dipakai guard agar penanganan khusus native (mis. fallback rute
 * html5mode di landing page) tidak pernah aktif pada deploy web.
 */
export function isNativeApp() {
  if (typeof window === 'undefined') return false

  return Capacitor.isNativePlatform()
}

/** Origin yang dipakai saat berjalan di WebView native, atau null di browser. */
export function getNativeOrigin() {
  if (typeof window === 'undefined') return null

  if (!Capacitor.isNativePlatform()) return null

  return ENV_ORIGIN || DEFAULT_NATIVE_ORIGIN
}

/**
 * Ubah path API menjadi URL absolut saat berjalan di native.
 *
 * Di browser cukup mengembalikan path apa adanya (nanti di-proxy
 * Next.js), sedangkan di WebView aset dibundel lokal sehingga path
 * relatif akan mengenai server statis — bukan backend.
 *
 * Dipakai oleh kode yang memanggil `fetch()` langsung (bukan lewat
 * `lib/api.js`), mis. halaman login dan landing.
 */
export function resolveApiUrl(path) {
  if (typeof path !== 'string') return path

  // URL absolut (http/https) dibiarkan apa adanya.
  if (/^https?:\/\//i.test(path)) return path

  const nativeOrigin = getNativeOrigin()

  if (!nativeOrigin) return path

  return `${nativeOrigin}${path.startsWith('/') ? '' : '/'}${path}`
}
