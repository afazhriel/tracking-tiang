# Laporan Audit — Pemulihan Data & Rekonsiliasi Repositori

**Proyek:** Tracking Tiang
**Tanggal:** 2026-10-16
**Server produksi:** `srv2029172` (`187.77.112.247`) — `https://pjl.ituiot.com`
**Repo lokal:** `C:\Dev\tracking-tiang\tracking-tiang`
**Remote GitHub:** `https://github.com/afazhriel/tracking-tiang.git`
**Dieksekusi oleh:** opencode (via SSH `id_tiang`)

---

## 1. Ringkasan Eksekutif

1. **Insiden data hilang SELESAI dipulihkan.** Data dari database `tracking_tiang_recovery` berhasil dipulihkan ke database aplikasi `tracking_tiang`. Aplikasi kembali berfungsi: proyek tampil, tombol "Tambah Tiang" aktif, dan penambahan tiang/pekerjaan berjalan.
2. **Produksi dikeraskan (hardened).** `APP_ENV`/`APP_DEBUG` diperbaiki, `APP_URL` dibetulkan, config Laravel di-cache ulang.
3. **Artefak pengembangan dibersihkan** (file nyasar, file `.bak`).
4. **Ditemukan drift repositori yang serius.** Kode yang berjalan di produksi **sebagian besar tidak ter-commit**. Repo GitHub, clone lokal, dan kondisi produksi saling berbeda. Seluruh pekerjaan di produksi **sudah diamankan** dalam bentuk patch + tarball (lihat §8).
5. **Sisa pekerjaan:** rekonsiliasi yang disengaja + commit/push (rencana di §10). Ini butuh keputusan pemilik repo karena menyangkut dua garis keturunan (lineage) kode.

---

## 2. Insiden & Pemulihan Data

### 2.1 Gejala
- Aplikasi kehilangan data: tidak ada proyek yang tampil sehingga `projectId` menjadi `null` → tombol "Tambah Tiang" dalam keadaan *disabled* (`frontend/app/tiang/TiangPage.jsx`: `disabled={polesLoading || !projectId}`).
- Tabel region (`provinces`/`regencies`/…) kosong → `/api/regions/provinces` mengembalikan `[]`.

### 2.2 Sumber & Prosedur
- Sumber data: database `tracking_tiang_recovery`.
- Skrip: `/opt/tracking-tiang/02_restore_data.sh` (idempoten: truncate → import berurutan sesuai FK dengan `pg_dump --data-only --column-inserts` → reset sequence → start backend → verifikasi).
- Log: `/opt/tracking-tiang/restore.log`.
- Backup pra-restore (dump) dibuat lebih dulu (lihat §8).

### 2.3 Verifikasi Hasil (main vs recovery — cocok)

| Tabel | Jumlah |
|---|---|
| projects | 1 |
| poles | 2 |
| work_items | 8 |
| pole_work_progress | 7 |
| pole_progress_histories | 8 |
| provinces | 38 |
| regencies | 514 |
| districts | 7285 |
| villages | 83762 |

**Sequence (diverifikasi, menambah baris baru aman):**

| Sequence | Nilai |
|---|---|
| projects_id_seq | 1 |
| poles_id_seq | 3 |
| work_items_id_seq | 8 |
| pole_work_progress_id_seq | 7 |
| pole_progress_histories_id_seq | 16 |

### 2.4 Catatan penting
- Pada `restore.log` langkah `[4/6]` tabel `projects` sempat muncul `ERROR: duplicate key value violates unique constraint "projects_pkey" (Key (id)=(1))`. Ini berasal dari import yang berjalan ulang/leftover; **hasil akhir tetap benar** (jumlah cocok dengan sumber) sehingga tidak berdampak.
- Kolom snapshot pada `pole_progress_histories` bernama **`weight_percent_snapshot`** dan **`is_active_snapshot`** (bukan `weight_snapshot`). Ke-8 baris hasil import memiliki nilai **NULL** untuk kolom itu, **tetapi aman**: `WorkItemController@index` melakukan backfill otomatis untuk baris yang NULL, dan `CurveController` menangani NULL dengan fallback.
- Kesehatan API pasca-restore: `/api/projects` → `401` (butuh auth, wajar), `/api/regions/provinces` → `200` (data nyata).

> **Catatan diagnostik:** kegagalan `404` di awal investigasi adalah artefak pengujian — `curl` ke `127.0.0.1`/IP tanpa header `Host: pjl.ituiot.com` mengenai vhost default nginx. API sesungguhnya sehat (login via browser berhasil).

---

## 3. Pengerasan Produksi (Hardening)

File: `/opt/tracking-tiang/backend/.env`

| Variabel | Sebelum | Sesudah |
|---|---|---|
| APP_ENV | `local` | `production` |
| APP_DEBUG | `true` | `false` |
| APP_URL | `http://localhost:8000` | `https://pjl.ituiot.com` |

Tindakan:
- Backup: `backend/.env.bak-hardening-<timestamp>`.
- `php artisan config:clear` lalu `config:cache` (berhasil).
- Dampak: stack trace tidak lagi bocor ke pengguna; URL absolut yang dihasilkan aplikasi (mis. tautan undangan) kini memakai domain produksi.

---

## 4. Pembersihan (Cleanup)

- Menghapus file nyasar di server: `/root/:USERPROFILE\.ssh\id_tiang` dan `.pub`.
- Memindahkan berkas backup kontroler keluar dari direktori aplikasi ke `backups/code-bak-<timestamp>/` (6 file `.bak-*`; tidak lagi mengotori `app/Http/Controllers/Api/`).
- `/api/projects` (`401`) dan `/api/regions/provinces` (`200`) diverifikasi ulang setelah perubahan.

---

## 5. Arsitektur Deployment yang Ditemukan

| Komponen | Lokasi / Detail |
|---|---|
| PostgreSQL 18 | container `tracking-tiang-postgres`, `127.0.0.1:5432` |
| Backend (PHP 8.4-FPM) | container `tracking-tiang-backend`, port `9000`, volume `./backend:/var/www/html` → `/opt/tracking-tiang/backend` |
| Frontend (Next.js) | **`/opt/tracking-tiang/frontend-next/frontend`**, dijalankan `tracking-tiang-next.service` (`npm start -- --port 3000`) |
| Reverse proxy | nginx host: `/api/` → PHP-FPM; `/` → `http://127.0.0.1:3000` |
| **Dead code** | `/opt/tracking-tiang/frontend` = aplikasi **Vite/React lama** (228 MB, tidak dipakai) |
| **Staging** | `/opt/tracking-tiang/staging/frontend-update` (25 MB, tidak di-deploy) |

> Frontend yang **aktif** adalah `frontend-next/frontend`, bukan `frontend/`. Snapshot frontend pertama di sesi ini sempat salah ambil `frontend/` (Vite lama) lalu dikoreksi.

---

## 6. Kondisi Repositori

### 6.1 Server (`/opt/tracking-tiang`)
- Remote: `git@github.com:afazhriel/tracking-tiang.git`
- Branch: `main` = `564517c` (**shallow clone**, hanya 1 commit), branch `recovery-dashboard` ter-checkout pada commit yang sama.
- **Seluruh pekerjaan nyata belum di-commit**: 12 file termodifikasi + puluhan file untracked (controller/model/migration auth, tim, undangan; fitur snapshot bobot; dsb.).
- `/opt/tracking-tiang/frontend-next` adalah **repo git bersarang (nested clone)** dari remote yang sama, branch `migration/nextjs-frontend` @ `92d90b5`, dengan **39 file frontend termodifikasi belum di-commit**.

### 6.2 Lokal (`C:\Dev\tracking-tiang\tracking-tiang`)
- Remote: `https://github.com/afazhriel/tracking-tiang.git` (full clone, bukan shallow).
- Branch aktif: `migration/nextjs-frontend` @ `ceddcbd` (2 commit di depan `origin/migration/nextjs-frontend`).
- Riwayat: `564517c (initial) → 92d90b5 (migrate to Next.js) → b933a21 → ceddcbd (pole region hierarchy)`.
- Working tree: 77 entri status (38 untracked). **Working tree lokal ini sudah memuat sebagian besar pekerjaan backend dari server** (77 file identik) sebagai file untracked.

### 6.3 Kesimpulan lineage
- **Backend: server lebih maju** (memiliki fitur yang belum ada di lokal, mis. `PoleActivityController`, migrasi snapshot bobot).
- **Frontend: lokal lebih maju** (commit `b933a21`/`ceddcbd` "region hierarchy" tidak ada di server).
- Di kedua sisi, banyak perubahan **belum di-commit** → risiko kehilangan kode sangat tinggi.

---

## 7. Analisis Drift (server vs lokal)

Perbandingan berbasis hash SHA-256 per file (mengecualikan `.git`, `node_modules`, `.next`, `vendor`, `storage`, artefak `build/`).

### 7.1 Backend — server 102 file vs lokal 95 file
- **Identik:** 77
- **Berbeda isi:** 17

**Hanya ada di SERVER (8):**
- `app/Http/Controllers/Api/PoleActivityController.php` (fitur baru)
- `database/migrations/2026_10_14_092909_add_weight_snapshot_to_pole_progress_histories_table.php`
- `database/migrations/2026_10_15_120000_create_personal_access_tokens_table.php`
- `import-jabar.sql`, `import-wilayah-full.sql` (data)
- `public/test-fpm.php` (artefak dev)
- `tests/Feature/ProgressCalculationTest.php`, `tests/Feature/WorkItemNormalizationTest.php`

**Hanya ada di LOKAL (1):** `backend/.env.example` (ter-track lokal)

**Berbeda isi (17):**
`ActivityController.php`, `CurveController.php`, `NotificationController.php`, `PoleAssignmentController.php`, `PoleController.php`, `ProgressController.php`, `ProjectController.php`, `TeamController.php`, `WorkItemController.php`, `Models/Pole.php`, `Models/PoleProgressHistory.php`, `Models/Project.php`, `Policies/TeamPolicy.php`, `bootstrap/app.php`, `composer.lock`, `database/migrations/2026_10_02_181142_create_work_items_table.php`, `routes/api.php`

### 7.2 Frontend — server 188 file vs lokal 590 file
- **Identik:** 181
- **Berbeda isi:** 6 — `app/pekerjaan/PekerjaanPage.jsx`, `app/tiang/[id]/TiangDetailPage.jsx`, `app/tiang/TiangPage.jsx`, `components/tiang/CreatePoleModal.jsx`, `eslint.config.js`, `lib/api.js`
- **Hanya ada di SERVER (1):** `app/pekerjaan/PekerjaanPage.jsx.bak-sebelum-tambah-pekerjaan` (artefak)
- **Hanya ada di LOKAL (source nyata, 3):** `app/pekerjaan/pengaturan/page.jsx`, `app/pekerjaan/pengaturan/PekerjaanSettingsPage.jsx`, `lib/use-current-user.js` — semuanya **untracked** (WIP lokal yang belum di-commit/di-deploy).
  - (Sisanya ±380 file "hanya lokal" adalah artefak `frontend/android/**/build/**` yang **di-gitignore** di lokal → abaikan.)

> Antara server dan lokal, kode frontend **±95% identik**. Perbedaan murni pada 6 file + 3 file WIP.

### 7.3 Bau kode / higiene / keamanan
- `.gitignore` repo bersarang `frontend-next` **tidak meng-ignore `.next/`** → 615 file build terdeteksi untracked.
- Direktori mati `/opt/tracking-tiang/frontend` (Vite, 228 MB) masih ada.
- Direktori `staging/` (25 MB) berisi salinan frontend yang tidak di-deploy.
- `backend/public/test-fpm.php` — skrip uji yang sebaiknya dihapus dari produksi.
- Banyak `.bak-*` (sudah sebagian dipindahkan).
- Repo lokal berisi 2 file sampah akibat perintah rusak: `"--others --exclude-standard'"` dan `"-files --others --exclude-standard"`.
- Backend punya file data besar (`backend/import-wilayah-full.sql` 18 MB, `wilayah_indonesia.sql` 5 MB, `import-jabar.sql` 1.3 MB) di dalam direktori aplikasi.

---

## 8. Artefak Preservasi

Semua pekerjaan produksi yang belum di-commit telah diamankan (patch + tarball), lalu **diunduh & diverifikasi hash-nya**.

**Disalin ke lokal:** `C:\Dev\tracking-tiang\_server-drift-20261016\`

| Artefak | Ukuran | SHA-256 |
|---|---|---|
| `backend-worktree-20261016_033231.patch` | 135.684 B | `75e5df94508f2506052117f5d44da6143c42a15401b487f826e6be7dfb9b7d8a` |
| `frontend-modified-20261016_033257.patch` | 717.524 B | `810ae01a7478e6045cb7dfd0b9e8b8ed927fe2158cfbe97e74d78ee6d03665ae` |
| `frontend_source.tar.gz` | 525.604 B | `6033e51fb28de96061c5b0818ad192d99b510a8b150536cc776f0bf1ddc3e131` |

**Tersimpan di server** (`/opt/tracking-tiang/backups/`):

| Artefak | SHA-256 |
|---|---|
| `tracking_tiang_pre_datarestore_20261016_025710.dump` (76.239 B) | `7697ce2d8cfd7fa81fc1363e26ae379839a56f2ab6cdeffc2bcc1780f7cfe6bb` |
| `tracking_tiang_recovery_pre_datarestore_20261016_025710.dump` (1.788.188 B) | `15a74329708718d4d599c3ffa5ba831c796f6b39b324312ae9a5ef2de9cddfc6` |
| `backups/patches/backend-worktree-*.patch` | (sama dengan lokal di atas) |
| `backups/patches/frontend-modified-*.patch` | (sama dengan lokal di atas) |
| `/tmp/frontend_source.tar.gz` | `6033e51f…c3e131` |
| `/tmp/backend_snapshot.tar.gz` | `79bbd9b4f9764a7e17c187be8ca17f12a9ba10c65307cc3e17af0ac1a5baf7ab` |

> `backend_snapshot.tar.gz` (4 MB) dan `frontend_source.tar.gz` (0,5 MB) berisi snapshot **source** lengkap (tanpa `vendor`/`node_modules`/`.next`).

---

## 9. Risiko

| Risiko | Tingkat | Mitigasi saat ini |
|---|---|---|
| Kehilangan kode produksi (belum di-commit) | **Tinggi** | Patch + tarball sudah diamankan (lokal & server) |
| GitHub remote tidak mencerminkan produksi | **Tinggi** | Perlu commit/push (belum dilakukan) |
| Dua lineage (server backend maju / lokal frontend maju) | Tinggi | Perlu rekonsiliasi terarah (§10) |
| 2 file frontend konflik (`TiangPage.jsx`, `TiangDetailPage.jsx`, `CreatePoleModal.jsx`, `api.js`) berisiko saling menimpa | Sedang | Jangan overwrite buta; gunakan 3-way merge |
| `.gitignore` frontend-next tidak meng-ignore `.next/` | Rendah | Perbaiki `.gitignore` |
| Data besar (SQL) di dalam repo backend | Rendah | Pindahkan / abaikan via `.gitignore` |

---

## 10. Rencana Rekonsiliasi yang Disarankan

**Rekomendasi: jadikan repo LOKAL sebagai sumber kebenaran (canonical)**, karena frontend-nya sudah lebih maju (`ceddcbd`), lalu tarik bagian backend yang lebih maju dari server.

Langkah aman (non-destruktif, di branch terpisah):

1. Di lokal, buat branch kerja:
   ```
   git switch -c reconcile/2026-10-16
   ```
2. Tarik perubahan backend produksi (server = otoritatif untuk backend):
   ```
   git apply --3way "C:\Dev\tracking-tiang\_server-drift-20261016\backend-worktree-20261016_033231.patch"
   ```
   Selesaikan konflik (17 file) dengan **memilih versi produksi** untuk controller/migration yang jelas lebih baru, kecuali terbukti lokal lebih baru.
3. Review 6 file frontend yang berbeda + 3 file WIP lokal (`pengaturan/`, `use-current-user.js`). Untuk `TiangPage.jsx`/`TiangDetailPage.jsx`/`CreatePoleModal.jsx`/`api.js` **wajib** merge manual karena lokal memuat fitur "region hierarchy".
4. Jalankan test backend: `php artisan test` (tersedia `ProgressCalculationTest`, `WorkItemNormalizationTest`).
5. Commit + push:
   ```
   git add -A
   git commit -m "reconcile: align repo with production (backend) + region hierarchy (frontend)"
   git push origin reconcile/2026-10-16
   ```
6. Deploy frontend dari repo lokal ke `/opt/tracking-tiang/frontend-next/frontend`, lalu `systemctl restart tracking-tiang-next`.

**Higiene produksi (SUDAH dilakukan atas persetujuan):**
- Hapus `/opt/tracking-tiang/frontend` (Vite lama, 228 MB) dan `staging/` (25 MB).
- Hapus `backend/public/test-fpm.php`.
- Tambahkan `.next/` ke `.gitignore` repo `frontend-next` (untracked turun dari 615 → 69).
- Pindahkan sisa `.bak` ke `backups/code-bak-final/`.
- Perbaiki korupsi byte `k<?php` pada `backend/database/migrations/2026_10_02_181142_create_work_items_table.php` (backup: `backups/code-bak-final/...k-corrupt`). `php -l` bersih.
- Diverifikasi aman: vhost aktif `tracking-tiang` TIDAK merujuk direktori yang dihapus (`/` → Next :3000, `/api/` → FPM); `nginx -t` OK; `GET /` → 200.

---

## 11. Lampiran

**Akses:**
- SSH: `ssh -i "$env:USERPROFILE\.ssh\id_tiang" root@187.77.112.247` (key `id_tiang`, pubkey `opencode-tiang`).
- Kredensial DB: user `tracking_admin`; DB `tracking_tiang` (app) & `tracking_tiang_recovery` (sumber).

**Berkas kunci:**
- `/opt/tracking-tiang/02_restore_data.sh` — skrip restore.
- `/opt/tracking-tiang/restore.log` — log restore.
- `/opt/tracking-tiang/backend/.env` — konfigurasi backend (kini production).
- `/opt/tracking-tiang/backups/` — seluruh backup DB + patch + snapshot source.
- `C:\Dev\tracking-tiang\_server-drift-20261016\` — artefak hasil audit (patch + tarball).

**Perintah verifikasi cepat (produksi):**
```bash
cd /opt/tracking-tiang
docker compose ps
docker exec tracking-tiang-backend php artisan about
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: pjl.ituiot.com" -k https://127.0.0.1/api/regions/provinces   # harus 200
```

---

## 12. Eksekusi Rekonsiliasi (dilakukan 2026-10-16)

- **Branch:** `reconcile/2026-10-16` (dibuat dari `migration/nextjs-frontend` @ `ceddcbd`).
- **Commit:** `5c4cfba` — `chore(reconcile): snapshot WIP lokal 2026-10-16` (135 file: backend + frontend + proyek Capacitor `frontend/android`).
- **Commit tambahan:** `5614b76` — `feat(auth): tambahkan migrasi create_personal_access_tokens_table (Sanctum)` (menutup gap migrasi Sanctum yang hilang di lokal).
- **Push:** `origin/reconcile/2026-10-16` (**berhasil**). PR: https://github.com/afazhriel/tracking-tiang/pull/new/reconcile/2026-10-16
- **Dikecualikan dari commit** (sengaja, tetap untracked):
  - `backend/wilayah_indonesia.sql` (data 5 MB)
  - `frontend/FRONTEND-COLLECT.txt` (dump tool)
  - `package.json` di root (junk: hanya `framer-motion`)
  - `frontend/android/.idea/` (IDE)
- **Perbaikan ikut di-commit:** hapus UTF-8 BOM pada 12 file.
- **File sampah dihapus:** `"--others --exclude-standard'"` dan `"-files --others --exclude-standard"`.

## 13. Temuan Penting — Lokal MENDAHULUI Server (bukan sebaliknya)

Analisis diff membuktikan cabang lokal adalah **desain yang lebih baru dan menggantikan (supersede)** kode server di produksi:

| Aspek | Server (produksi) | Lokal (lebih baru) |
|---|---|---|
| Snapshot bobot progres | `weight_percent_snapshot` + `is_active_snapshot` (kolom, model, controller) | **Dihapus**; diganti `Project::progressDenominator()` |
| Aktivitas | `PoleActivityController` | Diganti `ActivityController` + `NotificationController` |
| Wilayah hierarki | tidak ada | `province_id/regency_id/district_id/village_id` di `Pole` + validasi konsistensi |
| Item pekerjaan | hanya `store` | **CRUD lengkap** (`update`/`destroy`) + validasi total budget bobot ≤ 100% |

**Konsekuensi:** menimpa lokal dengan server akan **memundurkan** fitur. Rekomendasi: jadikan cabang lokal sebagai sumber kebenaran dan deploy ke produksi (opsi "Jadikan lokal kanonik & deploy ke server"), bukan menarik server → lokal.

**Artefak server-only yang perlu keputusan:**
- `database/migrations/2026_10_15_120000_create_personal_access_tokens_table.php` — **lokal belum punya**, dibutuhkan Sanctum pada setup DB baru → **SUDAH ditambahkan ke lokal** (commit `5614b76`). Dikonfirmasi lokal memakai Sanctum: `laravel/sanctum:^4.0`, `HasApiTokens`, `createToken()`, `auth:sanctum` (`routes/api.php:60`).
- `database/migrations/2026_10_14_092909_add_weight_snapshot_...` — **sengaja dihapus** lokal → jangan diambil.
- `app/Http/Controllers/Api/PoleActivityController.php` — superseded oleh `ActivityController` → jangan diambil.
- `tests/Feature/ProgressCalculationTest.php`, `WorkItemNormalizationTest.php` — uji tambahan; perlu diperiksa kompatibilitasnya dengan desain lokal sebelum diambil.

## 14. Temuan BOM & Korupsi

- **12 file lokal ber-BOM UTF-8** (`EF BB BF`) — **sudah distrip**:
  `PoleAssignmentController.php`, `TeamController.php`, `TeamPolicy.php`, `frontend/app/login/page.jsx`, `frontend/app/tiang/TiangPage.jsx`, `frontend/app/page.jsx`, `frontend/components/ui/badge.jsx`, `frontend/components/ui/modal.jsx`, `frontend/lib/status.js`, `frontend/lib/theme.js`, `frontend/src/components/ui/sign-in-card-2.jsx`, `frontend/src/lib/utils.js`.
  (BOM sebelum `<?php` dapat menyebabkan output sebelum header → mengganggu API.)
- **1 file server korup:** `database/migrations/2026_10_02_181142_create_work_items_table.php` diawali byte `k` (`k<?php`) — **sudah diperbaiki**.
- Bukan korupsi (abaikan): `resources/views/welcome.blade.php` dan `storage/framework/views/*.php` (template/kompilasi, memang diawali HTML).

## 15. Rekomendasi Lanjutan

1. **Deploy frontend lokal** ke `/opt/tracking-tiang/frontend-next/frontend` lalu `systemctl restart tracking-tiang-next` (agar fitur tim/profil/pengaturan ikut terpasang). *(Belum — butuh persetujuan.)*
2. ~~Tambahkan migrasi `personal_access_tokens` ke repo lokal~~ — **selesai** (commit `5614b76`).
3. Perbaiki `.gitignore` repo: `.next/`, `.idea/`, `*.sql`.
4. Hapus file junk: `frontend/FRONTEND-COLLECT.txt`, `package.json` (root).
5. Jalankan `php artisan test` pada desain lokal (uji `ProgressCalculationTest`/`WorkItemNormalizationTest` perlu disesuaikan bila diambil dari server).

---

*Dokumen ini dihasilkan otomatis sebagai bagian dari sesi pemulihan & rekonsiliasi. Pemulihan data, hardening, higiene produksi, dan rekonsiliasi ke branch review SUDAH dilakukan. Langkah destruktif berikutnya (deploy ke produksi / merge ke branch utama) menunggu keputusan pemilik repo.*
