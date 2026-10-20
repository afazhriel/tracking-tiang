import PekerjaanDetail from '../[id]/PekerjaanDetailPage'

/**
 * Rute statis untuk APK — pasangan `detailHref('/pekerjaan', id)` di
 * lib/native.js (`/pekerjaan/detail?id={id}` di native, `/pekerjaan/{id}`
 * di browser). Alasan sama dengan `app/tiang/detail/page.jsx`:
 * ekspor statis tidak punya berkas RSC untuk path dinamis.
 */
export default function Page() {
  return <PekerjaanDetail />
}
