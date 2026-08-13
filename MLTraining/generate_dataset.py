"""
VR-GeoNusa — generate Dataset/geometry_wbn/{train,val,test}/<class>/ from the
360 deg panorama photos, using the per-area geometry mapping already set in
data/tour-borobudur.json (identify.class_id) via the admin panel.

Each equirectangular photo is reprojected to several ordinary perspective
crops (varying yaw/pitch around the area's marker direction) using the same
gnomonic projection a 360 deg viewer uses — not a naive rectangular crop,
which would be badly distorted off the image's equator.

Run: MLTraining/venv/bin/python MLTraining/generate_dataset.py
"""
import json, os, random, zipfile, io, math
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOUR_JSON = os.path.join(ROOT, 'data', 'tour-borobudur.json')
ZIP_PATH = "/Users/mac/Library/CloudStorage/GoogleDrive-fathoni@unsap.ac.id/My Drive/AKADEMIK/VR-Geo Nusa HIBAH BIMA 2026/Borobudur Virtual-20260812T033609Z-1-001.zip"
OUT_DIR = os.path.join(ROOT, 'Dataset', 'geometry_wbn')

OUT_SIZE = 260          # crop output size (px), matches typical MobileNetV2 input + margin
FOV_DEG = 65
YAW_OFFSETS = [-15, -5, 5, 15]     # crops per node, varying the look direction
PITCH_OFFSETS = [-5, 8]            # and a couple of vertical angles
SPLIT = {'train': 0.7, 'val': 0.2, 'test': 0.1}
SEED = 42


def equirect_to_perspective(img_arr, W, H, yaw_deg, pitch_deg, fov_deg, out_size):
    fov = math.radians(fov_deg)
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)

    ax = np.linspace(-math.tan(fov / 2), math.tan(fov / 2), out_size)
    ay = np.linspace(math.tan(fov / 2), -math.tan(fov / 2), out_size)
    xx, yy = np.meshgrid(ax, ay)
    zz = np.ones_like(xx)

    norm = np.sqrt(xx ** 2 + yy ** 2 + zz ** 2)
    xx, yy, zz = xx / norm, yy / norm, zz / norm

    y2 = yy * math.cos(pitch) - zz * math.sin(pitch)
    z2 = yy * math.sin(pitch) + zz * math.cos(pitch)
    x2 = xx

    x3 = x2 * math.cos(yaw) + z2 * math.sin(yaw)
    z3 = -x2 * math.sin(yaw) + z2 * math.cos(yaw)
    y3 = y2

    lon = np.arctan2(x3, z3)
    lat = np.arcsin(np.clip(y3, -1, 1))

    u = ((lon / (2 * math.pi)) + 0.5) * W
    v = (0.5 - lat / math.pi) * H
    u = np.clip(u, 0, W - 1).astype(np.int32)
    v = np.clip(v, 0, H - 1).astype(np.int32)

    return img_arr[v, u]


def main():
    tour = json.load(open(TOUR_JSON))
    nodes = [n for n in tour['nodes'] if n.get('identify')]
    print(f"{len(nodes)} node dengan identifikasi geometri")

    random.seed(SEED)
    by_class = {}
    for n in nodes:
        by_class.setdefault(n['identify']['class_id'], []).append(n)

    for split in SPLIT:
        for class_id in by_class:
            os.makedirs(os.path.join(OUT_DIR, split, class_id), exist_ok=True)

    total = 0
    with zipfile.ZipFile(ZIP_PATH) as z:
        for class_id, class_nodes in by_class.items():
            random.shuffle(class_nodes)
            n = len(class_nodes)
            n_train = max(1, round(n * SPLIT['train']))
            n_val = max(1, round(n * SPLIT['val'])) if n > 2 else 0
            splits_for_nodes = (['train'] * n_train + ['val'] * n_val +
                                 ['test'] * (n - n_train - n_val))

            for node, split in zip(class_nodes, splits_for_nodes):
                data = z.read(node['source_zip_path'])
                img = Image.open(io.BytesIO(data)).convert('RGB')
                arr = np.array(img)
                H, W = arr.shape[:2]
                base_angle = node['identify'].get('local_angle', 40.0)

                count = 0
                for dy in YAW_OFFSETS:
                    for dp in PITCH_OFFSETS:
                        crop = equirect_to_perspective(arr, W, H, base_angle + dy, dp, FOV_DEG, OUT_SIZE)
                        out_img = Image.fromarray(crop)
                        fname = f"{class_id}_{node['id']}_{count:02d}.jpg"
                        out_img.save(os.path.join(OUT_DIR, split, class_id, fname), 'JPEG', quality=88)
                        count += 1
                        total += 1
                print(f"  {node['id']:24s} -> {class_id:16s} [{split}] {count} crops")

    print(f"\nTotal crops generated: {total}")
    for class_id in by_class:
        counts = {s: len(os.listdir(os.path.join(OUT_DIR, s, class_id))) for s in SPLIT}
        print(f"  {class_id:18s} train={counts['train']:3d} val={counts['val']:3d} test={counts['test']:3d}")


if __name__ == '__main__':
    main()
