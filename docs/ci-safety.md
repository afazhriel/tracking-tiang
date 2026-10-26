# Pengamanan CI/CD Tracking Tiang

PR pertama memisahkan pemeriksaan kualitas dari akses produksi. Perubahan ini
baru berlaku setelah PR ditinjau dan di-merge oleh pemilik; penyusunan PR tidak
menjalankan workflow VPS, migration produksi, atau perubahan data pengguna.

## Alur pemeriksaan

`quality.yml` berjalan pada pull request dan dipakai ulang oleh `deploy.yml`.
Job CI tidak memakai environment `production` dan tidak menerima VPS secrets.
Deploy dan diagnostik VPS hanya diizinkan pada `refs/heads/main`.

| Check | Yang diperiksa |
| --- | --- |
| Laravel tests and Pint | PHP 8.4, dependency dari lockfile, Pint seluruh backend, unit/feature tests pada PostgreSQL 18 |
| PostgreSQL migration safety | Database tersendiri, migration baru tanpa operasi destruktif langsung, history lama tidak diubah, fresh install, upgrade dengan data lama, dan idempotensi |
| Frontend lint and build | Node 22, npm ci, lint tanpa warning, regression test API client, production build |
| Deployment regression tests | Backup gagal menghentikan pergantian source, runtime data dipertahankan, dan wiring CI/secrets/main |
| Quality gate | Gagal jika salah satu check gagal, dibatalkan, atau dilewati |

Job deploy memiliki `needs: quality`; SSH/secrets produksi baru digunakan setelah
semua pemeriksaan berhasil. Tidak ada `continue-on-error` pada jalur tersebut.
Pengujian skrip deploy tidak diduplikasi pada runner produksi karena sudah menjadi
bagian dari quality gate pada commit yang sama.


## Membaca error GitHub Actions setelah banyak commit (26 Oktober 2026)

GitHub Actions mempertahankan riwayat run untuk **setiap commit**. Run merah dari
SHA lama tidak otomatis hilang walaupun bug sudah diperbaiki; yang relevan untuk
kesiapan PR adalah **7 check pada SHA HEAD terbaru**, bukan jumlah seluruh
run historis. Di PR #16, kode handoff awal gagal pada PHP feature tests,
migration policy, dan npm security audit. Perbaikan dan regresi diuji kembali:
[run 40294197741](https://github.com/afazhriel/tracking-tiang/actions/runs/40294197741)
berhasil 7 dari 7 pada SHA `ca001440e46bcfae4db6f6373c74343ff1e58e2c`.

Workflow `quality.yml` sekarang memiliki concurrency khusus PR. Ketika commit
baru masuk, run PR yang sudah usang dapat dibatalkan; workflow main,
`workflow_dispatch` dan pemanggilan dari deploy tidak dibatalkan oleh
aturan ini. Pembatalan karena commit lebih baru bukan kegagalan produk.
Quality gate tetap **gagal** bila ada job pada SHA terkini yang failed,
cancelled, atau skipped; tidak ada bypass kualitas.

Untuk memeriksa kondisi terbaru:

1. Buka PR → **Checks** dan cocokkan SHA HEAD dengan run yang dilihat.
2. Buka job **Quality gate** → Summary untuk tabel hasil keenam job.
3. Jika ada check gagal pada SHA HEAD, buka **Logs** job gagal dan perbaiki
   penyebabnya. Jangan menganggap run hijau pada SHA sebelumnya sebagai bukti.
4. Jangan merge hanya karena CI hijau: staging dengan backup produksi terbaru,
   audit TT-001/TANKI --01, serta approval rilis masih diwajibkan.

## Database uji dan migration

Nama yang diizinkan oleh guard test: `tracking_ci` dan `tracking_migrations_ci`;
host harus lokal/service `postgres`. SQLite hanya boleh `:memory:`. Environment
wajib `testing`; URL override database ditolak, termasuk pada SQLite. Guard ini
dijalankan sebelum trait RefreshDatabase dapat mereset database.

Setiap job PostgreSQL mendapat container baru; tidak ada dump pelanggan atau
credential produksi. Fixture berisi user/admin/PIC pending, password hash, token,
project, tiang, pekerjaan, progres, histori, foto, tim dan keanggotaan buatan.
Upgrade memeriksa tabel, kolom, foreign key, semua nilai record fixture dan berkas
upload/avatar, kemudian menjalankan migrate lagi untuk memeriksa idempotensi.

Fixture `backend/tests/Fixtures/production-migrations` memodelkan empat migration
historis tambahan yang diketahui dari audit deploy sebelumnya. Fixture tersebut
bukan migration aplikasi dan tidak dijalankan oleh deployment. Ini menguji dua
baseline: schema GitHub dan schema dengan tambahan lama, termasuk pekerjaan per
tiang serta notifications. Ada pula uji upgrade dari schema sebelum role/profil.

`ci/check-migrations.php` memakai AST PHP, hanya memeriksa `up()` pada migration
baru, dan menolak perubahan/rename/penghapusan migration yang sudah ada pada base
PR. Operasi langsung seperti drop/delete/truncate/update/rename/change/raw SQL dan
panggilan dinamis ditolak. `down()` tetap dapat membalikkan schema pada lingkungan
uji. Data migration kompleks perlu rencana tersendiri dan review; jangan melewati
pemeriksaan dengan menyembunyikan operasi di helper.

CI bukan bukti bahwa semua variasi data pelanggan, volume tabel, atau lock durasi
produksi aman. Review SQL/index/foreign key dan ukuran tabel tetap diperlukan.
Tidak ada rollback database produksi otomatis.

## Menjalankan pemeriksaan

Siapkan PHP 8.4 dengan pdo_pgsql, mbstring, gd, bcmath dan dependency Composer.
Buat direktori bootstrap/cache serta storage/framework/{cache/data,sessions,views}
sebelum composer install, lalu salin `.env.example` untuk environment uji.

```sh
# Dari backend, dengan PostgreSQL uji yang baru dibuat dan APP_ENV=testing:
# DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_DATABASE=tracking_ci
vendor/bin/pint --test
php artisan test --testsuite=Unit,Feature --fail-on-warning --fail-on-risky

# Job migration menggunakan DB_DATABASE=tracking_migrations_ci dan
# CI_BASE_MIGRATIONS berisi migration dari base commit, bukan database produksi:
vendor/bin/phpunit --testsuite=Migration --fail-on-warning --fail-on-risky --fail-on-skipped

# Dari frontend:
npm ci
npm run lint -- --max-warnings=0
npm test
API_UPSTREAM_ORIGIN=http://127.0.0.1:9 npm run build

# Dari root:
pip install -r deploy/tests/requirements.txt
python3 -m unittest discover -s deploy/tests -v
```

Baseline upgrade diambil dari SHA base PR atau commit `before` pada push main.
Untuk pemeriksaan manual, gunakan merge-base terhadap origin/main; jika HEAD
sudah sama dengan main, gunakan parent commit. Semua migration dijalankan hanya
pada PostgreSQL uji. Detail eksekusi lengkap tersedia di quality.yml.

## Perlindungan main yang disarankan

Pemeriksaan ulang 21 Oktober 2026 WIB: daftar branch GitHub melaporkan
`main.protected=false`, dan daftar ruleset yang dapat dibaca kosong. Endpoint
detail classic branch protection mengembalikan HTTP 403, sehingga konfigurasi
detail tidak dapat diperiksa/diubah dengan kredensial sesi ini. Perlindungan main
perlu diaktifkan oleh pemilik. Tidak ada pengaturan protection yang diubah.

Pemilik dapat membuat branch ruleset aktif di Settings → Rules → Rulesets:

1. Target tepat branch `main`; wajibkan pull request.
2. Required status check: **Quality gate** dari workflow **Quality gates**.
   Pilih check yang muncul dari PR ini setelah berhasil.
3. Wajibkan branch up to date dan semua percakapan review selesai.
4. Untuk tim, minimal 1 approval dan dismiss stale approvals. Jika bekerja sendiri,
   gunakan 0 approval agar pemilik masih bisa merge PR sendiri; PR/check tetap wajib.
5. Blokir force push dan penghapusan branch; hindari bypass, termasuk admin jika
   kebijakan tim mengizinkan. Batasi bypass hanya jika benar-benar diperlukan.
6. Batasi deployment branch environment `production` ke `main` melalui Settings →
   Environments. Reviewer produksi tambahan dapat diatur bila ada reviewer lain.

Review perubahan workflow, ci/, deploy/ dan migration oleh pemilik/anggota tim
sebelum merge. Jangan menambahkan required check deploy VPS pada PR karena job
produksi memang tidak boleh dijalankan dari PR.
