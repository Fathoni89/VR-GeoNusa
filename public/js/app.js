// VR-GeoNusa — Main Application Logic

// ── Scene Registry ───────────────────────────────────
const SCENES = {
  prambanan: {
    name: 'Candi Prambanan',
    location: 'Sleman, DI Yogyakarta',
    era: 'Abad ke-9 Masehi',
    skyColor: '#1f1a30',
    groundColor: '#3a3028',
    file: 'scenes/prambanan.html',
  },
};

// ── State ────────────────────────────────────────────
// Candi Borobudur pindah ke vr/tour-borobudur.html (foto 360° + identifikasi
// geometri) — bukan lagi bagian dari registry primitif ini.
let currentScene = 'prambanan';
let hintsVisible = true;
let sessionId = null;
let quizData = null;
let currentQuizClass = null;
let quizShownAt = null;

// ── Splash ───────────────────────────────────────────
async function startApp() {
  if (loginMode === 'student') {
    const ok = await studentLoginBeforeStart();
    if (!ok) return; // salah password dll — tetap di splash
  }

  const splash = document.getElementById('splash');
  splash.classList.add('fade-out');
  startSession();
  setTimeout(() => {
    splash.style.display = 'none';
    loadScene(currentScene);
  }, 600);
}

function selectScene(key) {
  currentScene = key;
  document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
  const card = document.querySelector(`.scene-card[data-scene="${key}"]`);
  if (card) card.classList.add('active');
}

// ── Scene Loader ─────────────────────────────────────
function loadScene(key) {
  const scene = SCENES[key];
  if (!scene) return;

  const bar = document.getElementById('loading-bar');
  bar.style.width = '30%';

  // Show the a-scene container
  const vrscene = document.getElementById('vrscene');
  vrscene.style.display = '';

  // Update HUD
  document.getElementById('hud-name').textContent = scene.name;
  document.getElementById('hud-loc').textContent = scene.location;
  document.getElementById('hud').style.display = 'block';
  document.getElementById('scene-btn').style.display = 'block';
  if (studentAuthToken) {
    const rBtn = document.getElementById('student-results-toggle');
    if (rBtn) rBtn.style.display = 'block';
  }

  bar.style.width = '100%';
  setTimeout(() => { bar.style.width = '0%'; }, 500);

  // Hide controls hint after 8 seconds
  setTimeout(() => {
    const hint = document.getElementById('controls-hint');
    if (hint) hint.classList.add('hidden');
    hintsVisible = false;
  }, 8000);
}

// ── Info Panel ───────────────────────────────────────
function showInfo(el) {
  const panel = document.getElementById('info-overlay');
  const d = el.dataset;

  document.getElementById('info-geo-name').textContent  = d.geo    || '—';
  document.getElementById('info-geo-sub').textContent   = d.geoEn  || '—';
  document.getElementById('info-sisi').textContent      = d.sisi   || '0';
  document.getElementById('info-rusuk').textContent     = d.rusuk  || '0';
  document.getElementById('info-titik').textContent     = d.titik  || '0';
  document.getElementById('info-volume').textContent    = d.volume || '—';
  document.getElementById('info-luas').textContent      = d.luas   || '—';
  document.getElementById('info-context').textContent   = d.context || '—';
  document.getElementById('info-element').textContent   = d.element || '';

  const conf = parseInt(d.conf || '0');
  const fill = document.getElementById('info-conf-bar');
  const text = document.getElementById('info-conf-text');
  fill.style.width      = conf + '%';
  fill.style.background = conf >= 93 ? '#00e676' : conf >= 87 ? '#ffd700' : '#ff7043';
  text.style.color      = fill.style.background;
  text.textContent      = conf + '% (dummy ML)';

  panel.style.display = 'block';

  // Kelas geometri belum digerakkan oleh model sungguhan di scene ini (baru
  // Borobudur yang punya model TF.js terlatih) — object_code di sini dipakai
  // untuk mencocokkan soal kuis dan mencatat interaksi, bukan hasil prediksi.
  currentQuizClass = (d.geo || '').toLowerCase().replace(/\s+/g, '-');
  logInteraction(el.id, d.element, d.geo, 'identify');
  logPrediction(el.id, d.element, d.geo, d.geo, conf / 100);
}

function hideInfo() {
  document.getElementById('info-overlay').style.display = 'none';
}

// ══════════════════════════════════════════════════════
// Sesi & Log Aktivitas Siswa — sama seperti tur Borobudur,
// dipakai bersama di semua scene primitif (Prambanan, dst).
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
  } catch (e) { /* dropdown sekolah opsional */ }
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
  if (studentAuthToken) headers.Authorization = 'Bearer ' + studentAuthToken;
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ student_name: studentName, school_id: schoolId, scene_name: currentScene, device_type: deviceType }),
    });
    const json = await res.json();
    if (json.success) sessionId = json.session_id;
  } catch (e) { /* logging best-effort */ }
}

function endSession() {
  if (!sessionId) return;
  fetch(`/api/sessions/${sessionId}/end`, { method: 'PUT', keepalive: true });
}
window.addEventListener('beforeunload', endSession);

// ══════════════════════════════════════════════════════
// Hasil Belajar Saya — siswa login sungguhan bisa melihat kembali
// riwayat sesi & akurasi kuisnya sendiri (diskop lewat token, server
// tidak menerima student_id dari client).
// ══════════════════════════════════════════════════════
let studentResultsLoaded = false;

async function toggleStudentResults() {
  const panel = document.getElementById('student-results-panel');
  if (!panel) return;
  const willShow = panel.style.display !== 'block';
  panel.style.display = willShow ? 'block' : 'none';
  if (willShow && !studentResultsLoaded) await loadStudentResults();
}

async function loadStudentResults() {
  const panel = document.getElementById('student-results-panel');
  if (!panel || !studentAuthToken) return;
  panel.innerHTML = '<div class="sr-empty">Memuat…</div>';
  try {
    const res = await fetch('/api/students/me/results', { headers: { Authorization: 'Bearer ' + studentAuthToken } });
    const json = await res.json();
    if (!json.success) { panel.innerHTML = `<div class="sr-empty">${json.message || 'Gagal memuat'}</div>`; return; }
    studentResultsLoaded = true;
    renderStudentResults(json.data);
  } catch (e) {
    panel.innerHTML = '<div class="sr-empty">Gagal menghubungi server</div>';
  }
}

function renderStudentResults(data) {
  const panel = document.getElementById('student-results-panel');
  const t = data.totals;
  const rows = (data.perQuestion || []).slice(0, 10).map(q => `
    <div class="sr-row ${q.is_correct ? 'correct' : 'wrong'}">
      <span>${q.question_id}</span>
      <span class="sr-badge">${q.is_correct ? '✓ Benar' : '✗ Salah'}</span>
    </div>`).join('');
  panel.innerHTML = `
    <div class="sr-name">👤 ${data.name}</div>
    <div class="sr-stats">
      <div class="sr-stat"><div class="val">${t.total_sessions}</div><div class="lbl">Sesi</div></div>
      <div class="sr-stat"><div class="val">${t.quiz_accuracy_pct}%</div><div class="lbl">Akurasi Kuis</div></div>
      <div class="sr-stat"><div class="val">${t.total_quiz_attempts}</div><div class="lbl">Kuis Dijawab</div></div>
      <div class="sr-stat"><div class="val">${t.total_interactions}</div><div class="lbl">Interaksi</div></div>
    </div>
    <div class="sr-section-label">Riwayat Kuis Terbaru</div>
    ${rows || '<div class="sr-empty">Belum ada kuis dijawab</div>'}`;
}

function logInteraction(objectCode, objectName, geometryLabel, type) {
  if (!sessionId) return;
  fetch('/api/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, object_code: objectCode, object_name: objectName, geometry_label: geometryLabel, interaction_type: type }),
  }).catch(() => {});
}

function logPrediction(objectCode, objectName, geometryLabel, predictedLabel, confidence) {
  if (!sessionId) return;
  fetch('/api/predictions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, object_code: objectCode, object_name: objectName, geometry_label: geometryLabel, predicted_label: predictedLabel, confidence_score: confidence }),
  }).catch(() => {});
}

// ══════════════════════════════════════════════════════
// Kuis (uji pemahaman) — sama seperti di tur Borobudur,
// data dari data/quiz.json, dicocokkan lewat kelas geometri objek.
// ══════════════════════════════════════════════════════

async function loadQuizData() {
  try {
    const res = await fetch('../data/quiz.json');
    quizData = await res.json();
  } catch (e) { /* kuis opsional — jangan blokir scene kalau gagal */ }
}

function openQuiz() {
  if (!quizData || !currentQuizClass) return;
  const question = quizData.questions.find(q => q.class_id === currentQuizClass);
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
    (isCorrect ? '✓ Benar! ' : '✗ Kurang tepat. ') + question.explanation;

  if (sessionId) {
    fetch('/api/quiz-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, question_id: question.id, answer: selected, is_correct: isCorrect, response_time: responseTime }),
    }).catch(() => {});
  }
}

// ── A-Frame Init ─────────────────────────────────────
function initInteractions() {
  const objects = document.querySelectorAll('.wbn-object');
  objects.forEach(obj => {
    obj.addEventListener('click', function () { showInfo(this); });

    obj.addEventListener('mouseenter', function () {
      this.setAttribute('animation__glow', {
        property: 'components.material.material.emissive',
        type: 'color', to: '#1a3a2a', dur: 250,
      });
    });

    obj.addEventListener('mouseleave', function () {
      this.removeAttribute('animation__glow');
      this.setAttribute('material', 'emissive', '#000000');
    });
  });
}

// Wait for A-Frame scene to load
document.addEventListener('DOMContentLoaded', () => {
  loadQuizData();
  loadSchoolOptions();
  const scene = document.querySelector('a-scene');
  if (!scene) return;
  if (scene.hasLoaded) { initInteractions(); }
  else { scene.addEventListener('loaded', initInteractions); }
});
