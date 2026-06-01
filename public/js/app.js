// VR-GeoNusa — Main Application Logic

// ── Scene Registry ───────────────────────────────────
const SCENES = {
  borobudur: {
    name: 'Candi Borobudur',
    location: 'Magelang, Jawa Tengah',
    era: 'Abad ke-8 Masehi',
    skyColor: '#1a2744',
    groundColor: '#2d4a2a',
    file: 'scenes/borobudur.html',
  },
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
let currentScene = 'borobudur';
let hintsVisible = true;

// ── Splash ───────────────────────────────────────────
function startApp() {
  const splash = document.getElementById('splash');
  splash.classList.add('fade-out');
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
}

function hideInfo() {
  document.getElementById('info-overlay').style.display = 'none';
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
  const scene = document.querySelector('a-scene');
  if (!scene) return;
  if (scene.hasLoaded) { initInteractions(); }
  else { scene.addEventListener('loaded', initInteractions); }
});
