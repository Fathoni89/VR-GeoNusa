// VR-GeoNusa — Dynamic Scene Loader
// Membaca data dari JSON dan membangun entitas A-Frame secara dinamis.
// Mendukung primitive (box/sphere/cylinder/cone) dan model GLTF/GLB.

async function loadSceneData(jsonPath) {
  const res = await fetch(jsonPath);
  if (!res.ok) throw new Error('Gagal memuat scene data: ' + jsonPath);
  return res.json();
}

function buildAFrameEntity(obj) {
  let el;

  if (obj.model_src && obj.model_src.trim() !== '') {
    // ── GLTF/GLB model ──────────────────────────────
    el = document.createElement('a-entity');
    el.setAttribute('gltf-model', obj.model_src);
    el.setAttribute('scale', obj.scale || '1 1 1');
  } else {
    // ── Primitive geometry ───────────────────────────
    const tagMap = { box: 'a-box', sphere: 'a-sphere', cylinder: 'a-cylinder', cone: 'a-cone' };
    const tag = tagMap[obj.type] || 'a-box';
    el = document.createElement(tag);

    el.setAttribute('color',     obj.color     || '#888888');
    el.setAttribute('roughness', obj.roughness  || '0.8');
    el.setAttribute('scale',     obj.scale      || '1 1 1');

    if (obj.type === 'box') {
      if (obj.width)  el.setAttribute('width',  obj.width);
      if (obj.height) el.setAttribute('height', obj.height);
      if (obj.depth)  el.setAttribute('depth',  obj.depth);
    } else if (obj.type === 'sphere') {
      if (obj.radius)       el.setAttribute('radius',       obj.radius);
      if (obj.theta_length) el.setAttribute('theta-length', obj.theta_length);
    } else if (obj.type === 'cylinder') {
      if (obj.radius) el.setAttribute('radius', obj.radius);
      if (obj.height) el.setAttribute('height', obj.height);
    } else if (obj.type === 'cone') {
      if (obj.radius_bottom)   el.setAttribute('radius-bottom',   obj.radius_bottom);
      if (obj.radius_top)      el.setAttribute('radius-top',      obj.radius_top);
      if (obj.height)          el.setAttribute('height',          obj.height);
      if (obj.segments_radial) el.setAttribute('segments-radial', obj.segments_radial);
    }
  }

  el.setAttribute('id',       obj.id);
  el.setAttribute('position', obj.position || '0 0 0');
  el.setAttribute('rotation', obj.rotation || '0 0 0');

  if (obj.interactive) {
    el.setAttribute('class', 'wbn-object');

    // Data attributes for info panel
    el.dataset.geo     = obj.geo     || '';
    el.dataset.geoEn   = obj.geo_en  || '';
    el.dataset.sisi    = obj.sisi    || '0';
    el.dataset.rusuk   = obj.rusuk   || '0';
    el.dataset.titik   = obj.titik   || '0';
    el.dataset.volume  = obj.volume  || '—';
    el.dataset.luas    = obj.luas    || '—';
    el.dataset.element = obj.element || '';
    el.dataset.context = obj.context || '';
    el.dataset.conf    = obj.conf    || '0';

    // Hover color via event-set
    if (obj.color_hover && !obj.model_src) {
      el.setAttribute('event-set__mouseenter', `color:${obj.color_hover}`);
      el.setAttribute('event-set__mouseleave', `color:${obj.color}`);
    }
  }

  return el;
}

async function initSceneFromJSON(jsonPath, sceneEl) {
  const data = await loadSceneData(jsonPath);

  // Inject objects into scene
  data.objects.forEach(obj => {
    const entity = buildAFrameEntity(obj);
    sceneEl.appendChild(entity);
  });

  // Update sky + ground
  const sky = sceneEl.querySelector('a-sky');
  if (sky && data.sky_color) sky.setAttribute('color', data.sky_color);

  const grounds = sceneEl.querySelectorAll('a-plane[data-ground]');
  grounds.forEach(g => g.setAttribute('color', data.ground_color || '#2d4a2a'));

  // Update cursor color
  const cursor = sceneEl.querySelector('a-cursor');
  if (cursor && data.cursor_color) cursor.setAttribute('color', data.cursor_color);

  // Update floating label
  const labelMain = sceneEl.querySelector('#scene-label-main');
  const labelSub  = sceneEl.querySelector('#scene-label-sub');
  if (labelMain) labelMain.setAttribute('value', data.name.toUpperCase());
  if (labelSub)  labelSub.setAttribute('value', data.era);

  return data;
}
