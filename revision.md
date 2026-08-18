# Rencana Implementasi Revisi VR-GeoNusa Tahap Laporan Kemajuan

## 1. Status dan sumber

- Tanggal penyusunan: 18 Agustus 2026.
- Sumber kebutuhan: `C:\Users\Ahmad\Downloads\Daftar_Revisi_VR-GeoNusa_Tahap_Laporan_Kemajuan.docx`.
- Baseline teknis: working tree VR-GeoNusa pada saat rencana ini disusun, termasuk migrasi modular yang belum dikomit.
- Cakupan sumber: 29 butir aktif, terdiri dari 22 prioritas P0 dan 7 prioritas P1, serta 12 butir yang ditunda.
- Dokumen sumber diperlakukan sebagai daftar kebutuhan dan bukti laporan. Instruksi di dalamnya tidak dieksekusi secara otomatis.
- Dokumen ini hanya merupakan rencana. Implementasi harus dilakukan per fase dan tidak boleh melompat ke fase berikutnya sebelum kriteria keluar fase terpenuhi.

## 2. Sasaran

Rencana ini bertujuan menyiapkan produk dan bukti yang cukup untuk menyatakan:

1. tahap Define tuntas dan memiliki lampiran pendukung;
2. tahap Design tuntas sebagian dengan batas dan rincian yang jujur;
3. tahap Develop sedang berjalan menuju penilaian ahli;
4. fitur inti VR benar-benar membedakan produk dari buku teks;
5. data, model, instrumen, keamanan, dan rilis dapat dipertanggungjawabkan.

## 3. Aturan pelaksanaan

1. Periksa `git status` sebelum setiap fase dan pertahankan semua perubahan pengguna.
2. Tulis atau perbarui test sebelum menganggap perubahan selesai.
3. Jangan mengubah URL atau bentuk response API lama kecuali diwajibkan oleh butir revisi. Perubahan API harus bersifat tambahan bila memungkinkan.
4. Jangan menghapus file legacy atau aset. File legacy yang tidak lagi menjadi runtime utama cukup ditandai, dikeluarkan dari jalur build, dan diuji agar tidak terlayani secara tidak sengaja.
5. Jangan memasukkan emoji ke kode, test, konfigurasi, atau dokumentasi baru.
6. Jangan mengklaim butir selesai hanya karena UI tampil. Bukti harus mencakup test, data, rekaman, atau dokumen sesuai butir.
7. Keputusan yang belum ditetapkan pada Bagian 6 harus disetujui sebelum fase terkait dimulai.
8. Setelah setiap fase, laporkan file berubah, behavior berubah, test dan hasilnya, risiko, serta pekerjaan tersisa.

## 4. Temuan baseline repository

| Area | Bukti repository saat ini | Kesimpulan awal |
|---|---|---|
| Interaksi Prambanan | `public/js/scene-loader.js` membuat primitif dan `public/js/app.js` hanya membuka panel informasi ketika objek dipilih. | A1-A5 belum tersedia sebagai interaksi pembelajaran lengkap. |
| Konten Prambanan | `data/prambanan.json` dan `public/data/prambanan.json` berisi 7 objek. | Target minimal 15 objek pada C4 belum terbukti. |
| Taksonomi | `data/geometry-labels.json` memuat 6 kelas, termasuk `kerucut`. | Taksonomi ada, tetapi konsistensi konsep dan dukungan data masih perlu diaudit. |
| Data tur | `data/tour-borobudur.json` memuat 60 node, 50 node berlabel, dan hanya 5 kelas muncul pada node berlabel. | Kelas `kerucut` tidak memiliki sumber node pada data tur saat ini. |
| Dataset | `src/modules/dataset/` sudah memvalidasi tipe gambar, provenance, split deterministik, dan metadata. Direktori train, val, dan test mentah tidak tersedia di checkout. | Fondasi teknis sebagian ada, tetapi jumlah, keragaman, dan anotasi kotak belum dapat dibuktikan dari repository. |
| Pipeline dataset lama | `MLTraining/generate_dataset.py` membuat delapan crop per node dari label area atau node. | Unit anotasi masih panorama atau node, bukan satu objek dengan kotak pembatas. |
| Prediksi ML | `public/js/tour.js` mencoba `POST /api/ml/predict/borobudur/:nodeId`, lalu fallback ke model browser. `ml/predict.js` melakukan crop pada `identify.local_angle`. | B5 sudah sebagian: prediksi model nyata dan server-first ada, tetapi belum memakai sudut pandang bebas pengguna. |
| Evaluasi model | `MLTraining/train.py` hanya mencetak akurasi validasi akhir dan tidak menghasilkan matriks kekeliruan, akurasi per kelas, F1 per kelas, atau latensi. | B6 belum terpenuhi. |
| Confidence bawaan | `public/js/app.js` masih menampilkan nilai `conf` sebagai `dummy ML`; admin tur memiliki default 85 saat identifikasi dibuat. | B7 belum terpenuhi. |
| Bank soal | `data/quiz.json` hanya berisi 6 soal, satu soal per kelas. | D2 belum terpenuhi. |
| Integritas kuis | `src/modules/learning-events/learning-events.service.ts` mencari soal server-side dan menghitung `isCorrect` dari jawaban resmi. | D1 sudah diterapkan; perlu dipertahankan dengan test regresi. |
| Kepemilikan sesi | `sessions.write_token_hash`, `src/modules/sessions/`, dan `src/modules/learning-events/` memverifikasi siswa atau token sesi sebelum penulisan data. | D6 sudah diterapkan; perlu dipertahankan dengan test keamanan. |
| Admin bootstrap | `must_change_password`, `auth_version`, limiter login, serta UI ganti password sudah tersedia. | E4 sudah diterapkan; perlu dipertahankan dengan test regresi dan bukti laporan. |
| Data ganda | `server.js` memasang `express.static(PUBLIC_DIR)` sebelum route `/data`, tetapi repository scene dan tur menulis ke `data/` dan `public/data/`. | E1 sebagian tertangani melalui sinkronisasi ganda, tetapi sumber data runtime masih ambigu dan rawan drift saat edit manual. |
| Rilis | `/`, `/admin`, dan aset publik dilayani server Node. Docker menyertakan source, tetapi hanya volume MySQL yang persisten. | E3 sebagian terpenuhi; E5 dan ketahanan deploy ulang masih perlu smoke test serta strategi penyimpanan. |
| Privasi penelitian | Identitas siswa berada pada `students` dan `users`, sedangkan sesi dan hasil masih dapat dihubungkan langsung melalui `student_id` atau `user_id`. Belum ada consent maupun kode responden penelitian. | F2 belum terpenuhi. |
| Dokumentasi ML | `README.md`, `ml-model/README.md`, `Dataset/geometry_wbn/README.md`, dan komentar skrip menjelaskan cara jalan, tetapi belum ada Laporan Teknis Desain ML dengan evaluasi formal. | F5 belum terpenuhi. |

## 5. Inventaris butir aktif

| Kode | Prioritas | Ringkasan kebutuhan | Status baseline | Fase |
|---|---:|---|---|---|
| A1 | P0 | Genggam, putar, skala, reset, serta fallback non-VR | Belum ada | R2 |
| A2 | P0 | Animasi buka-lipat jaring-jaring untuk kubus, balok, prisma, dan limas | Belum ada | R2 |
| A3 | P0 | Mode padat, transparan, dan rangka | Belum ada | R2 |
| A4 | P0 | Penghitungan sisi, rusuk, dan titik oleh siswa dengan koreksi | Belum ada | R2 |
| A5 | P1 | Diagonal bidang, diagonal ruang, dan bidang diagonal | Belum ada | R4 |
| B1 | P0 | Anotasi kotak pembatas per objek dan crop ketat | Belum ada | R3 |
| B2 | P0 | Minimal 15 objek dan sasaran 50 gambar per kelas yang beragam | Belum dapat dibuktikan | R3 |
| B3 | P0 | Kelas kerucut harus memiliki data nyata atau dikeluarkan | Menunggu keputusan | R1 |
| B4 | P1 | Sebaran kelas lebih seimbang dan pembanding kelas mayoritas | Belum dapat dibuktikan | R3 |
| B5 | P0 | Prediksi dari sudut pandang bebas dan catatan latensi | Sebagian | R3 |
| B6 | P0 | Matriks kekeliruan, akurasi dan F1 per kelas, serta uji lintas situs | Belum ada | R3 |
| B7 | P1 | Nilai confidence bawaan tidak boleh terbaca sebagai hasil ML | Belum | R3 |
| C1 | P0 | Setengah bola konsisten menjadi dua sisi dan satu rusuk | Belum | R1 |
| C2 | P1 | Bentuk budaya disebut sebagai pendekatan bentuk ideal | Belum konsisten | R4 |
| C3 | P1 | Hubungan makna budaya dan sifat geometri dibuat eksplisit | Sebagian dalam teks, belum terstruktur | R4 |
| C4 | P0 | Minimal 15 objek warisan budaya tercakup | Baru 7 objek Prambanan; inventaris lintas situs belum formal | R4 |
| C5 | P0 | Setiap objek atau area terkait tujuan pembelajaran dan kurikulum | Belum ada field khusus | R4 |
| D1 | P0 | Penilaian kuis di server | Sudah diterapkan | R1 verifikasi |
| D2 | P0 | Lima sampai delapan soal per kelas dengan pengecakan dan jenjang | Baru satu soal per kelas | R4 |
| D4 | P0 | Instrumen pretest-posttest Draft I terpisah dari kuis eksplorasi | Belum ada | R4 |
| D5 | P0 | Kuesioner efikasi diri Draft I dengan kode responden sama | Belum ada | R4 |
| D6 | P0 | Endpoint sesi dan hasil dilindungi token kepemilikan | Sudah diterapkan | R1 verifikasi |
| E1 | P0 | Satu sumber data runtime; suntingan admin langsung tampil | Sebagian | R1 |
| E2 | P1 | Salinan root usang tidak membingungkan runtime atau penelaah | Ada file legacy | R5 |
| E3 | P0 | Satu alamat server yang berfungsi penuh | Sebagian | R1 |
| E4 | P0 | Tidak ada kredensial admin bawaan yang dapat langsung dipakai | Sudah diterapkan | R1 verifikasi |
| E5 | P0 | Panorama dan aset besar pasti tersedia di server tujuan | Belum diverifikasi di target | R1 dan R6 |
| F2 | P0 | Persetujuan etik, consent, pemisahan identitas, dan kode responden | Belum ada | R5 |
| F5 | P1 | Laporan Teknis Desain ML | Belum lengkap | R5 |

## 6. Keputusan wajib sebelum implementasi terkait

Keputusan berikut tidak boleh diasumsikan oleh pengembang:

1. B3: pilih salah satu antara menambah objek kerucut nyata beserta data yang sah atau mengeluarkan kelas kerucut dari taksonomi, model, kuis, dan UI.
2. C4: tim materi menetapkan daftar final minimal 15 objek, situs asal, kelas geometri, dan bukti rujukannya.
3. C5: tim materi menetapkan kurikulum, fase atau kelas, capaian pembelajaran, tujuan pembelajaran, dan indikator per objek atau area.
4. D4 dan D5: tim peneliti menyerahkan naskah instrumen Draft I, kunci atau skoring, skala efikasi diri, versi, serta status validasi ahli. Pengembang tidak boleh menulis substansi instrumen sendiri.
5. F2: penanggung jawab etik menetapkan dasar persetujuan, naskah consent orang tua dan assent siswa, data yang boleh dikumpulkan, masa simpan, hak akses, mekanisme penarikan data, dan bentuk ekspor pseudonim.
6. E3 dan E5: operator menetapkan alamat produksi, metode deploy final, lokasi persisten untuk data suntingan admin, dataset, panorama, model, dan `config/jwt-secret.txt`.
7. B6: tim penelitian menetapkan situs atau dataset pembanding yang sah untuk uji lintas situs dan aturan pemisahan train, validation, dan test.

## 7. Fase pelaksanaan

### Fase R0 - Baseline, kontrak, dan paket bukti awal

Tujuan: mengunci kondisi awal agar pekerjaan revisi tidak merusak migrasi yang sedang berjalan.

Pekerjaan:

1. Simpan keluaran `git status --short`, versi Node, versi Python ML, commit dasar, serta checksum data utama dalam catatan fase.
2. Jalankan test, typecheck, lint, dan build yang tersedia. Catat kegagalan baseline tanpa memperbaiki masalah di luar cakupan.
3. Tambahkan validator konten read-only yang menghitung objek per situs, kelas terpakai, soal per kelas, node berlabel, dan referensi aset yang hilang.
4. Tambahkan characterization test untuk kontrak API yang akan disentuh: data scene dan tur, prediksi ML, kuis, sesi, login admin, serta halaman utama.
5. Tetapkan struktur bukti, misalnya `docs/evidence/progress-report/<kode>/`, tanpa memasukkan data siswa nyata atau dataset mentah ke Git.

File utama:

- `package.json`
- `tests/`
- `data/prambanan.json`
- `data/tour-borobudur.json`
- `data/geometry-labels.json`
- `data/quiz.json`
- dokumentasi bukti baru di `docs/`

Kriteria keluar:

- baseline dapat diulang;
- semua 29 kode memiliki status awal yang terukur;
- tidak ada file pengguna terhapus atau tertimpa;
- URL dan response API lama telah dikarakterisasi.

### Fase R1 - Ketepatan konsep, keamanan, dan kesiapan rilis

Butir: C1, B3, E1, E3, E4, E5, D1, dan D6.

Pekerjaan:

1. Perbaiki C1 pada `data/geometry-labels.json`, `data/quiz.json`, data scene atau tur terkait, katalog geometri admin, dan test konsistensi sehingga setengah bola selalu memiliki dua sisi dan satu rusuk sesuai keputusan materi pada dokumen sumber.
2. Jalankan keputusan B3. Bila kerucut dipertahankan, tambahkan sumber objek nyata, anotasi, jumlah minimal, split, dan evaluasi. Bila dikeluarkan, lakukan migrasi konsisten pada taksonomi, model, kuis, data tur, UI, dan dokumentasi tanpa meninggalkan referensi yatim.
3. Untuk E1, jadikan `data/` sumber kanonik dengan memasang route `/data` sebelum `express.static(PUBLIC_DIR)`. Pertahankan `public/data/` sebagai salinan kompatibilitas, tetapi jangan lagi menjadikannya sumber yang menang pada runtime Node.
4. Tambahkan test yang menyunting data melalui repository atau API di temporary directory dan membuktikan GET `/data/...` langsung melihat versi terbaru.
5. Untuk E3, pertahankan URL publik yang ada dan pastikan halaman utama, admin, Prambanan, Borobudur, API, model, dan data memakai origin server yang sama. Alur static lama tidak boleh menjadi alamat yang direkomendasikan.
6. Untuk E5, tambahkan manifest aset wajib dengan ukuran dan checksum, pemeriksaan startup atau build, serta smoke test produksi yang memuat panorama dan model.
7. Jangan menulis ulang D1, D6, dan E4 yang sudah ada. Perkuat test regresi untuk penilaian server-side, token kepemilikan sesi, bootstrap secret, wajib ganti password, revokasi token, dan rate limit.
8. Pastikan image Docker tidak memuat `.env`, `config/jwt-secret.txt`, atau kredensial legacy. Tentukan volume atau lokasi persisten sebelum Docker direkomendasikan untuk perubahan admin dan dataset.

Test minimum:

- konsistensi taksonomi, kuis, katalog, dan data objek;
- data route tidak tertutup `public/data`;
- penilaian kuis mengabaikan klaim `is_correct` dari client;
- sesi milik pihak lain menghasilkan 403 sebelum INSERT atau UPDATE;
- login bootstrap memaksa ganti password dan token lama dicabut;
- build atau deploy gagal jelas bila aset wajib hilang;
- smoke test satu origin untuk `/`, `/admin`, kedua halaman VR, `/data`, `/ml-model`, dan `/api/health`.

Bukti laporan:

- daftar perbaikan konsep C1;
- catatan keputusan dan hasil B3;
- test keamanan D1, D6, dan E4;
- alamat server uji, manifest aset, dan tangkapan layar aplikasi yang memuat penuh.

### Fase R2 - Interaksi geometri inti VR

Butir: A1, A2, A3, dan A4.

Pekerjaan:

1. Buat komponen A-Frame terpisah untuk pemilihan, genggam atau drag, rotasi, skala, reset, transparansi, rangka, jaring-jaring, dan mode hitung. Jangan menumpuk seluruh state baru di `public/js/app.js`.
2. A1 harus mendukung controller WebXR dan pointer atau tetikus. Transformasi siswa bersifat lokal pada sesi dan tidak menulis ulang posisi admin.
3. Sediakan reset per objek serta reset semua objek. Terapkan batas skala, posisi, dan rotasi agar objek tidak hilang atau menutupi kamera.
4. A3 menyediakan tiga mode yang dapat dibandingkan pada objek sama: padat, transparan, dan rangka. Material asli harus dapat dipulihkan tanpa reload.
5. A4 tidak boleh sekadar menyembunyikan angka. Siswa memilih unsur satu per satu, unsur terpilih diberi penanda, duplikasi pilihan dicegah, lalu server atau data resmi memeriksa jumlah akhir.
6. A2 memakai definisi jaring-jaring data-driven untuk kubus, balok, prisma, dan limas. Animasi harus dapat dibuka, ditutup, dihentikan, dan direset.
7. Tambahkan petunjuk tekstual, fokus keyboard, target klik yang cukup besar, dan mode non-VR agar fitur dapat dinilai dari laptop biasa.
8. Catat interaksi baru melalui event yang sudah ada dengan nilai `interaction_type` yang tervalidasi, tanpa mengubah response endpoint lama.

File yang diperkirakan:

- komponen baru di `public/js/components/`
- `public/js/scene-loader.js`
- `public/js/app.js`
- `public/vr/prambanan.html`
- `public/css/ui.css`
- `data/prambanan.json`
- `src/modules/learning-events/`
- test unit komponen dan test browser baru

Test minimum:

- state machine setiap mode dan reset;
- batas transformasi dan pemulihan material;
- perhitungan unsur benar, salah, duplikat, dan reset;
- jaring-jaring kembali tepat ke bentuk awal;
- pointer desktop dan controller VR menghasilkan aksi yang sama;
- tidak ada event milik sesi lain yang dapat ditulis.

Bukti laporan:

- tangkapan layar tiga mode A3;
- rekaman singkat A1, A2, dan A4;
- daftar bangun yang mendukung jaring-jaring;
- catatan fallback non-VR.

### Fase R3 - Dataset dan bukti kinerja model

Butir: B1, B2, B4, B5, B6, dan B7, serta penyelesaian hasil keputusan B3.

Pekerjaan:

1. Ubah mode dataset menjadi anotasi satu objek. Pengguna memilih kotak pembatas pada frame perspektif, memilih `object_id` dan `class_id`, lalu sistem menyimpan frame sumber, koordinat kotak ternormalisasi, crop ketat, situs, tur, node, sudut kamera, versi taksonomi, hash, dan split.
2. Pertahankan split deterministik berdasarkan sumber objek atau panorama agar crop dari sumber yang sama tidak bocor ke train dan test.
3. Susun inventaris minimal 15 objek yang telah disetujui pada C4. Laporan jumlah harus membedakan jumlah objek unik, gambar, crop, kelas, situs, dan split.
4. Terapkan target 50 gambar per kelas dengan variasi sudut, jarak, dan pencahayaan. Bila belum tercapai, laporan harus menyebut angka aktual dan rencana pelengkapan, bukan mengklaim selesai.
5. Seimbangkan kelas dengan pengumpulan data lebih dahulu. Augmentasi tidak boleh dihitung sebagai objek nyata baru. Catat pembanding kelas mayoritas untuk B4.
6. Pertahankan URL `POST /api/ml/predict/:tourId/:nodeId`. Tambahkan body opsional berisi yaw dan pitch kamera yang divalidasi. Client baru mengirim sudut pandang pengguna; client lama tanpa body tetap memakai `local_angle` agar kompatibel.
7. Catat latensi server, sumber prediksi, versi model, dan kecocokan dengan label area. Response lama `{ success, data: { class_id, confidence } }` tetap ada; metadata baru hanya tambahan bila diperlukan.
8. Tambahkan skrip evaluasi terpisah yang memakai test split dan menghasilkan JSON atau CSV metrik, matriks kekeliruan, akurasi per kelas, precision, recall, F1 per kelas dan macro, jumlah sampel, serta latensi ringkas.
9. Jalankan uji lintas situs hanya setelah sumber pembanding disetujui. Hasil negatif tetap dilaporkan apa adanya.
10. Hilangkan representasi confidence palsu. Pada Prambanan atau fallback admin, sembunyikan bilah atau tampilkan teks `Data referensi, bukan hasil model`. Nilai admin tidak boleh masuk tabel `predictions` sebagai confidence model.

File yang diperkirakan:

- `public/js/tour.js`
- `public/vr/tour-borobudur.html`
- `public/css/ui.css`
- `src/modules/dataset/`
- `server.js` atau modul ML baru
- `ml/predict.js`
- `MLTraining/generate_dataset.py`
- `MLTraining/train.py`
- skrip evaluasi baru di `MLTraining/`
- `data/geometry-labels.json`
- `data/tour-borobudur.json`
- test dataset, predictor, dan UI

Test minimum:

- koordinat kotak harus berada dalam frame dan crop tidak kosong;
- image dan metadata ditulis atomik;
- duplikasi hash ditolak atau dilaporkan;
- sumber sama selalu masuk split sama;
- yaw dan pitch invalid ditolak tanpa membaca file;
- request legacy tanpa body tetap bekerja;
- label, output model, dan taksonomi memiliki urutan yang sama;
- evaluator lulus pada fixture kecil dan menghasilkan seluruh metrik wajib;
- tidak ada UI atau log prediction yang menyebut confidence model saat sumbernya admin.

Bukti laporan:

- protokol anotasi;
- contoh sebelum, kotak pembatas, dan crop sesudah;
- tabel jumlah per objek, kelas, situs, dan split;
- grafik sebaran;
- matriks kekeliruan dan tabel metrik;
- tabel latensi serta hasil uji lintas situs.

### Fase R4 - Konten, kurikulum, instrumen, dan fitur geometri lanjutan

Butir: A5, C2, C3, C4, C5, D2, D4, dan D5.

Pekerjaan:

1. A5 memakai mode transparan A3 sebagai prasyarat. Tambahkan penanda bertahap untuk diagonal bidang, diagonal ruang, dan bidang diagonal pada kubus atau balok, dengan penjelasan teks non-VR.
2. C2 menambahkan penanda eksplisit bahwa elemen budaya `mendekati` bentuk ideal. Simpan penjelasan pendekatan dan keterbatasan, lalu tampilkan konsisten di panel informasi dan soal.
3. C3 menghubungkan sifat geometri dengan makna budaya dalam satu narasi yang telah ditinjau ahli materi, bukan hanya dua paragraf yang berdiri sendiri.
4. C4 menambahkan atau memetakan minimal 15 objek unik lintas situs. Setiap objek memiliki ID stabil, situs, elemen budaya, kelas geometri, bukti atau sumber, dan status review materi.
5. C5 menambah metadata kurikulum terstruktur pada objek atau area: kurikulum, fase atau kelas, capaian pembelajaran, tujuan pembelajaran, indikator, dan versi review.
6. Perluas schema Zod, form admin, renderer scene atau tur, dan validator konten agar field baru tidak hilang saat round-trip admin.
7. D2 memperluas bank menjadi minimal 5 soal per kelas aktif. Soal memiliki indikator, tingkat kognitif awal, versi, pilihan, kunci, penjelasan, dan status review. Client memilih soal tanpa terus mengulang satu soal yang sama dalam satu sesi.
8. D4 dan D5 memakai instrumen yang diberikan tim penelitian. Pisahkan pretest, posttest, efikasi diri, dan kuis eksplorasi pada definisi, alur UI, tabel hasil, ekspor, dan laporan.
9. Gunakan satu `respondent_code` pseudonim untuk menghubungkan instrumen tanpa memasukkan nama atau nomor induk ke tabel hasil penelitian.

Perubahan data yang diperkirakan:

- field tambahan pada objek scene dan `identify` node tur;
- versi baru `data/geometry-labels.json` dan `data/quiz.json`;
- tabel definisi instrumen, administrasi instrumen, dan respons;
- tabel atau mapping responden yang aksesnya dipisahkan dari hasil;
- migrasi idempotent untuk database lama.

Test minimum:

- round-trip admin mempertahankan metadata kurikulum dan budaya;
- setiap objek aktif memiliki metadata wajib dan ID unik;
- minimal 15 objek dan minimal 5 soal per kelas terverifikasi otomatis;
- kunci jawaban tidak dikirim sebagai keputusan final client;
- pretest, posttest, efikasi diri, dan kuis tidak tercampur dalam query atau ekspor;
- kode responden sama menghubungkan instrumen, tetapi ekspor penelitian tidak memuat nama atau nomor induk;
- A5 dapat direset dan tidak mengganggu mode A1-A4.

Bukti laporan:

- matriks objek terhadap kelas geometri;
- peta konsep geometri terhadap kurikulum;
- kisi-kisi bank soal;
- instrumen Draft I dan lembar validasi ahli;
- tangkapan layar A5.

### Fase R5 - Etik, tata kelola, dokumentasi teknis, dan legacy

Butir: F2, F5, dan E2.

Pekerjaan:

1. F2 dipisahkan menjadi pekerjaan administratif dan teknis. Pengajuan etik, consent, assent, dan lembar informasi peserta merupakan keluaran tim penelitian, bukan dibuat sepihak oleh pengembang.
2. Setelah keputusan etik tersedia, tambahkan versi consent, waktu persetujuan, pihak pemberi persetujuan, status penarikan, dan audit trail tanpa menyimpan isi sensitif di log aplikasi.
3. Pisahkan mapping identitas dengan dataset hasil penelitian. Guru tetap dapat memakai identitas operasional dalam dashboard sesuai kewenangan, sedangkan ekspor penelitian memakai kode responden pseudonim.
4. Tambahkan penghapusan atau penarikan data yang terkontrol sesuai kebijakan retensi yang disetujui. Jangan menerapkan penghapusan massal tanpa backup dan persetujuan operator.
5. Untuk E2, pertahankan file root legacy dan aset sesuai aturan proyek. Dokumentasikan direktori kanonik, keluarkan legacy dari build atau route aktif, dan tambahkan test bahwa runtime Node melayani hanya versi `public/` atau hasil build yang sah.
6. Susun F5 sebagai Laporan Teknis Desain ML: tujuan, taksonomi, sumber dan lisensi data, protokol anotasi, quality control, split, arsitektur, preprocessing, augmentasi, training, metrik, matriks kekeliruan, uji lintas situs, latensi, keterbatasan, risiko bias, versioning, dan reproduksi.
7. Siapkan indeks lampiran yang menghubungkan setiap kode revisi ke file bukti dan bagian laporan kemajuan.

Test minimum:

- role dan tenant membatasi akses mapping identitas;
- ekspor penelitian bebas nama, nomor induk, username, dan formula spreadsheet berbahaya;
- consent yang ditarik tidak dapat membuat sesi penelitian baru sesuai kebijakan;
- file legacy tidak menjadi response runtime;
- pemeriksaan tautan dan referensi dokumen teknis;
- reproduksi evaluator dari versi model dan taksonomi yang dicatat.

Bukti laporan:

- surat pengajuan atau persetujuan etik;
- contoh consent dan assent yang telah disetujui;
- diagram pemisahan identitas dan hasil;
- Laporan Teknis Desain ML;
- struktur repository final dan daftar file legacy yang tetap dipertahankan.

### Fase R6 - Verifikasi akhir dan paket laporan kemajuan

Tujuan: membuktikan seluruh hasil, bukan menambah fitur baru.

Pekerjaan:

1. Jalankan seluruh verification pada build bersih dan database uji yang merepresentasikan migrasi lama serta instalasi baru.
2. Jalankan smoke test desktop, mobile, dan perangkat WebXR yang tersedia pada alamat produksi final.
3. Uji akun super admin, admin sekolah, guru, siswa, tamu, serta akses lintas sekolah.
4. Uji deploy ulang untuk membuktikan database, suntingan admin, dataset, panorama, model, dan secret tetap tersedia.
5. Rekam demo singkat fitur A1-A5, prediksi sudut bebas, kuis, instrumen, dashboard, serta alur consent bila masuk cakupan etik.
6. Jalankan validator konten dan buat tabel status akhir seluruh 29 butir.
7. Masukkan bukti ke lampiran tanpa data identitas siswa nyata.

Kriteria keluar:

- semua 22 P0 selesai atau memiliki pengecualian tertulis yang disetujui;
- tujuh P1 selesai atau dilaporkan jujur sebagai berjalan;
- seluruh test dan build relevan lulus;
- tidak ada API lama yang berubah tanpa catatan kompatibilitas;
- alamat produksi berfungsi penuh dengan aset besar;
- bukti laporan dapat ditelusuri ke kode revisi.

## 8. Kontrak API dan data yang direncanakan

### API yang dipertahankan

- `POST /api/ml/predict/:tourId/:nodeId` tetap memakai URL dan field response lama. Body yaw atau pitch bersifat opsional dan response metadata baru hanya tambahan.
- `POST /api/quiz-results` tetap menerima field lama; server tetap menjadi sumber kebenaran untuk `is_correct`.
- Endpoint sesi dan learning events tetap memakai JWT siswa atau `X-Session-Token` yang sudah ada.
- `/data/...` tetap menjadi URL publik; yang berubah hanya sumber kanonik dan urutan middleware.

### Data yang perlu ditambah

- metadata objek: identitas objek budaya, sumber, approximation note, hubungan budaya-geometri, dan tujuan kurikulum;
- metadata dataset: object ID, bounding box, sudut kamera, kualitas anotasi, annotator atau reviewer pseudonim, dan versi taksonomi;
- metadata model: model version, taxonomy version, dataset manifest hash, metrik, dan latensi;
- metadata instrumen: jenis, versi, waktu administrasi, respondent code, dan status kelengkapan;
- metadata consent: versi, status, waktu, dan audit trail sesuai persetujuan etik.

Semua migrasi database harus idempotent, diuji pada schema kosong dan schema lama, serta memiliki backup dan rollback yang terdokumentasi.

## 9. Matriks verification

| Lapisan | Verification |
|---|---|
| Kode TypeScript dan JavaScript | `npm run typecheck`, `npm run lint`, unit test, integration test, dan `git diff --check` |
| Build | `npm run build` dan smoke health hasil `dist/` |
| API | Supertest untuk kontrak lama, response tambahan, auth, tenant isolation, rate limit, dan ownership |
| Konten | Validator jumlah objek, metadata wajib, konsistensi taksonomi, referensi aset, dan soal per kelas |
| VR | Test state komponen, browser smoke desktop dan mobile, serta pemeriksaan manual WebXR |
| Dataset | Validasi format, provenance, bbox, hash, split leakage, distribusi kelas, dan manifest |
| ML | Training atau evaluasi reproducible, test split terkunci, confusion matrix, per-class metrics, dan latency |
| Privasi | Test pseudonymization, access control, consent state, CSV safety, dan absence of PII pada log atau evidence |
| Deploy | Build image, pemeriksaan secret, persistence, asset manifest, health check, dan production URL smoke |

## 10. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Working tree migrasi belum bersih | Perubahan revisi menimpa pekerjaan pengguna | Snapshot per fase, patch kecil, dan review diff terarah. |
| Konten ahli belum disetujui | Produk memuat konsep atau instrumen yang salah | Jadikan C4, C5, D4, D5, dan F2 sebagai gate persetujuan. |
| Dataset mentah tidak ada di repository | Jumlah dan sebaran tidak dapat diaudit | Gunakan manifest checksum dan laporan terpisah tanpa mengomit data sensitif atau berlisensi. |
| Kebocoran sumber antar split | Metrik model terlalu optimistis | Split berdasarkan objek atau panorama sebelum crop dan uji leakage otomatis. |
| Confidence fallback dianggap ML | Klaim laporan menyesatkan | Tampilkan sumber prediksi dan sembunyikan angka saat bukan model. |
| Fitur VR berat pada gawai sekolah | Frame rate turun dan evaluasi terganggu | Batas kompleksitas mesh, lazy initialization, profiling, dan fallback non-VR. |
| Perubahan schema memutus data lama | Kehilangan data atau startup gagal | Migrasi idempotent, backup, fixture schema lama, dan rollback terdokumentasi. |
| Identitas siswa muncul pada bukti | Risiko etik dan privasi | Gunakan data sintetis atau pseudonim pada test, screenshot, ekspor, dan lampiran. |
| Deploy ulang menghapus file runtime | Suntingan admin atau dataset hilang | Tetapkan volume atau storage persisten sebelum rilis dan uji recreate container. |
| File legacy membingungkan penelaah | Versi salah dibuka atau dinilai | Pertahankan file tetapi tandai non-kanonik dan keluarkan dari route atau build aktif. |

## 11. Butir yang tetap ditunda

Butir berikut tidak boleh ikut diimplementasikan hanya karena berdekatan dengan pekerjaan aktif:

| Kode | Butir | Batas penundaan |
|---|---|---|
| A6 | Irisan bidang | Menjelang uji coba terbatas. |
| A7 | Alat ukur virtual | Tahun 2. |
| A8 | Narasi suara dan teks terjemah | Menjelang uji coba terbatas. |
| A9 | Pengaturan kenyamanan dan durasi | Menjelang uji coba terbatas. |
| D3 | Penjenjangan ranah kognitif butir soal | Setelah validasi instrumen Draft I. |
| D7 | Pemanfaatan data proses sebagai variabel | Setelah uji terbatas. |
| E6 | Penyesuaian beban inferensi | Tahun 2. |
| E7 | Uji gawai sederhana dan mode luring | Menjelang uji coba terbatas. |
| E8 | Penanganan galat dan pengelola proses | Menjelang uji coba terbatas. |
| F1 | Modul ajar dan SOP rotasi perangkat | Menjelang uji coba terbatas. |
| F3 | Perizinan dan atribusi citra situs | Harus mulai diurus lebih awal, tetapi keluarannya ditargetkan sebelum penyebaran produk. |
| F4 | Pendaftaran hak cipta program komputer | Akhir Tahun 1 setelah versi stabil. |

## 12. Definition of Done keseluruhan

Pekerjaan revisi baru dapat dinyatakan selesai bila:

1. setiap kode aktif memiliki perubahan, test, bukti, pemilik, dan status yang dapat ditelusuri;
2. semua P0 memenuhi acceptance criteria atau memiliki pengecualian tertulis dari penanggung jawab;
3. angka pada laporan berasal dari validator atau artefak evaluasi, bukan hitungan manual tanpa sumber;
4. tidak ada kredensial, secret, identitas siswa, atau dataset terlarang masuk Git maupun lampiran;
5. aplikasi berjalan dari satu alamat server dengan panorama dan model tersedia;
6. test, typecheck, lint, build, security checks, content checks, ML evaluation, dan production smoke yang relevan lulus;
7. file legacy dan aset tetap dipertahankan sesuai aturan, tetapi tidak mengambil alih runtime;
8. laporan kemajuan menyatakan capaian secara jujur: Define tuntas, Design tuntas sebagian dengan rincian, dan Develop sedang berjalan menuju penilaian ahli.
