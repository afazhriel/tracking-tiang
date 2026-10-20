import TiangDetail from './TiangDetailPage'

/**
 * Detail satu tiang.
 *
 * Shell server tanpa `'use client'` supaya boleh mengekspor
 * `generateStaticParams` (dibutuhkan build static export/APK).
 * Penjelasan lengkap ada di `app/pekerjaan/[id]/page.jsx`.
 */
export function generateStaticParams() {
  return [{ id: 'placeholder' }]
}

export default function Page() {
  return <TiangDetail />
}