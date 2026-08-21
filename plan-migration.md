# Rencana Migrasi Arsitektur VR-GeoNusa

Status: **Draft untuk eksekusi bertahap**  
Target: **Feature-based modular monolith dengan Clean Architecture pragmatis dan ML hybrid terverifikasi admin pada worker terisolasi**
Strategi: **Incremental strangler migration**  
Tanggal penyusunan: **13 Agustus 2026**
Pembaruan strategi ML hybrid: **16 Agustus 2026**
Pembaruan integrasi revisi klien (`revision.md`): **19 Agustus 2026** — lihat Bagian 27.

## 1. Tujuan

Migrasikan VR-GeoNusa dari backend Express monolitik satu file dan frontend statis yang saling terduplikasi menjadi:

- backend modular berdasarkan fitur/domain;
- TypeScript untuk seluruh kode baru;
- admin dashboard React yang aman dan mudah dipelihara;
- aplikasi VR Vite + TypeScript + A-Frame;
- kontrak API bersama menggunakan Zod;
- migrasi MySQL yang versioned;
- ML hybrid yang memisahkan label terverifikasi admin dari prediksi model;
- inferensi ML pada worker terisolasi dengan kebijakan confidence, mismatch, dan audit versi model;
- kandidat hotspot otomatis yang wajib ditinjau admin sebelum dipublikasikan;
- test otomatis dan quality gate CI;
- deployment server dan demo GitHub Pages yang tetap kompatibel.

Migrasi harus dilakukan tanpa rewrite besar dan tanpa memutus URL `/api/*` yang sedang digunakan.

## 2. Kondisi Repository Saat Rencana Dibuat

Temuan baseline yang harus dianggap sebagai konteks eksekusi:

- `server.js` memiliki sekitar 1.417 baris dan menampung hampir seluruh route, autentikasi, authorization, query, filesystem, laporan, dan startup.
- `public/admin/index.html` memiliki sekitar 1.769 baris.
- `public/js/tour.js` memiliki sekitar 764 baris.
- Repository belum memiliki unit test, integration test, E2E test, lint, TypeScript, atau build frontend.
- Backend memakai Express 4, MySQL, JWT, bcrypt, dan `@tensorflow/tfjs-node`.
- Import TensorFlow.js Node gagal pada Node.js 24 LTS karena native binding tidak tersedia.
- Model saat ini adalah classifier MobileNetV2 atas crop panorama yang diarahkan oleh `identify.local_angle`, bukan object detector yang mencari seluruh bangun ruang.
- `public/js/tour.js` saat ini dapat mengganti `identify.class_id` terverifikasi dengan kelas prediksi tanpa threshold minimum; `ml_matches_area` hanya dicatat dan belum menjadi kebijakan keputusan.
- `MLTraining/train.py` hanya melaporkan validation accuracy dan belum mengevaluasi split test secara eksplisit.
- Metadata tur saat ini memiliki node terverifikasi untuk lima kelas, sedangkan model menghasilkan enam kelas; coverage kelas dan generalisasi lintas situs belum tervalidasi.
- Terdapat source/data yang diduplikasi antara root dan `public/`.
- GitHub Pages hanya dapat menjalankan mode statis; fitur login, laporan, dan penyimpanan memerlukan Node.js + MySQL.
- Saat rencana dibuat, `package.json` telah dimodifikasi pengguna dan `.agents/` serta `bun.lock` masih untracked. Perubahan tersebut tidak boleh ditimpa atau dihapus tanpa izin.

## 3. Arsitektur Target

```text
VR-GeoNusa/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── app.ts
│   │       ├── server.ts
│   │       ├── config/
│   │       ├── db/
│   │       ├── middleware/
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   ├── schools/
│   │       │   ├── accounts/
│   │       │   ├── classes/
│   │       │   ├── students/
│   │       │   ├── sessions/
│   │       │   ├── learning-events/
│   │       │   ├── scenes/
│   │       │   ├── tours/
│   │       │   ├── reports/
│   │       │   ├── team/
│   │       │   └── ml/
│   │       └── shared/
│   ├── admin/
│   └── vr/
├── packages/
│   ├── contracts/
│   └── testing/
├── public/
│   └── assets/
├── tests/
└── package.json
```

Alur backend per fitur:

```text
HTTP route
    ↓
input validation
    ↓
authentication dan authorization
    ↓
service/use-case
    ↓
repository
    ↓
MySQL atau filesystem
```

Alur ML hybrid saat menyiapkan panorama:

```text
panorama
    ↓
candidate proposal worker
    ↓
antrean review admin
    ↓ accept/edit/reject
hotspot + label terverifikasi
```

Alur ML hybrid saat siswa menggunakan tur:

```text
hotspot terverifikasi
    ↓
crop panorama deterministik
    ↓
ML service → worker_threads → ONNX Runtime → classifier
    ↓
decision policy (match / uncertain / mismatch / unavailable)
    ↓
label terverifikasi tetap ditampilkan + prediksi dicatat terpisah
```

## 4. Keputusan Arsitektur

### 4.1 Modular monolith, bukan microservices

Backend tetap satu aplikasi dan satu deployment. Pemisahan dilakukan pada source code berdasarkan fitur. Microservices tidak digunakan selama skala aplikasi masih pilot dan seluruh fitur masih berbagi satu database.

### 4.2 Feature-based modules

Setiap fitur menggunakan pola berikut:

```text
src/modules/<feature>/
├── <feature>.router.ts
├── <feature>.schema.ts
├── <feature>.service.ts
├── <feature>.repository.ts
└── <feature>.test.ts
```

Tanggung jawab:

- `router`: transport HTTP dan mapping status code;
- `schema`: validasi body, query, dan parameter;
- `service`: aturan bisnis, authorization, dan transaksi;
- `repository`: query database atau akses filesystem;
- `test`: behavior fitur dan failure path.

Jangan membuat generic base repository, service superclass, atau abstraction lain yang belum memiliki minimal dua implementasi nyata.

### 4.3 Backward compatibility

- URL `/api/*` dipertahankan selama migrasi.
- Bentuk response dipertahankan kecuali perubahan keamanan secara eksplisit memerlukannya.
- `server.js` lama dipertahankan sebagai entry point kompatibilitas sampai fase cleanup.
- Admin baru berjalan di `/admin-v2` sebelum menggantikan `/admin`.
- Demo statis GitHub Pages tetap dipertahankan.

### 4.4 ML hybrid dengan human verification

Invarian domain berikut wajib dipertahankan:

- `identify.class_id` yang berasal dari admin diperlakukan sebagai **label terverifikasi** dan tetap menjadi nilai efektif untuk materi pembelajaran selama masa kompatibilitas.
- Prediksi ML adalah data turunan. Prediksi tidak boleh menimpa label terverifikasi, teks pembelajaran, rumus, atau konteks budaya.
- Response dan event baru harus membedakan minimal `verified_class_id`, `predicted_class_id`, `confidence`, `decision_status`, `prediction_source`, `model_version`, dan `preprocessing_version`.
- `decision_status` minimal mendukung `match`, `uncertain`, `mismatch`, dan `unavailable`.
- Threshold tidak boleh ditetapkan hanya berdasarkan intuisi atau warna UI. Threshold ditentukan per versi model, dan bila perlu per kelas, dari evaluation set yang bebas data leakage.
- Nilai `identify.conf` legacy tidak boleh dianggap sebagai confidence model. Field tersebut harus didokumentasikan sebagai metadata legacy, lalu didepresiasi setelah client lama tidak bergantung kepadanya.
- Prediksi browser fallback harus diberi sumber berbeda dan tidak boleh dicampur dengan evaluasi resmi server tanpa `model_version` dan `preprocessing_version` yang identik.
- Kandidat hotspot dari model hanya terlihat pada workflow admin. Kandidat tidak boleh menjadi hotspot siswa sebelum admin menerima atau mengeditnya.
- Penerimaan kandidat harus menghasilkan audit metadata tentang reviewer, waktu, proposal awal, dan perubahan yang dilakukan.
- Otomatisasi penuh pada runtime siswa berada di luar target migrasi ini sampai dataset lintas panorama/situs dan gate metrik disetujui.

## 5. Aturan Eksekusi untuk Model

Aturan ini wajib diikuti oleh setiap model yang mengeksekusi rencana:

1. Kerjakan hanya satu fase atau satu subfase per task.
2. Jangan mengerjakan fase berikutnya sebelum seluruh acceptance criteria fase aktif terpenuhi.
3. Periksa `git status` sebelum mengubah file.
4. Pertahankan seluruh perubahan pengguna yang tidak terkait.
5. Jangan menghapus `server.js`, admin lama, asset, panorama, dataset, atau model sebelum fase cleanup.
6. Jangan mengubah URL atau response API tanpa instruksi eksplisit pada fase aktif.
7. Jangan menjalankan migrasi pada database produksi.
8. Jangan menggunakan `npm audit fix --force`.
9. Jangan memperkenalkan microservices, Redis, message broker, container orchestration, atau state-management frontend tambahan.
10. Jangan menggunakan `dangerouslySetInnerHTML` pada admin React.
11. Jangan memindahkan atau menghapus file Git LFS tanpa persetujuan pengguna.
12. Gunakan npm sebagai package manager default. Jangan menghapus `bun.lock` sebelum pengguna mengizinkan.
13. Setiap perubahan behavior harus memiliki regression test.
14. Jika keputusan tidak tercantum pada rencana, berhenti dan tanyakan kepada pengguna.
15. Setelah task selesai, laporkan file berubah, behavior berubah, test yang dijalankan, hasil test, dan risiko tersisa.
16. Jangan pernah memakai prediksi ML sebagai ground truth atau menimpa label terverifikasi admin.
17. Jangan mengaktifkan candidate proposal untuk siswa atau auto-publish hotspot tanpa gate manual yang eksplisit.

## 6. Checklist Fase

- [ ] Fase 0 — Baseline dan perlindungan migrasi
- [ ] Fase 1 — Pisahkan startup dari aplikasi
- [ ] Fase 2 — Tambahkan safety net
- [ ] Fase 3A — Tutup path traversal
- [ ] Fase 3B — Amankan bootstrap dan login admin
- [ ] Fase 3C — Terapkan ownership sesi
- [ ] Fase 3D — Pindahkan penilaian kuis ke server
- [ ] Fase 3E — Perbaiki tenant isolation laporan
- [ ] Fase 3F — Tutup XSS dan perbaiki autentikasi browser
- [ ] Fase 4 — Introduksi TypeScript
- [ ] Fase 5 — Buat fondasi modular monolith
- [ ] Fase 6A — Ekstrak module auth
- [ ] Fase 6B — Ekstrak module schools dan accounts
- [ ] Fase 6C — Ekstrak module classes dan students
- [ ] Fase 6D — Ekstrak module sessions dan learning-events
- [ ] Fase 6E — Ekstrak module scenes dan objects
- [ ] Fase 6F — Ekstrak module tours dan dataset
- [ ] Fase 6G — Ekstrak module reports
- [x] Fase 6H — Ekstrak module team
- [x] Fase 6I — Ekstrak health dan static application
- [x] Fase 7 — Migrasi database versioned
- [ ] Fase R0 — Baseline revisi klien dan paket bukti awal (lihat Bagian 27)
- [ ] Fase R1 — Ketepatan konsep, keamanan, dan kesiapan rilis (lihat Bagian 27)
- [ ] Fase R2 — Interaksi geometri inti VR (lihat Bagian 27)
- [ ] Fase R3 — Dataset dan bukti kinerja model, digabung dengan Fase 8A–8D (lihat Bagian 27)
- [ ] Fase 8A — Bentuk kontrak dan data ML hybrid
- [ ] Fase 8B — Isolasi inferensi classifier dalam worker
- [ ] Fase 8C — Migrasi classifier ke ONNX dengan parity
- [ ] Fase 8D — Terapkan decision policy dan pengalaman runtime hybrid
- [ ] Fase 8E — Tambahkan candidate hotspot berbasis review admin
- [ ] Fase R4 — Konten, kurikulum, instrumen, dan fitur geometri lanjutan (lihat Bagian 27)
- [ ] Fase R5 — Etik, tata kelola, dokumentasi teknis, dan legacy (lihat Bagian 27)
- [ ] Fase R6 — Verifikasi akhir dan paket laporan kemajuan (lihat Bagian 27)
- [ ] Fase 9 — Migrasi frontend VR
- [ ] Fase 10 — Migrasi admin
- [ ] Fase 11 — Bentuk npm workspaces
- [ ] Fase 12 — CI, deployment, dan cleanup

---

## 7. Fase 0 — Baseline dan Perlindungan Migrasi

### Tujuan

Merekam kondisi awal dan memastikan migrasi tidak merusak perubahan pengguna.

### Pekerjaan

1. Buat branch `codex/modular-monolith-migration` jika pengguna mengizinkan pembuatan branch.
2. Rekam:
   - `git status --short`;
   - branch aktif;
   - commit terakhir;
   - versi Node.js dan npm;
   - daftar route pada `server.js`;
   - ukuran file utama;
   - dependency tree.
3. Jalankan pemeriksaan baseline:
   - `npm ci --dry-run`;
   - `node --check` pada seluruh JavaScript aplikasi;
   - smoke test frontend statis;
   - smoke test ML;
   - `npm audit` tanpa auto-fix.
4. Tambahkan dokumen:
   - `docs/architecture/ADR-001-modular-monolith.md`;
   - `docs/architecture/api-route-inventory.md`;
   - `docs/architecture/migration-checklist.md`.
5. Catat kegagalan yang sudah ada sebagai baseline, bukan sebagai regression baru.

### Larangan

- Jangan mengubah behavior.
- Jangan memperbarui dependency.
- Jangan membersihkan worktree.

### Verifikasi

- Dokumen route inventory mencakup seluruh deklarasi `app.get/post/put/patch/delete`.
- Status Git sesudah fase hanya menampilkan dokumen baseline baru dan perubahan pengguna sebelumnya.

### Acceptance criteria

- Baseline dapat direproduksi.
- Seluruh kegagalan awal terdokumentasi.
- Tidak ada source code runtime yang berubah.

---

## 8. Fase 1 — Pisahkan Startup dari Aplikasi

### Tujuan

Backend dapat di-import oleh test tanpa membuka port, menghubungkan database, atau memuat native ML.

### File utama

- `server.js`
- `ml/predict.js`

### Pekerjaan

1. Bungkus proses `initDb()` dan `app.listen()` dalam fungsi `startServer()`.
2. Jalankan fungsi hanya jika `require.main === module`.
3. Export minimal:
   - `app`;
   - `startServer`;
   - `initDb`.
4. Hilangkan `require('./ml/predict')` dari import-time startup.
5. Lazy-load provider ML ketika endpoint prediction dipanggil atau setelah HTTP server siap.
6. Jika ML tidak siap, kembalikan HTTP `503` dengan response JSON stabil.
7. Tambahkan centralized Express error middleware.
8. Pastikan async rejection menghasilkan response error dan tidak membuat request menggantung.

### Test wajib

- Import `server.js` tidak membuka port.
- Import tidak memuat TensorFlow native binding.
- Server tetap dapat menyala ketika ML gagal.
- Error async menghasilkan response JSON `500`.
- Health endpoint non-ML tetap bekerja.

### Acceptance criteria

Perintah berikut berhasil tanpa koneksi database dan tanpa membuka listener:

```bash
node -e "require('./server.js'); console.log('import-ok')"
```

Rollback cukup dengan mengembalikan perubahan pada `server.js` dan `ml/predict.js`; tidak ada perubahan data pada fase ini.

---

## 9. Fase 2 — Tambahkan Safety Net

### Tujuan

Membangun test karakterisasi sebelum route dipindahkan.

### Dependency pengembangan

- `vitest`
- `supertest`
- `typescript`
- `tsx`
- `eslint`
- `zod`
- type definitions yang diperlukan

### Struktur

```text
tests/
├── unit/
├── integration/
├── security/
└── fixtures/
```

### Test minimum

1. Route inventory test mendeteksi route yang hilang.
2. Login staf berhasil dan gagal.
3. Login siswa berhasil dan gagal.
4. Authorization matrix untuk:
   - `super_admin`;
   - `school_admin`;
   - `teacher`;
   - `student`;
   - guest.
5. Guru tidak bisa mengakses kelas guru lain.
6. School admin tidak bisa mengakses sekolah lain.
7. Scene ID tidak dapat keluar dari direktori data.
8. Session event tidak dapat ditulis oleh pemilik yang salah.
9. Nilai admin yang berasal dari API tidak dieksekusi sebagai HTML.
10. Export CSV membutuhkan autentikasi.
11. Kegagalan ML tidak mematikan API.

### Ketentuan database test

- Gunakan fake repository, disposable test database, atau fixture database yang terisolasi.
- Jangan memakai database development yang berisi data pengguna.
- Jangan memakai database production.
- Test harus dapat dijalankan berulang kali.

### Acceptance criteria

- Test dapat dijalankan melalui satu script npm.
- Test failure menghasilkan pesan yang menunjukkan kontrak mana yang berubah.
- Belum ada route bisnis yang dipindahkan.

---

## 10. Fase 3 — Perbaikan Keamanan Sebelum Modularisasi

Fase 3 harus dijalankan sebagai enam task terpisah.

### 10.1 Fase 3A — Path Traversal

#### Pekerjaan

1. Tambahkan validator ID terpusat.
2. Gunakan allowlist `^[a-z0-9-]+$` untuk identifier file-backed.
3. Gunakan `path.resolve()`.
4. Pastikan resolved path masih berada di dalam direktori yang diperbolehkan.
5. Terapkan pada:
   - scene ID;
   - tour ID;
   - node ID bila menjadi bagian path;
   - dataset class ID;
   - file lain yang berasal dari parameter request.

#### Test

- Tolak `../`, encoded slash, backslash, absolute path, drive path Windows, dan null byte.
- ID valid tetap bekerja.

#### Acceptance criteria

- Tidak ada parameter request yang digabungkan ke path tanpa validator.

### 10.2 Fase 3B — Bootstrap dan Login Admin

#### Pekerjaan

1. Hapus password bootstrap yang tetap.
2. Untuk database kosong, password bootstrap berasal dari environment.
3. Jangan mencetak password atau token ke log.
4. Tambahkan rate limiter khusus login staf.
5. Tambahkan `must_change_password`.
6. Tolak operasi admin selain ganti password selama flag masih aktif.

#### Test

- Startup database kosong gagal dengan pesan konfigurasi yang aman jika password bootstrap tidak tersedia.
- Login terkena rate limit.
- Password tidak muncul di log.
- Admin bootstrap wajib mengganti password.

### 10.3 Fase 3C — Ownership Sesi

#### Perubahan data

Tambahkan kolom `sessions.write_token_hash` melalui migration development/test terlebih dahulu.

#### Alur target

1. Pembuatan sesi guest menghasilkan token acak.
2. Database hanya menyimpan hash token.
3. Frontend menyimpan token dalam memory.
4. Event berikutnya mengirim `X-Session-Token`.
5. Siswa login boleh memakai JWT siswa sebagai bukti kepemilikan.
6. Server memvalidasi bahwa sesi dimiliki token atau siswa tersebut.

#### Endpoint terdampak

- `PUT /api/sessions/:id/end`
- `POST /api/interactions`
- `POST /api/predictions`
- `POST /api/quiz-results`

#### Compatibility

- Pertahankan field response yang lama.
- Field token baru boleh ditambahkan.
- Update `public/js/app.js` dan `public/js/tour.js` pada task yang sama karena keduanya adalah client kontrak sesi.

#### Test

- Token pemilik diterima.
- Token salah ditolak.
- Session ID asing ditolak.
- JWT siswa hanya dapat menulis ke sesi miliknya.

### 10.4 Fase 3D — Integritas Kuis

#### Pekerjaan

1. Client hanya dipercaya untuk mengirim `question_id` dan `answer`.
2. Server membaca `quiz.json`.
3. Server menghitung `is_correct`.
4. Tolak question ID atau jawaban yang tidak valid.
5. Validasi response time sebagai angka non-negatif dengan batas atas wajar.

#### Test

- `is_correct: true` palsu dari client diabaikan.
- Jawaban benar dan salah dinilai server.
- Question ID tidak dikenal ditolak.

### 10.5 Fase 3E — Tenant Isolation Laporan

#### Aturan scope

- `super_admin`: seluruh data atau filter sekolah valid.
- `school_admin`: hanya `school_id` dari token.
- `teacher`: hanya class dengan `teacher_account_id` miliknya.
- Query `class_id` harus diverifikasi berada dalam scope akun.

#### Endpoint

- `GET /api/reports/summary`
- `GET /api/reports/export.csv`

#### Test

- Guru A tidak melihat kelas Guru B dalam sekolah sama.
- School admin A tidak melihat sekolah B.
- Filter class lintas scope menghasilkan `403` atau data kosong secara konsisten.
- Summary dan CSV memakai filter identik.

### 10.6 Fase 3F — XSS dan Autentikasi Browser

#### Pekerjaan

1. Tambahkan escape helper untuk admin lama.
2. Jangan memasukkan nilai API mentah ke `innerHTML`.
3. Gunakan `textContent` ketika memungkinkan.
4. Tambahkan Helmet dan Content Security Policy.
5. Mulai dukung cookie `HttpOnly`, `Secure`, dan `SameSite`.
6. Pertahankan Bearer token lama sementara admin legacy masih digunakan.
7. Perbaiki export CSV melalui authenticated `fetch()` dan download `Blob`.

#### Test

- Payload HTML pada nama siswa/sekolah/kelas tampil sebagai teks.
- Token tidak tersedia melalui JavaScript ketika memakai admin baru.
- CSV berhasil diunduh oleh akun valid dan ditolak untuk akun tanpa izin.

---

## 11. Fase 4 — Introduksi TypeScript

### Tujuan

Membuat build campuran JavaScript/TypeScript tanpa konversi massal legacy.

### Konfigurasi

Tambahkan:

- `tsconfig.json`;
- `eslint.config.js`;
- script `typecheck`;
- script `lint`;
- script `test`;
- script `build`.

Ketentuan TypeScript:

- `strict: true` untuk file TypeScript;
- `allowJs: true`;
- `checkJs: false` untuk legacy;
- `noEmitOnError: true`;
- target runtime Node.js LTS yang disepakati;
- source map aktif untuk server.

### Aturan

- Semua file baru memakai TypeScript.
- Jangan mengonversi seluruh `server.js` sekaligus.
- Jangan menambahkan `any` tanpa komentar alasan dan issue tindak lanjut.

### Verifikasi

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

### Acceptance criteria

- Seluruh command lulus.
- Build dapat menjalankan health endpoint.
- Runtime lama tetap dapat digunakan sebagai rollback.

---

## 12. Fase 5 — Fondasi Modular Monolith

### Struktur awal

```text
src/
├── app.ts
├── config/
│   ├── env.ts
│   └── paths.ts
├── db/
│   └── client.ts
├── middleware/
│   ├── authenticate.ts
│   ├── authorize.ts
│   ├── error-handler.ts
│   ├── rate-limit.ts
│   └── validate.ts
└── shared/
    ├── app-error.ts
    ├── ids.ts
    └── types.ts
```

### Pekerjaan

1. Validasi environment dengan Zod.
2. Pindahkan pool MySQL ke `src/db/client.ts`.
3. Pindahkan path canonical ke `src/config/paths.ts`.
4. Pindahkan middleware autentikasi dan role.
5. Definisikan tipe principal untuk account dan student.
6. Pisahkan Express app dan HTTP listener.
7. Pastikan centralized error middleware menjadi middleware terakhir.
8. Pertahankan `server.js` sebagai compatibility entry point.

### Acceptance criteria

- Belum ada endpoint bisnis yang berubah.
- Seluruh characterization test tetap lulus.
- Tidak ada pembacaan `process.env` di module bisnis.
- Tidak ada query database di router baru.

---

## 13. Fase 6 — Ekstraksi Module

Setiap subfase adalah satu task atau satu PR.

### Prosedur wajib setiap subfase

1. Identifikasi route legacy yang akan dipindahkan.
2. Buat router, schema, service, repository, dan test.
3. Mount router pada URL yang sama.
4. Hapus hanya deklarasi route legacy yang sudah dipindahkan.
5. Jalankan contract test dan authorization test.
6. Bandingkan response sukses dan error dengan baseline.
7. Jangan lanjut jika parity belum tercapai.

### 13.1 Fase 6A — Auth

Route:

- `POST /api/auth/login`
- `GET /api/auth/verify`
- `POST /api/auth/change-password`
- `POST /api/auth/student-login`

Test tambahan:

- token/account yang sudah dihapus tidak dianggap valid;
- password change merotasi atau mencabut sesi lama sesuai keputusan auth;
- error login tidak mengungkap username mana yang valid.

### 13.2 Fase 6B — Schools dan Accounts

Route:

- `GET /api/schools`
- `POST /api/schools`
- `DELETE /api/schools/:id`
- `GET /api/accounts`
- `POST /api/accounts`
- `PUT /api/accounts/:id/reset-password`
- `DELETE /api/accounts/:id`

Authorization harus diverifikasi dalam service atau repository filter, bukan hanya berdasarkan UI.

### 13.3 Fase 6C — Classes dan Students

Route:

- `GET /api/classes`
- `POST /api/classes`
- `DELETE /api/classes/:id`
- `GET /api/classes/:id/students`
- `POST /api/classes/:id/students/bulk`
- `PUT /api/students/:id/reset-password`
- `DELETE /api/students/:id`
- `GET /api/students/me/results`

Gunakan transaksi untuk bulk insert. Batasi jumlah siswa per request dan validasi panjang setiap field.

### 13.4 Fase 6D — Sessions dan Learning Events

Module `sessions` menangani:

- pembuatan sesi;
- penutupan sesi;
- ownership token;
- transaksi pembuatan user dan session.

Module `learning-events` menangani:

- interactions;
- predictions;
- quiz results.

Semua event harus memvalidasi kepemilikan sesi.

### 13.5 Fase 6E — Scenes dan Objects

Pekerjaan:

- pindahkan CRUD scene;
- pindahkan CRUD object;
- buat filesystem repository;
- validasi JSON scene;
- gunakan atomic write melalui temporary file dan rename;
- pertahankan sinkronisasi data publik sampai build frontend baru siap.

### 13.6 Fase 6F — Tours dan Dataset

Pekerjaan:

- listing tour;
- update hotspot/identifikasi terverifikasi tanpa mencampurnya dengan prediksi ML;
- upload dataset;
- statistik dataset;
- provenance dataset dan source panorama/node;
- validasi taxonomy version serta pemisahan train/validation/test berdasarkan source ID;
- validasi MIME berdasarkan isi file;
- batasi ukuran ketika streaming, bukan setelah seluruh body masuk memory;
- cegah filename collision dengan UUID atau atomic counter.

#### Catatan revisi (19 Agustus 2026)

`revision.md` butir B1 mengubah mode anotasi dataset dari crop per panorama/node menjadi anotasi per objek dengan kotak pembatas (`object_id`, `class_id`, koordinat ternormalisasi). Perubahan ini membuka kembali `src/modules/dataset/` yang sudah selesai pada fase ini dan dikerjakan pada Fase R3 (Bagian 27), bukan sebagai subfase 6F baru. Jangan mengulang pekerjaan yang sudah terverifikasi di fase ini (validasi MIME, atomic write, provenance, split deterministik); Fase R3 hanya menambah unit anotasi bounding box di atas fondasi tersebut.

### 13.7 Fase 6G — Reports

Pekerjaan:

- summary;
- CSV export;
- tenant scope terpusat;
- pagination;
- query optimization;
- hitung siswa unik berdasarkan `student_id` untuk siswa login;
- tentukan penanganan guest secara eksplisit.

### 13.8 Fase 6H — Team

Pekerjaan:

- CRUD anggota;
- reorder;
- upload foto;
- validasi image dengan Sharp;
- atomic JSON write;
- hapus file foto lama hanya jika aman dan secara eksplisit disetujui.

### 13.9 Fase 6I — Health dan Static Application

Pisahkan:

- liveness endpoint;
- readiness endpoint database;
- readiness endpoint ML;
- static asset serving;
- frontend fallback.

Health endpoint publik tidak boleh menampilkan daftar file internal atau detail secret/configuration.

#### Catatan revisi (19 Agustus 2026)

`revision.md` butir E1 mewajibkan `data/` menjadi sumber kanonik runtime: mount route `/data` sebelum `express.static(PUBLIC_DIR)` agar suntingan admin pada `data/` langsung terlihat tanpa bergantung pada sinkronisasi ke `public/data/`. Terapkan urutan middleware ini sebagai bagian dari static asset serving pada fase ini, dan pertahankan `public/data/` hanya sebagai salinan kompatibilitas yang tidak lagi menang saat konflik. Tambahkan test yang menyunting data melalui repository/API pada temporary directory lalu membuktikan `GET /data/...` melihat versi terbaru.

### Acceptance criteria Fase 6

- Tidak ada route bisnis tersisa di `server.js`.
- `server.js` hanya menjadi compatibility bootstrap.
- Semua router hanya menangani HTTP concern.
- Semua query berada dalam repository.
- Semua aturan akses memiliki test.

---

## 14. Fase 7 — Migrasi Database Versioned

### Sasaran

Gunakan Drizzle untuk schema dan migration management dengan MySQL/MariaDB yang ada.

### Struktur

```text
src/db/
├── client.ts
├── schema.ts
└── migrations/
```

### Pekerjaan

1. Introspeksi database yang benar-benar digunakan.
2. Cocokkan dengan `db/schema.mysql.sql`.
3. Identifikasi orphan row sebelum menambahkan foreign key.
4. Buat foreign key eksplisit menggunakan `FOREIGN KEY (...) REFERENCES ...`.
5. Tambahkan index untuk seluruh foreign key dan query laporan utama.
6. Tambahkan:
   - `sessions.write_token_hash`;
   - `accounts.must_change_password`.
7. Tentukan kebijakan `RESTRICT`, `CASCADE`, atau `SET NULL` per relasi.
8. Generate SQL migration dan review manual.
9. Jangan menggunakan `drizzle push` ke production.
10. Uji pada:
    - fresh database;
    - snapshot database versi lama;
    - data yang memiliki orphan;
    - proses restore backup.

### Gate manual

Model wajib berhenti sebelum menjalankan migration production dan meminta:

- konfirmasi backup;
- konfirmasi target database;
- konfirmasi maintenance window;
- persetujuan SQL migration.

### Acceptance criteria

- Fresh install menghasilkan schema lengkap.
- Upgrade dari schema lama berhasil.
- Tidak ada orphan setelah migration.
- Restore backup telah diuji.

### Hasil eksekusi (21 Agustus 2026)

- Fresh install dan upgrade snapshot legacy berisi data lulus pada MySQL 8.4.
- Orphan ditolak sebelum DDL; retry migration bersifat idempotent.
- Kebijakan `RESTRICT`, `SET NULL`, dan `CASCADE` serta dump/restore backup telah diuji.
- Migration production belum dijalankan dan tetap memerlukan seluruh gate manual.
- Schema revisi C4/C5/D4/D5/F2 ditunda karena struktur finalnya masih menunggu keputusan manual Bagian 24.

---

## 15. Fase 8 — Migrasi ke ML Hybrid Terverifikasi Admin

Fase 8 harus dijalankan sebagai lima subfase terpisah. Migrasi runtime, perubahan kebijakan keputusan, dan pengembangan candidate detector tidak boleh digabung dalam satu task atau satu perubahan behavior besar.

### Prinsip yang tidak boleh dilanggar

1. Label admin adalah label terverifikasi dan sumber materi pembelajaran.
2. Prediksi classifier tidak pernah menimpa label terverifikasi.
3. Confidence adalah skor model, bukan probabilitas kebenaran, sampai kalibrasi dibuktikan.
4. Golden dataset parity runtime berbeda dari evaluation set kualitas model.
5. Candidate detector hanya memberi proposal kepada admin dan tidak melakukan auto-publish.
6. Semua hasil harus dapat ditelusuri ke versi model, preprocessing, taxonomy, dataset, dan asset panorama.

### 15.1 Fase 8A — Kontrak dan Data ML Hybrid

#### Tujuan

Memisahkan ground truth terverifikasi, prediksi model, keputusan policy, dan metadata audit tanpa memutus client lama.

#### Lokasi utama

- `data/tour-*.json` sebagai sumber label/hotspot terverifikasi selama penyimpanan tur masih file-backed;
- `db/schema.mysql.sql` dan migration versioned untuk event prediksi;
- `src/modules/ml/` untuk kontrak dan decision types;
- `packages/contracts/` setelah workspace tersedia;
- `public/js/tour.js` hanya untuk compatibility test pada tahap ini, bukan redesign UI.

#### Pekerjaan

1. Tambahkan characterization test yang membuktikan behavior saat ini, termasuk kasus model cocok, model berbeda, confidence rendah, server unavailable, dan browser fallback.
2. Definisikan kontrak prediksi hybrid yang minimal memuat:
   - `verified_class_id`;
   - `predicted_class_id`;
   - `confidence`;
   - optional `top_k` bila diperlukan untuk evaluasi;
   - `decision_status` (`match`, `uncertain`, `mismatch`, `unavailable`);
   - `prediction_source` (`server`, `browser`, atau `none`);
   - `model_version`;
   - `preprocessing_version`;
   - `taxonomy_version`;
   - `asset_version` atau checksum panorama;
   - `latency_ms` untuk prediksi server.
3. Pertahankan `identify.class_id` sebagai alias legacy untuk label terverifikasi. Jangan mengubahnya ketika inferensi selesai.
4. Jangan menyimpan output prediksi sebagai bagian dari `identify` di JSON tur. Simpan sebagai event/audit atau cache yang dapat dibuang dan dihitung ulang.
5. Tambahkan kolom versioned yang diperlukan pada tabel `predictions`, termasuk label terverifikasi, status keputusan, sumber prediksi, versi model/preprocessing, dan latency. Pertahankan kolom legacy selama compatibility window.
6. Dokumentasikan bahwa `identify.conf` adalah metadata legacy, bukan confidence model. Jangan gunakan field itu untuk evaluasi.
7. Tentukan cache key dari tour/node, checksum atau versi asset, yaw/pitch/FOV, model version, dan preprocessing version agar cache lama tidak dipakai setelah salah satu input berubah.
8. Response endpoint lama tetap menyediakan `class_id` dan `confidence`; response baru boleh menambahkan objek `verified`, `prediction`, dan `decision` secara backward-compatible.
9. (Revisi B5) Tambahkan body opsional `yaw`/`pitch` yang divalidasi pada `POST /api/ml/predict/:tourId/:nodeId` agar client baru dapat mengirim sudut pandang bebas pengguna untuk crop; client lama tanpa body tetap memakai `identify.local_angle` agar kompatibel. Catat `latency_ms`, sumber prediksi, dan kecocokan dengan label area pada setiap panggilan.
10. (Revisi B7) Nilai `identify.conf` yang berasal dari input admin (bukan hasil inferensi model) tidak boleh ditampilkan sebagai confidence model di UI maupun dicatat sebagai confidence pada tabel `predictions`. Tandai secara eksplisit sebagai data referensi admin.

#### Test wajib

- Prediksi match tidak mengubah label terverifikasi.
- Prediksi mismatch tidak mengubah label, rumus, atau konteks budaya.
- Event menyimpan verified dan predicted label secara terpisah.
- Cache invalid ketika model, preprocessing, crop, atau asset berubah.
- Client lama masih dapat membaca response legacy.
- Browser fallback selalu ditandai sebagai sumber yang berbeda.
- Request dengan `yaw`/`pitch` valid menghasilkan crop sesuai sudut pandang pengguna; request tanpa body tetap memakai `local_angle`.
- `yaw`/`pitch` tidak valid ditolak tanpa membaca file panorama.
- UI dan log prediction tidak pernah menyebut `identify.conf` bersumber admin sebagai confidence model.

#### Acceptance criteria

- Tidak ada jalur kode yang menulis `predicted_class_id` ke `identify.class_id` atau menjadikannya label efektif untuk materi/kuis, baik di memory maupun persistence.
- Setiap event prediksi resmi dapat ditelusuri ke seluruh versi input yang relevan.
- Migration fresh install dan upgrade lulus beserta rollback/recovery yang disetujui.

### 15.2 Fase 8B — Isolasi Inferensi Classifier dalam Worker

Struktur target:

```text
src/modules/ml/
├── ml.router.ts
├── ml.schema.ts
├── ml.service.ts
├── ml.policy.ts
├── ml.provider.ts
├── ml.worker.ts
├── ml.types.ts
└── ml.evaluation.ts
```

Pekerjaan:

1. Jalankan crop dan inferensi classifier melalui `worker_threads`.
2. Muat model satu kali per worker.
3. Tambahkan timeout dan pembatalan hasil yang sudah kedaluwarsa.
4. Batasi panjang antrean dan concurrency.
5. Kembalikan `503` bila worker/model belum siap tanpa mengganti label terverifikasi.
6. Tambahkan graceful shutdown dan restart worker yang terkontrol.
7. Gunakan cache key terversi dari Fase 8A.
8. Catat latency, timeout, worker restart, dan queue rejection tanpa menulis panorama, token, atau data sensitif ke log.

Test:

- API non-ML tetap responsif saat inferensi berjalan.
- Worker crash tidak mematikan API.
- Timeout menghasilkan response terkontrol dan `decision_status: unavailable`.
- Antrean berlebih ditolak tanpa kehabisan memory.
- Hasil dari request yang dibatalkan tidak ditulis sebagai event sukses.
- Shutdown tidak meninggalkan worker atau promise menggantung.

### 15.3 Fase 8C — TensorFlow.js ke ONNX dengan Parity

1. Buat **golden parity set** dari panorama/node/crop yang ada; set ini hanya menguji kesetaraan runtime, bukan kualitas model.
2. Rekam raw output vector, top class, preprocessing input, dan latency model lama pada environment yang mendukungnya.
3. Konversi classifier yang sama ke ONNX tanpa retraining atau perubahan taxonomy.
4. Jalankan menggunakan `onnxruntime-node` pada worker.
5. Bandingkan raw scores, top class, confidence, preprocessing output, dan latency.
6. Tentukan tolerance numerik sebelum pengujian.
7. Pertahankan provider TensorFlow.js di balik interface yang sama sampai parity lulus.
8. Jalankan shadow comparison pada sampel non-production atau fixture tanpa mengubah response siswa.
9. Hapus `@tensorflow/tfjs-node` hanya setelah seluruh parity, contract, load, dan rollback test lulus.
10. Jalankan `npm audit` ulang.

#### Gate manual

Jika output berbeda di luar tolerance, model eksekutor harus berhenti. Jangan melakukan retraining, memilih model baru, mengubah preprocessing, atau menaikkan tolerance tanpa persetujuan pengguna.

### 15.4 Fase 8D — Decision Policy dan Pengalaman Runtime Hybrid

#### Persiapan evaluasi

1. Buat evaluation manifest yang immutable dan terpisah dari golden parity set.
2. Split dataset berdasarkan panorama/node sumber, dan bila data mencukupi berdasarkan situs, bukan berdasarkan crop acak, agar crop dari sumber yang sama tidak bocor ke train dan test.
3. Tambahkan evaluasi test set eksplisit pada pipeline training.
4. Hasil evaluasi minimal memuat confusion matrix serta precision, recall, dan F1 per kelas. Tambahkan metrik kalibrasi bila confidence ditampilkan sebagai tingkat keyakinan.
5. Laporkan kelas yang tidak memiliki coverage cukup; jangan menyembunyikannya di dalam rata-rata keseluruhan.

#### Kebijakan keputusan

1. Implementasikan `ml.policy.ts` sebagai fungsi deterministik dan teruji.
2. Tentukan threshold dari evaluation set per versi model dan, bila diperlukan, per kelas.
3. Aturan minimal:
   - prediksi tersedia, di atas threshold, dan sama dengan verified label → `match`;
   - prediksi di bawah threshold → `uncertain`;
   - prediksi di atas threshold tetapi berbeda → `mismatch`;
   - model gagal, timeout, atau versi tidak cocok → `unavailable`.
4. Untuk seluruh status, label efektif yang dipakai materi dan kuis tetap `verified_class_id`.
5. UI boleh menampilkan prediksi sebagai informasi tambahan dengan bahasa yang tidak menyamakan confidence dengan akurasi.
6. `uncertain` dan `mismatch` masuk antrean review peneliti/admin; jangan diperlihatkan sebagai kebenaran baru kepada siswa.
7. Laporan penelitian harus dapat memfilter sumber prediksi, versi model, status keputusan, dan kelas terverifikasi.

#### Test wajib

- Boundary test tepat di bawah, sama dengan, dan di atas setiap threshold.
- Match, uncertain, mismatch, dan unavailable mempertahankan label terverifikasi.
- Kuis memilih pertanyaan berdasarkan label terverifikasi, bukan prediksi.
- Confidence model tidak mengambil nilai dari `identify.conf`.
- UI dan log menyebut sumber prediksi serta versi model dengan benar.
- Evaluation pipeline gagal bila manifest test tumpang tindih dengan train/validation berdasarkan source ID.

#### Acceptance criteria

- Tidak ada salah prediksi yang dapat mengubah materi siswa.
- Threshold memiliki artefak evaluasi dan approval yang dapat ditelusuri.
- Hasil test set dan confusion matrix tersimpan sebagai artifact CI/release model.

### 15.5 Fase 8E — Candidate Hotspot dengan Review Admin

Subfase ini baru boleh dimulai setelah Fase 8A–8D selesai dan taxonomy bangun ruang disetujui. Candidate proposal adalah fitur authoring/admin, bukan fitur runtime siswa.

#### Prasyarat data

1. Buat annotation guideline yang membedakan elemen budaya, komponen geometri, dan bentuk gabungan.
2. Anotasi kandidat menggunakan koordinat panorama yang tidak ambigu, minimal `yaw`, `pitch`, dan `fov` atau representasi ekuivalen yang mendukung seam panorama 360°.
3. Simpan reviewer, status review, taxonomy version, asset checksum, dan provenance anotasi.
4. Pisahkan train/validation/test berdasarkan panorama dan situs. Tetapkan jumlah minimum data per kelas serta gate lintas situs sebelum training.
5. Jangan melatih candidate detector dari label folder atau `local_angle` saja bila area objek yang sebenarnya belum dianotasi.

#### Workflow target

```text
panorama terversi
    ↓
candidate detector/proposer
    ↓
proposal { lokasi, top-k kelas, confidence, versi }
    ↓
antrean admin
    ├── accept → buat hotspot terverifikasi
    ├── edit   → simpan perubahan + audit
    └── reject → simpan feedback untuk evaluasi/retraining
```

#### Pekerjaan

1. Evaluasi kandidat pendekatan/model pada dataset representatif; pemilihan model merupakan gate manual dan tidak diasumsikan oleh plan.
2. Jalankan proposal secara asynchronous pada worker dengan timeout, queue limit, dan feature flag default `off`.
3. Tambahkan endpoint admin-only untuk membuat job, melihat proposal, menerima, mengedit, dan menolak proposal.
4. Terapkan authorization, audit log, idempotency, validasi koordinat, dan optimistic concurrency agar review lama tidak menimpa tur yang lebih baru.
5. Penerimaan/edit proposal harus melalui service tur yang sama dengan edit manual dan menghasilkan label terverifikasi baru.
6. Proposal tidak boleh muncul pada JSON/build publik atau UI siswa sebelum diterima.
7. Ukur precision, recall, mAP atau metrik deteksi yang disepakati, false positive per panorama, acceptance/edit/rejection rate admin, dan latency per panorama.
8. Sediakan kill switch dan kemampuan menghapus proposal turunan tanpa menghapus hotspot terverifikasi atau panorama sumber.

#### Test wajib

- Teacher tanpa hak pengelolaan tur tidak dapat mereview proposal.
- Proposal tidak membuat atau mengubah hotspot tanpa tindakan admin eksplisit.
- Accept, edit, reject, retry, dan duplicate job bersifat idempotent.
- Proposal untuk asset/taxonomy versi lama ditolak atau ditandai stale.
- Koordinat di sekitar seam 0°/360° divalidasi dengan benar.
- Worker/job failure tidak mengubah tur.
- Build publik tidak membocorkan proposal pending atau rejected.

#### Acceptance criteria

- Tidak ada auto-publish.
- Seluruh hotspot baru memiliki reviewer dan audit trail.
- Gate metrik yang disetujui tercapai pada test set yang tidak bocor dan mencakup panorama/situs yang representatif.
- Feature flag dapat menonaktifkan proposer tanpa mengganggu classifier runtime.

### Gate manual akhir Fase 8

Eksekutor wajib berhenti dan meminta keputusan pengguna untuk:

- taxonomy dan definisi bagian bangun ruang gabungan;
- siapa yang berwenang menetapkan label terverifikasi;
- threshold per kelas dan metrik minimum classifier;
- tolerance parity TensorFlow.js ke ONNX;
- pendekatan/model candidate proposal;
- jumlah minimum anotasi serta metrik minimum candidate detector;
- apakah prediksi browser boleh masuk laporan penelitian resmi.

---

## 16. Fase 9 — Migrasi Frontend VR

### Sasaran

Gunakan Vite + TypeScript + A-Frame tanpa menulis ulang pengalaman VR.

### Struktur

```text
apps/vr/
├── index.html
├── vr/
├── src/
│   ├── app.ts
│   ├── tour.ts
│   ├── scene-loader.ts
│   ├── api-client.ts
│   ├── session-client.ts
│   └── ml-client.ts
└── vite.config.ts
```

### Urutan

1. Replikasi entry HTML tanpa perubahan tampilan.
2. Migrasikan `scene-loader.js`.
3. Migrasikan `app.js`.
4. Migrasikan `tour.js`.
5. Pisahkan session/API client dari rendering VR.
6. Tambahkan mode:
   - `server`: API aktif;
   - `static`: demo GitHub Pages.
7. Gunakan satu sumber asset canonical.
8. Pertahankan kontrak hybrid: materi dan kuis memakai label terverifikasi; prediksi hanya informasi tambahan.
9. Static mode boleh memakai browser fallback, tetapi harus menandai sumber/versi dan tidak mengirimkannya sebagai telemetry resmi bila versi tidak tervalidasi.
10. Upgrade A-Frame pada task terpisah setelah parity.
11. Jangan migrasikan scene A-Frame ke React.

### E2E minimum

- portal terbuka;
- Prambanan terbuka;
- Borobudur berpindah node;
- informasi geometri terbuka;
- status ML match, uncertain, mismatch, dan unavailable tidak mengubah label terverifikasi;
- kuis bekerja;
- sesi guest bekerja;
- login siswa bekerja;
- static mode tidak menghasilkan request API gagal tanpa batas;
- smoke test desktop dan mobile.

### Acceptance criteria

- Tampilan dan navigasi utama setara dengan frontend lama.
- Build statis dapat dideploy ke GitHub Pages.
- Build server dapat menggunakan API pada origin yang sama.

---

## 17. Fase 10 — Migrasi Admin

Admin baru dibuat di `/admin-v2`. Jangan mengganti admin lama sekaligus.

### Stack

- React
- Vite
- TypeScript
- React Router
- TanStack Query
- Zod contracts
- cookie `HttpOnly`

### Urutan halaman

1. App shell, login, logout, dan API client.
2. Laporan.
3. Kelas dan siswa.
4. Sekolah dan akun.
5. Scene dan object.
6. Tour dan dataset.
7. Review prediction mismatch/uncertain.
8. Review candidate hotspot: accept, edit, reject, stale, dan retry.
9. Team.
10. Settings.

### Aturan

- Satu kelompok halaman per task.
- Gunakan komponen form dan table bersama hanya setelah ada minimal dua penggunaan.
- Jangan gunakan `dangerouslySetInnerHTML`.
- Jangan menyimpan token baru dalam `localStorage`.
- Semua aksi destructive memiliki confirmation dan error state.
- Semua halaman memiliki loading, empty, dan error state.
- UI harus membedakan label terverifikasi, prediksi model, confidence, status keputusan, dan versi model.
- Tidak ada tombol atau bulk action yang dapat mempublikasikan proposal tanpa review eksplisit dan authorization server-side.

### Cutover

1. Jalankan admin lama dan `/admin-v2` secara bersamaan.
2. Lakukan E2E role matrix.
3. Setelah parity, arahkan `/admin` ke build baru.
4. Pertahankan admin lama satu release sebagai rollback.
5. Hapus admin lama pada release berikutnya setelah tidak ada regression.

---

## 18. Fase 11 — Bentuk npm Workspaces

Lakukan setelah backend modular, VR baru, dan admin baru stabil.

### Workspace target

```json
{
  "workspaces": [
    "apps/api",
    "apps/admin",
    "apps/vr",
    "packages/contracts",
    "packages/testing"
  ]
}
```

### Pemindahan

- `src/` ke `apps/api/src/`;
- kontrak Zod ke `packages/contracts/`;
- test helper ke `packages/testing/`;
- pertahankan root `server.js` sebagai shim jika hosting memerlukannya.

### Aturan

- Gunakan satu `package-lock.json`.
- Jangan menghapus `bun.lock` tanpa persetujuan pengguna.
- Pemindahan harus mekanis; jangan mengubah behavior pada PR yang sama.
- Jalankan seluruh test sebelum dan sesudah pemindahan.

### Acceptance criteria

- Root command dapat build seluruh workspace.
- Dependency production dan development terpisah dengan benar.
- Tidak ada import lintas app melalui relative path yang melewati package boundary.

---

## 19. Fase 12 — CI, Deployment, dan Cleanup

### CI wajib

Pipeline menjalankan:

1. `npm ci`;
2. typecheck;
3. lint;
4. unit test;
5. integration test;
6. build;
7. E2E smoke test;
8. dependency audit;
9. artifact verification;
10. ML contract dan decision-policy test pada setiap PR;
11. ML parity/evaluation job dengan Git LFS hanya ketika model, preprocessing, taxonomy, atau dataset manifest berubah, serta dapat dijalankan manual/terjadwal;
12. upload confusion matrix, per-class metrics, calibration report bila dipakai, dan parity report sebagai artifact tanpa mengunggah dataset privat.

### Deployment

- API berjalan pada Node.js LTS + MySQL.
- Admin build dilayani oleh API pada origin yang sama.
- VR server build dilayani oleh API.
- GitHub Pages menerima hanya static VR build.
- Database migration dijalankan sebagai langkah terpisah setelah backup.
- Readiness harus memisahkan status database dan ML.
- Readiness ML classifier dan candidate proposer dilaporkan terpisah; proposer yang dinonaktifkan tidak membuat aplikasi siswa dianggap down.
- Candidate proposer default `off` sampai gate data, metrik, authorization, dan admin review disetujui.

#### Catatan revisi (19 Agustus 2026)

`revision.md` butir E3/E5 (satu alamat produksi berfungsi penuh, manifest aset wajib dengan checksum, smoke test produksi) sudah diverifikasi lebih awal pada Fase R1 sebagai bukti laporan kemajuan klien, sebelum Fase 8–12 dikerjakan. Fase 12 ini mengeraskan hasil tersebut menjadi bagian CI/deployment permanen (readiness terpisah database/ML, manifest aset otomatis pada build), bukan mengulang pembuktian dari nol.

### Cleanup

Hapus file hanya setelah `rg` membuktikan tidak ada referensi:

- duplikasi `js/` dan `public/js/`;
- duplikasi CSS;
- duplikasi JSON;
- admin lama;
- SQLite schema lama bila secara resmi tidak dipakai;
- dependency TensorFlow.js Node setelah ONNX tervalidasi.

Jangan menghapus:

- panorama;
- dataset penelitian;
- model yang masih dibutuhkan untuk reproduksibilitas;
- dataset manifest, annotation guideline, audit review, dan artifact evaluasi model;
- asset Git LFS;
- backup database.

---

## 20. Strategi Test Keseluruhan

### Unit test

Fokus pada:

- validator;
- authorization policy;
- service rules;
- quiz scoring;
- tenant scoping;
- session ownership;
- CSV escaping;
- ML preprocessing;
- cache key versioning;
- decision policy match/uncertain/mismatch/unavailable;
- threshold boundary;
- pemisahan label terverifikasi dan prediksi.

### Integration test

Fokus pada:

- route + middleware + repository;
- transaksi;
- database constraint;
- migration;
- filesystem atomic write;
- upload validation;
- penyimpanan prediction event beserta version metadata;
- ownership dan authorization job/review candidate;
- idempotency accept/edit/reject proposal.

### E2E test

Fokus pada:

- login setiap role;
- pengelolaan sekolah, kelas, dan siswa;
- laporan dan CSV;
- guest/student VR session;
- kuis;
- navigasi scene/tour;
- label terverifikasi tetap tampil pada match, uncertain, mismatch, dan unavailable;
- admin mereview candidate hotspot tanpa proposal pending masuk ke build publik;
- admin cutover.

### Security regression test

Wajib mencakup:

- stored XSS;
- path traversal;
- broken object-level authorization;
- cross-tenant access;
- brute-force login;
- session event forgery;
- oversized upload;
- invalid MIME;
- akses proposal ML lintas role/tenant;
- manipulasi `verified_class_id`, confidence, model version, atau candidate coordinate dari client;
- kebocoran dataset/panorama privat melalui artifact CI atau response API;
- error leakage.

### ML evaluation test

Wajib memisahkan dua tujuan:

- **runtime parity:** raw output TensorFlow.js dan ONNX pada crop yang sama berada dalam tolerance;
- **model quality:** classifier/detector dinilai pada evaluation manifest yang tidak bocor dari train/validation.

Verification minimal:

- source IDs pada train, validation, dan test saling lepas;
- confusion matrix dan precision/recall/F1 per kelas classifier;
- coverage setiap kelas dan situs dilaporkan;
- calibration report bila confidence ditampilkan kepada pengguna;
- metrik candidate detector dan false positive per panorama;
- seluruh artifact menyertakan model, preprocessing, taxonomy, dataset manifest, dan code commit version.

## 21. Data, API, dan Configuration Changes

### Perubahan data terencana

- `sessions.write_token_hash`;
- `accounts.must_change_password`;
- foreign key eksplisit;
- index sesuai query utama;
- migration metadata table;
- metadata prediction event: verified label, decision status, source, model/preprocessing/taxonomy/asset version, dan latency;
- audit candidate hotspot: proposal, status review, reviewer, perubahan, dan versi tour/asset.

### Perubahan API terencana

- Session creation menambahkan write capability token untuk guest.
- Session event memerlukan capability token atau JWT siswa.
- Quiz result tidak mempercayai `is_correct` dari client.
- Auth mulai mendukung cookie aman selama compatibility Bearer masih aktif.
- Endpoint prediksi menambahkan kontrak `verified`, `prediction`, dan `decision` tanpa menghapus field legacy selama compatibility window.
- Endpoint log prediksi tidak mempercayai verified label, decision status, model version, atau confidence yang dikirim client; server mengikatnya ke hasil server atau menandai sumber browser secara eksplisit.
- Endpoint candidate job/review bersifat admin-only, idempotent, terversi, dan tidak pernah auto-publish.
- URL endpoint lainnya dipertahankan.

### Environment target

Nama final harus ditetapkan dalam `env.ts`, tetapi minimal mencakup:

- database host, port, username, password, dan name;
- application port;
- bootstrap admin password atau bootstrap workflow;
- cookie/session secret;
- allowed origin;
- trust proxy;
- ML model path;
- ML timeout dan queue limit;
- ML model, preprocessing, taxonomy, dan dataset manifest version;
- ML threshold configuration per versi/kelas;
- candidate proposer feature flag, model path, timeout, concurrency, dan queue limit;
- static/server frontend mode.

Jangan memberikan nilai default production untuk secret.

## 22. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Route hilang saat ekstraksi | Route inventory dan contract test pada setiap module |
| Kebocoran data lintas tenant | Authorization policy terpusat dan matrix test |
| Migration merusak data | Backup, dry run, orphan audit, restore rehearsal |
| ML memblokir API | Worker thread, timeout, queue limit, circuit breaker sederhana |
| Perbedaan output ONNX | Golden dataset dan tolerance yang disetujui |
| Prediksi ML menimpa materi terverifikasi | Invarian domain, kontrak terpisah, decision-policy test, dan label efektif selalu dari admin |
| Confidence dianggap sebagai probabilitas benar | Evaluasi kalibrasi, bahasa UI yang tepat, dan threshold terversi dari evaluation set |
| Data leakage membuat metrik terlalu optimistis | Split berdasarkan panorama/node/situs dan validasi source ID di pipeline |
| Bentuk candi gabungan memiliki label ambigu | Annotation guideline, taxonomy versioned, dan gate reviewer manusia |
| Candidate detector menghasilkan false positive | Admin review wajib, no auto-publish, metrik false positive per panorama, dan kill switch |
| Proposal lama menimpa tour baru | Asset/tour version check dan optimistic concurrency |
| Frontend lama dan baru drift | Strangler route dan E2E parity sebelum cutover |
| Asset hilang saat cleanup | Referensi `rg`, manifest asset, dan larangan delete LFS |
| Shared hosting tidak mendukung worker/native module | Gate deployment dan fallback service terpisah yang disetujui pengguna |
| Scope migrasi terlalu besar untuk model | Satu subfase per task dan acceptance criteria eksplisit |

## 23. Success Criteria Akhir

Migrasi selesai hanya jika:

- seluruh URL API yang dipertahankan lulus contract test;
- tidak ada route bisnis di entry point;
- backend dapat menyala tanpa ML;
- label terverifikasi tidak pernah ditimpa hasil prediksi;
- match, uncertain, mismatch, dan unavailable memiliki behavior yang teruji dan dapat diaudit;
- kuis dan materi selalu menggunakan verified label;
- setiap prediction event resmi dapat ditelusuri ke model, preprocessing, taxonomy, asset, dan source;
- classifier memiliki test-set report tanpa leakage dan metrik per kelas;
- candidate hotspot tidak pernah dipublikasikan tanpa reviewer;
- error async selalu menghasilkan response terkontrol;
- tidak ada akses lintas sekolah atau lintas guru;
- nilai kuis dihitung server;
- seluruh session event memiliki ownership;
- tidak ada data API mentah dieksekusi melalui `innerHTML`;
- fresh database migration berhasil;
- upgrade migration pada snapshot lama berhasil;
- restore backup berhasil diuji;
- admin dan VR lulus E2E desktop/mobile;
- GitHub Pages static demo tetap berfungsi;
- tidak ada critical/high runtime vulnerability yang reachable;
- CI hijau;
- rollback procedure terdokumentasi dan telah diuji.

## 24. Keputusan Manual yang Masih Diperlukan

Model harus meminta keputusan pengguna sebelum fase terkait jika belum tersedia:

1. Konfirmasi npm sebagai package manager final.
2. Apakah `bun.lock` boleh dihapus setelah npm workspaces stabil.
3. Apakah GitHub Pages tetap dipertahankan sebagai demo statis.
4. Versi MySQL/MariaDB production.
5. Apakah data guest masuk laporan penelitian resmi.
6. Apakah guest boleh memilih sekolah tanpa autentikasi.
7. Domain/origin production untuk cookie.
8. Kemampuan hosting menjalankan worker thread dan ONNX native binding.
9. Tolerance output yang diterima untuk migrasi TFJS ke ONNX.
10. Taxonomy/definisi komponen geometri pada objek budaya yang tersusun dari beberapa bangun ruang.
11. Role atau daftar reviewer yang berwenang menetapkan label terverifikasi.
12. Threshold serta metrik minimum per kelas untuk classifier.
13. Apakah prediksi browser fallback boleh masuk laporan penelitian resmi.
14. Pendekatan/model candidate proposal yang akan diuji.
15. Jumlah minimum anotasi, coverage situs, dan metrik minimum sebelum proposer diaktifkan.
16. Maintenance window dan backup sebelum migration production.

Keputusan tambahan dari integrasi `revision.md` (lihat Bagian 27), wajib diselesaikan sebelum fase R terkait dimulai:

17. B3 — pertahankan kelas `kerucut` dengan data nyata dan anotasi yang sah, atau keluarkan kelas tersebut dari taksonomi, model, kuis, dan UI secara konsisten.
18. C4 — daftar final minimal 15 objek warisan budaya lintas situs, beserta situs asal, kelas geometri, dan bukti rujukan, ditetapkan oleh tim materi.
19. C5 — kurikulum, fase/kelas, capaian pembelajaran, tujuan pembelajaran, dan indikator per objek/area, ditetapkan oleh tim materi.
20. D4 dan D5 — naskah instrumen Draft I pretest-posttest dan kuesioner efikasi diri, kunci/skoring, skala, versi, dan status validasi ahli, diserahkan oleh tim peneliti. Pengembang tidak menulis substansi instrumen.
21. F2 — dasar persetujuan etik, naskah consent orang tua dan assent siswa, data yang boleh dikumpulkan, masa simpan, hak akses, mekanisme penarikan data, dan bentuk ekspor pseudonim, ditetapkan oleh penanggung jawab etik.
22. B6 (revisi) — situs atau dataset pembanding yang sah untuk uji lintas situs dan aturan pemisahan train/validation/test, ditetapkan oleh tim penelitian sebelum Fase R3 menjalankan uji lintas situs.

## 25. Template Prompt untuk Model Eksekutor

Salin template berikut dan ganti placeholder fase:

```text
Kerjakan hanya Fase <nomor dan nama> dari plan-migration.md pada project VR-GeoNusa.

Aturan:
1. Baca seluruh bagian fase aktif, aturan eksekusi global, dan acceptance criteria.
2. Jangan mengerjakan fase berikutnya.
3. Periksa git status terlebih dahulu dan pertahankan semua perubahan pengguna.
4. Jangan mengubah URL atau response API kecuali diwajibkan fase.
5. Jangan menghapus file legacy, data, model, panorama, atau asset Git LFS.
6. Tambahkan atau perbarui test untuk setiap perubahan behavior.
7. Jalankan semua verification yang disebutkan pada fase.
8. Jika keputusan tidak ditentukan oleh plan, berhenti dan tanyakan kepada pengguna.
9. Jangan menganggap task selesai bila test gagal.
10. Untuk Fase 8, jangan menimpa label terverifikasi, jangan menyamakan prediksi dengan ground truth, dan jangan auto-publish candidate hotspot.
11. Setelah selesai, laporkan:
   - file yang berubah;
   - behavior yang berubah;
   - test/verification yang dijalankan dan hasilnya;
   - untuk Fase 8: versi model/preprocessing/taxonomy/dataset manifest dan artifact evaluasi yang digunakan;
   - risiko dan pekerjaan tersisa;
   - apakah acceptance criteria fase telah terpenuhi.
```

## 26. Format Laporan Setiap Fase

```markdown
### Fase yang dikerjakan

<nomor dan nama fase>

### File berubah

- path/file

### Perubahan behavior

- perubahan atau "tidak ada"

### Verification

- command: hasil

### ML evidence (wajib untuk Fase 8)

- model/preprocessing/taxonomy/dataset manifest version
- parity atau evaluation artifact
- threshold dan approval yang digunakan

### Acceptance criteria

- [x] kriteria terpenuhi
- [ ] kriteria belum terpenuhi — alasan

### Risiko tersisa

- risiko

### Rekomendasi langkah berikutnya

Berhenti. Jangan otomatis mengerjakan fase berikutnya.
```

## 27. Integrasi dengan revision.md

### Konteks

`revision.md` (disusun 18 Agustus 2026) adalah daftar revisi klien untuk tahap laporan kemajuan, dengan 29 butir aktif (22 P0, 7 P1) dan fase eksekusinya sendiri, R0–R6. Dokumen tersebut ditulis di atas working tree migrasi yang sedang berjalan dan tidak menyebutkan bagaimana fase R harus disisipkan ke dalam Fase 0–12 pada dokumen ini. Bagian ini mengunci keputusan integrasi sehingga model eksekutor tidak perlu menebak urutan.

### Keputusan sequencing (disetujui pengguna, 19 Agustus 2026)

Selesaikan sisa ekstraksi modul dan migrasi database versioned terlebih dahulu, karena sebagian besar butir revisi mengubah schema atau bergantung pada routing final:

1. Tuntaskan **Fase 6H** (Team) dan **Fase 6I** (Health dan Static Application) — Fase 6I sudah memuat catatan revisi E1.
2. Tuntaskan **Fase 7** (Migrasi database versioned) — sertakan kolom/tabel baru yang dibutuhkan revisi (lihat "Perubahan data" di bawah) sebagai bagian dari migration versioned yang sama, bukan SQL ad hoc terpisah.
3. Jalankan **Fase R0–R6** secara penuh, dengan **Fase R3 digabung ke Fase 8A–8D** (lihat pemetaan di bawah) karena keduanya sama-sama mengubah kontrak `POST /api/ml/predict/:tourId/:nodeId` dan modul dataset. Fase 8E (candidate hotspot) tetap dikerjakan setelah R3/8A–8D selesai, bukan bagian dari R3.
4. Setelah R0–R6 selesai, lanjutkan **Fase 9–12** (VR, admin, workspaces, CI/deployment) seperti rencana semula. Fase 12 sudah memuat catatan revisi yang menegaskan E3/E5 tidak diulang dari nol.

Alasan: butir P0 revisi (konten, keamanan, bukti kinerja model, interaksi VR inti) lebih mendesak untuk laporan kemajuan klien daripada sisa pekerjaan Fase 9–12 yang sifatnya migrasi frontend/admin dan pembersihan. Aturan "satu fase per task" pada Bagian 5 tetap berlaku di dalam urutan ini.

### Pemetaan fase R terhadap dokumen ini

| Fase R | Butir | Hubungan dengan Fase 0–12 |
|---|---|---|
| R0 | Baseline dan bukti awal | Melengkapi, bukan mengulang, Fase 0 dan Fase 2. Fokus pada validator konten dan characterization test khusus butir revisi. |
| R1 | C1, B3, E1, E3, E4, E5, D1, D6 | E1 sudah disisipkan ke Fase 6I. E3/E5 diverifikasi di sini lalu dikeraskan di Fase 12. D1, D6, E4 hanya perlu test regresi karena sudah diimplementasikan (Fase 3D, 3C, 3B). B3 adalah gate manual (Bagian 24 butir 17) sebelum R3/Fase 8 dataset dikerjakan. |
| R2 | A1–A4 | Tidak beririsan dengan Fase 0–12; murni fitur VR baru, dikerjakan sebelum Fase 9 (migrasi frontend VR) agar tidak dibangun dua kali di stack lama lalu dipindah. |
| R3 | B1, B2, B4, B5, B6, B7, penyelesaian B3 | **Digabung dengan Fase 8A–8D.** B1 membuka kembali modul dataset Fase 6F (lihat catatan revisi di 13.6). B5 dan B7 sudah disisipkan ke pekerjaan dan test Fase 8A. B6 butuh keputusan Bagian 24 butir 22 sebelum uji lintas situs. |
| R4 | A5, C2, C3, C4, C5, D2, D4, D5 | C4, C5, D4, D5 adalah gate manual (Bagian 24 butir 18–20). A5 memakai mode transparan dari Fase R2 (A3), dikerjakan sebelum Fase 9 dengan alasan sama seperti R2. |
| R5 | F2, F5, E2 | F2 adalah gate manual (Bagian 24 butir 21). F5 (Laporan Teknis Desain ML) menjadi artifact tambahan untuk Fase 8's evaluation report (Bagian 20). E2 beririsan dengan Fase 12 cleanup — jangan hapus file legacy pada R5, cukup keluarkan dari route/build aktif sesuai Bagian 5 aturan 5. |
| R6 | Verifikasi akhir 29 butir | Setara cakupan dengan Fase 12 tetapi untuk butir revisi klien. Jalankan setelah R1–R5, sebelum Fase 9 dimulai, agar laporan kemajuan tidak menunggu migrasi frontend/admin selesai. |

### Konflik yang teridentifikasi dan resolusinya

1. **E1 dijadwalkan lebih awal oleh klien (R1) tetapi awalnya ditempatkan di Fase 6I (akhir Fase 6).** Resolusi: dipertahankan di Fase 6I karena urutan asli sudah cukup dekat (6H → 6I), tetapi persyaratan teknis eksplisit dari `revision.md` (urutan middleware `/data` sebelum `express.static`) ditambahkan ke Fase 6I agar tidak lagi ambigu.
2. **E3/E5 (kesiapan produksi) adalah P0 klien tetapi aslinya hanya ada di Fase 12 (fase terakhir).** Resolusi: dibuktikan lebih awal di Fase R1, dikeraskan menjadi bagian CI permanen di Fase 12. Lihat catatan revisi pada kedua fase.
3. **B1 (anotasi bounding box per objek) menyiratkan modul dataset perlu diubah, padahal Fase 6F sudah selesai.** Resolusi: dicatat eksplisit di Fase 6F bahwa pekerjaan lanjutan terjadi di Fase R3/8, tanpa mengulang validasi yang sudah lulus.
4. **B5 (prediksi sudut pandang bebas) dan B7 (confidence admin bukan confidence model) tidak ada di kontrak Fase 8A awal.** Resolusi: ditambahkan sebagai pekerjaan dan test eksplisit di Fase 8A.
5. **Gate keputusan manual B3, C4, C5, D4/D5, F2 tidak ada di Bagian 24 versi awal.** Resolusi: ditambahkan sebagai butir 17–22 di Bagian 24.
6. **Perubahan schema database untuk revisi (instrumen, consent, metadata dataset/objek) tidak disebutkan di Fase 7.** Resolusi: lihat "Perubahan data" di bawah; seluruh migrasi tersebut mengikuti disiplin Fase 7 (Drizzle, review manual, gate manual sebelum production) dan tidak boleh dijalankan sebagai SQL ad hoc di luar migration versioned.
7. **R0 tumpang tindih dengan Fase 0/2 (baseline dan characterization test).** Resolusi: R0 diperlakukan sebagai pelengkap terarah pada 29 butir revisi, bukan pengulangan baseline arsitektur yang sudah selesai.

### Perubahan data tambahan untuk Fase 7

Selain kolom yang sudah direncanakan di Bagian 14 dan Bagian 21, migration versioned pada Fase 7 harus turut menyediakan ruang untuk:

- metadata objek budaya: approximation note (C2), hubungan budaya-geometri (C3), tujuan kurikulum (C5);
- metadata dataset per objek: `object_id`, bounding box ternormalisasi, sudut kamera, kualitas anotasi, annotator/reviewer pseudonim, versi taksonomi (B1);
- metadata model: model version, taxonomy version, dataset manifest hash, metrik evaluasi, latensi (B6);
- tabel definisi instrumen, administrasi instrumen, dan respons (D4, D5), dengan `respondent_code` pseudonim;
- tabel/mapping consent dan audit trail (F2), terpisah aksesnya dari tabel hasil penelitian.

Struktur dan isi pastinya menunggu keputusan manual Bagian 24 butir 18–21 sebelum schema final ditulis.

### Dokumen sumber

Isi lengkap butir, prioritas, dan bukti laporan ada di `revision.md`. Dokumen tersebut tetap menjadi rujukan detail per butir; bagian ini hanya mengunci titik integrasi dan urutan eksekusi terhadap dokumen ini.
