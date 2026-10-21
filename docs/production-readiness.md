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
   → #3 → #4 (upload) → #5 (akun). Setelah PR sebelumnya masuk main, ubah base PR berikutnya ke main dan jalankan
   check pada commit terbaru. Tidak perlu force push.
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


## Tambahan perlindungan akun (PR #5)

Temuan High yang dibuktikan sebelum perbaikan: admin terakhir bisa dibuat pending;
dua penonaktifan bersamaan sama-sama membalas 200 sehingga seluruh admin menjadi
nonaktif. Update role/status kini mengunci kumpulan admin dengan urutan tetap dan
memeriksa ulang target dalam transaksi. Pending termasuk kehilangan akses aktif;
role/status yang ditolak mengembalikan field error yang sesuai. Pesan status PIC
pending diperbaiki agar tidak menyatakan akun sudah aktif.

Accept undangan sebelumnya membuat akun/membership sebelum penandaan accepted,
sehingga error meninggalkan akun aktif tanpa penerimaan yang lengkap. Seluruh
pembuatan akun, membership, accepted state dan token sekarang satu transaksi,
dengan pemeriksaan ulang token/status di bawah row lock yang juga dipakai revoke.
Explicit expired/unknown status ditolak. Undangan ke tim juga memberi membership
project tim, sesuai tujuan undangan, tanpa mengubah akun/password yang sudah ada.

Tes concurrency menjalankan dua proses API Laravel terpisah pada PostgreSQL uji,
bukan hanya mock/simulasi satu proses: dua suspension harus menyisakan satu admin;
accept/revoke hanya boleh menghasilkan salah satu urutan serial yang konsisten.
Fixture/worker dibatasi guard APP_ENV=testing dan nama/host database CI. Tidak ada
akun atau token produksi dibuat/dicetak. Skenario penambahan anggota ke tim tanpa
project sesudah assignment/perpindahan tim masih membutuhkan pengujian lanjutan;
perubahan ini tidak mengklaim semua kemungkinan alur organisasi sudah diaudit.


## Verifikasi gabungan pada branch akun

Pengujian terbaru sesudah seluruh perubahan source di atas: **166 Unit/Feature /
518 assertions**, **5 migration / 763 assertions**, **14 frontend tests**, Pint
**115 file**, lint tanpa warning dan Next production build lulus. Dua proses API
terpisah digunakan untuk masing-masing race admin dan accept/revoke undangan.
Tes deployment 15 kasus lulus pada PR #3 dan dipakai ulang oleh quality gates.
Image PHP produksi dibangun dan parser HTTP lokal lima berkas 5 MiB lulus.

Tidak ada migration baru, penggantian dependency/lockfile atau force push pada
tahap hardening ini. PR #1/#2 dipertahankan; PR #3 deployment/transport, PR #4
upload, PR #5 integritas akun adalah perubahan tambahan yang dapat ditinjau
terpisah. Semua PR tetap memerlukan review pemilik. Main dan VPS tetap pada
keadaan sebelumnya; status NOT READY tidak berubah sampai langkah aktivasi di
atas selesai. Konfigurasi Capacitor HTTPS baru berlaku pada APK hasil build baru,
dan perangkat lama mungkin perlu login kembali setelah perpindahan origin.
