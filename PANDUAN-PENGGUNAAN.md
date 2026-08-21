# Panduan Penggunaan VR-GeoNusa

Buku panduan penggunaan software **VR-GeoNusa** — aplikasi pembelajaran geometri berbasis Virtual Reality dan Machine Learning, menjelajahi Candi Borobudur dan Candi Prambanan.

> **Catatan URL:** Panduan ini menampilkan alamat produksi `https://vr-geonusa.my.id/` sebagai alamat resmi aplikasi. Domain ini **masih dalam proses deployment** — screenshot pada panduan ini diambil dari server pengembangan, namun seluruh alamat ditulis dalam bentuk final yang akan digunakan setelah aplikasi live. Untuk menjalankan di komputer sendiri selama masa pengembangan, lihat [`CARA-MENJALANKAN.md`](CARA-MENJALANKAN.md).

---

## Daftar Isi

1. [Tentang Sistem Ini](#tentang-sistem-ini)
2. [Peran Pengguna](#peran-pengguna)
3. [Bagian 1 — Panduan Pengguna (Portal & Tur VR)](#bagian-1--panduan-pengguna-portal--tur-vr)
   - [1.1 Portal Utama](#11-portal-utama)
   - [1.2 Tur 360° Candi Borobudur](#12-tur-360-candi-borobudur)
   - [1.3 Scene Candi Prambanan](#13-scene-candi-prambanan)
4. [Bagian 2 — Panduan Admin Panel](#bagian-2--panduan-admin-panel)
   - [2.1 Login Admin](#21-login-admin)
   - [2.2 Objek Scene](#22-objek-scene)
   - [2.3 Kelola Scene](#23-kelola-scene)
   - [2.4 Tur 360°](#24-tur-360)
   - [2.5 Kelas & Siswa](#25-kelas--siswa)
   - [2.6 Laporan Guru](#26-laporan-guru)
   - [2.7 Sekolah & Akun Guru](#27-sekolah--akun-guru)
   - [2.8 Katalog Geometri](#28-katalog-geometri)
   - [2.9 Export & Backup](#29-export--backup)
   - [2.10 Tim Peneliti](#210-tim-peneliti)
   - [2.11 Pengaturan](#211-pengaturan)
5. [Lampiran — Ringkasan Alamat & Akun](#lampiran--ringkasan-alamat--akun)

---

## Tentang Sistem Ini

VR-GeoNusa terdiri dari dua bagian:

- **Portal & Tur VR** (frontend) — halaman publik yang diakses siswa/pengunjung untuk menjelajahi Candi Borobudur (foto 360° asli) dan Candi Prambanan (scene WebXR), mengidentifikasi bentuk geometri tiap elemen candi, dan mengerjakan kuis pemahaman.
- **Admin Panel** (backend) — halaman khusus untuk tim peneliti, admin sekolah, dan guru mengelola konten, kelas, siswa, dan melihat laporan hasil belajar.

---

## Peran Pengguna

| Peran | Bisa Mengakses | Contoh Penggunaan |
|---|---|---|
| **Pengunjung / Tamu** | Portal & Tur VR (tanpa login) | Demo publik, uji coba tanpa akun |
| **Siswa** | Tur VR (login nomor induk + password) + "Hasil Belajar Saya" | Siswa peserta pilot penelitian |
| **Guru** | Admin Panel: Kelas & Siswa (kelasnya sendiri), Laporan Guru, Pengaturan | Guru pengampu di satu kelas |
| **Admin Sekolah** | Admin Panel: Kelas & Siswa (semua kelas sekolahnya), Sekolah & Akun Guru (akun guru sekolahnya), Laporan Guru, Pengaturan | Koordinator sekolah peserta pilot |
| **Super Admin** | Seluruh menu Admin Panel, semua sekolah | Tim peneliti / pengelola sistem |

---

## Bagian 1 — Panduan Pengguna (Portal & Tur VR)

### 1.1 Portal Utama

**Alamat:** `https://vr-geonusa.my.id/`

Halaman pertama yang dilihat pengunjung — ringkasan proyek, jumlah destinasi VR, dan tombol untuk mulai eksplorasi.

![Portal Utama](docs/panduan-screenshots/01-portal-utama.jpg)

Klik **"Mulai Eksplorasi"** untuk masuk ke Candi Borobudur, atau gunakan menu **Destinasi** untuk memilih candi lain.

---

### 1.2 Tur 360° Candi Borobudur

**Alamat:** `https://vr-geonusa.my.id/vr/tour-borobudur.html`

Tur ini dibangun dari **foto panorama 360° asli** (dokumentasi RICOH THETA V, 2018 — 12 area, 60 titik pandang) — bukan model 3D buatan, jadi tampilannya sesuai kondisi nyata candi.

#### Masuk sebagai Tamu

Mode default. Nama dan sekolah bersifat opsional — cocok untuk demo publik tanpa perlu akun.

![Splash Borobudur - Mode Tamu](docs/panduan-screenshots/02-splash-borobudur-tamu.jpg)

#### Masuk sebagai Siswa (Login Sungguhan)

Klik tab **"Login Siswa"** untuk masuk memakai **nomor induk dan password** yang dibuat oleh guru (lihat [2.5 Kelas & Siswa](#25-kelas--siswa)). Dengan mode ini, sesi eksplorasi dan hasil kuis tercatat atas nama siswa yang sebenarnya, dan siswa bisa melihat kembali riwayat belajarnya sendiri.

![Splash Borobudur - Login Siswa](docs/panduan-screenshots/03-splash-borobudur-login-siswa.jpg)

#### Eksplorasi & Navigasi

Setelah masuk, siswa bisa melihat sekeliling (gerakkan mouse / usap layar), berpindah titik pandang lewat lingkaran **"Maju"/"Mundur"**, atau melompat langsung ke area tertentu lewat menu di kanan atas. Kontrol keyboard: `↑/W` maju, `↓/S` mundur, `←→/AD` menoleh.

![Eksplorasi Tur Borobudur](docs/panduan-screenshots/04-tur-borobudur-eksplorasi.jpg)

#### Identifikasi Geometri

Setiap area punya penanda oranye **"Identifikasi"**. Mengarahkan kursor ke penanda ini memicu **Machine Learning** (berjalan di server, dengan cadangan model di browser) untuk mengenali bentuk geometri elemen candi di titik itu — lengkap dengan nama bentuk, sifat-sifatnya (sisi/rusuk/titik sudut), rumus volume & luas, confidence score ML, dan konteks budayanya.

![Panel Identifikasi Geometri](docs/panduan-screenshots/05-tur-borobudur-identifikasi.jpg)

#### Uji Pemahaman (Kuis)

Dari panel identifikasi, klik **"Uji Pemahaman"** untuk menjawab soal terkait bentuk geometri yang baru dikenali. Hasilnya (benar/salah, waktu jawab) ikut tercatat untuk laporan guru.

![Panel Kuis Pemahaman](docs/panduan-screenshots/06-tur-borobudur-kuis.jpg)

#### Melihat Hasil Belajar Sendiri

Siswa yang masuk lewat **Login Siswa** akan melihat tombol **"📊 Hasil Saya"** di pojok kanan atas begitu tur dimulai. Panel ini menampilkan jumlah sesi, akurasi kuis, jumlah kuis dijawab, jumlah interaksi, dan riwayat jawaban kuis terbaru — semuanya diskop otomatis ke akun siswa yang sedang login, tidak bisa melihat hasil siswa lain.

![Hasil Belajar Saya](docs/panduan-screenshots/07-tur-borobudur-hasil-saya.jpg)

---

### 1.3 Scene Candi Prambanan

**Alamat:** `https://vr-geonusa.my.id/vr/prambanan.html`

Scene WebXR dengan objek geometri primitif (belum berupa foto 360° asli seperti Borobudur). Alur penggunaannya sama: pilih mode Tamu/Login Siswa di splash screen, lalu jelajahi dengan WASD + mouse.

![Splash Prambanan](docs/panduan-screenshots/08-splash-prambanan.jpg)

Arahkan kursor ke objek yang bercahaya dan tahan sebentar untuk memicu identifikasi geometrinya — sama seperti di Borobudur, lengkap dengan panel info dan tombol Uji Pemahaman.

![Identifikasi di Prambanan](docs/panduan-screenshots/09-prambanan-identifikasi.jpg)

---

## Bagian 2 — Panduan Admin Panel

**Alamat:** `https://vr-geonusa.my.id/admin`

### 2.1 Login Admin

Semua peran staf (Guru, Admin Sekolah, Super Admin) masuk lewat halaman yang sama menggunakan username & password masing-masing. Sistem otomatis menyesuaikan menu yang muncul sesuai peran akun setelah login.

![Halaman Login Admin](docs/panduan-screenshots/10-admin-login.jpg)

Menu sidebar yang tampil berbeda-beda tergantung peran — lihat tabel [Peran Pengguna](#peran-pengguna) di atas. Bagian-bagian berikut ditulis dari sudut pandang **Super Admin** (yang melihat semua menu), dengan catatan perbedaan tampilan untuk Guru dan Admin Sekolah di bagian yang relevan.

---

### 2.2 Objek Scene

*Khusus Super Admin.*

Menambah, mengedit, atau menghapus objek geometri di dalam sebuah scene VR — termasuk jenis bentuk (box/sphere/cylinder/cone), posisi, warna, dan data edukasi (rumus, konteks budaya, confidence).

![Manajemen Objek Scene](docs/panduan-screenshots/11-admin-objek-scene.jpg)

---

### 2.3 Kelola Scene

*Khusus Super Admin.*

Menambah destinasi/candi baru selain Borobudur dan Prambanan, atau menghapus scene yang sudah ada (kecuali scene bawaan). Setiap scene baru otomatis mendapat halaman VR sendiri.

![Kelola Scene](docs/panduan-screenshots/12-admin-kelola-scene.jpg)

---

### 2.4 Tur 360°

*Khusus Super Admin.*

Daftar semua tur foto 360° yang tersedia (saat ini: Candi Borobudur).

![Daftar Tur 360°](docs/panduan-screenshots/13-admin-tur360-list.jpg)

Klik salah satu tur untuk masuk ke halaman detail — mengelola titik identifikasi geometri per node foto, termasuk sudut crop yang dipakai model ML.

![Detail Tur 360° Borobudur](docs/panduan-screenshots/14-admin-tur360-detail.jpg)

---

### 2.5 Kelas & Siswa

Halaman ini yang membuat siswa punya **login sungguhan** (nomor induk + password), bukan sekadar isi nama bebas. Tampilannya berbeda menurut peran:

**Sudut pandang Super Admin** — melihat semua kelas di semua sekolah (tidak bisa menambah kelas sendiri, karena super admin tidak mengajar):

![Kelas & Siswa - Super Admin](docs/panduan-screenshots/15-admin-kelas-siswa-superadmin.jpg)

Klik **"Kelola Siswa"** pada salah satu kelas untuk membuka rosternya — di sini guru/admin sekolah bisa **impor siswa secara massal** (satu baris per siswa: `Nama, Nomor Induk`), dan sistem otomatis membuatkan password untuk tiap siswa (ditampilkan **sekali saja** setelah dibuat — catat dan bagikan segera ke siswa).

![Roster Kelas & Impor Massal Siswa](docs/panduan-screenshots/16-admin-kelas-siswa-roster.jpg)

**Sudut pandang Guru** — hanya melihat kelas yang diampunya sendiri, dan bisa langsung menambah kelas baru untuk dirinya:

![Kelas & Siswa - Guru](docs/panduan-screenshots/23-admin-kelas-siswa-guru.jpg)

**Sudut pandang Admin Sekolah** — melihat *semua* kelas di sekolahnya (bukan cuma satu guru), dan saat menambah kelas baru wajib memilih guru pengampunya (karena admin sekolah sendiri tidak mengajar).

---

### 2.6 Laporan Guru

Rekap aktivitas eksplorasi dan kuis siswa — jumlah sesi, siswa unik, rata-rata durasi, akurasi kuis, dan total interaksi. Guru dan Admin Sekolah otomatis hanya melihat data sekolahnya sendiri; Super Admin bisa memfilter per sekolah atau melihat semua.

Bagian **"Rekomendasi per Konsep Geometri"** menganalisis akurasi kuis per konsep (Balok, Tabung, Kerucut, dst.) dan memberi saran tindak lanjut otomatis — mis. *"Sebagian besar siswa masih kesulitan dengan konsep Tabung, disarankan memberi contoh konkret tambahan."*

![Laporan Guru dengan Rekomendasi per Konsep](docs/panduan-screenshots/17-admin-laporan-guru.jpg)

Laporan bisa diekspor ke CSV lewat tombol **"Export CSV"** di pojok kanan atas, untuk analisis lebih lanjut di Excel/SPSS.

---

### 2.7 Sekolah & Akun Guru

Tampilan menu ini berbeda tergantung peran:

**Sudut pandang Super Admin** — mengelola daftar sekolah peserta pilot (tambah/hapus) dan semua akun staf (Guru maupun Admin Sekolah) di seluruh sekolah:

![Sekolah & Akun Guru - Super Admin](docs/panduan-screenshots/18-admin-sekolah-akun-guru-superadmin.jpg)

**Sudut pandang Admin Sekolah** — tidak bisa menambah/menghapus sekolah, hanya mengelola akun guru **di sekolahnya sendiri**:

![Sekolah & Akun Guru - Admin Sekolah](docs/panduan-screenshots/24-admin-sekolah-akun-guru-adminsekolah.jpg)

*(Guru tidak memiliki akses ke menu ini sama sekali.)*

---

### 2.8 Katalog Geometri

*Khusus Super Admin.*

Referensi cepat sifat-sifat bangun ruang (jumlah sisi, rusuk, titik sudut, rumus volume & luas) — dipakai sebagai acuan saat mengisi form objek scene.

![Katalog Geometri](docs/panduan-screenshots/19-admin-katalog-geometri.jpg)

---

### 2.9 Export & Backup

*Khusus Super Admin.*

Mengunduh data scene dalam format JSON, untuk keperluan backup atau deploy statis (mis. GitHub Pages).

![Export & Backup](docs/panduan-screenshots/20-admin-export-backup.jpg)

---

### 2.10 Tim Peneliti

*Khusus Super Admin.*

Mengelola profil anggota tim peneliti yang ditampilkan di halaman portal — nama, peran, institusi, foto, dan deskripsi singkat.

![Manajemen Tim Peneliti](docs/panduan-screenshots/21-admin-tim-peneliti.jpg)

---

### 2.11 Pengaturan

Tersedia untuk semua peran staf — mengganti password akun sendiri.

![Pengaturan Akun](docs/panduan-screenshots/22-admin-pengaturan.jpg)

---

## Lampiran — Ringkasan Alamat & Akun

| Halaman | Alamat |
|---|---|
| Portal Utama | `https://vr-geonusa.my.id/` |
| Tur 360° Borobudur | `https://vr-geonusa.my.id/vr/tour-borobudur.html` |
| Scene Prambanan | `https://vr-geonusa.my.id/vr/prambanan.html` |
| Admin Panel | `https://vr-geonusa.my.id/admin` |

> Akun login (username/password) tidak dicantumkan di sini untuk alasan keamanan — hubungi tim peneliti/pengelola sistem untuk mendapatkan akses. Detail teknis instalasi dan konfigurasi ada di [`CARA-MENJALANKAN.md`](CARA-MENJALANKAN.md).
