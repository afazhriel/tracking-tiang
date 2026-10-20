import PekerjaanDetail from './PekerjaanDetailPage'

/**
 * Halaman detail pekerjaan.
 *
 * =========================================================
 * KENAPA SHELL SERVER, BUKAN SATU FILE 'use client'
 * ------------------------------------------------------------
 * Rute `[id]` TIDAK bisa dirender statis tanpa `generateStaticParams`,
 * dan fungsi itu TIDAK boleh berada di file `'use client'` (aturan
 * Next.js: "cannot use both 'use client' and export function
 * generateStaticParams()"). Jadi file ini sengaja bebas dari
 * `'use client'` dan hanya bertugas menyediakan parameter.
 *
 * Nilai `id` yang dikembalikan bersifat PLACEHOLDER. Build static
 * export (APK) butuh minimal satu dokumen HTML per rute dinamis, dan
 * Capacitor melayani dokumen itu untuk path apa pun. `id` yang
 * sesungguhnya dibaca di klien oleh `PekerjaanDetailPage` melalui
 * `useParams()` — perilaku yang sama seperti versi SSR.
 * =========================================================
 */
export function generateStaticParams() {
  return [{ id: 'placeholder' }]
}

export default function Page() {
  return <PekerjaanDetail />
}
