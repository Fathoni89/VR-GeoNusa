# VR-GeoNusa

**Integrasi Machine Learning dan Virtual Reality untuk Preservasi Digital dan Identifikasi Cerdas Geometri pada Warisan Budaya Nusantara**

Hibah Penelitian Fundamental — BIMA Kemenristekdikti 2026–2027

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

## Struktur Repository

```
VR-GeoNusa/
├── UnityProject/          # Project Unity (VR Application)
├── MLTraining/            # Pipeline training CNN
│   ├── scripts/           # Script training & evaluasi
│   ├── configs/           # Konfigurasi hyperparameter
│   └── output/            # Model terlatih (LFS)
├── Dataset/               # Dataset anotasi WBN
│   ├── annotations/       # File JSON anotasi per objek
│   ├── images/            # Foto objek WBN
│   └── models_3d/         # Model 3D .obj/.fbx/.glb (LFS)
├── Docs/                  # Dokumentasi teknis
│   ├── architecture/      # Dokumen arsitektur sistem
│   ├── sop/               # SOP pengambilan data, anotasi, dll.
│   └── reports/           # Laporan progress
├── Research/              # Instrumen & data penelitian
└── README.md
```

## Quick Start

```bash
# Clone repository
git clone <repo-url>
cd VR-GeoNusa

# Install Git LFS (jika belum)
git lfs install
git lfs pull

# Setup ML environment
cd MLTraining
pip install -r requirements.txt
```

## Teknologi

- **VR Engine:** Unity 2022 LTS + Universal Render Pipeline
- **XR SDK:** Meta XR SDK / XR Interaction Toolkit
- **ML Framework:** PyTorch 2.x → ONNX → Unity Barracuda
- **3D Capture:** Agisoft Metashape + LiDAR
- **Target Device:** Meta Quest 3 / Pico 4
