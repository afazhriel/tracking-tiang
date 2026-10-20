import PekerjaanTiang from '../../[id]/pekerjaan/PekerjaanTiangPage'

/**
 * Rute statis untuk APK — pasangan `poleWorkHref` di lib/native.js
 * (`/tiang/detail/pekerjaan?pole={id}` di native, `/tiang/{id}/pekerjaan`
 * di browser). Alasan sama dengan `app/tiang/detail/page.jsx`:
 * ekspor statis tidak punya berkas RSC untuk path dinamis.
 */
export default function Page() {
  return <PekerjaanTiang />
}
