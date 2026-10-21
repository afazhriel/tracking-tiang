# Kontrak API dan audit awal

Base path `/api`. Kirim `Accept: application/json`; JSON request memakai
`Content-Type: application/json`. Endpoint protected memerlukan
`Authorization: Bearer <token>` dan akun aktif. Daftar lengkap 56 kombinasi
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
| Kurva S | GET /projects/{project}/curve | `{project,planned_curve,actual_curve,actual_current_percent,registered_poles}`; menangani schema lama tanpa pole_id dan schema tambahan lama |
| Aktivitas | GET /projects/{project}/activities | filter pole_id; histori mencakup foto; route terikat project dan authorization |
| Notifikasi | GET /notifications; GET /projects/{project}/notifications | `{data,meta:{total,unread,project}}`; implementasi saat ini masih sintetis, bukan inbox tersimpan |
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

## Gap yang harus diselesaikan pada tahap API

Helper frontend menargetkan sembilan kombinasi method/path yang belum terdaftar:

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

Pekerjaan per tiang memerlukan model/relasi dan migration yang konsisten antara
instalasi baru dan schema lama. Sekadar menambahkan route tidak cukup:
CurveController::poleCurve sudah ada tetapi relasi Pole::workItems belum ada.
Parameter scope=project/aggregate saat ini belum membedakan query backend.

Notifikasi sintetis menandai tiga histori terbaru sebagai unread berdasarkan
posisi, bukan status baca pengguna. Frontend badge memanggil unread-count yang
belum ada. Tahap API perlu inbox per pengguna, pembatasan scope, dan test
cross-user untuk mark-read/count, sekaligus mempertahankan data notifications lama.

## Batas audit tahap ini

Inventaris dilakukan dari route Laravel, helper API dan seluruh sumber frontend
app/components/lib/src, termasuk pembacaan manual fetch dengan URL variabel.
Pengujian auth mencakup semua route terdaftar; pengujian bisnis existing mencakup
registrasi/role/profil, province assignment, progres/foto dan normalisasi bobot.
Ini belum membuktikan semua alur UI/role setiap fitur secara end-to-end. CRUD tim,
undangan, skenario lintas-project, dan fitur per tiang/inbox perlu perluasan test
pada tahap API. Source Vite legacy juga masih berada di src/, sementara produksi
menggunakan Next.js. Audit tidak mengirim request ke VPS atau database produksi.
