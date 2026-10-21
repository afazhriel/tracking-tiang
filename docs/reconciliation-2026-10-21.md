# Rekonsiliasi Tracking Tiang — 21 Oktober 2026 WIB

## Kondisi GitHub yang diperiksa ulang

| Branch | Commit | Kondisi |
| --- | --- | --- |
| main | c547c48504e72ec282d8668946e73b6113b0cca0 | Sumber deployment aktif; tidak diubah dalam pekerjaan ini |
| review/sinkronisasi-20261020 | 4fc1fc605fdb177f480bdb386d3d31376efaea07 | Tiga commit fitur; tertinggal 10 commit main, sehingga tidak aman dijadikan pengganti main langsung |
| codex/ci-quality-gates | 0c0c4b2cb4023c5fa66f7d0b954e0d972306c8f6 | PR #1 terbuka, mergeable, lima checks SUCCESS pada run 39450455134 |
| codex/api-completion | Lihat head PR lanjutan | Berbasis PR #1; mengambil fitur review secara selektif dengan perbaikan integritas data |

Endpoint yang dilaporkan hilang pada main memang sudah ada pada branch review:
pekerjaan per tiang, Kurva S tiang, unread-count, read, dan read-all. Implementasi
serta tes review digunakan sebagai acuan; tidak ada dua route/service aktif untuk
fungsi yang sama. Handler per tiang dipisahkan dari katalog project, dengan
validasi, normalisasi, dan rekonsiliasi bersama agar aturan tidak berbeda.

## Matriks keputusan source

| Kelompok | Sudah di main | Hanya/perubahan di review | Keputusan tahap ini |
| --- | --- | --- | --- |
| Deployment | Otomatis main, backup dan health checks | Review tertinggal perbaikan deployment main | Pertahankan main + seluruh quality gates PR #1; tidak mengambil workflow review |
| Auth/profil/user/wilayah | Login, registrasi pending, approval, role/profil/avatar, cascading wilayah | Throttle login/API, CORS native | Ambil limiter dan tesnya; CORS/native dibahas pada PR Android berikutnya |
| Pekerjaan | Katalog project, normalisasi, progres dan foto lama | Item independen per tiang dan agregat source_item_id | Ambil kontrak/fitur/tes review; gunakan service transaksi untuk kompatibilitas legacy dan partial backfill |
| Database | Template/progres/histori/foto | Tiga migration per-tiang/inbox/backfill | Tidak memasukkan migration lama tersebut sebagai migration aktif baru; pakai dua migration tambahan yang memeriksa keberadaan schema dan tidak mengubah record lama |
| Notifikasi | Sintetis dari histori | Inbox tersimpan, status baca, service | Ambil model/controller/service/tes, tambah pembatasan penerima aktif dan izin tiang, pagination, read-all per proyek |
| Akses | Policy detail tiang dan proyek | Filter list tiang/tim, cache foto privat | Ambil dan uji; perluas filter yang sama ke aktivitas dan Kurva S tiang |
| Frontend fitur | Detail tiang sudah memanggil endpoint per tiang, tetapi halaman editor belum ada | Editor pekerjaan tiang dan tombol baca notifikasi | Ambil UI terkait; total proyek memakai agregat otoritatif backend; desain lainnya dipertahankan |
| Android/mobile | Capacitor memuat website, konfigurasi lama masih ada | Static export lokal, native origin, route query, plugin perangkat, splash/icons, UI mobile/landing | Tetap tersimpan di branch review; dipisahkan dari PR integritas database/API. Belum dinyatakan terverifikasi pada perangkat |
| Dependency | Lockfile Composer/npm produksi | Boost dev + beberapa plugin Capacitor | Lockfile PR #1 dipertahankan pada tahap ini; tidak perlu dependency baru untuk API ini |

Inventaris seluruh perbedaan file tersimpan di [reconciliation-files.json](reconciliation-files.json).
Ini membedakan perubahan deployment yang hanya ada di main dari fitur review;
file yang ditunda tidak dihapus dari branch review.

## Temuan berdasarkan risiko

| Risiko | Bukti | Tindakan |
| --- | --- | --- |
| Critical | Main masih memicu deploy; branch API GitHub melaporkan protected=false, ruleset yang dapat dibaca kosong. Endpoint detail protection 403 | PR #1 harus diperiksa lebih dahulu. Wajibkan PR + required check Quality gate + branch up to date; tidak mengubah setting atau melakukan deploy tanpa izin |
| High | Backfill review berhenti global bila satu scoped item ada; rollback menghapus semua scoped item termasuk manual | Migration baru hanya menambah schema. Konversi dilakukan per tiang saat aksi eksplisit, dengan lock/transaksi, perlindungan konflik 409, dan tanpa mass-delete |
| High | Progress hanya dibatasi project pada main; item tiang lain dapat dipakai | Periksa project + pole dan serialisasikan perubahan lewat lock project/pole |
| High | Notifikasi review dikirim kepada anggota tanpa filter status/izin tiang; aktivitas daftar hanya memeriksa project | Penerima harus aktif dan boleh view tiang; filter aktivitas mengikuti policy tiang; regression tests |
| High | Assignment memilih kolom poles.name/code yang tidak ada; membuat assignment tidak memastikan akses project; team project bisa berbeda | Tes PostgreSQL membuktikan 500; perbaiki kolom, transaksi assignment/membership, validasi project tim, lindungi role pivot lama |
| Medium | Agregasi review hanya menghitung source copies, mengabaikan legacy/custom; memakai bobot template untuk pekerjaan yang bobotnya sudah berbeda | Agregat menggunakan bobot item aktual; kontribusi custom disertakan pada meta dan total UI; diuji sama dengan Kurva S |
| Medium | Edit bobot mengubah angka histori Kurva S jika histori memakai bobot live | Simpan snapshot bobot sebelum perubahan dan pada histori baru; histori lama/berkas tetap ada |
| Medium | Query Kurva S memuat progres satu query per tiang | Eager load poles.workProgress.workItem; rekonsiliasi progres scoped memakai lookup legacy terkelompok, dengan regression test batas 35 query untuk katalog 51 template; rumus tetap |
| Medium | UI notifikasi menyebut backend belum ada dan belum menyimpan status baca | Pakai inbox tersimpan, read/read-all scoped proyek, badge refresh dan pagination; hapus teks integrasi teknis dari layar produk |
| Low | Next.js server page mengekspor generateStaticParams yang dianggap komponen Fast Refresh | Izinkan hanya export Next.js yang dikenal pada file page; aturan lint lainnya tetap aktif |

## Database dan rollback

Migration tambahan `2026_10_20_154241` menambah scope pekerjaan, sumber template,
penanda kustomisasi tiang dan snapshot bobot histori hanya bila belum tersedia.
`2026_10_20_154245` membuat inbox bila tabel belum ada. Tidak ada backfill massal,
update, delete, rename atau drop di up(). Migration historis tidak diedit.

Down kedua migration sengaja mempertahankan schema/data. Jika aplikasi perlu
dikembalikan, pulihkan kode/image sesuai prosedur deploy dan biarkan kolom tambahan.
Jangan menjalankan rollback migration lama 2026_10_17 pada produksi: down lama bisa
menghapus item manual. CI menguji fresh install, schema GitHub lama, tambahan
historis, partial backfill, item manual, inbox yang sudah dibaca, dan panggilan
up/down baru berulang pada PostgreSQL terisolasi.

Saat pengguna secara eksplisit mengubah pekerjaan satu tiang, template lama yang
masih dipakai progres/histori/foto ditautkan ke salinan tiang dalam transaksi yang
sama. Jika validasi gagal, seluruh penyalinan/penautan dibatalkan. Jika template dan
salinan memiliki dua state progres, respons 409 mempertahankan keduanya untuk
rekonsiliasi manual di tahap berikutnya. Item manual tidak dihapus oleh apply-template.

## Urutan PR dan batas pemeriksaan

1. Review PR #1 untuk quality gates terlebih dahulu. Jangan merge otomatis.
2. Review PR API/integritas ini dengan base codex/ci-quality-gates. Setelah PR #1
   digabung oleh pemilik, ubah base ke main dan pastikan check commit terbaru lulus.
3. PR berikutnya: rekonsiliasi Android/static export/CORS dan perubahan mobile,
   disertai build aplikasi serta tes perangkat. Jangan merge branch review langsung.

Deployment tetap baru boleh terjadi setelah pemilik menyetujui merge. Perintah
migrate dalam skrip deploy adalah tindakan produksi pada merge main berikutnya;
penyusunan dan CI PR ini tidak menjalankannya di VPS.

Health checks skrip saat ini memeriksa systemd, /login dan /api/regions/provinces.
Backup DB/image/source dilakukan sebelum pergantian source, tetapi pemulihan backend
atau database tetap manual; rollback frontend hanya mencakup artefak yang sudah
sempat ditukar. CI tidak membuktikan durasi lock pada volume produksi atau uji
restore backup riil. Detail prosedur ada pada deploy/README.md.

Belum tuntas: audit transaksi undangan/revoke bersamaan, perpindahan tim antar
project dan penambahan anggota setelah assignment pada tim tanpa project, pengujian
beban/concurrency multi-worker, private/signed photo URL, build APK/tes perangkat,
dan audit tampilan seluruh halaman. Foto/avatar masih publik melalui URL sesuai
kontrak lama. Hasil tahap ini bukan sertifikasi seluruh fitur atau Android produksi.
