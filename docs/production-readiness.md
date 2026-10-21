# Final hardening dan kesiapan produksi

Catatan berikut mencatat tahap-tahap audit sebelum izin aktivasi diberikan.
Untuk kondisi operasional terkini, baca [pelaksanaan rollout](production-rollout-2026-10-21.md).

Status saat menyiapkan PR tambahan: **NOT READY untuk aktivasi produksi**.
Main c547c48 belum berisi quality gates dan GitHub melaporkan protected=false.
Environment production juga belum punya reviewer rules/deployment branch policy;
metadata ini dapat dibaca, sedangkan detail branch protection/secrets mengembalikan
403. Tidak ada pengaturan produksi yang diubah.
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

Catatan tahap sebelum PR #8 (digantikan oleh bagian sesi browser di bawah):
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

PR #8 di bawah mengganti akses publik API dengan auth/policy dan upload privat;
risiko bypass Nginx pada file lama tetap memerlukan verifikasi operator.

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
   Detail branch protection/secrets mengembalikan 403. Metadata environment dapat
   dibaca: production belum punya protection rules atau deployment branch policy.
   Konfigurasinya tidak diubah karena batasan perubahan produksi dari pemilik.
   Sesuaikan approval reviewer
   dengan jumlah anggota tim; jangan memberi bypass rutin.
2. Pause `DEPLOY_ENABLED=false` oleh pemilik sebelum merge rangkaian PR agar commit
   antara tidak langsung deploy. Merge/rebase retarget dilakukan pemilik: #1 → #2
   → #3 → #4 (upload) → #5 (akun) → #6 (total legacy). Setelah PR sebelumnya masuk main, ubah base PR berikutnya ke main dan jalankan
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

## Tambahan integritas total legacy (PR #6)

Temuan High: guard penulisan sudah menolak konflik template/salinan, tetapi GET
agregat masih menjumlahkan kedua state. Dua progres 75% dan 90% dari sumber sama
dapat menghasilkan total 165%. ProgressIntegrity kini mengembalikan 409 pada GET
progress, summary, project work-items/aggregate dan Kurva S yang ambigu. Policy
tetap diperiksa terlebih dahulu; summary PIC hanya memeriksa tiang yang terlihat.
Daftar pekerjaan per tiang tetap dapat dibaca untuk rekonsiliasi. Tidak ada state,
histori, pekerjaan manual atau referensi foto yang ditimpa/dihapus.

Kasus berbeda: jika hanya histori yang sebagian dipindahkan, Kurva S sebelumnya
mempertahankan state lama dan salinan sekaligus. Timeline kini memakai sumber
pekerjaan yang sama dan urutan recorded_at/id, sehingga 75% lalu 90% menghasilkan
90%, bukan 165%, tanpa menghapus histori atau mengganti snapshot bobot.

File: services/ProgressIntegrity.php, empat controller API (Curve, Pole, Progress,
WorkItem), tests/Feature/AmbiguousProgressTest.php serta dua dokumen ini. Tujuh
regression tests mencakup lima endpoint, timeline parsial dan scope summary PIC.
Konflik data produksi yang memang sudah ada tetap perlu keputusan rekonsiliasi
pemilik; PR ini sengaja tidak memilih angka atau menjalankan backfill otomatis.

Verifikasi gabungan terbaru: **173 Unit/Feature / 540 assertions**, **5 migration /
763 assertions**, Pint **117 file** lulus lokal pada PostgreSQL terisolasi. Source
frontend/deployment tidak berubah dari tahap sebelumnya (14 tes frontend, 15 tes
deployment, ESLint dan build lulus); quality gates PR tetap menjalankan semuanya
pada commit gabungan terbaru. Tidak ada migration atau dependency baru. Urutan
review enam PR di atas wajib disertai CI ulang setelah retarget ke main.

## Lanjutan akses tim (PR #7)

Empat kegagalan dibuktikan pada source sebelum perbaikan: anggota yang baru
ditambahkan sesudah assignment dan undangan ke tim tanpa project_id mendapat 403
pada tiang yang ditugaskan; tim nonaktif tetap memberi akses; perpindahan project
tim lolos walaupun assignment masih aktif. TeamAccess memberi project membership
dari project tim dan assignment aktif di bawah transaksi/lock tim. Writer
assignment membaca ulang status/project setelah lock; update tim menolak pindah
project selama assignment aktif (409). Akses melalui tim nonaktif ditutup.

Delapan regression tests juga mencakup rollback saat grant gagal, role membership
lama, pencabutan anggota, dan pindah project tim tanpa assignment. Tidak ada
migration, penghapusan histori atau membership project lama. Unit/Feature lokal:
181 tes / 571 assertions lulus. Review #7 setelah #6 dan retarget/CI ulang sesuai
prosedur di atas. Pembatasan produksi tetap berlaku; source ini belum dideploy.

## Lanjutan sesi browser dan media privat (PR #8)

Browser kini memilih cookie Sanctum __Host-... yang Secure, HttpOnly, Strict,
host-only, maksimal 12 jam; token tidak dikembalikan dalam JSON atau disimpan
di localStorage. Penanda sesi acak bukan credential. Bearer browser lama dipindah
lebih dulu tanpa menambah token atau memperpanjang expiry yang lebih pendek.
Login dan mutasi cookie memerlukan header browser + Origin yang cocok; HTTP
publik ditolak frontend sebelum password/token dikirim. API bisnis tetap active;
logout/logout-all hanya auth agar akun suspended pun bisa mencabut sesi sendiri.
Halaman internal memeriksa profil server. Menu logout kini benar-benar mencabut
token; error jaringan tidak dinyatakan sukses.

Foto memakai policy tiang, avatar untuk pemilik/admin/supervisor. Respons media
no-store/CORP same-origin, MIME raster server; HTML/SVG lama tidak dirender inline.
Upload baru memakai storage/app/private/media. Avatar baru memiliki prefix
private-media/avatars; referensi/path lama tetap dibaca dari public tanpa migration
atau pemindahan massal. Cleanup mempertahankan file lama/referensi committed.
deploy/nginx-private-media.conf menutup /storage/ agar file legacy tidak melewati
Laravel; operator harus menggabungkannya dengan vhost yang ada setelah persetujuan.
Source tidak memasang aturan Nginx atau mengubah server produksi.

Kontrak bearer lama tetap tersedia untuk klien tanpa header browser, termasuk
klien native. Native yang membaca foto perlu mengirim bearer. Cookie memerlukan
HTTPS same-origin: APK lama yang masih membuka HTTP/IP harus diperbarui ke URL
HTTPS sebelum rollout ini; jangan menambahkan fallback login HTTP. Build APK dan
perangkat fisik belum diverifikasi. APP_URL/proxy harus cocok dengan origin HTTPS,
tidak menghapus Set-Cookie atau mencache respons private/API. Source ini harus
dirilis bersama frontend/backend, sesudah perlindungan dan preflight produksi.

Validasi lokal: 196 Unit/Feature / 674 assertions, 5 migration / 763 assertions,
Pint 124 file, 15 deployment tests, frontend lint/build lulus. Enam kelompok smoke
Chromium nyata lulus: login/cookie/upload progres/gambar privat/CSRF, anonim dan
PIC asing, pencabutan assignment, upgrade bearer lama, viewport ponsel, menu logout.
Frontend mempunyai 21 unit tests setelah tambahan penolakan HTTP. Dependency dev
playwright-core dipin; metadata dependency lama tetap dipertahankan. Job browser
terisolasi PostgreSQL 18 kini menjadi dependency wajib Quality gate, tanpa secrets
atau environment produksi. Review setelah #7; semua perubahan masih memerlukan
merge oleh pemilik dan CI ulang pada target main. Status produksi belum berubah.

## Pemulihan dan gerbang produksi (PR #9)

Deployment memeriksa main protected, SHA tepat dan reviewer/branch policy
environment sebelum memuat secrets SSH. Metadata tak terbaca atau setting belum
lengkap menghentikan proses. Metadata GitHub saat ini membuktikan gate menolak
main belum protected, reviewer kosong dan branch policy kosong. Detail required
PR/Quality gate tetap perlu verifikasi pemilik karena API admin 403; tidak ada
setting GitHub yang diubah.

Backup otomatis/manual memvalidasi struktur tar serta katalog dump, menyimpan
SHA256SUMS lalu COMPLETE sebelum selesai atau mengubah source. Arsip rusak
dibuktikan menghentikan rollout dan membiarkan source lama aktif. Migration
mendapat PGOPTIONS lock_timeout=5s/statement_timeout=300s; nilai ini terverifikasi
melalui koneksi Laravel PostgreSQL uji, dengan compatibility suite memakai batas
sama. Timeout memerlukan penilaian operator; tidak ada rollback DB otomatis.

Job recovery wajib menjalankan dump/restore PostgreSQL 18 ke database baru,
membandingkan 10 tabel, sequence ID dan bytes file public/private. Fixture mencakup
partial backfill ganda, histori snapshot, item manual, role pivot lama, referensi
foto dan notifikasi sudah dibaca. createdb menolak nama yang sudah ada; restore
tidak memakai --clean/DROP. Tool dikunci ke Docker lokal, ID container postgres:18,
database CI dan direktori fixture. Bootstrap memakai IsolatedDatabase sebelum
migrate:fresh. Jangan gunakan untuk restore produksi. File dipulihkan ke folder
sementara baru, data/file sumber tidak ditimpa.

Validasi lokal: restore nyata lulus, 5 tes policy, 19 deployment/safety tests,
5 migration / 763 assertions dengan timeout, Pint 125 file dan bash syntax.
Source backend/frontend tetap PR #8: 196 tes / 674 assertions, 21 frontend unit
tests dan enam kelompok browser smoke yang juga dijalankan ulang CI. CI membuktikan
format/fixture, belum backup/offsite VPS atau kapasitas/durasi lock data produksi.
Lihat [langkah aktivasi](activation-checklist.md) untuk urutan #1–#9, perlindungan
GitHub, Nginx/cookie, APK HTTPS, worker, restore backup nyata dan persetujuan rollout.
Status aktivasi tetap NOT READY sampai langkah operasional selesai; source siap
review. Tidak ada migration/schema/dependency aplikasi baru pada PR #9.

## Dependency dan runtime produksi (PR #10)

Audit npm produksi awal menemukan tiga Moderate dari Capacitor CLI → xcode →
uuid. Audit termasuk dev juga menemukan High pada Vite 8.3.2 dan temuan turunan
plugin React. Vite dipin ke 8.3.4 yang sudah ditambal. uuid dipin 11.1.1 melalui
override khusus xcode untuk GHSA-w5hq-g745-h8pq; tidak memakai override global.
Caller xcode hanya memakai API CommonJS v4. Regression test menjalankan generator
ID project xcode sebenarnya 1.000 kali dengan ID lama pada fixture dan memastikan
format/keunikan; startup Capacitor CLI 8.5.2 juga lulus. Ini bukan build iOS/APK.
Resolver juga memperbarui patch postcss 8.5.28→8.5.31 dan nanoid 3.3.19→3.3.20;
build dan browser diuji dengan lockfile hasil tersebut, tanpa force audit fix.
Override perlu ditinjau ulang ketika upstream xcode memperbarui dependency-nya.

Capacitor CLI dipindah ke devDependencies. Staging melakukan npm prune --omit=dev
sesudah build dan sebelum menyentuh layanan aktif. Job browser menggunakan hasil
prune yang sama, memeriksa CLI/Vite/ESLint/Playwright tidak ada di runtime; driver
penguji dipisah ke folder sementara. Fallback frontend lama tetap menyimpan build
dan node_modules yang cocok, sesuai prosedur PR #3. APK/build developer tetap
menggunakan npm ci lengkap, jadi tooling native tidak dihapus dari pengembangan.

Hasil lokal: npm audit termasuk dev **0 advisory**, audit npm produksi **0**,
Composer --locked --no-dev **0 advisory / 0 abandoned package**. Frontend **22 tes**
(termasuk integrasi xcode/uuid), lint, Next production build, versi CLI serta enam
kelompok Chromium sesudah prune lulus. Deployment **19 tes**, policy **5 tes** dan
syntax lulus. CI wajib menjalankan audit Composer dan npm; kegagalan menghentikan
Quality gate. Backend/migration tetap source #9 dan dijalankan ulang pada CI.

Urutan review menjadi #1 sampai #10. Main/VPS tetap belum diubah. Audit bersih
berlaku untuk snapshot advisory saat pengujian, bukan jaminan terhadap temuan baru.
SDK Android tidak terkonfigurasi pada workspace; APK/perangkat fisik tetap belum
diuji. Langkah operasional pada activation-checklist.md masih diperlukan sebelum
status produksi dapat READY. Source perbaikan siap ditinjau sesudah CI terbaru hijau.
