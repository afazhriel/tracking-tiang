# Deploy otomatis ke VPS

Workflow `.github/workflows/deploy.yml` berjalan setiap push ke `main` atau lewat
Actions → Deploy VPS → Run workflow. Setelah aktivasi, workflow berjalan otomatis
secara default. Repository variable `DEPLOY_ENABLED=false` menjeda deploy berikutnya.
Tidak ada secret di kode.

## Susunan yang didukung

Berdasarkan `RECOVERY_AUDIT_2026-10-16.md`, bukan pemeriksaan langsung VPS:

- Repo/backend: `/opt/tracking-tiang`, backend PHP-FPM dan PostgreSQL via Docker Compose.
- Frontend aktif: checkout terpisah `/opt/tracking-tiang/frontend-next/frontend`,
  layanan systemd `tracking-tiang-next`, Node.js 20.9+ (disarankan Node 22).
- Nginx/TLS tetap di host, domain `https://pjl.ituiot.com`.

Frontend ternyata tidak menggunakan Docker. Workflow mempertahankan susunan
tersebut. Jangan aktifkan jika susunan VPS sudah berubah. Kedua checkout harus
berasal dari repo ini, punya akses baca GitHub, source aktif bersih, dan bisa fast-forward ke
`main`. Perubahan manual/WIP harus dibackup dan direkonsiliasi terlebih dahulu;
Deploy rutin menolak perubahan manual pada source aktif. Mode manual
`replace_vps=true` khusus penyelarasan awal membuat backup sebelum mengganti
source dengan commit GitHub dan membersihkan file kode tambahan yang tidak
diabaikan Git. `.env`, storage dan vendor yang diabaikan Git tetap dipertahankan.

## Persiapan satu kali

1. Periksa susunan di atas lewat SSH, termasuk `systemctl cat tracking-tiang-next`,
   `docker compose ps`, `git status` pada kedua checkout, dan environment produksi.
   Pastikan backend `.env`, APP_KEY, storage, database dan konfigurasi Nginx sudah
   tersedia. Jangan mengganti APP_KEY aplikasi yang sudah berjalan.
2. VPS harus punya Git, Docker dengan Compose v2, Node/npm, rsync, curl, flock,
   tar dan systemd. User SSH harus bisa menjalankan Docker serta start/stop layanan
   tanpa prompt. Script saat ini membutuhkan hak root untuk lokasi dan systemd;
   akun deploy dengan pembatasan izin memerlukan penyesuaian terlebih dahulu.
   Akses grup Docker juga setara hak root.
3. Buat key SSH khusus GitHub Actions. Pasang **public key** di `authorized_keys`
   user VPS. Masukkan **private key** hanya ke GitHub Secret `VPS_SSH_KEY`.
   Ini berbeda dari key VPS untuk membaca repo privat GitHub.
4. Pada GitHub → Settings → Environments buat `production`. Isi secrets berikut
   di environment itu (repository secrets juga didukung):

   | Secret | Isi |
   | --- | --- |
   | `VPS_HOST` | IP atau hostname VPS, tanpa `https://` |
   | `VPS_USER` | User SSH yang sudah disiapkan |
   | `VPS_PORT` | Port SSH; boleh kosong untuk 22 |
   | `VPS_SSH_KEY` | Private key khusus deploy, tanpa passphrase |
   | `VPS_KNOWN_HOSTS` | Baris host key SSH VPS yang sudah diverifikasi |

   Ambil host key melalui administrator/konsol VPS yang dipercaya. Bila memakai
   `ssh-keyscan`, cocokkan fingerprint dengan `ssh-keygen -lf
   /etc/ssh/ssh_host_ed25519_key.pub` melalui konsol VPS. Untuk port khusus,
   known_hosts memakai `[host]:port`. Workflow menolak host key yang tidak cocok.
5. Jika perlu, buat `/etc/tracking-tiang-deploy.conf` di VPS, milik root dan mode
   `600`, berisi variabel shell non-secret:

   ```sh
   DEPLOY_REPO=/opt/tracking-tiang
   DEPLOY_FRONTEND=/opt/tracking-tiang/frontend-next/frontend
   DEPLOY_SERVICE=tracking-tiang-next
   DEPLOY_URL=https://pjl.ituiot.com
   DEPLOY_BACKUPS=/opt/tracking-tiang-deploy-backups
   ```

6. Untuk VPS baru, jeda workflow dengan repository variable `DEPLOY_ENABLED=false`
   sampai layout/secrets siap. Hapus variable itu atau ubah menjadi `true` setelah
   siap. Untuk penyelarasan source awal yang sudah disetujui pemilik, jalankan
   manual dengan `replace_vps=true`. Periksa hasil deploy pertama beserta web/API.
   Push berikutnya ke `main` akan deploy otomatis.
   Lindungi branch `main` dengan review/checks sesuai kebutuhan tim.

## Perilaku dan batasan

- Commit yang dideploy harus tepat sama dengan ujung `origin/main`. Run lama
  ditolak jika ada commit lebih baru. Deploy diserialkan oleh Actions dan flock.
- Frontend dibangun di folder sementara sebelum source aktif diperbarui. Build
  menggunakan `.env*` produksi yang sudah ada di VPS. PHP image juga dibangun
  sebelum pergantian source, dari Dockerfile commit yang dituju.
- Perubahan yang hanya menyentuh workflow/dokumentasi memperbarui SHA kedua
  checkout dan menjalankan smoke check tanpa membangun atau merestart aplikasi.
- Sebelum perubahan aktif, script membackup frontend (termasuk build), source
  backend, SHA kedua checkout, dan database PostgreSQL format custom. Backup
  mengandung data sensitif; disimpan dengan izin terbatas di luar repo. Pastikan
  ruang disk cukup untuk build dan backup. Atur retensi/backup offsite sendiri.
- Backend memakai bind mount sehingga proses pembaruan source, Composer dan
  migrasi dapat menyebabkan downtime. Frontend juga berhenti sebentar saat build
  hasil staging dipasang. Ini belum merupakan deploy tanpa downtime.
- Composer production dependencies dipasang, migrasi dijalankan `--force`, cache
  Laravel diperbarui dan backend direstart. Migrasi harus kompatibel dengan data
  produksi. Script tidak menghapus volume/database dan tidak menjalankan seeder.
- Smoke check memeriksa `/login` serta `/api/regions/provinces` melalui HTTPS.
  Tes bisnis dan login pengguna tetap perlu dilakukan setelah deploy pertama.
- Script berhenti pada error dan menampilkan lokasi backup. **Tidak ada rollback
  otomatis**, terutama untuk migrasi database. Jika layanan frontend berhenti,
  pulihkan build lalu start layanan. Untuk pemulihan penuh, hentikan trafik,
  gunakan SHA yang dicatat untuk kedua checkout (simpan perubahan baru dahulu),
  pulihkan arsip frontend/backend dan dependency/image yang cocok, kemudian
  restart layanan. Restore database dengan `pg_restore` hanya setelah menilai
  migrasi dan risiko kehilangan data yang masuk setelah backup. Jangan asal
  menjalankan migrate:rollback pada database produksi.
- Untuk mematikan deploy berikutnya, ubah `DEPLOY_ENABLED=false`. Ini tidak
  membatalkan run yang sedang berjalan. Android/iOS tetap memerlukan build dan
  distribusi aplikasi tersendiri; workflow ini memperbarui web dan backend.

## Validasi sebelum aktivasi

```sh
bash -n deploy/vps.sh
# Di VPS, dari DEPLOY_REPO (tanpa mencetak nilai .env):
docker compose config --quiet
systemctl is-active tracking-tiang-next
```

Akses SSH dan host key berhasil diuji melalui workflow `Check VPS access` pada
20 Oktober 2026. Pemilik memilih source GitHub sebagai acuan. Penyelarasan dan
deploy pertama berhasil setelah backup source/database dibuat. Deploy otomatis
aktif untuk push ke `main`; lihat [hasil pemeriksaan dan lokasi backup](VPS-AUDIT.md).

## Tambahan hardening (PR lanjutan setelah #1 dan #2)

Sebelum backup, deploy mengaktifkan maintenance lalu menghentikan backend dengan
waktu drain 120 detik. Ini mencegah request aplikasi mengubah DB/upload saat kedua
snapshot diambil. Worker eksternal atau penulis DB di luar backend harus dihentikan
oleh operator juga; skrip tidak dapat menemukan semuanya. Maintenance operator
yang sudah aktif tidak ditimpa. Jika backup gagal sebelum source berubah, backend
lama dinyalakan kembali dan maintenance dibuka. Setelah source/schema berubah,
kegagalan mempertahankan maintenance dan memerlukan pemeriksaan operator; tidak
ada pengembalian database atau backend otomatis.

Journal lokal `.git/tracking-deploy-pending` dibuat sebelum maintenance/backup.
Deploy berikutnya menolak berjalan jika journal tertinggal, termasuk setelah
koneksi terputus atau proses terbunuh. Jangan menghapus journal untuk sekadar
mengulang deploy: periksa SHA, backup, stage, status migration dan layanan terlebih
dahulu, pilih lanjut/perbaikan atau pemulihan yang disetujui pemilik, baru hapus
journal setelah verifikasi. Artefak stage dan build gagal dipertahankan ketika
pemulihan diperlukan. Simpan direktori tersebut privat karena berisi `.env*`.
Health check yang gagal sesudah pertukaran frontend mengembalikan build frontend
lama sambil mempertahankan build baru untuk pemeriksaan; ini bukan rollback penuh.

Health check kini mewajibkan HTTP 200 `/login`, HTTP 200 dengan array JSON pada
`/api/regions/provinces`, dan HTTP 401 dengan JSON `Unauthenticated.` pada `/api/me`.
Redirect atau HTML fallback API gagal. Ini belum menggantikan smoke test bisnis
berizin. `backup-vps.sh` mandiri menolak backend yang masih berjalan; penghentian
backend/worker untuk backup manual perlu persetujuan operator sebelum dijalankan.

Proxy Next memakai `API_UPSTREAM_ORIGIN`; alias `API_PROXY_ORIGIN` tetap diterima.
Default HTTPS `https://pjl.ituiot.com` sesuai vhost yang didokumentasikan:
`/api/` langsung ke PHP-FPM, `/` ke Next. Jangan arahkan origin ke Next sendiri;
itu membentuk loop. HTTP ke IP/domain publik ditolak pada production build;
HTTP loopback diperbolehkan untuk tes dan upstream lokal yang benar-benar HTTP.
Pastikan `.env*` build VPS yang lama tidak menetapkan public HTTP; ubah hanya saat
persetujuan konfigurasi produksi diberikan. Header/token tidak pernah dimasukkan
ke URL. Konfigurasi ini belum diterapkan pada VPS oleh PR.

Sebelum merge produksi: aktifkan branch protection/required PR dan `Quality gate`,
pause deploy `DEPLOY_ENABLED=false` selama penggabungan rangkaian PR, periksa vhost,
origin HTTPS/TLS dari VPS, graceful-stop signal PHP-FPM, worker eksternal, ruang
disk, izin backup serta prosedur restore. Resume deploy dan eksekusi produksi
memerlukan persetujuan pemilik. Detail branch protection dan daftar metadata secrets mengembalikan 403. Metadata
environment production dapat dibaca: belum ada protection rules/branch policy.
Konfigurasi environment tidak diubah karena batasan pemilik; tidak ada nilai
secrets yang dibaca/dicetak.

Konfigurasi Capacitor remote-WebView juga memakai HTTPS pada domain yang sama,
dengan cleartext=false. App ID/navigasi/arsitektur remote-WebView tetap dipertahankan;
ini baru berlaku pada build APK berikutnya. APK yang sudah terpasang tidak berubah
dan masih memerlukan pembaruan berizin serta tes perangkat. Ini bukan integrasi
static-export/plugin native dari branch review.

## Gerbang produksi dan pembuktian restore

PR #9 menambahkan pemeriksaan read-only metadata main/environment dan SHA terbaru
sebelum secrets SSH dimuat. Main harus protected, environment membutuhkan reviewer
dan policy branch yang membatasi main/protected branches. Metadata 403 atau setting
kosong menghentikan proses. Required PR/Quality gate tetap harus diperiksa pemilik
karena detail admin belum bisa dibaca. Tidak ada setting GitHub/VPS diubah oleh PR.

Backup kini memiliki SHA256SUMS dan COMPLETE setelah kedua arsip tar serta katalog
dump valid. COMPLETE bukan bukti restore penuh. Verifikasi checksum sebelum
rehearsal pemulihan dan pertahankan backup privat/offsite. Kegagalan validasi arsip
menghentikan rollout sebelum source/migration. Migration dibatasi lock_timeout 5s
dan statement_timeout 300s; timeout mempertahankan maintenance/journal agar operator
memeriksa, tanpa rollback database otomatis.

Quality gate juga mewajibkan restore PostgreSQL 18 nyata serta hash upload fixture
lama/privat ke target baru yang terisolasi. Ini tidak menjalankan restore/SSH atau
mengakses data VPS. Lihat [langkah aktivasi](../docs/activation-checklist.md) untuk
urutan review, Nginx /storage, HTTPS/Set-Cookie, APK dan preflight yang diperlukan.

PR #10 membersihkan devDependencies dari stage frontend sesudah build. Hanya
node_modules runtime yang ditukar ke layanan aktif; native CLI dan tool lint/test
tetap tersedia di lingkungan pengembangan/CI lengkap. Chromium menguji hasil
prune, dengan driver terpisah; audit dependency PHP/npm juga wajib sebelum deploy.
Patch Vite dan override uuid khusus xcode dicatat di production-readiness.md.
