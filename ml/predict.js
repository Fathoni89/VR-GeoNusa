// VR-GeoNusa — inferensi ML server-side (Node + @tensorflow/tfjs-node)
//
// Server sudah punya file foto panorama di disk (public/assets/panorama/),
// jadi tidak perlu client upload gambar apa pun — cukup kirim tourId+nodeId,
// server yang crop & prediksi sendiri. Ini "ground truth" resmi; client
// (public/js/tour.js) tetap punya jalur TF.js di browser sebagai fallback
// kalau server tidak terjangkau (mode offline/degradasi jaringan).
//
// Matematika crop (equirectangular -> perspektif) sama persis dengan
// MLTraining/generate_dataset.py (Python, dipakai bikin dataset training)
// dan public/js/tour.js (JS versi browser, dipakai Mode Dataset) — di sini
// pakai `sharp` untuk baca piksel, bukan DOM canvas.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Kompatibilitas: util.isNullOrUndefined() sudah dihapus dari Node.js core
// (deprecated sejak lama, dibuang di versi Node terbaru), tapi binding
// native @tensorflow/tfjs-node masih memanggilnya secara internal ->
// "(0, util_1.isNullOrUndefined) is not a function". Shim kecil ini
// mengembalikan fungsinya sebelum tfjs-node di-require, tanpa perlu
// menurunkan versi Node di seluruh proyek.
const nodeUtil = require('util');
if (typeof nodeUtil.isNullOrUndefined !== 'function') {
  nodeUtil.isNullOrUndefined = (v) => v === null || v === undefined;
}

const tf = require('@tensorflow/tfjs-node');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MODEL_DIR = path.join(ROOT, 'ml-model');

let model = null;
let classNames = [];

async function loadModel() {
  model = await tf.loadLayersModel(`file://${path.join(MODEL_DIR, 'model.json')}`);
  classNames = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'class_indices.json'), 'utf8'));
  console.log('🧠 Model ML server-side dimuat:', classNames.join(', '));
}

function equirectToPerspective(srcBuffer, srcWidth, srcHeight, yawDeg, pitchDeg, fovDeg, outSize) {
  const fov = (fovDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const tanHalfFov = Math.tan(fov / 2);
  const out = Buffer.alloc(outSize * outSize * 3);

  for (let j = 0; j < outSize; j++) {
    const ay = 1 - (j / (outSize - 1)) * 2;
    for (let i = 0; i < outSize; i++) {
      const ax = (i / (outSize - 1)) * 2 - 1;
      let x = ax * tanHalfFov, y = ay * tanHalfFov, z = 1;
      const norm = Math.sqrt(x * x + y * y + z * z);
      x /= norm; y /= norm; z /= norm;

      const y2 = y * Math.cos(pitch) - z * Math.sin(pitch);
      const z2 = y * Math.sin(pitch) + z * Math.cos(pitch);
      const x3 = x * Math.cos(yaw) + z2 * Math.sin(yaw);
      const z3 = -x * Math.sin(yaw) + z2 * Math.cos(yaw);
      const y3 = y2;

      const lon = Math.atan2(x3, z3);
      const lat = Math.asin(Math.max(-1, Math.min(1, y3)));
      let u = Math.floor(((lon / (2 * Math.PI)) + 0.5) * srcWidth);
      let v = Math.floor((0.5 - lat / Math.PI) * srcHeight);
      u = Math.max(0, Math.min(srcWidth - 1, u));
      v = Math.max(0, Math.min(srcHeight - 1, v));

      const srcIdx = (v * srcWidth + u) * 3;
      const dstIdx = (j * outSize + i) * 3;
      out[dstIdx] = srcBuffer[srcIdx];
      out[dstIdx + 1] = srcBuffer[srcIdx + 1];
      out[dstIdx + 2] = srcBuffer[srcIdx + 2];
    }
  }
  return out;
}

async function predictNode(tourId, nodeId) {
  if (!model) throw new Error('Model ML belum siap — coba lagi sesaat lagi');

  const tourFile = path.join(DATA_DIR, `tour-${tourId}.json`);
  if (!fs.existsSync(tourFile)) throw new Error(`Tur "${tourId}" tidak ditemukan`);
  const tour = JSON.parse(fs.readFileSync(tourFile, 'utf8'));

  const node = tour.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error(`Titik "${nodeId}" tidak ditemukan`);
  if (!node.identify) throw new Error('Titik ini belum diberi identifikasi geometri oleh admin');

  const imgPath = path.join(PUBLIC_DIR, node.image);
  const { data, info } = await sharp(imgPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const cropBuf = equirectToPerspective(data, info.width, info.height, node.identify.local_angle, 1.5, 65, 224);

  const result = tf.tidy(() => {
    const tensor = tf.tensor3d(cropBuf, [224, 224, 3], 'int32').toFloat().expandDims(0);
    const logits = model.predict(tensor);
    return logits.dataSync();
  });

  let best = 0;
  for (let i = 1; i < result.length; i++) if (result[i] > result[best]) best = i;

  return { class_id: classNames[best], confidence: result[best] };
}

module.exports = { loadModel, predictNode };
