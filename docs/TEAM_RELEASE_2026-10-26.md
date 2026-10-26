# Tim proyek — release candidate

Base produksi: `handoff/production-20261026T075933Z` / `7782764687b422de5108099efe0bec1c79575be2`.

## Model akses

| Aktor aktif | Baca tim | Kelola anggota/status/penugasan |
| --- | --- | --- |
| Admin | Semua; UI mengikuti proyek aktif | Semua |
| Pemilik proyek (role global apa pun) | Proyek miliknya | Proyek miliknya |
| Supervisor anggota proyek | Proyek yang dapat diakses | Tidak, kecuali pemilik |
| PIC anggota proyek | Tim proyek yang dapat diakses; penugasan mengikuti visibilitas tiang | Tidak, kecuali pemilik |
| Pending/suspended/tanpa login | Ditolak | Ditolak |

Role dalam tim adalah label operasional, bukan eskalasi role global. Pengelolaan akun, role global, wilayah, dan undangan tetap khusus Admin. Pemilik proyek dapat mencari anggota proyek atau pengguna aktif memakai **email lengkap**, tanpa endpoint daftar seluruh akun.

Akses efektif proyek = Admin + owner + `project_user` langsung + keanggotaan tim aktif (proyek tim atau penugasan aktif tim legacy). Akses tim tidak lagi ditulis ke `project_user`. Keluar/nonaktif/pindah tim mencabut hanya akses turunannya; akses langsung, kepemilikan, dan tim lain tidak dihapus. Tidak ada migration baru atau backfill penghapusan membership.

Baris `project_user` lama tidak memiliki provenance; semuanya dipertahankan. Handoff menyebut 0 tim/0 anggota. Staging harus memverifikasi asumsi itu terhadap snapshot terbaru. Jika ada grant lama dari tim yang sudah telanjur disalin, audit manual dengan pemilik diperlukan; jangan menebak asal lalu menghapusnya.

Penugasan baru di Tim menggunakan `user_id=NULL, team_id=...`. Pencabutan mengubah status menjadi `revoked`, tidak menghapus baris. Penugasan lama campuran user+tim tetap melalui endpoint Admin; Tim menolak perubahan yang akan mengubah akses langsungnya. Nonaktif tim menyimpan anggota dan penugasan sehingga reaktivasi mengembalikan akses.

## Pemeriksaan sebelum rilis

- PR ini membawa perubahan handoff yang belum ada di main, termasuk Quantity dan baseline. Review seluruh diff terhadap main dan diff tambahan terhadap commit handoff.
- Jalankan seluruh workflow Quality gates pada SHA final: PostgreSQL 18 unit/feature, migration upgrade, HTTP role boundary, browser auth/media, frontend lint/test/build, backup restore, deployment regression.
- File migrasi snapshot produksi tidak diubah. Ada migrasi korektif BARU 2026_10_26_120000_restore_historical_pole_progress_source.php untuk proyek lama yang sebelumnya salah dibaca sebagai quantity_entries. Koreksi hanya berlaku saat terdapat histori progres tiang, total target cocok, dan tidak ada entri Quantity. Proyek TANKI --01 dikecualikan secara eksplisit; tes PostgreSQL memeriksa proyek Quantity dengan entri tetap tidak berubah. Semua migrasi dari snapshot dan migrasi korektif dipin dengan Git blob SHA; migrasi lain tetap tunduk pada pemeriksaan perubahan destruktif. Sebelum staging/produksi, tinjau daftar ID proyek yang akan berubah pada snapshot terbaru dan setujui secara manual. Dua file migrasi snapshot dikecualikan dari Pint karena formatnya berbeda; aplikasi aktif tetap diformat.
- Review kontrak `docs/api-routes.json`, khususnya Tim, membership, Quantity dan baseline.
- Jalankan kueri read-only docs/sql/preview-legacy-progress-source.sql pada salinan staging terkini dan tinjau setiap project_id yang akan dikoreksi. Jika ada proyek Quantity yang sah dalam hasil, BLOKIR rilis dan audit logika migrasi. Jangan jalankan kueri ini untuk menulis atau memperbarui database.
- Staging memakai database dan storage terpisah. Jangan mengisi `.env` pengujian dengan kredensial produksi. Guard test hanya menerima `tracking_ci`/`tracking_migrations_ci` pada loopback atau service `postgres`.
- Restore salinan backup yang telah disanitasi ke staging; periksa TT-001 dan TANKI --01, jumlah histori, fingerprint Quantity, baseline approved/periods, progress, foto, serta kurva sebelum/sesudah. Fixture sintetis tidak membuktikan integritas database live.
- Uji browser Admin, owner PIC/Supervisor, Supervisor non-owner, PIC, pengguna proyek lain; buat tim, tambah, penugasan, cabut, nonaktif, aktifkan, pindah proyek, session expired, 403/422/409, dan viewport HP.

## Deployment dan rollback

Deployment sekarang **workflow_dispatch saja**, dengan `release_reviewed=true` dan production environment approval. Merge PR tidak menjalankan deploy otomatis. Jangan merge atau dispatch sampai bukti staging dan persetujuan rilis ada.

1. Catat SHA backend/frontend aktif, image ID, direktori frontend sebenarnya, status migrasi, volume storage, konfigurasi systemd/nginx, dan SHA kandidat. Handoff menunjukkan frontend aktif disalin ke `frontend/`, sementara script deploy mengharapkan checkout frontend terpisah; verifikasi konfigurasi server terlebih dahulu.
2. Gunakan prosedur `deploy/backup-vps.sh` dan `deploy/verify-production-backup.sh`: drain penulisan, dump PostgreSQL custom format, arsip source/config dan uploads, checksum, lalu restore ke target terisolasi. Jangan masukkan secrets/dump ke GitHub.
3. Snapshot integritas kedua proyek sebelum rilis: seluruh baris histori/progress/foto, Quantity termasuk request key/fingerprint, baseline/periods, owner/membership, target/unit/source. Bandingkan hash baris terurut, bukan jumlah saja.
4. Build kandidat sebelum downtime, validasi mode file source 0644/direktori 0755 serta ownership service (jangan mengubah permission secrets). Jalankan deploy SHA main yang sudah ditinjau menggunakan layout server yang diverifikasi. Tidak memakai `--replace-vps` tanpa review drift/backup.
5. Smoke: `/login` 200, `/api/me` tanpa login **401 JSON**, login role pengujian dan API riil, Quantity/kurva/histori kedua proyek. HTTP 200 halaman saja tidak cukup.
6. Jika gagal, hentikan penulisan dan simpan log serta dump keadaan gagal. Restore **pasangan source backend+frontend dan dependensi/image** dari backup yang sama. Perubahan Tim tidak menambah schema, tetapi migrasi korektif dapat mengubah progress_source pada proyek historis yang memenuhi syarat. Jangan jalankan migrate:rollback atau mengembalikan progress_source secara massal; untuk pemulihan gunakan daftar ID dan snapshot hasil audit pada staging. Namun rollback ke backend lama akan tidak mengenali grant tim dinamis yang dibuat setelah rilis: rekonsiliasi keanggotaan terverifikasi sebelum membuka kembali akses.
7. Jangan otomatis menimpa database dengan dump lama: itu membuang transaksi setelah backup. Restore DB hanya setelah pemeriksaan kehilangan data dan persetujuan tersendiri; biasanya gunakan forward fix. Jangan `migrate:rollback` pada Quantity/baseline live.
8. Journal `tracking-deploy-pending` harus diperiksa dan diselesaikan operator sebelum retry. Jangan menghapusnya untuk melewati kegagalan.

## Batas audit

Audit source dan pengujian kandidat tidak membuktikan keadaan host/domain/DB produksi. Tidak ada akses VPS, dump produksi, perubahan DB produksi, atau deployment yang dilakukan dalam pekerjaan ini. Rilis tetap diblokir hingga validasi staging dan backup restore terhadap snapshot terkini selesai.

## Verifikasi CI pada candidate

- GitHub Actions Quality gates pada commit 227f471276b7caed73cd18631e3837ddc9457250: semua 7 job lulus (https://github.com/afazhriel/tracking-tiang/actions/runs/40293680328).
- CI menggunakan database PostgreSQL test terisolasi dan fixture sintetis; hasil lulus tidak menggantikan rekonsiliasi dengan snapshot produksi, backup restore yang terverifikasi, dan uji staging.
- Hanya branch review yang diperbarui; belum ada merge ke main, migrasi database produksi, atau deployment VPS.
