# Pemeriksaan VPS sebelum aktivasi deploy

Pemeriksaan dilakukan 20 Oktober 2026 melalui GitHub Actions. Semua lima secrets
tersedia, private key valid, dan verifikasi host key SSH berhasil.

- Backend aktif: Docker PHP-FPM 8.4, bind mount `/opt/tracking-tiang/backend`.
- Database: PostgreSQL 18, container sehat.
- Frontend aktif: systemd `tracking-tiang-next`, direktori
  `/opt/tracking-tiang/frontend-next/frontend`.
- `/login` dan `/api/regions/provinces`: HTTP 200.
- Kedua checkout mengandung perubahan staged/unstaged dan file tambahan.

## Perbedaan source yang perlu diputuskan

Perbandingan hash isi file, tanpa bergantung pada index Git lama, menemukan
21 file existing berbeda dari `main`. Selain itu, salinan source yang diperiksa
memiliki 10 file kode/migrasi/test tambahan yang belum ada di GitHub.

Perbedaan ini mencakup fitur aktif, bukan hanya status checkout:

- VPS menyimpan notifikasi per pengguna, mendukung hitungan belum dibaca dan
  penandaan sudah dibaca. GitHub masih memiliki controller notifikasi sintetis.
- VPS memiliki item pekerjaan dan progres yang independen untuk setiap tiang,
  beserta agregasi pekerjaan project dan halaman pekerjaan per tiang.
- VPS memiliki empat migrasi tambahan, termasuk tabel notifications, kolom
  pole/source pada work items dan backfill. Migrasi-migrasi tersebut sudah tercatat
  dijalankan pada database produksi.

Mengganti source VPS langsung dengan GitHub dapat menghilangkan perilaku fitur
tersebut. Rekomendasi: rekonsiliasi perubahan aktif VPS ke GitHub terlebih dahulu,
lalu jadikan source hasil rekonsiliasi sebagai acuan deploy berikutnya. Alternatif:
gunakan GitHub sebagai acuan setelah pemilik memilih untuk mengganti fitur VPS.

Pemilik sudah memilih melalui chat: **gunakan versi GitHub dan simpan versi VPS
sebagai backup**. Backup awal di bawah selesai sebelum penyelarasan source.
Workflow sedang disiapkan untuk penyelarasan pertama; deploy rutin tetap menolak
perubahan manual baru pada source aktif.

## Backup dan bukti

Backup privat di VPS selesai dan daftar arsip database berhasil divalidasi:

`/opt/tracking-tiang-deploy-backups/before-activation-20261020T144743Z`

Backup mencakup source backend/frontend, storage backend, konfigurasi Compose,
SHA checkout, patch perubahan staged/unstaged dan PostgreSQL custom-format dump.
Dependency vendor/node_modules tidak disertakan. File backup tidak dipublikasikan
ke GitHub. Salinan kode untuk perbandingan dikirim dalam bentuk terenkripsi;
private key dekripsi tetap berada di workspace pemeriksaan.

- [Pemeriksaan source, SSH, web dan API](https://github.com/afazhriel/tracking-tiang/actions/runs/39442062425)
- [Backup dan pengambilan source terenkripsi](https://github.com/afazhriel/tracking-tiang/actions/runs/39442434082)
