# Deploy otomatis ke VPS

Workflow `.github/workflows/deploy.yml` berjalan setiap push ke `main` atau lewat
Actions → Deploy VPS → Run workflow. Workflow belum aktif sampai repository
variable `DEPLOY_ENABLED` bernilai `true`. Tidak ada secret di kode.

## Susunan yang didukung

Berdasarkan `RECOVERY_AUDIT_2026-10-16.md`, bukan pemeriksaan langsung VPS:

- Repo/backend: `/opt/tracking-tiang`, backend PHP-FPM dan PostgreSQL via Docker Compose.
- Frontend aktif: checkout terpisah `/opt/tracking-tiang/frontend-next/frontend`,
  layanan systemd `tracking-tiang-next`, Node.js 20.9+ (disarankan Node 22).
- Nginx/TLS tetap di host, domain `https://pjl.ituiot.com`.

Frontend ternyata tidak menggunakan Docker. Workflow mempertahankan susunan
tersebut. Jangan aktifkan jika susunan VPS sudah berubah. Kedua checkout harus
berasal dari repo ini, punya akses baca GitHub, bersih, dan bisa fast-forward ke
`main`. Perubahan manual/WIP harus dibackup dan direkonsiliasi terlebih dahulu;
script tidak menjalankan `git reset --hard`.

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

6. Commit dan push perubahan workflow ini ke `main`. Setelah prasyarat cocok,
   buat repository variable `DEPLOY_ENABLED=true` di Settings → Secrets and
   variables → Actions → Variables. Jalankan workflow manual untuk deploy
   pertama dan periksa log serta web. Push berikutnya akan deploy otomatis.
   Lindungi branch `main` dengan review/checks sesuai kebutuhan tim.

## Perilaku dan batasan

- Commit yang dideploy harus tepat sama dengan ujung `origin/main`. Run lama
  ditolak jika ada commit lebih baru. Deploy diserialkan oleh Actions dan flock.
- Frontend dibangun di folder sementara sebelum source aktif diperbarui. Build
  menggunakan `.env*` produksi yang sudah ada di VPS. PHP image juga dibangun
  sebelum pergantian source, dari Dockerfile commit yang dituju.
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

Tidak ada akses VPS/SSH yang dikonfigurasi dalam sesi penyusunan workflow ini;
keberhasilan deploy langsung belum diverifikasi.
