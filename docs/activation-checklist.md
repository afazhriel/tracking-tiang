# Aktivasi produksi setelah review

Persetujuan merge/deploy/konfigurasi/migration telah diberikan pemilik.
Status pelaksanaan terbaru ada di [catatan rollout](production-rollout-2026-10-21.md).
Checklist ini tetap wajib sebelum aktivasi; persetujuan tidak menggantikan verifikasi.

## 1. Jeda deployment selama penggabungan

GitHub repo → Settings → Secrets and variables → Actions → Variables:
set `DEPLOY_ENABLED=false`. Ini variable, bukan secret. Jika akses variable
ditolak, nonaktifkan workflow Deploy VPS dan verifikasi `disabled_manually`. Pastikan tidak ada deploy
lama yang masih berjalan; jeda tidak menghentikan run yang sudah aktif.

## 2. Lindungi main dan environment production

Settings → Rules → Rulesets atau Branches: pada main wajibkan pull request,
required check **Quality gate** dari GitHub Actions, branch terbaru sebelum merge,
penyelesaian review, serta larangan force push/delete. Atur reviewer sesuai tim;
jangan memakai bypass rutin. Detail branch protection tidak dapat dibaca dengan
akses workspace (403); metadata main masih protected=false. Pemilik perlu
memeriksa setting tersebut.

Settings → Environments → production: tambahkan required reviewer (bisa pemilik
yang memeriksa rollout) dan deployment branches main saja atau protected branches.
Workflow tetap main-only. Jangan mengaktifkan prevent self review jika hanya ada
satu reviewer yang juga memulai run; sesuaikan pembagian review dengan anggota
tim. Jika plan GitHub tidak mendukung perlindungan, selesaikan dukungannya bersama
pemilik; source tidak membypass aturan tersebut.

PR #9 memeriksa metadata perlindungan dan SHA main sebelum secrets SSH dimuat.
Metadata tidak terbaca, main belum protected, reviewer kosong, policy branch
terlalu luas atau SHA basi menghentikan deploy. Pemeriksa tidak mengklaim dapat
membaca detail required PR/check yang memerlukan izin admin; verifikasi setting
main tetap wajib. Tidak ada token tambahan yang ditempel di source. HTTP 403
pada pemeriksaan environment menghentikan proses; periksa izin Actions/deployments
read milik GITHUB_TOKEN sebelum melanjutkan.

## 3. Review dan gabungkan berurutan

Urutan: **#1 → #2 → #3 → #4 → #5 → #6 → #7 → #8 → #9 → #10**. PR bertumpuk agar
pekerjaan tidak diulang. Setelah satu masuk main, pemilik mengubah base PR
berikutnya ke main dan menunggu CI commit terbaru sebelum merge. Jangan merge
branch review/sinkronisasi langsung, force push atau menghapus migration lama.
Agent sudah diberi izin merge; workflow deployment harus tetap dijeda selama integrasi.

Quality gate wajib mencakup Laravel/Pint, compatibility migration PostgreSQL,
frontend unit/lint/build, audit dependency PHP/npm, deployment/policy tests, Chromium desktop/viewport
ponsel, serta pemulihan PostgreSQL/upload terisolasi. Gagal/cancelled/skipped
menghentikan deploy. CI harus diulang sesudah retarget. Browser smoke memakai
node_modules runtime sesudah prune; CLI native, Vite, ESLint dan test driver
tidak ikut dipasang pada layanan web aktif. Tool browser penguji berada terpisah.

## 4. Preflight VPS dan aplikasi

Langkah server berikut telah diizinkan, tetapi pelaksanaan dan hasilnya harus diverifikasi:

- Pastikan Nginx `/api/` langsung ke PHP-FPM, APP_URL/upstream memakai origin HTTPS
  yang benar, serta Set-Cookie dan respons no-store tidak dibuang/dicache.
- Gabungkan deploy/nginx-private-media.conf ke vhost TLS dengan mengganti location
  `/storage/` lama. Uji konfigurasi sebelum reload; jangan membuat location duplikat.
  Tanpa ini, file legacy mungkin melewati policy Laravel.
- Periksa upload Nginx minimal 32m, image PHP baru 5M/32M/20, izin tulis media privat,
  dan backup seluruh storage/app/public serta storage/app/private/media. File lama
  tidak dipindah atau dihapus oleh PR.
- Inventaris worker/scheduler/penulis DB lain, stop signal PHP-FPM, ruang disk,
  backup/offsite dan SSH khusus deploy. Root/Docker tetap berkuasa penuh;
  pengetatan akun/authorized_keys merupakan perubahan konfigurasi server.
- Perbarui APK yang masih membuka HTTP/IP ke HTTPS sebelum source #8 dirilis.
  Cookie aman tidak memakai fallback HTTP. Viewport ponsel bukan tes APK/perangkat
  fisik. Native bearer tetap tersedia; file privat perlu bearer.
- Periksa konflik progres legacy. Source membalas 409 agar angka ambigu tidak
  menjadi laporan palsu. Pemilihan state memerlukan rekonsiliasi dengan persetujuan
  pemilik; histori/foto tetap disimpan, tidak ada auto-delete.
- Di lingkungan pemulihan yang disetujui, verifikasi backup VPS sebenarnya,
  checksum, referensi file dan smoke bisnis. CI memakai fixture, sehingga belum
  membuktikan backup produksi/offsite benar-benar dapat dipulihkan.

## 5. Rollout sesudah persetujuan

Sesudah langkah di atas selesai, pemilik menyetujui rollout, membuka jeda dan
memulai workflow dari main yang telah diperiksa. Reviewer environment menyetujui
commit yang sama. Jangan dispatch deploy untuk sekadar mencoba.

Backup baru memiliki SHA256SUMS dan COMPLETE setelah arsip dan katalog dump valid.
COMPLETE bukan bukti restore penuh. Gate tambahan mewajibkan restore dump
sebenarnya ke PostgreSQL terisolasi sebelum perubahan source/migration; lihat
`RESTORE_VERIFIED`. Rehearsal migration dan offsite recovery tetap perlu diuji. Backup memuat data sensitif dan harus disimpan privat. Migration
memakai lock_timeout 5s dan statement_timeout 300s. Gagal/timeout setelah perubahan
mempertahankan maintenance/journal untuk pemeriksaan, bukan rollback DB otomatis.
Jangan menghapus journal atau menjalankan migrate:rollback untuk memaksa retry.
Retensi/offsite, durasi maintenance dan rencana pemulihan perlu disepakati operator.
