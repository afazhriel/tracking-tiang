import PekerjaanTiang from './PekerjaanTiangPage'

/**
 * Pekerjaan pada satu tiang.
 *
 * Shell server tanpa `'use client'` supaya boleh mengekspor
 * `generateStaticParams` (dibutuhkan build static export/APK).
 * Lihat penjelasan lengkap di `app/pekerjaan/[id]/page.jsx`.
 */
export function generateStaticParams() {
  return [{ id: 'placeholder' }]
}

export default function Page() {
  return <PekerjaanTiang />
}
