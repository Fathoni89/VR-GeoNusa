# VR-GeoNusa

**Integrasi Machine Learning dan Virtual Reality untuk Preservasi Digital dan Identifikasi Cerdas Geometri pada Warisan Budaya Nusantara**

Hibah Penelitian Fundamental — BIMA Kemenristekdikti 2026–2027

---

## Tim Peneliti

| Nama | Peran | Institusi |
|------|-------|-----------|
| Fitria Sulistyowati | Ketua Pengusul | UST |
| Betty Kusumaningrum | Anggota 1 | UST |
| Fathoni Mahardika | Anggota 2 (Informatika) | Universitas Sebelas April |
| Ahmad Taupik Paisal | Mahasiswa (Informatika) | Universitas Sebelas April |
| Moch. Sugih Nugraha | Mahasiswa (Informatika) | Universitas Sebelas April |
| Elisa Silvi Ardita | Mahasiswa (Pend. Matematika) | UST |
| Farah Luqen Nur Aini | Mahasiswa (Pend. Matematika) | UST |

---

## Tentang Proyek

VR-GeoNusa adalah aplikasi web (Node.js + MySQL, bukan lagi situs statis) untuk membantu siswa SMP memahami geometri bangun ruang lewat eksplorasi Virtual Reality berbasis web (WebXR) di dua situs warisan budaya:

- **Candi Borobudur** — tur 360° dari **foto panorama asli** (dokumentasi RICOH THETA V, 2018 — 12 area, 60 titik pandang), dengan identifikasi elemen geometri lewat Machine Learning.
- **Candi Prambanan** — scene WebXR dengan objek geometri primitif interaktif.

Di setiap titik, siswa bisa mengidentifikasi bentuk geometri elemen candi (stupa → setengah bola, teras → balok, pilar → tabung, dsb), melihat rumus & konteks budayanya, lalu menjawab kuis pemahaman. Sistem mendukung **login siswa sungguhan** (bukan cuma nama bebas), **multi-sekolah**, dan **dashboard guru** untuk memantau aktivitas dan hasil belajar kelasnya — dirancang untuk uji coba pilot ke beberapa sekolah dengan ratusan siswa.

## Fitur Utama

- **Tur 360° Borobudur** — navigasi node-to-node dari foto panorama asli, identifikasi geometri per titik, kuis pemahaman, kontrol keyboard/klik.
- **Scene Prambanan** — eksplorasi WebXR objek geometri primitif (A-Frame), kuis pemahaman.
- **Login siswa sungguhan** — nomor induk + password per sekolah (dibuat guru, bukan pendaftaran bebas), atau mode Tamu untuk demo publik tanpa akun. Siswa yang login bisa melihat kembali riwayat sesi & akurasi kuisnya sendiri ("Hasil Belajar Saya").
- **Machine Learning identifikasi geometri** — inferensi berjalan di server (TensorFlow.js Node, model MobileNetV2 hasil transfer learning), dengan fallback ke model yang sama berjalan di browser kalau server tidak terjangkau.
- **Dashboard Guru** — rekap sesi eksplorasi, akurasi kuis per soal, interaksi per elemen geometri, dan **rekomendasi tindak lanjut otomatis per konsep geometri** (mis. "siswa masih kesulitan dengan konsep Tabung, disarankan contoh konkret tambahan").
- **Multi-sekolah & multi-peran** — `super_admin` (semua sekolah), `school_admin` (kelola guru & kelas di sekolahnya sendiri), `teacher`/guru (kelasnya sendiri), semuanya diskop dan ditegakkan di server, bukan cuma disembunyikan di tampilan.
- **Admin panel** — kelola scene & objek geometri, tur 360°, kelas & siswa (termasuk impor massal), sekolah & akun guru, laporan, ekspor CSV, dan profil tim peneliti.

## Cara Menjalankan Lokal

**Prasyarat:** Node.js 22 LTS dan MySQL/MariaDB.

```bash
git clone https://github.com/Fathoni89/VR-GeoNusa.git
cd VR-GeoNusa
npm install
```

Buat database + user MySQL, lalu salin `.env.example` menjadi `.env` dan isi kredensialnya:

```bash
cp .env.example .env
# edit .env — isi DB_HOST, DB_USER, DB_PASSWORD, DB_NAME,
# serta BOOTSTRAP_ADMIN_PASSWORD untuk database kosong atau upgrade admin legacy
```

Jalankan server (skema tabel dan akun `super_admin` default dibuat otomatis saat pertama kali jalan):

```bash
node server.js
```

Perintah verifikasi dan build campuran JavaScript/TypeScript:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Hasil build berada di `dist/` dan dapat dijalankan dengan `npm run start:build`.
Entry point lama `node server.js` tetap tersedia sebagai rollback.

Pada database kosong atau saat migrasi akun `admin` versi lama, password awal
berasal dari `BOOTSTRAP_ADMIN_PASSWORD` dan wajib diganti setelah login pertama.

| Halaman | Alamat |
|---|---|
| Portal utama | http://localhost:4000 |
| Tur 360° Borobudur | http://localhost:4000/vr/tour-borobudur.html |
| Admin Panel | http://localhost:4000/admin |

Untuk langkah lebih detail (troubleshooting, dan panduan deploy ke hosting produksi) lihat [`CARA-MENJALANKAN.md`](CARA-MENJALANKAN.md).

Untuk panduan penggunaan lengkap dengan screenshot tiap menu (portal, tur VR, dan admin panel) lihat [`PANDUAN-PENGGUNAAN.md`](PANDUAN-PENGGUNAAN.md).

## Struktur Repository

```
VR-GeoNusa/
├── server.js                 # Backend Express — auth, API, admin, ML endpoint
├── db/
│   └── schema.mysql.sql      # Skema database MySQL/MariaDB
├── ml/
│   └── predict.js            # Inferensi ML server-side (TensorFlow.js Node)
├── ml-model/                 # Model terlatih (MobileNetV2 hasil transfer learning)
├── MLTraining/                # Pipeline training Python (dataset, train, convert ke TF.js)
├── public/
│   ├── index.html            # Portal utama
│   ├── admin/index.html      # Admin panel (SPA)
│   ├── vr/
│   │   ├── tour-borobudur.html   # Tur 360° Borobudur
│   │   └── prambanan.html        # Scene Prambanan (WebXR primitif)
│   ├── js/
│   │   ├── tour.js           # Logika tur 360° + ML client-side + kuis
│   │   └── app.js            # Logika scene primitif (Prambanan)
│   ├── css/ui.css            # Styling UI overlay
│   ├── data/                 # Data scene/tur/kuis (JSON)
│   └── assets/panorama/      # Foto panorama 360° Borobudur
└── data/                     # Sumber data JSON (disinkron ke public/data/)
```

## Stack Teknis

- **Backend:** Node.js + Express, MySQL/MariaDB (`mysql2`), autentikasi JWT + bcrypt, rate limiting.
- **Frontend VR:** A-Frame 1.5.0 (WebXR) — kompatibel Chrome, Firefox, Edge, Quest Browser, Pico Browser.
- **Machine Learning:** MobileNetV2 (transfer learning, dilatih offline dengan Python/Keras), dikonversi ke TensorFlow.js — inferensi server-side (`@tensorflow/tfjs-node`) dengan fallback client-side (`tfjs`) di browser.
- **Target deployment:** hosting shared dengan dukungan Node.js + MySQL (mis. Rumahweb paket Medium ke atas) — lihat [`CARA-MENJALANKAN.md`](CARA-MENJALANKAN.md) untuk panduan deploy.

## Roadmap

| Tahap | Status |
|---|---|
| Prototype WebXR (scene Borobudur & Prambanan) | ✅ Selesai |
| Tur 360° Borobudur dari foto panorama asli + identifikasi ML | ✅ Selesai |
| Backend multi-sekolah, login siswa sungguhan, dashboard guru | ✅ Selesai |
| Uji coba pilot beberapa sekolah | 🔲 Berjalan |
| Model 3D fotogrametri / GLTF asli untuk situs lain | 🔲 Planned |
| Migrasi ke Unity XR (Tahun 2) | 🔲 Planned |

---

*WebXR dipilih sebagai platform utama karena kendala perangkat mahasiswa dan anggaran penelitian — tidak butuh instalasi maupun GPU khusus, bisa diakses langsung lewat browser di laptop maupun smartphone peserta pilot.*
