# Tracking Tiang — Handoff ChatGPT Work
Tanggal: 26 Oktober 2026

## Source
Repository: afazhriel/tracking-tiang
Branch ini merupakan snapshot source dari VPS produksi.

Backend: Laravel PHP + PostgreSQL.
Frontend: Next.js 16.4.2.
Frontend aktif disalin ke direktori frontend/ pada branch ini.

## Sudah deployed di produksi
- Multi-project dengan owner_user_id dan project members.
- Target kuantitas proyek: target_quantity dan unit_code.
- Progress source: pole_weighted atau quantity_entries.
- Project baseline versi, approval, dan kurva per periode.
- API realisasi quantity, koreksi, dan idempotency fingerprint.
- Frontend proyek, baseline, dan panel realisasi.
- TT-001 mempertahankan histori tiang lama.
- TANKI --01 menggunakan kuantitas umum.

## Masalah terakhir yang telah dipulihkan
Deployment backend sempat menghasilkan HTTP 500 karena file PHP
berizin 0600. File produksi telah diperbaiki menjadi 0644.
API publik tanpa login kembali menghasilkan HTTP 401.

## Pekerjaan belum selesai: Menu Tim
- Database terakhir: 0 tim dan 0 anggota tim.
- API TeamController sudah memiliki CRUD tim dan anggota.
- TeamPolicy produksi masih membatasi pengelolaan tim ke Admin.
- Pemilik proyek perlu kemampuan mengelola tim proyek sendiri.
- Frontend non-Admin masih berupa halaman referensi role.
- Form Admin membuat tim tanpa project_id.
- TeamAccess dapat memberi akses proyek, tetapi pencabutan
  akses turunan tim belum direkonsiliasi secara aman.
- Kandidat backend TeamPolicy dan TeamController pernah dibuat
  terpisah, tetapi belum deployed.
- Kandidat frontend Tim belum selesai karena kegagalan patch
  import, sehingga bukan bagian dari source produksi.

## Prioritas ChatGPT Work
1. Audit integritas source dan konfigurasi build.
2. Desain role Admin, pemilik proyek, Supervisor, PIC.
3. Bedakan akses proyek langsung dengan akses turunan tim.
4. Bangun Tim interaktif berbasis proyek aktif.
5. Uji API dan kontrol akses pada database terisolasi.
6. Uji build frontend, lalu siapkan deployment aman.
7. Buat PR untuk menggabungkan perubahan ke main.

## Pengamanan
- Jangan mengubah DB produksi tanpa backup dan pengujian.
- Jangan menghapus histori tiang atau proyek lama.
- Jangan menganggap halaman HTTP 200 sebagai bukti API sehat.
- Jangan menjalankan migrate:rollback pada data quantity baru.
- Jangan melakukan force push ke main.
- Branch handoff tidak menyertakan dump database atau secrets.
