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

## Prototype WebXR (Tahun 1)

**Demo langsung:** Buka `index.html` di browser atau akses via GitHub Pages.

### Cara Menjalankan Lokal

```bash
# Python 3
python3 -m http.server 8000
# Buka: http://localhost:8000
```

Atau double-klik `index.html` langsung di browser. Tidak perlu install apapun.

### Akses di Meta Quest 3

1. Aktifkan GitHub Pages: Settings → Pages → Branch: main
2. Buka URL GitHub Pages di Meta Quest Browser
3. Klik "Masuk Eksplorasi" → klik ikon VR goggles untuk mode penuh

### Kontrol

| Platform | Gerak | Lihat | Identifikasi |
|---|---|---|---|
| Desktop | WASD | Mouse drag | Arahkan cursor, tahan 1.5 detik |
| Quest 3 | Joystick kiri | Gerak kepala | Tatap objek 1.5 detik / Trigger |

---

## Struktur Repository

```
VR-GeoNusa/
├── index.html              # Scene utama: Candi Borobudur (WebXR)
├── scenes/
│   └── prambanan.html      # Scene: Candi Prambanan (WebXR)
├── css/ui.css              # Styling UI overlay
├── js/app.js               # Logika interaksi & scene management
├── api/
│   └── ml-placeholder.json # Placeholder respons ML (Tahun 2)
├── assets/
│   ├── models/             # (Tahun 2) Model GLTF/GLB fotogrametri
│   └── textures/           # (Tahun 2) Tekstur kustom
└── README.md
```

---

## Objek Interaktif

### Scene Borobudur (7 objek)
| Objek | Geometri | Confidence |
|---|---|---|
| Stupa Utama | Setengah Bola | 97% |
| Teras Rupadhatu | Balok | 94% |
| Stupa Berlubang | Tabung | 91% |
| Pilar Gapura | Tabung | 91% |
| Dasar Kamadhatu | Limas Segiempat | 88% |
| Tangga Masuk | Prisma Segitiga | 87% |
| Ornamen Puncak | Kerucut | 85% |

### Scene Prambanan (6 objek)
| Objek | Geometri | Confidence |
|---|---|---|
| Menara Utama | Limas Segiempat | 93% |
| Tubuh Candi | Balok | 91% |
| Pilar Gapura | Tabung | 90% |
| Candi Brahma/Wisnu | Balok | 89% |
| Lingga Yoni | Tabung | 88% |
| Antefix/Ornamen | Kerucut | 86% |

---

## Stack Teknis (Tahun 1 — WebXR)

- **Framework:** A-Frame 1.5.0 (WebXR)
- **Movement:** aframe-extras movement-controls
- **Kompatibel:** Chrome, Firefox, Edge, Quest Browser, Pico Browser
- **Ukuran:** < 100KB — tidak perlu install, tidak perlu GPU dedicated

## Stack Teknis (Tahun 2 — Unity, target)

- **VR Engine:** Unity 2022 LTS + Universal Render Pipeline
- **XR SDK:** Meta XR SDK / XR Interaction Toolkit
- **ML Framework:** PyTorch 2.x → ONNX → Unity Barracuda
- **3D Capture:** Agisoft Metashape + LiDAR
- **Target Device:** Meta Quest 3 / Pico 4

---

## Roadmap

| Tahap | Target | Status |
|---|---|---|
| Prototype WebXR Tahun 1 | Juni 2026 | ✅ Selesai |
| Scene Prambanan | Juni 2026 | ✅ Selesai |
| Model 3D GLTF asli | Oktober 2026 | 🔲 Planned |
| ML Integration API | Tahun 2 | 🔲 Planned |
| Migrasi ke Unity XR | Tahun 2 | 🔲 Planned |
| 25 Sekolah pilot | Tahun 2 | 🔲 Planned |

---

*Platform WebXR dipilih untuk Tahun 1 karena kendala device mahasiswa dan anggaran. Lihat `Analisis_Solusi_Teknis_Prototype.md` untuk justifikasi teknis lengkap.*
