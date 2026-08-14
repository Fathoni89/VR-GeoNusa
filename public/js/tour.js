// VR-GeoNusa — Tur 360° (foto panorama asli, node-to-node)
// Hotspot arah: "Maju" selalu di depan (angle 0), "Mundur" selalu di belakang
// (angle 180) relatif terhadap arah hadap foto — lihat catatan di data/tour-borobudur.json
// soal kenapa bukan dihitung dari GPS/kompas.

let tourGraph = null;
let tourNodesById = {};
let currentNodeId = null;
let quizData = null;
let sessionId = null;
let sessionWriteToken = null;
let currentIdentify = null;
let quizShownAt = null;
let mlModel = null;
let mlClassNames = [];
let geometryClasses = [];

const HOTSPOT_RADIUS = 4;
const HOTSPOT_HEIGHT = 1.2;

async function loadTour(jsonPath) {
  const res = await fetch(jsonPath);
  if (!res.ok) throw new Error('Gagal memuat data tur: ' + jsonPath);
  tourGraph = await res.json();
  tourNodesById = {};
  tourGraph.nodes.forEach(n => { tourNodesById[n.id] = n; });
  buildJumpMenu();
  renderNode(tourGraph.start_node);
}

function buildJumpMenu() {
  const select = document.getElementById('tour-jump');
  if (!select) return;
  select.innerHTML = '';
  tourGraph.folder_order.forEach(folder => {
    const firstNode = tourGraph.nodes.find(n => n.folder === folder);
    if (!firstNode) return;
    const opt = document.createElement('option');
    opt.value = firstNode.id;
    opt.textContent = firstNode.area_label;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => renderNode(select.value));
}

function angleToPosition(angleDeg, radius, height) {
  const rad = (angleDeg * Math.PI) / 180;
  const x = radius * Math.sin(rad);
  const z = -radius * Math.cos(rad);
  return `${x.toFixed(2)} ${height ?? HOTSPOT_HEIGHT} ${z.toFixed(2)}`;
}

function clearHotspots() {
  document.querySelectorAll('.wbn-hotspot').forEach(el => el.remove());
  document.querySelectorAll('.wbn-identify').forEach(el => el.remove());
}

function buildHotspot(connection) {
  // The ring itself carries the raycast target class — A-Frame's cursor emits
  // click on the exact entity whose Object3D was hit, which does not bubble
  // to a non-mesh parent wrapper, so class/position/listener all live here.
  const ring = document.createElement('a-ring');
  ring.setAttribute('class', 'wbn-hotspot tour-hotspot-ring');
  ring.setAttribute('position', angleToPosition(connection.local_angle, HOTSPOT_RADIUS));
  ring.setAttribute('look-at', '[camera]');
  ring.setAttribute('radius-inner', '0.28');
  ring.setAttribute('radius-outer', '0.4');
  ring.setAttribute('color', connection.label === 'Maju' ? '#00e5ff' : '#818CF8');
  ring.setAttribute('opacity', '0.85');
  ring.setAttribute('side', 'double');

  const label = document.createElement('a-text');
  label.setAttribute('value', connection.label);
  label.setAttribute('align', 'center');
  label.setAttribute('color', '#ffffff');
  label.setAttribute('width', '2.4');
  label.setAttribute('position', '0 -0.62 0');
  ring.appendChild(label);

  ring.dataset.target = connection.to;
  ring.addEventListener('click', () => renderNode(connection.to));

  return ring;
}

// Sudut TAMPILAN marker sengaja dipisah dari sudut PREDIKSI (identify.local_angle).
// local_angle asli (mis. 40°) sudah pas untuk crop dataset training, tapi itu
// nyaris di tepi FOV default kamera A-Frame (~80°) — nyaris tidak kelihatan
// tanpa menoleh sampai mentok. Marker ditampilkan lebih dekat ke tengah biar
// langsung kelihatan begitu titik dimuat, sementara prediksi ML tetap memakai
// local_angle asli supaya tetap cocok dengan cara model dilatih.
const IDENTIFY_DISPLAY_ANGLE = 18;
const IDENTIFY_DISPLAY_HEIGHT = HOTSPOT_HEIGHT + 0.9;

function buildIdentifyMarker(node, identify) {
  // Distinct look from nav hotspots (amber, octahedron) so it reads as
  // "inspect this" rather than "walk here".
  const marker = document.createElement('a-octahedron');
  marker.setAttribute('class', 'wbn-identify tour-hotspot-ring');
  marker.setAttribute('position', angleToPosition(IDENTIFY_DISPLAY_ANGLE, HOTSPOT_RADIUS - 0.5, IDENTIFY_DISPLAY_HEIGHT));
  marker.setAttribute('look-at', '[camera]');
  marker.setAttribute('radius', '0.32');
  marker.setAttribute('color', '#FFB74D');
  marker.setAttribute('opacity', '0.9');
  marker.setAttribute('material', 'shader:flat');

  const label = document.createElement('a-text');
  label.setAttribute('value', 'Identifikasi');
  label.setAttribute('align', 'center');
  label.setAttribute('color', '#ffffff');
  label.setAttribute('width', '2.4');
  label.setAttribute('position', '0 -0.55 0');
  marker.appendChild(label);

  marker.addEventListener('click', async () => {
    // Prediksi diambil dari crop tetap pada arah marker ini (bukan dari
    // arah kamera pengguna saat ini) — lihat catatan di predictFromNode().
    const prediction = await predictFromNode(node, identify);
    const display = buildDisplayIdentify(identify, prediction);
    currentIdentify = display;
    showGeoInfo(display);
    logInteraction(display, 'identify');
    logPrediction(display);
  });
  return marker;
}

// Gabungkan hasil prediksi ML sungguhan (jika model sudah dimuat & kelasnya
// dikenal) dengan teks naratif area (element/context) yang diatur admin.
// Kalau model belum siap atau prediksi meleset dari kelas yang punya data
// (mis. "kerucut" — belum ada foto latihan sama sekali), fallback ke data
// admin apa adanya supaya UI tidak pernah menampilkan info kosong.
function buildDisplayIdentify(identify, prediction) {
  if (!prediction) return { ...identify, ml_source: 'admin' };
  const cls = geometryClasses.find(c => c.class_id === prediction.classId);
  if (!cls) return { ...identify, ml_source: 'admin' };
  return {
    ...identify,
    class_id: cls.class_id,
    geo: cls.label_id, geo_en: cls.label_en,
    sisi: cls.sisi, rusuk: cls.rusuk, titik: cls.titik,
    volume: cls.volume, luas: cls.luas,
    conf: Math.round(prediction.confidence * 100),
    ml_source: prediction.source === 'server' ? 'model-server' : 'model-browser',
    ml_matches_area: cls.class_id === identify.class_id,
  };
}

function showGeoInfo(identify) {
  document.getElementById('info-geo-name').textContent = identify.geo    || '—';
  document.getElementById('info-geo-sub').textContent  = identify.geo_en || '—';
  document.getElementById('info-sisi').textContent     = identify.sisi   ?? '0';
  document.getElementById('info-rusuk').textContent    = identify.rusuk  ?? '0';
  document.getElementById('info-titik').textContent    = identify.titik  ?? '0';
  document.getElementById('info-volume').textContent   = identify.volume || '—';
  document.getElementById('info-luas').textContent     = identify.luas   || '—';
  document.getElementById('info-context').textContent  = identify.context || '—';
  document.getElementById('info-element').textContent  = identify.element || '';

  const conf = parseInt(identify.conf || 0);
  const fill = document.getElementById('info-conf-bar');
  const text = document.getElementById('info-conf-text');
  fill.style.width      = conf + '%';
  fill.style.background = conf >= 93 ? '#00e676' : conf >= 87 ? '#ffd700' : '#ff7043';
  text.style.color      = fill.style.background;
  const sourceLabel = { 'model-server': 'model server', 'model-browser': 'model browser (fallback)', admin: 'belum ada model — data admin' }[identify.ml_source] || 'model';
  text.textContent      = `${conf}% (${sourceLabel})`;

  document.getElementById('info-overlay').style.display = 'block';
}

function hideInfo() {
  document.getElementById('info-overlay').style.display = 'none';
}

function renderNode(nodeId) {
  const node = tourNodesById[nodeId];
  if (!node) return;

  const isFirstLoad = currentNodeId === null;
  const fade = document.getElementById('tour-fade');

  const applyNode = () => {
    currentNodeId = nodeId;
    hideInfo();

    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = '60%';

    const sky = document.getElementById('tour-sky');
    sky.setAttribute('src', node.image);

    clearHotspots();
    const scene = document.getElementById('vrscene');
    node.connections.forEach(conn => scene.appendChild(buildHotspot(conn)));
    if (node.identify) scene.appendChild(buildIdentifyMarker(node, node.identify));

    document.getElementById('tour-area-name').textContent = node.area_label;
    document.getElementById('tour-area-pos').textContent  = `Titik ${node.folder_pos + 1} / ${node.folder_total}`;
    document.getElementById('tour-area-desc').textContent = node.area_desc;

    if (sessionId) {
      logInteraction({
        class_id: node.folder.toLowerCase().replace(/\s+/g, '-'),
        element: node.area_label, geo: node.folder,
      }, 'visit');
    }

    const jump = document.getElementById('tour-jump');
    if (jump) {
      const firstOfFolder = tourGraph.nodes.find(n => n.folder === node.folder);
      if (firstOfFolder) jump.value = firstOfFolder.id;
    }

    if (bar) {
      bar.style.width = '100%';
      setTimeout(() => { bar.style.width = '0%'; }, 400);
    }
  };

  // Lompatan antar titik 360° tidak bisa dibuat mulus (bukan geometri 3D
  // yang bisa dijalani, cuma foto) — fade sebentar ke hitam supaya
  // perubahan sudut/pencahayaan yang tiba-tiba tidak terasa seperti "patah".
  if (isFirstLoad || !fade) {
    applyNode();
  } else {
    fade.classList.add('active');
    setTimeout(() => {
      applyNode();
      requestAnimationFrame(() => fade.classList.remove('active'));
    }, 220);
  }
}

// ── Navigasi keyboard: panah/WASD ────────────────────────
// Atas/W = maju, Bawah/S = mundur (sesuai hotspot yang ada di titik ini).
// Kiri/A dan Kanan/D = menoleh (bukan lompat "ke samping" — tidak ada foto
// yang diambil dari sisi jalur, jadi tidak ada tempat untuk dituju ke sana).
function handleTourKeydown(e) {
  if (!currentNodeId || document.getElementById('splash').style.display !== 'none') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  const node = tourNodesById[currentNodeId];
  if (!node) return;

  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    const conn = node.connections.find(c => c.label === 'Maju');
    if (conn) renderNode(conn.to);
  } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    const conn = node.connections.find(c => c.label === 'Mundur');
    if (conn) renderNode(conn.to);
  } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    nudgeLook(-20);
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    nudgeLook(20);
  } else {
    return;
  }
  e.preventDefault();
}

function nudgeLook(deltaDeg) {
  const cam = document.querySelector('[camera]');
  const lookControls = cam && cam.components['look-controls'];
  if (!lookControls || !lookControls.yawObject) return;
  lookControls.yawObject.rotation.y += (deltaDeg * Math.PI) / 180;
}

document.addEventListener('keydown', handleTourKeydown);

async function startTour() {
  if (loginMode === 'student') {
    const btn = document.getElementById('start-tour-btn');
    if (btn) btn.disabled = true;
    const ok = await studentLoginBeforeStart();
    if (btn) btn.disabled = false;
    if (!ok) return; // salah password dll — tetap di splash, jangan lanjut
  }

  const splash = document.getElementById('splash');
  splash.classList.add('fade-out');
  startSession();
  setTimeout(() => {
    splash.style.display = 'none';
    document.getElementById('vrscene').style.display = '';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('scene-btn').style.display = 'block';
    document.getElementById('dataset-toggle').style.display = 'block';
    if (studentAuthToken) {
      const rBtn = document.getElementById('student-results-toggle');
      if (rBtn) rBtn.style.display = 'block';
    }
    setTimeout(() => {
      const hint = document.getElementById('controls-hint');
      if (hint) hint.classList.add('hidden');
    }, 8000);
  }, 600);
}

document.addEventListener('DOMContentLoaded', () => {
  loadTour('../data/tour-borobudur.json').catch(err => console.error(err));
  loadGeometryClasses().catch(err => console.error(err));
  loadQuizData().catch(err => console.error(err));
  loadMLModel().catch(err => console.error('Model ML gagal dimuat:', err));
  loadSchoolOptions();
});

// ══════════════════════════════════════════════════════
// Machine Learning — klasifikasi geometri di browser (TensorFlow.js)
// Model MobileNetV2 dilatih dari crop foto panorama 360° (lihat
// MLTraining/train.py). Menggantikan nilai confidence "dummy" di atas
// dengan prediksi model sungguhan saat marker identifikasi diklik.
// ══════════════════════════════════════════════════════

async function loadMLModel() {
  const [model, classNames] = await Promise.all([
    tf.loadLayersModel('/ml-model/model.json'),
    fetch('/ml-model/class_indices.json').then(r => r.json()),
  ]);
  mlModel = model;
  mlClassNames = classNames;
  console.log('Model ML dimuat:', mlClassNames);
}

// Rescaling (0,255] -> [-1,1] terjadi di dalam model itu sendiri (lihat
// layers.Rescaling di train.py) — di sini cukup resize + expand dims.
function predictFromCanvas(canvas) {
  if (!mlModel || !canvas || canvas.width === 0 || canvas.height === 0) return null;
  try {
    return tf.tidy(() => {
      const img = tf.browser.fromPixels(canvas)
        .resizeBilinear([224, 224])
        .toFloat()
        .expandDims(0);
      const logits = mlModel.predict(img);
      const probs = logits.dataSync();
      let best = 0;
      for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
      return { classId: mlClassNames[best], confidence: probs[best] };
    });
  } catch (e) {
    console.error('Prediksi ML gagal:', e);
    return null;
  }
}

// Titik tengah rentang crop yang dipakai saat membuat dataset training
// (lihat YAW_OFFSETS/PITCH_OFFSETS di MLTraining/generate_dataset.py) —
// dipakai di sini supaya arah yang diprediksi konsisten dengan arah yang
// dipelajari model, bukan arah kamera pengguna yang bisa ke mana saja.
const PREDICT_PITCH_DEG = 1.5;

const imageCache = {};
function loadImageCached(src) {
  if (imageCache[src]) return imageCache[src];
  imageCache[src] = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  return imageCache[src];
}

// Reproyeksi equirectangular -> perspektif (gnomonic), sama persis dengan
// equirect_to_perspective() di MLTraining/generate_dataset.py. Menghasilkan
// crop yang SELALU menghadap arah marker, tidak peduli ke mana pengguna
// sedang menoleh saat mengklik — supaya hasil prediksi konsisten dan cocok
// dengan bagaimana model dilatih.
function equirectToPerspective(img, yawDeg, pitchDeg, fovDeg, outSize) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = W; srcCanvas.height = H;
  srcCanvas.getContext('2d').drawImage(img, 0, 0);
  const srcData = srcCanvas.getContext('2d').getImageData(0, 0, W, H).data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outSize; outCanvas.height = outSize;
  const outCtx = outCanvas.getContext('2d');
  const outData = outCtx.createImageData(outSize, outSize);

  const fov = (fovDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const tanHalfFov = Math.tan(fov / 2);

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
      let u = Math.floor(((lon / (2 * Math.PI)) + 0.5) * W);
      let v = Math.floor((0.5 - lat / Math.PI) * H);
      u = Math.max(0, Math.min(W - 1, u));
      v = Math.max(0, Math.min(H - 1, v));

      const srcIdx = (v * W + u) * 4;
      const dstIdx = (j * outSize + i) * 4;
      outData.data[dstIdx]     = srcData[srcIdx];
      outData.data[dstIdx + 1] = srcData[srcIdx + 1];
      outData.data[dstIdx + 2] = srcData[srcIdx + 2];
      outData.data[dstIdx + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

// Server punya foto panorama yang sama di disk dan menjalankan model yang
// identik — jadi prediksi "resmi" lewat API server-side dicoba dulu (juga
// tercatat sebagai sumber kebenaran terpusat, bukan hasil komputasi browser
// klien yang bisa saja dimodifikasi). Kalau server tak terjangkau (jaringan
// putus di tengah eksplorasi VR), baru jatuh ke model TF.js lokal di browser
// supaya pengalaman tur tidak berhenti total.
async function predictFromNode(node, identify) {
  try {
    const res = await fetch(`/api/ml/predict/borobudur/${node.id}`, { method: 'POST' });
    const json = await res.json();
    if (json.success) return { classId: json.data.class_id, confidence: json.data.confidence, source: 'server' };
  } catch (e) {
    console.warn('Prediksi server-side gagal, coba fallback browser:', e.message);
  }

  if (!mlModel) return null;
  try {
    const img = await loadImageCached(node.image);
    const crop = equirectToPerspective(img, identify.local_angle, PREDICT_PITCH_DEG, 65, 224);
    const localResult = predictFromCanvas(crop);
    return localResult ? { ...localResult, source: 'browser' } : null;
  } catch (e) {
    console.error('Prediksi ML gagal (server & browser):', e);
    return null;
  }
}

// ══════════════════════════════════════════════════════
// Sesi & Log Aktivitas Siswa (dasar laporan guru)
// ══════════════════════════════════════════════════════

async function loadSchoolOptions() {
  const selects = document.querySelectorAll('.school-select');
  if (!selects.length) return;
  try {
    const res = await fetch('/api/schools');
    const json = await res.json();
    selects.forEach(select => {
      (json.data || []).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        select.appendChild(opt);
      });
    });
  } catch (e) { /* dropdown sekolah opsional — jangan blokir tur kalau gagal */ }
}

// ══════════════════════════════════════════════════════
// Login Siswa Sungguhan (opsional — mode "Tamu" tetap tersedia untuk demo
// publik/GitHub Pages tanpa akun). Kalau login berhasil, token dipakai saat
// mulai sesi supaya tercatat dengan nama/kelas asli, bukan nama isian bebas.
// ══════════════════════════════════════════════════════
let loginMode = 'guest';
let studentAuthToken = null;

function setLoginMode(mode) {
  loginMode = mode;
  document.querySelectorAll('.mode-tab').forEach(el => el.classList.toggle('active', el.dataset.mode === mode));
  const guestFields = document.getElementById('guest-fields');
  const studentFields = document.getElementById('student-login-fields');
  if (guestFields) guestFields.style.display = mode === 'guest' ? '' : 'none';
  if (studentFields) studentFields.style.display = mode === 'student' ? '' : 'none';
}

async function studentLoginBeforeStart() {
  const schoolId = document.getElementById('login-school')?.value;
  const studentNumber = document.getElementById('login-student-number')?.value.trim();
  const password = document.getElementById('login-student-password')?.value;
  const errEl = document.getElementById('student-login-error');
  if (errEl) errEl.textContent = '';

  if (!schoolId || !studentNumber || !password) {
    if (errEl) errEl.textContent = 'Pilih sekolah, isi nomor induk, dan password.';
    return false;
  }
  try {
    const res = await fetch('/api/auth/student-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, student_number: studentNumber, password }),
    });
    const json = await res.json();
    if (!json.success) { if (errEl) errEl.textContent = json.message; return false; }
    studentAuthToken = json.token;
    return true;
  } catch (e) {
    if (errEl) errEl.textContent = 'Gagal menghubungi server';
    return false;
  }
}

async function startSession() {
  const nameInput = document.getElementById('student-name');
  const schoolSelect = document.getElementById('student-school');
  const studentName = (nameInput && nameInput.value.trim()) || 'Anonim';
  const schoolId = (schoolSelect && schoolSelect.value) || null;
  const deviceType = window.innerWidth < 768 ? 'mobile' : 'desktop';
  const headers = { 'Content-Type': 'application/json' };
  // Token siswa (kalau login sungguhan) dipakai server untuk mengisi
  // student_id/class_id yang benar — server tidak percaya begitu saja
  // school_id/nama dari body kalau ada token yang sah.
  if (studentAuthToken) headers.Authorization = 'Bearer ' + studentAuthToken;
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ student_name: studentName, school_id: schoolId, scene_name: 'borobudur-360', device_type: deviceType }),
    });
    const json = await res.json();
    if (json.success) {
      sessionId = json.session_id;
      sessionWriteToken = json.session_token || null;
    }
  } catch (e) { /* logging best-effort — jangan blokir pengalaman tur */ }
}

function endSession() {
  if (!sessionId) return;
  fetch(`/api/sessions/${sessionId}/end`, {
    method: 'PUT',
    headers: sessionOwnershipHeaders(),
    keepalive: true,
  });
}
window.addEventListener('beforeunload', endSession);

// ══════════════════════════════════════════════════════
// Hasil Belajar Saya — siswa login sungguhan bisa melihat kembali
// riwayat sesi & akurasi kuisnya sendiri (diskop lewat token, server
// tidak menerima student_id dari client).
// ══════════════════════════════════════════════════════
let studentResultsLoaded = false;

function sessionOwnershipHeaders() {
  const headers = {};
  if (studentAuthToken) headers.Authorization = 'Bearer ' + studentAuthToken;
  else if (sessionWriteToken) headers['X-Session-Token'] = sessionWriteToken;
  return headers;
}

function sessionJsonHeaders() {
  return { 'Content-Type': 'application/json', ...sessionOwnershipHeaders() };
}

async function toggleStudentResults() {
  const panel = document.getElementById('student-results-panel');
  if (!panel) return;
  const willShow = panel.style.display !== 'block';
  panel.style.display = willShow ? 'block' : 'none';
  if (willShow && !studentResultsLoaded) await loadStudentResults();
}

function setStudentResultsMessage(panel, message) {
  const content = document.createElement('div');
  content.className = 'sr-empty';
  content.textContent = message;
  panel.replaceChildren(content);
}

async function loadStudentResults() {
  const panel = document.getElementById('student-results-panel');
  if (!panel || !studentAuthToken) return;
  setStudentResultsMessage(panel, 'Memuat…');
  try {
    const res = await fetch('/api/students/me/results', { headers: { Authorization: 'Bearer ' + studentAuthToken } });
    const json = await res.json();
    if (!json.success) { setStudentResultsMessage(panel, json.message || 'Gagal memuat'); return; }
    studentResultsLoaded = true;
    renderStudentResults(json.data);
  } catch (e) {
    setStudentResultsMessage(panel, 'Gagal menghubungi server');
  }
}

function renderStudentResults(data) {
  const panel = document.getElementById('student-results-panel');
  const t = data.totals;
  const rows = (data.perQuestion || []).slice(0, 10).map(q => `
    <div class="sr-row ${q.is_correct ? 'correct' : 'wrong'}">
      <span>${escapeHtml(q.question_id)}</span>
      <span class="sr-badge">${q.is_correct ? 'Benar' : 'Salah'}</span>
    </div>`).join('');
  panel.innerHTML = `
    <div class="sr-name">${escapeHtml(data.name)}</div>
    <div class="sr-stats">
      <div class="sr-stat"><div class="val">${escapeHtml(t.total_sessions)}</div><div class="lbl">Sesi</div></div>
      <div class="sr-stat"><div class="val">${escapeHtml(t.quiz_accuracy_pct)}%</div><div class="lbl">Akurasi Kuis</div></div>
      <div class="sr-stat"><div class="val">${escapeHtml(t.total_quiz_attempts)}</div><div class="lbl">Kuis Dijawab</div></div>
      <div class="sr-stat"><div class="val">${escapeHtml(t.total_interactions)}</div><div class="lbl">Interaksi</div></div>
    </div>
    <div class="sr-section-label">Riwayat Kuis Terbaru</div>
    ${rows || '<div class="sr-empty">Belum ada kuis dijawab</div>'}`;
}

function logInteraction(identify, type, gazeDuration) {
  if (!sessionId) return;
  fetch('/api/interactions', {
    method: 'POST',
    headers: sessionJsonHeaders(),
    body: JSON.stringify({
      session_id: sessionId,
      object_code: identify.class_id,
      object_name: identify.element,
      geometry_label: identify.geo,
      interaction_type: type,
      gaze_duration: gazeDuration || null,
    }),
  }).catch(() => {});
}

function logPrediction(identify) {
  if (!sessionId) return;
  fetch('/api/predictions', {
    method: 'POST',
    headers: sessionJsonHeaders(),
    body: JSON.stringify({
      session_id: sessionId,
      object_code: identify.class_id,
      object_name: identify.element,
      geometry_label: identify.geo,
      predicted_label: identify.geo,
      confidence_score: (identify.conf || 0) / 100,
    }),
  }).catch(() => {});
}

// ══════════════════════════════════════════════════════
// Kuis (uji pemahaman) — data/quiz.json, dipicu dari panel identifikasi
// ══════════════════════════════════════════════════════

async function loadQuizData() {
  const res = await fetch('../data/quiz.json');
  quizData = await res.json();
}

function openQuiz() {
  if (!quizData || !currentIdentify) return;
  const question = quizData.questions.find(q => q.class_id === currentIdentify.class_id);
  if (!question) return;

  document.getElementById('quiz-question').textContent = question.question;
  document.getElementById('quiz-feedback').textContent = '';
  const optionsEl = document.getElementById('quiz-options');
  optionsEl.innerHTML = '';
  question.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => answerQuiz(question, opt, btn));
    optionsEl.appendChild(btn);
  });

  quizShownAt = Date.now();
  document.getElementById('quiz-overlay').style.display = 'block';
}

function closeQuiz() {
  document.getElementById('quiz-overlay').style.display = 'none';
}

function answerQuiz(question, selected, btnEl) {
  const isCorrect = selected === question.correct_answer;
  const responseTime = quizShownAt ? (Date.now() - quizShownAt) / 1000 : null;

  document.querySelectorAll('.quiz-option').forEach(b => {
    b.disabled = true;
    if (b.textContent === question.correct_answer) b.classList.add('correct');
    else if (b === btnEl) b.classList.add('wrong');
  });
  document.getElementById('quiz-feedback').textContent =
    (isCorrect ? 'Benar! ' : 'Kurang tepat. ') + question.explanation;

  if (sessionId) {
    fetch('/api/quiz-results', {
      method: 'POST',
      headers: sessionJsonHeaders(),
      body: JSON.stringify({
        session_id: sessionId, question_id: question.id,
        answer: selected, response_time: responseTime,
      }),
    }).catch(() => {});
  }
}

// ══════════════════════════════════════════════════════
// Dataset Capture Mode — untuk tim peneliti menyusun
// Dataset/geometry_wbn/ dari view tur 360° (bukan crop
// manual equirectangular — WebGL sudah merender proyeksi
// perspektif yang benar dari sudut pandang kamera saat ini).
// ══════════════════════════════════════════════════════

function getDatasetToken() {
  return localStorage.getItem('vgn_token') || '';
}

async function loadGeometryClasses() {
  const res = await fetch('../data/geometry-labels.json');
  const json = await res.json();
  geometryClasses = json.classes;
  const select = document.getElementById('dataset-class');
  json.classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.class_id;
    opt.textContent = `${c.label_id} (${c.label_en})`;
    select.appendChild(opt);
  });
}

function toggleDatasetPanel() {
  const panel = document.getElementById('dataset-panel');
  const toggle = document.getElementById('dataset-toggle');
  const show = panel.style.display === 'none';
  panel.style.display = show ? 'block' : 'none';
  toggle.classList.toggle('active', show);
  if (show) {
    const authed = !!getDatasetToken();
    document.getElementById('dataset-login').style.display   = authed ? 'none' : 'block';
    document.getElementById('dataset-capture').style.display = authed ? 'block' : 'none';
  }
}

async function datasetLogin() {
  const username = document.getElementById('dataset-user').value.trim();
  const password = document.getElementById('dataset-pass').value;
  const msg = document.getElementById('dataset-login-msg');
  msg.textContent = 'Memproses...';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (!json.success) { msg.textContent = json.message || 'Login gagal'; return; }
    if (json.must_change_password === true) {
      msg.textContent = 'Ganti password terlebih dahulu melalui Panel Admin.';
      return;
    }
    localStorage.setItem('vgn_token', json.token);
    localStorage.setItem('vgn_user', json.username);
    msg.textContent = '';
    document.getElementById('dataset-login').style.display   = 'none';
    document.getElementById('dataset-capture').style.display = 'block';
  } catch (e) {
    msg.textContent = 'Gagal menghubungi server';
  }
}

function captureDatasetImage() {
  const status = document.getElementById('dataset-status');
  const classId = document.getElementById('dataset-class').value;
  const canvas = document.querySelector('a-scene').canvas;
  if (!canvas) { status.textContent = 'Canvas belum siap.'; return; }

  status.textContent = 'Menyimpan...';
  canvas.toBlob(async (blob) => {
    try {
      const res = await fetch(`/api/dataset/${classId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/jpeg',
          Authorization: 'Bearer ' + getDatasetToken(),
        },
        body: blob,
      });
      const json = await res.json();
      if (!json.success) { status.textContent = json.message || 'Gagal menyimpan'; return; }
      status.textContent = `Tersimpan: ${json.filename} (total ${json.total} gambar)`;
    } catch (e) {
      status.textContent = 'Gagal menghubungi server';
    }
  }, 'image/jpeg', 0.92);
}
