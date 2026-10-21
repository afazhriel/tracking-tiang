# Final hardening dan kesiapan produksi

Status saat menyiapkan PR tambahan: **NOT READY untuk aktivasi produksi**.
Main c547c48 belum berisi quality gates dan GitHub melaporkan protected=false.
PR #1 (0c0c4b2) dan #2 (4b70d91) tetap terbuka, mergeable dan checks hijau.
PR #3 memperkuat deployment/proxy; PR upload berbasis #3. Tidak ada perubahan main,
akses SSH, perubahan konfigurasi VPS, deploy, migration atau restore produksi.

## Temuan terbukti dan perubahan

| Risiko | Bukti dan perbaikan | File utama |
| --- | --- | --- |
| Critical | Main belum protected, quality gates belum diterapkan di main. Detail protection 403; ruleset yang dapat dibaca kosong. Pemilik harus mengaktifkan required PR/checks sebelum aktivasi | .github/workflows/quality.yml dan deploy.yml dari PR #1, pengaturan oleh pemilik |
| High | HEAD dapat maju sebelum migration berhasil, sehingga retry lama masuk jalur docs-only dan melewati pekerjaan yang gagal. Journal kini menolak retry tanpa pemeriksaan | deploy/vps.sh, deploy/tests/test_vps.py |
| High | Health failure terjadi setelah flag pertukaran frontend dimatikan; EXIT menghapus stage pemulihan. Flag kini bertahan hingga health lulus, artefak gagal/journal disimpan | deploy/vps.sh |
| High | Snapshot DB/upload online dapat berbeda ketika request mengubah foto/avatar. Maintenance + graceful drain backend dilakukan sebelum snapshot; helper backup manual menolak backend aktif | deploy/vps.sh, deploy/backup-vps.sh |
| High | HTTP/IP upstream mengirim bearer token tanpa TLS dan memilih vhost berdasarkan IP. Default HTTPS domain yang sama, env tervalidasi, public HTTP ditolak pada build produksi | frontend/next.config.mjs, lib/upstream.mjs, tests/upstream.test.mjs |
| High | Storage throw=false dapat mengembalikan false; progres sudah commit sebelum foto, avatar lama bisa terhapus walaupun file baru gagal. File/progres/histori/metadata/notifikasi kini satu unit kerja aplikasi dengan rollback DB dan cleanup file baru yang aman | ProgressController.php, UserProfileController.php, PendingPhotos.php, PhotoStorageFailed.php, AtomicUploadTest.php |
| Medium | POST progres tanpa optional notes/tanggal mengosongkan nilai lama walaupun UI menganggap omission mempertahankannya. Kini omission mempertahankan, null eksplisit mengosongkan | ProgressController.php dan AtomicUploadTest.php |
| High | Respons 200 HTML fallback diperlakukan sebagai sukses; koneksi putus setelah commit diberi label gagal. API helper menolak JSON tidak valid dan menandai hasil mutasi belum pasti | frontend/lib/api.js, UpdateProgressModal.jsx, tests/api.test.mjs |
| Medium | Batas PHP bawaan tidak selaras dengan kontrak foto 5 MiB × 5. Image aplikasi memakai upload 5M/post 32M, parser menerima lebih dari 5 agar Laravel dapat menolak kelebihan secara utuh | backend/docker/uploads.ini, backend/Dockerfile |

Tidak ada migration baru pada dua PR hardening ini, dan migration historis tidak
berubah. Guard, locking project/pole, normalisasi dan snapshot dari PR #2 dipakai
kembali. Fixture migration memperhitungkan base PR yang sudah berisi kolom baru;
CI tetap memeriksa kedua baseline, bukan menghapus pengujian historical extensions.

## Hasil pengujian tahap upload

- Laravel Unit/Feature PostgreSQL: 158 tes / 484 assertions lulus, termasuk tujuh
  skenario upload sukses/gagal dan perlindungan berkas/record lama.
- Compatibility migration: lima tes lulus terhadap baseline lama (746 assertions)
  dan baseline PR #2 (763 assertions), pada database terisolasi.
- Frontend: 13 tes API/config, ESLint tanpa warning dan Next production build lulus.
- Deployment: 15 tes serta bash syntax lulus; failure backup/migration/health diuji
  dengan Git checkout dan layanan tiruan, tanpa koneksi VPS.
- Image PHP produksi berhasil dibangun lokal; ini 5M/32M/20 dan expose_php=Off
  terverifikasi. HTTP parser image tersebut menerima lima berkas 5 MiB tanpa error.
  Ini bukan uji nginx atau VPS; batas di proxy produksi masih perlu diperiksa.

## Batas keamanan yang tetap berlaku

Sanctum tetap bearer, browser menyimpan token di localStorage agar kontrak web/
Capacitor lama tidak berubah. Semua route protected tetap auth + active dan policy.
Tidak ada bukti XSS yang digunakan untuk membenarkan refactor autentikasi besar;
localStorage tetap dapat dibaca JavaScript origin yang sama, sehingga pencegahan
XSS, pembatasan dependency dan rotasi token tetap penting. Masa berlaku token lama
belum diubah. Logout/logout-all dan suspended token tercakup tes sebelumnya.

Foto memakai capability URL ULID, avatar memakai ID user yang bisa ditebak;
keduanya tetap publik sesuai kontrak lama, dengan MIME server + nosniff/cache
private. Ini tidak setara authorization file privat. Jika foto bersifat rahasia,
akses signed/authenticated dan perubahan pemuatan gambar perlu keputusan kontrak
serta PR terpisah. Header keamanan bukan pengganti authorization tersebut.

PHP-FPM stop hanya menghentikan penulis HTTP di container backend. Worker, cron,
atau klien database eksternal harus didata/dihentikan operator saat backup. Perlu
rehearsal restore backup dan verifikasi stop signal/runtime/kapasitas disk pada
lingkungan yang diizinkan. Tidak ada rollback DB/backend otomatis karena berisiko
menghapus data setelah backup; frontend fallback juga bukan pemulihan penuh.

Kematian proses ketika menulis file dapat meninggalkan orphan. Cleanup menunda
penghapusan bila DB/storage tidak dapat dikonfirmasi; tidak menghapus file lama
atau file yang masih direferensikan. Unknown network/commit outcome belum memakai
idempotency key; refresh sebelum retry. Transaksi upload menahan lock tiang selama
penulisan lokal maksimal 25 MiB; stress multi-worker belum dilakukan.

## Urutan review dan aktivasi yang aman

1. Pemilik mengaktifkan required PR, **Quality gate**, branch up to date, review
   conversations, larangan force push/delete, serta production environment main-only.
   Detail setting tidak dapat diubah workspace (403). Sesuaikan approval reviewer
   dengan jumlah anggota tim; jangan memberi bypass rutin.
2. Pause `DEPLOY_ENABLED=false` oleh pemilik sebelum merge rangkaian PR agar commit
   antara tidak langsung deploy. Merge/rebase retarget dilakukan pemilik: #1 → #2
   → #3 → PR upload. Setelah base berubah, jalankan check pada commit terbaru.
3. Periksa API_UPSTREAM_ORIGIN di environment build VPS (bukan IP HTTP), routing
   nginx /api langsung FPM, TLS/hairpin dari VPS, root SSH/key/known-hosts dan izin
   backup. Jangan arahkan origin ke Next sendiri. Nilai secrets tidak dibaca di audit.
4. Pastikan nginx client_max_body_size setidaknya 32m dan PHP image baru terpakai;
   cek maintenance file/cache driver, stop signal PHP-FPM dan semua worker eksternal.
   Konfigurasi produksi hanya boleh diubah setelah persetujuan pemilik.
5. Uji restore pada lingkungan terisolasi yang disetujui, periksa backup/offsite dan
   ruang disk; lakukan smoke bisnis dengan akun berizin. Build/perangkat Android
   dan static-export/native reconciliation belum diuji pada tahap ini.
6. Baru setelah persetujuan pemilik, resume deployment dan lakukan rollout. Selama
   langkah tersebut belum tuntas, hasil CI hijau berarti siap review, bukan READY
   untuk produksi. Jika gagal, ikuti journal dan rencana pemulihan, jangan menghapus
   journal lalu mengulang atau menjalankan migrate:rollback secara membabi buta.
