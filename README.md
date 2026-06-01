# VR-GeoNusa
**Eksplorasi Geometri Warisan Budaya Nusantara via WebXR**

Prototype Tahun 1 — Hibah Fundamental BIMA 2026

---

## Cara Menjalankan

### Lokal (30 detik)
```bash
# Python 3
python3 -m http.server 8000
# Buka: http://localhost:8000
```
Atau: double-klik `index.html` langsung di browser.

### GitHub Pages (untuk akses Quest 3)
```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/[username]/vrgeonusa-prototype.git
git push -u origin main
# Aktifkan Settings → Pages → Branch: main
```

---

## Kontrol

| Platform | Gerak | Lihat | Identifikasi |
|---|---|---|---|
| Desktop | WASD | Mouse drag | Arahkan cursor, tahan 1.5 detik |
| Quest 3 | Joystick kiri | Gerak kepala | Tatap objek 1.5 detik / Trigger |

---

## Struktur Project

```
VR-GeoNusa/
├── index.html          ← Entry point utama + scene Borobudur
├── css/
│   └── ui.css          ← Semua styling UI
├── js/
│   └── app.js          ← Logika interaksi & scene management
├── assets/
│   ├── models/         ← (Tahun 2) Model GLTF/GLB
│   └── textures/       ← (Tahun 2) Tekstur kustom
└── scenes/
    └── (Tahun 2) Scene tambahan
```

---

## Objek Interaktif (Scene Borobudur)

| Objek | Geometri | Confidence |
|---|---|---|
| Stupa Utama | Setengah Bola | 97% |
| Teras Rupadhatu | Balok | 94% |
| Stupa Berlubang | Tabung | 91% |
| Pilar Gapura | Tabung | 91% |
| Dasar Kamadhatu | Limas Segiempat | 88% |
| Tangga Masuk | Prisma Segitiga | 87% |
| Ornamen Puncak | Kerucut | 85% |

---

## Stack Teknis

- **Framework:** A-Frame 1.5.0 (WebXR)
- **Movement:** aframe-extras movement-controls
- **Interaksi:** Gaze cursor + fuse timer 1500ms
- **Kompatibel:** Chrome, Firefox, Edge, Quest Browser, Pico Browser
- **Ukuran:** < 100KB (tanpa aset eksternal)
- **Requirement:** Browser modern — tidak perlu install apapun

---

## Roadmap

| Tahap | Target | Deskripsi |
|---|---|---|
| ✅ Prototype Tahun 1 | Juni 2026 | Scene Borobudur + 7 geometri + panel edukasi |
| 🔲 Tambah Scene | Agustus 2026 | Candi Prambanan + Keraton Yogyakarta |
| 🔲 Model 3D Asli | Oktober 2026 | Ganti placeholder dengan model GLTF fotogrametri |
| 🔲 ML Integration | Tahun 2 | API endpoint klasifikasi geometri real |
| 🔲 Migrasi Unity | Tahun 2 | Porting ke Unity XR untuk performa optimal |

---

*Dikembangkan menggunakan WebXR/A-Frame sebagai solusi teknis Tahun 1 dengan anggaran terbatas.*  
*Lihat `Analisis_Solusi_Teknis_Prototype.md` untuk justifikasi pemilihan platform.*
