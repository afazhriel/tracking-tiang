import TiangDetail from '../[id]/TiangDetailPage'

/**
 * Rute statis untuk APK.
 *
 * Ekspor statis hanya punya `placeholder` untuk `/tiang/{id}`, jadi di
 * WebView Capacitor navigasi ke path dinamis selalu 404 lalu jatuh ke
 * `index.html` (landing) — pengguna "kelempar" keluar dari aplikasi.
 * Di native, tautan detail memakai `/tiang/detail?id={id}`
 * (lihat `detailHref` di lib/native.js) yang diekspor penuh build ini.
 * Di browser tetap `/tiang/{id}` — file ini tidak dipakai di sana.
 */
export default function Page() {
  return <TiangDetail />
}
