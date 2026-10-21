# Hasil pengujian tahap rekonsiliasi API

Dijalankan 21 Oktober 2026 WIB pada branch codex/api-completion, berbasis PR #1.
Semua database dan file fixture buatan berada pada lingkungan uji lokal. Tidak ada
SSH, migration produksi, merge main, penghapusan data pengguna, atau deploy VPS.

| Pemeriksaan aktual | Hasil |
| --- | --- |
| Laravel Unit + Feature, PHP 8.4.26 / PostgreSQL 18 | 151 tes, 438 assertions, lulus; fail-on-warning/risky aktif |
| Kompatibilitas migration PostgreSQL terpisah | 5 tes, 742 assertions, lulus; fail-on-warning/risky/skipped aktif |
| Kebijakan migration AST terhadap base PR #1 | Lulus; dua migration baru additive; tidak mengubah migration historis |
| Laravel Pint --test | Lulus, 109 file |
| npm ci dari lockfile | Berhasil, 308 package; peringatan deprecation uuid@7 dari dependency lama |
| ESLint --max-warnings=0 | Lulus |
| Frontend node:test | 8 tes, lulus; satu tes memeriksa sembilan helper terhadap kontrak Laravel |
| Next.js 16.3.8 production build | Berhasil; API upstream uji http://127.0.0.1:9 |
| Smoke check build lokal /tiang/42/pekerjaan | HTTP 200; tidak memakai API produksi |
| Bash syntax + deployment unittest | Lulus, 8 tes, termasuk quality gate/guard main |
| Pencarian pola private key/token pada file perubahan | Tidak ada kecocokan; bukan pengganti secret-scanning menyeluruh |

Migration diuji dari schema GitHub lama, schema dengan empat tambahan historis,
partial backfill, pekerjaan manual, inbox lama yang sudah dibaca, serta sebelum
role/profile. Semua record/kolom/FK/file fixture lama dipertahankan. Down migration
baru mempertahankan schema dan data; up ulang tidak menggandakan record.

Tes backend mencakup sembilan endpoint yang sebelumnya hilang, auth semua route,
akses PIC lintas project/tiang, transaksi batal saat validasi/konflik, referensi
histori/foto, apply-template berulang, penghapusan item terakhir, snapshot bobot,
agregasi legacy/scoped/custom yang sama dengan Kurva S, penerima notifikasi,
read-all scoped/idempotent, dan alur project–team–assignment. Ada batas query untuk
update progres dengan katalog 51 template agar tidak membaca tiap template satu
per satu pada tiang yang sudah memakai scoped items.

Jalankan suite backend dan migration secara berurutan bila memakai checkout lokal
yang sama: Storage::fake Laravel memakai direktori fixture yang sama. Workflow
GitHub memisahkannya ke job/runner yang berbeda.

Belum dijalankan: build APK, uji perangkat Android, seluruh UI end-to-end, stress
multi-worker, atau restore backup produksi. Perubahan mobile/Android tetap berada
di branch review untuk PR berikutnya. Rekomendasi protection main dan keterbatasan
rollback VPS dicatat pada ci-safety.md dan reconciliation-2026-10-21.md.
