# Kontrak API dan audit awal

Base path `/api`. Kirim `Accept: application/json`; JSON request memakai
`Content-Type: application/json`. Endpoint protected memerlukan
`Authorization: Bearer <token>` dan akun aktif. Daftar lengkap 66 kombinasi
method/path beserta auth/active policy ada di [api-routes.json](api-routes.json).
`ApiContractTest` memeriksa inventaris terhadap route Laravel dan memastikan
seluruh 46 endpoint protected mengembalikan 401 tanpa token.

## Format umum

- 401: token hilang/tidak valid. 403: role, status akun, atau scope tidak diizinkan.
- 404: resource tidak ada/tidak berada pada parent yang diminta; lihat policy
  masing-masing resource. Beberapa penolakan akses masih memakai 403.
- 422: `{ message, errors: { field: [pesan] } }`; UI mempertahankan errors per-field.
- List sering berbentuk `{ data: [...] }`, tetapi teams dan wilayah masih array
  langsung; poles memakai envelope pagination Laravel. Jangan menganggap semua
  endpoint memiliki envelope identik. `unwrapList`/`unwrapItem` menangani variasi.

## Fitur yang sudah terdaftar

| Fitur | Method/path utama | Request dan respons penting |
| --- | --- | --- |
| Login | POST /login | email, password, device_name opsional → `{token,token_type,user}`; invalid/pending/suspended → 422 |
| Registrasi | POST /register | name,email,password,password_confirmation → 201 `{message,user}` dengan role pic, status pending, tanpa token |
| Sesi | GET /me; POST /logout; POST /logout-all | me mempertahankan payload top-level dan data; logout mencabut token saat ini, logout-all semua token |
| Profil | GET/PUT /user/profile; PUT /user/password | name/phone/email; perubahan email/password meminta current_password; avatar lewat POST/DELETE /user/avatar |
| Pengguna | GET /users; GET/PUT /users/{user}; PATCH /users/{user}/status; PATCH /users/{user}/provinces | Manajemen admin; filter role/status/search; province_ids berupa array string; admin terakhir dilindungi |
| Proyek | GET/POST /projects; GET /projects/{project} | Buat proyek oleh admin; code/name, tanggal, target tiang/status sesuai validasi; baca mengikuti project policy |
| Tiang | GET/POST /projects/{project}/poles; GET .../poles/{pole}; GET .../poles/summary | pagination per_page/page, province_id/search; lokasi/hierarki wilayah; summary total/per provinsi; tulis mengikuti penugasan |
| Pekerjaan proyek | GET/POST .../work-items; GET/PUT/PATCH/DELETE .../work-items/{workItem}; POST .../work-items/normalize | name,weight_percent,sequence,jadwal; bobot dinormalisasi; index memberi actual_progress/weighted_contribution dan meta bobot |
| Progres | GET/POST .../poles/{pole}/progress | work_item_id dan progress_percent 0–100; started_at/completed_at/notes opsional; POST memperbarui state dan menambah histori |
| Foto | multipart pada POST progress; GET /photos/{ulid} | maksimal 5 foto, jpg/jpeg/png/webp, 5120 KB per foto; respons memuat photos; GET mengembalikan file/gambar, bukan JSON |
| Kurva S | GET /projects/{project}/curve; GET .../poles/{pole}/curve | `{project,planned_curve,actual_curve,actual_current_percent,registered_poles}`; menangani schema lama tanpa pole_id dan schema tambahan lama |
| Aktivitas | GET /projects/{project}/activities | filter pole_id; histori mencakup foto; route terikat project dan authorization |
| Notifikasi | GET /notifications; GET /projects/{project}/notifications | `{data,meta:{total,unread,project}}`; inbox tersimpan milik user yang login; pagination limit 1–100 (default 50), page >=1 |
| Tim | GET/POST /teams; GET/PUT/PATCH /teams/{team}; POST /teams/{team}/members; DELETE .../members/{user} | name/code/project_id/status; anggota dikirim user_id; list array langsung; hak akses melalui TeamPolicy |
| Penugasan | GET/POST /users/{user}/poles; DELETE .../poles/{pole} | Penugasan tiang ke pengguna; validasi/otorisasi pada controller |
| Wilayah | GET /regions/provinces; GET /regions/provinces/{province}/regencies; GET /regions/regencies/{regency}/districts; GET /regions/districts/{district}/villages | Publik, array id/nama, ID wilayah string; data master perlu disiapkan tersendiri |
| Undangan | GET/POST /invitations; DELETE /invitations/{invitation}; GET /invitations/{token}; POST .../{token}/accept | Kelola oleh admin; preview/accept publik sesuai token; request terikat validasi undangan |

Foto dan avatar saat ini dapat dibaca publik melalui URL, sesuai implementasi
existing. Jangan mengasumsikan bearer token melindungi URL file tersebut. Perubahan
ke signed URL/akses privat memerlukan keputusan kontrak tersendiri.

## Perbaikan kecil pada tahap pengamanan

1. Kurva S sebelumnya error PostgreSQL pada instalasi dari migration GitHub karena
   langsung memfilter kolom pole_id yang belum ada. Filter kini dipakai hanya
   jika kolom ada, tetap mendukung schema produksi lama dengan kolom tambahan.
2. Request GET frontend sebelumnya berbagi respons hanya berdasarkan URL.
   Authorization/header kini ikut membedakan cache in-flight sehingga pergantian
   akun atau request tanpa auth tidak memakai respons akun lain.
3. Helper listNotifications sebelumnya mengabaikan projectId. Kini project yang
   dipilih memakai route scoped project; pemanggilan tanpa project tetap global.

Ada regression test perubahan akun, multipart, validasi Laravel, pilihan project
notifikasi dan akses PIC ke project notifikasi sendiri/penolakan project lain.

## Endpoint per tiang dan inbox yang telah direkonsiliasi

Sembilan kombinasi berikut sudah tersedia pada branch review dan diintegrasikan setelah diperiksa. PATCH pekerjaan per tiang juga didukung:

| Method | Path relatif terhadap /api |
| --- | --- |
| GET | /projects/{project}/poles/{pole}/work-items |
| POST | /projects/{project}/poles/{pole}/work-items |
| PUT | /projects/{project}/poles/{pole}/work-items/{workItem} |
| DELETE | /projects/{project}/poles/{pole}/work-items/{workItem} |
| POST | /projects/{project}/poles/{pole}/work-items/apply-template |
| GET | /projects/{project}/poles/{pole}/curve |
| GET | /notifications/unread-count |
| POST | /notifications/{notification}/read |
| POST | /notifications/read-all |

Tiga URL fallback juga belum terdaftar: GET .../poles/{pole}/activities,
GET .../activity-logs dan GET /activities. Fallback primer aktivitas berbasis
project sudah terdaftar, sehingga ketiadaan alternatif ini berbeda dari gap wajib.

### Pekerjaan per tiang dan kompatibilitas data

GET per tiang mengembalikan `{data:[workItem],meta:{total_weight,is_balanced,inherited,needs_reconciliation,can_manage}}`.
Tiang lama tanpa scoped item/penanda kustomisasi membaca template secara virtual;
GET tidak menulis ke database. Pada partial backfill, item legacy yang masih punya
referensi ikut dikirim dan needs_reconciliation=true; tidak disembunyikan dari
daftar. can_manage mencerminkan policy updateProgress untuk tombol editor. Tiang baru mendapat salinan template dalam transaksi
pembuatan tiang. POST menambah item, PUT memerlukan name + weight_percent, PATCH
menerima sebagian field. Name unik di kelompok yang sama (project template atau
satu pole), weight_percent 0–100, sequence >=0 (null menjadi 0), durasi >=0,
bulan rencana 1–60 dengan akhir >= awal, is_active boolean. Field scope/project
atau source dari klien diabaikan; server menentukan parent dan sumber.

Perubahan scope tiang memakai policy updateProgress; pembacaan memakai view tiang.
Item project/pole yang tidak cocok mengembalikan 404; izin gagal 403; validasi 422.
Item dengan progres, histori atau foto tidak bisa dihapus (409); template dengan
salinan juga dilindungi. Menonaktifkan item mempertahankan data. Normalisasi
melibatkan seluruh item kelompok, sesuai perilaku sebelumnya; is_active mengatur
visibilitas pekerjaan berjalan, bukan menghapus kontribusi historis.

Saat edit eksplisit pada tiang lama, service menyalin/menautkan progres, histori dan
foto secara atomik. Partial backfill diperiksa per tiang. Dua state progres untuk
template/salinan tidak ditimpa: 409, data tetap ada. Apply-template menambah sumber
yang belum ada dan menyegarkan salinan tanpa record; item manual dan item lama tidak
dihapus. Seluruh bobot kelompok dinormalisasi kembali ke 100%; snapshot bobot
menjaga titik histori sebelum perubahan. Menghapus item terakhir yang belum punya
record meninggalkan daftar kosong, tanpa mewarisi template kembali.

GET project work-items menerima scope=project (default), aggregate atau pole
(dengan pole_id wajib). Project/aggregate menampilkan satu baris per template,
termasuk progres legacy dan scoped copies. weighted_contribution memakai bobot
item aktual, bukan bobot template dikali rata-rata persentase. Meta memuat
progress_denominator, custom_weighted_contribution dan actual_current_percent.
Kontribusi template + custom sama dengan progres proyek Kurva S; UI memakai total
backend. Data pekerjaan custom dikelola pada halaman tiang, bukan dihapus dari data.

Jika satu tiang memiliki state progres template dan salinan dari sumber yang sama,
GET work-items project/aggregate, progress tiang, summary serta Kurva S terkait
mengembalikan 409 dengan message rekonsiliasi. Server tidak menjumlahkan dua state
yang ambigu atau memilih salah satunya. Summary hanya memeriksa tiang dalam scope
akses pembacanya. GET work-items scope=pole tetap tersedia untuk melihat data dan
needs_reconciliation; catatan, histori dan foto tidak dihapus. Pemilihan state yang
benar membutuhkan rekonsiliasi eksplisit, bukan migration otomatis.

Untuk histori yang baru sebagian dipindahkan ke salinan, Kurva S memakai satu
timeline per sumber pekerjaan dan tiang: kejadian terbaru menurut recorded_at/id
menggantikan state sebelumnya, dengan snapshot bobot kejadian tersebut. ID item
manual tanpa sumber tetap berdiri sendiri. Seluruh baris histori dipertahankan.

POST progress menerima template ID untuk tiang legacy. Setelah dikustomisasi,
ID template dipetakan ke salinan milik tiang itu. ID item tiang lain ditolak 404;
konflik partial backfill 409. Histori baru menyimpan snapshot bobot. Perubahan
pekerjaan/progres diserialisasikan dengan lock project lalu pole di transaksi.
Foto dan metadata kini disimpan sebelum transaksi progres di-commit. Kegagalan
storage/metadata/notifikasi membatalkan seluruh state/histori/notifikasi baru;
503 `{message,saved:false}` menandakan kegagalan penyimpanan foto yang dibatalkan.
Berkas baru yang tidak lagi direferensikan dibersihkan, berkas lama tetap ada.
Jika DB tidak dapat diperiksa setelah error commit, berkas dipertahankan untuk
menghindari penghapusan file yang mungkin sudah direferensikan. File dan PostgreSQL
bukan satu transaksi fisik: proses mati mendadak masih dapat meninggalkan orphan.
Kolom tanggal/catatan yang tidak dikirim dipertahankan; null eksplisit mengosongkan.
Response menyertakan snapshot progres/bobot dari transaksi tersebut. Koneksi
terputus/5xx umum tidak menjamin operasi belum commit; klien menampilkan hasil
belum diketahui dan meminta refresh sebelum pengiriman ulang.

Kurva S project mempertahankan angka agregat seluruh proyek, sedangkan route tiang
menggunakan izin view tiang. Aktualitas histori memakai snapshot bila tersedia;
actual_current_percent memakai bobot terkini, sehingga bisa berbeda setelah bobot
diubah. Penolakan akses berlaku pula pada filter aktivitas pole_id; daftar aktivitas
hanya memuat tiang yang dapat dilihat user.

### Inbox tersimpan

GET /notifications menampilkan seluruh inbox pribadi, tidak hanya project pertama.
GET scoped project memeriksa izin proyek dan memfilter project_id. Meta total
menghitung seluruh hasil, unread menghitung seluruh hasil belum dibaca, dan page/
per_page menunjukkan pagination. Urutan created_at DESC, id DESC.

- GET /notifications/unread-count → `{data:{unread},meta:{unread}}` pribadi.
- POST /notifications/{notification}/read → `{message,data:notification}`;
  idempotent, timestamp lama dipertahankan; milik user lain 403, tidak ada 404.
- POST /notifications/read-all → `{message,data:{updated}}`; body project_id
  opsional membatasi satu proyek dengan policy view. Tanpa project_id mencakup
  seluruh inbox sendiri. Tidak mengubah notifikasi user lain atau timestamp read lama.

Payload notification: id numerik, category/title/description/href/data,
created_at/read_at ISO atau null, dan is_read boolean. Progres membuat
notifikasi hanya untuk penerima aktif yang memiliki akses view ke tiang, kecuali
pelaku. Selesai 100% seluruh bobot tiang menambah kategori aktivitas. Membaca daftar
tidak membuat notifikasi sintetis atau mengubah status baca. Inbox lama dipertahankan
migration; histori lama tidak dibroadcast ulang. Tidak ada email/push eksternal dari
NotificationService.

### Penugasan dan pembatasan request

Assignment admin memeriksa proyek tim sesuai proyek tiang. Response memuat
pole.id/project_id/pole_code/address, tidak memakai kolom name/code yang tidak ada.
Assignment dan penambahan keanggotaan proyek berlangsung dalam satu transaksi;
role pivot yang sudah ada tidak ditimpa. Pencabutan assignment mengubah status
menjadi revoked; record tidak dihapus, dan keanggotaan proyek tetap berdiri sendiri.
Penugasan team/pole yang sudah dimiliki record lain menghasilkan 409, bukan error DB.

Login/register dibatasi lima request/IP/menit dan sepuluh/email/menit; seluruh API
120 request/user atau IP/menit. Batas terlampaui 429 dengan Retry-After. Token/session
native tetap bearer; perubahan Android/CORS lebih luas dipisah ke tahap berikutnya.

## Batas audit tahap ini

Inventaris mencakup route Laravel serta helper/pemanggilan frontend. Tes kontrak
memeriksa semua 66 method/path, middleware auth/active dan 401 tanpa token; frontend
memeriksa sembilan helper yang sebelumnya belum tersedia terhadap inventaris yang
sama. Tes bisnis mencakup auth/profil/approval, wilayah penugasan, progres/foto,
normalisasi/Kurva S, CRUD per tiang, legacy/partial backfill, notifikasi dan alur
project–team–assignment. Tes tersebut tidak membuktikan seluruh UI secara end-to-end.

Tiga URL fallback aktivitas di atas tetap tidak diperlukan karena URL primer sudah
valid. Belum ada uji lengkap semua skenario undangan, perpindahan tim antar proyek,
concurrency multi-worker/beban, private photo URL atau perangkat Android. Source
Vite legacy tetap tersimpan, sedangkan build produksi memakai Next.js. Perubahan
mobile/Android dan dependency plugin dari branch review dipisahkan agar tidak
tercampur dengan perbaikan integritas ini. Tidak ada request ke VPS atau database
produksi dalam audit/tahap pengujian ini. Lihat reconciliation-2026-10-21.md untuk
keputusan source, risiko, dan urutan PR.


### Integritas akun dan undangan

Update role/status admin memeriksa ulang di bawah lock transaksi. Admin aktif
terakhir tidak boleh diturunkan role, suspended atau pending (422, field role/status
sesuai request). Dua request bersamaan diserialisasi agar setidaknya satu admin
aktif tetap tersedia. Status pending pada PIC tetap diperbolehkan.

Accept dan revoke undangan berbagi row lock. Pembuatan user, keanggotaan, status
accepted dan token berada pada satu transaksi. Expired/revoked/accepted/unknown
status ditolak; pemeriksaan diulang setelah lock diperoleh. Jika revoke menang,
accept ditolak 403; jika accept menang, revoke ditolak 422. Error persistence tidak
meninggalkan akun aktif setengah jadi. Team-only invitation memberi membership
project tim; explicit project membership tetap didukung. Akun dengan email yang
sudah ada tetap ditolak, tanpa reset password.

### Konsistensi akses tim

Penambahan anggota serta penerimaan undangan tim memberikan membership project
tim dan project dari penugasan aktifnya, termasuk tim lama tanpa project_id.
Grant memakai firstOrCreate sehingga role membership lama tidak ditimpa.
Keanggotaan tim dan grant project berada dalam satu transaksi dengan lock tim;
penugasan juga memeriksa ulang status/project setelah memperoleh lock yang sama.
Tim tidak dapat dipindah project selama masih punya penugasan aktif (409).
Anggota tim nonaktif kehilangan akses tiang melalui tim; assignment langsung dan
izin provinsi tetap independen. Menghapus anggota tim mempertahankan membership
project yang berdiri sendiri serta seluruh histori pekerjaan.
