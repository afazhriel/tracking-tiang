# Perbaikan akses, realisasi, bobot dan kalender

Kandidat ini memerlukan backend dan frontend dari commit yang sama. Jangan hanya
menyalin ProjectPolicy atau frontend: API tetap merupakan pengendali izin.

## Perilaku

- Admin dan Supervisor aktif memiliki akses administratif global: proyek, tim,
  tiang, anggota, realisasi, baseline dan pengelolaan akun. Identitas role tetap
  berbeda. Admin aktif terakhir tetap tidak boleh diturunkan/dinonaktifkan.
- PIC tetap memerlukan akses proyek/penugasan; tidak boleh membuat proyek baru.
- Pemilih proyek selalu terlihat. Kode `TT-001` adalah identitas proyek Tracking
  Tiang, bukan kode pekerjaan atau tanggal. TANKI dipilih sebagai proyek berbeda.
- Realisasi tiang: buka Tiang → detail → **Catat Realisasi**. Setelah menyimpan,
  detail, pekerjaan, progres, aktivitas dan kurva dimuat ulang.
- Realisasi kuantitas: pilih TANKI → Proyek → **Catat Realisasi**. Halaman
  Pekerjaan memberi tautan ke pencatatan kuantitas; total bobot tidak berlaku.
- Waktu realisasi tiang dapat diisi dalam waktu lokal perangkat lalu dikirim
  dengan offset UTC. Tidak boleh mendahului awal proyek/catatan terbaru item,
  atau berada di masa depan. Tanggal selesai tidak boleh mendahului mulai.
- Kurva utama **dihitung ulang dengan bobot aktif saat ini** pada setiap tanggal
  realisasi. Ini adalah penyajian ulang, bukan bukti bobot historis pada tanggal
  tersebut. Raw history tidak ditulis ulang. `calculation_basis` menjelaskan
  basis ini. `legacy_snapshot_curve` tersedia untuk diagnosis dan berstatus
  `unversioned_mixed_weights_not_comparable`; snapshot yang tidak diketahui
  menghasilkan null, bukan bobot saat ini yang diperlakukan sebagai sejarah.
- `data_quality` menampilkan total bobot per tiang, snapshot hilang, realisasi
  sebelum awal proyek, ketidaksamaan histori/progres terkini dan masalah jadwal.
- Kalender memakai bulan relatif terhadap awal proyek (B1 = bulan proyek pertama,
  bukan Januari), dengan `addMonthsNoOverflow`. Jadwal aktif yang tidak lengkap,
  terbalik, melebihi batas atau melewati akhir proyek tidak digambar seolah valid.
  Tiang dengan pekerjaan sendiri tidak diam-diam memakai jadwal template lain.
  Durasi hari deskriptif bukan pengganti rentang bulan untuk distribusi kurva ini.
- Kurva rencana proyek tetap membutuhkan baseline yang disahkan. Tidak ada
  persetujuan baseline otomatis, migrasi baru atau pengisian realisasi fiktif.

## Apa yang dibuktikan oleh angka audit

Untuk TT-001, `(9.3082 + 0.505 + 100) / 1500 = 0.0732088%`, ditampilkan
`0.0732%`. Target 1500 harus benar-benar berarti jumlah tiang yang menjadi
pembagi. Jangan menggantinya menjadi 3 hanya supaya progres terlihat besar.

Pada ABANG-01, snapshot 78.41 dan 5.24 menghasilkan 83.65 ketika kedua pekerjaan
100%. Bobot saat ini 78.41 dan 21.59 menghasilkan 100%. Kedua nilai berasal dari
basis berbeda. Kandidat menggunakan basis saat ini secara eksplisit, bukan
mengubah snapshot 5.24 menjadi 21.59.

## Rekonsiliasi data bobot

Total template 23.81, BDGL-001 26.21 dan BDG 002 23.81 belum otomatis berarti
seluruh item yang benar sudah ada. Periksa pekerjaan nonaktif/hilang dan lingkup
kontrak dahulu. Normalisasi mempertahankan proporsi; ia tidak mengetahui biaya,
volume atau pekerjaan yang belum dimasukkan.

Setelah kode kandidat dipasang di lingkungan uji dengan salinan backup, lihat
rencana tanpa menulis database:

```bash
php artisan tracking:reconcile-weights 1
```

Command mengunci proyek saat mengambil rencana, menolak referensi template/copy
ambigu, serta menampilkan perubahan per ID dan `fingerprint`. Jika lingkup aktif
sudah lengkap, jalankan dengan fingerprint dari rencana terbaru:

```bash
php artisan tracking:reconcile-weights 1 --apply --expect='<fingerprint-dari-rencana>' --reason='Lingkup pekerjaan aktif sudah diperiksa'
```

Apply atomik; perubahan progres/konfigurasi membatalkan fingerprint lama. Arsip
sebelum perubahan disimpan privat di `storage/app/private/weight-reconciliations`.
Arsip adalah catatan niat eksekusi, bukan bukti commit berhasil; cocokkan database
sesudahnya. Histori, foto, kuantitas dan baseline tidak diubah. Backup penuh
PostgreSQL dan uploads tetap diperlukan untuk pemulihan produksi.

## Verifikasi sebelum aktivasi produksi

1. Quality gate pada commit kandidat harus lulus di GitHub: PostgreSQL 18,
   migrasi, browser, pemulihan backup, frontend dan deployment tests.
2. Ambil backup produksi dengan mekanisme `deploy/backup-vps.sh` yang sudah
   dikonfigurasi. Verifikasi restore ke database terpisah sebelum perubahan data.
3. Produksi memakai backend `/opt/tracking-tiang/backend` dan frontend
   `/opt/tracking-tiang/frontend-next/frontend`. Jangan mengasumsikan folder
   `frontend/` di root merupakan layanan aktif.
4. Bandingkan source produksi dengan commit dasar `6051744`; simpan perubahan
   lokal lain. Kandidat sudah menyertakan izin create Admin/Supervisor dan reload
   lima sumber data setelah realisasi dari hotfix yang dilaporkan pengguna.
5. Build kandidat terpisah; jangan `git reset --hard`, `git clean`, atau menyalin
   seluruh checkout menimpa `.env`, storage, uploads dan direktori backup.
6. Pada salinan data, jalankan audit ulang dan bandingkan semua riwayat/foto
   sebelum-sesudah. Normalisasi hanya setelah lingkup aktif dinyatakan lengkap.
7. Uji akun Admin, Supervisor dan PIC: create proyek, akses TANKI, satu realisasi
   tiang, satu kuantitas, perpindahan proyek, tanggal, refresh kurva, dan penolakan
   PIC pada proyek asing. HTTP 200 halaman saja belum membuktikan alur ini.
8. Aktivasi backend+frontend bersama sesuai prosedur rilis; simpan source/build
   lama untuk rollback. Catat commit dan backup. Periksa log dan audit lagi.

Pengujian lokal memakai PGlite hanya untuk iterasi Unit/Feature; bukan pengganti
PostgreSQL 18 untuk concurrency, migrasi dan recovery. Data produksi belum
berubah oleh pembuatan kandidat ini.
