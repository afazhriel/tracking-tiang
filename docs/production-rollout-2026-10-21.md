# Pelaksanaan rollout 21 Oktober 2026

Pemilik telah memberi izin merge, deploy, perubahan konfigurasi, dan migration
produksi pada percakapan ini. Izin ini menggantikan larangan aktivasi sebelumnya.
Tidak ada izin untuk menghapus data pengguna atau rollback database destruktif.

## Pemeriksaan yang sudah dilakukan

- Workflow Deploy VPS dinonaktifkan melalui API. Status terverifikasi:
  `disabled_manually`. Tidak ada deployment yang masih berjalan saat pemeriksaan.
  Penulisan/pembacaan variable Actions ditolak 403; jeda memakai status workflow.
- Pemeriksaan SSH read-only berhasil, run `39560191944`. Layanan Next aktif;
  halaman login dan daftar provinsi HTTP 200. Ini bukan smoke bisnis lengkap.
- API pengaturan branch protection dan environment production menolak perubahan
  dengan 403 `Resource not accessible by integration`. Izin percakapan tidak
  memperluas permission GitHub App. Main masih belum protected, environment belum
  memiliki reviewer/branch restriction pada pemeriksaan tersebut.
- Main menerima PR secara berurutan dengan merge commit, tanpa force push.
  Setiap PR berikutnya diarahkan ke main dan quality workflow dijalankan ulang.
  Lihat status PR/Actions GitHub untuk kemajuan integrasi terbaru.

## Gate pemulihan backup sebenarnya

`deploy/vps.sh` kini mengambil helper dari **commit target yang sama** ke stage
privat. Setelah maintenance, drain backend, snapshot DB/file dan checksum,
`verify-production-backup.sh` me-restore dump itu ke container PostgreSQL 18 baru:

- Network `none`, tanpa port, tanpa mount produksi, CPU/memory dibatasi.
- Verifikasi manifest tiga arsip tetap dan checksum sebelum menjalankan container.
- Readiness menunggu TCP loopback server final: reproduksi lokal membuktikan
  socket Unix dapat menerima koneksi pada server init sementara sebelum startup
  selesai. Network tetap none; tidak ada port yang dipublikasikan.
- Restore penuh dengan `--exit-on-error`, tanpa owner/ACL produksi, termasuk
  constraint data; keberadaan migration ledger diperiksa.
- Detail error berpotensi berisi data pengguna sehingga disimpan hanya di direktori
  backup privat VPS. Actions hanya menerima pesan umum.
- Container dan volume anonim miliknya dibersihkan setelah pengujian. Database
  produksi dan arsip asli tidak dipulihkan, ditimpa, atau dihapus.
- `RESTORE_VERIFIED` hanya diterbitkan untuk dump yang lulus; bukti lama dibatalkan
  sebelum pemeriksaan ulang. Kegagalan cleanup juga menggagalkan gate.

Restore gagal sebelum pergantian source: deployment berhenti, backend lama
kembali dijalankan, migration produksi tidak dimulai. Tidak ada bypass variable.
CI menjalankan helper produksi yang sama terhadap fixture sintetis, selain
perbandingan sepuluh tabel, sequence, dan byte upload yang sudah tersedia.

Gate ini membuktikan dump PostgreSQL dapat di-restore. Gate tidak membuktikan
keselarasan penulis eksternal, kelengkapan file di luar direktori yang dibackup,
rehearsal migration pada salinan database produksi, atau offsite recovery.
Inventaris worker/scheduler dan validasi backup/file tetap diperlukan.

## Penghambat aktivasi

1. Pemilik perlu memperluas izin GitHub App untuk Administration dan Environments
   write, atau memasang perlindungan lewat UI: main wajib PR, minimal satu approval,
   required `Quality gate`, branch terbaru, conversation resolved, no force/delete;
   environment production wajib reviewer dan branch main saja.
2. Selesaikan preflight Nginx, blok legacy `/storage/`, konfigurasi HTTPS/cookie,
   kapasitas disk, worker/scheduler, referensi media dan konflik progres produksi.
3. Verifikasi backup produksi sebenarnya pada VPS dan rehearsal migration pada
   salinan terisolasi; jangan mempublikasikan dump sebagai artifact repo publik.
4. APK lama yang menggunakan HTTP/IP harus diperbarui ke HTTPS sebelum perilaku
   sesi/media baru dirilis. Browser mobile viewport bukan uji APK fisik.
5. Setelah bukti tersebut lengkap, reviewer memeriksa commit final sebelum workflow
   deployment diaktifkan kembali. Jangan mengaktifkan workflow hanya karena CI hijau.

Status aktivasi tetap **NOT READY** sampai bukti operasional di atas lengkap.

## Diagnostik tanpa mutasi

Check VPS menjalankan audit konfigurasi/data melalui PHP di container aktif.
Transaksi PostgreSQL dipaksa READ ONLY, query dibatasi timeout 5 detik/lock 1 detik.
Hasil hanya boolean/jumlah: environment, debug, HTTPS, batas PHP, jumlah record,
admin aktif, kolom scope dan konflik progres bila skema mendukung, serta sampel
maksimal 1.000 referensi foto lokal. Baris pengguna, token, password, path foto dan
error SQL tidak dipublikasikan. Sampel terpotong dilaporkan, bukan dianggap audit
penuh. Script ini tidak menjalankan migration, backfill, atau perubahan file.
