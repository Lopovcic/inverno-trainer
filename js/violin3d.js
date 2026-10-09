/* Inverno-Trainer · violin3d.js
 * Procedural 3D violin (three.js r147, classic script) that shows where a note is
 * fingered (target ring + finger number on the right string) and where the
 * player's finger really is according to the detected pitch (fingertip sphere),
 * with a correction arrow along the string.
 *
 * Units: millimetres. Axes: x along the strings (nut at x = 0, bridge at x = 328,
 * scroll at negative x), y up (out of the top plate), z across the strings with
 * the G string at +z and the E string at −z — seen from the front with the scroll
 * up, G is on the left and E on the right, as on a real violin.
 */
(function () {
  'use strict';
  const IT = (window.IT = window.IT || {});

  const SCALE = 328;                         // vibrating string length nut → bridge
  const FB_LEN = 270;                        // fingerboard length
  const BODY_X0 = 130, BODY_L = 356;         // body starts 130 mm after the nut
  const Z_NUT = [8.25, 2.75, -2.75, -8.25];  // G D A E
  const Z_BRIDGE = [17, 5.667, -5.667, -17];
  const Y_BRIDGE = [45.2, 47.1, 46.4, 42.7];
  const RADIUS = [0.62, 0.53, 0.45, 0.32];   // slightly exaggerated for visibility
  const FB_R = 42;                           // fingerboard camber radius

  const fbCenterY = x => 8 + 0.1037 * x;
  const fbDrop = z => FB_R - Math.sqrt(Math.max(0, FB_R * FB_R - z * z));
  const fbWidth = x => 24 + 18 * Math.max(0, Math.min(1, x / FB_LEN));
  const fingerMM = semis => SCALE * (1 - Math.pow(2, -semis / 12));
  const yNut = s => fbCenterY(0) - fbDrop(Z_NUT[s]) + 0.6;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ------------------------------------------------------------------ body outline
  // Half-width w(t) of the body along its length t (0 = upper end … 356 = lower end).
  const OUTLINE = [
    [[0, 0], [0, 30], [12, 70], [40, 80]],
    [[40, 80], [60, 86], [95, 86], [118, 78]],
    [[118, 78], [124, 76], [128, 75], [131, 77]],
    [[131, 77], [133, 70], [136, 63], [145, 59]],
    [[145, 59], [158, 55], [192, 55], [205, 59]],
    [[205, 59], [214, 63], [217, 70], [219, 78]],
    [[219, 78], [221, 80], [225, 81], [231, 82]],
    [[231, 82], [250, 95], [262, 104], [285, 104]],
    [[285, 104], [320, 104], [356, 70], [356, 0]],
  ];
  const HALF = (() => {
    const pts = [];
    for (const [p0, p1, p2, p3] of OUTLINE) {
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
        pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
      }
    }
    pts.sort((p, q) => p[0] - q[0]);
    const table = new Float32Array(BODY_L + 1);
    let k = 0;
    for (let t = 0; t <= BODY_L; t++) {
      while (k + 1 < pts.length - 1 && pts[k + 1][0] < t) k++;
      const [t0, w0] = pts[k], [t1, w1] = pts[Math.min(pts.length - 1, k + 1)];
      table[t] = t1 > t0 ? w0 + (w1 - w0) * clamp((t - t0) / (t1 - t0), 0, 1) : w0;
    }
    table[0] = 0; table[BODY_L] = 0;
    return table;
  })();
  function halfWidth(t) {
    if (t <= 0 || t >= BODY_L) return 0;
    const i = Math.floor(t), f = t - i;
    return HALF[i] * (1 - f) + HALF[Math.min(BODY_L, i + 1)] * f;
  }
  function archTop(t, u) {
    const along = Math.pow(Math.sin(Math.PI * clamp(t / BODY_L, 0, 1)), 0.55);
    const across = Math.pow(Math.max(0, 1 - u * u), 1.35);
    return 1.8 + 13.5 * along * across;
  }
  function archBack(t, u) {
    const along = Math.pow(Math.sin(Math.PI * clamp(t / BODY_L, 0, 1)), 0.6);
    return 1.6 + 11 * along * Math.pow(Math.max(0, 1 - u * u), 1.5);
  }

  // ------------------------------------------------------------------ textures
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, THREE, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
  function topTexture(THREE) {
    const W = 1024, H = 640, c = canvas(W, H), g = c.getContext('2d');
    const X = t => t / BODY_L * W, Y = z => (z + 110) / 220 * H;
    const grad = g.createRadialGradient(X(200), Y(0), 30, X(190), Y(0), 560);
    grad.addColorStop(0, '#c9772f'); grad.addColorStop(0.55, '#a5531d'); grad.addColorStop(1, '#5e250b');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // spruce grain along the length
    let z = -108;
    while (z < 108) {
      const step = 1.2 + 1.6 * Math.abs(Math.sin(z * 0.37)) + Math.random() * 0.6;
      g.strokeStyle = `rgba(60,22,6,${0.1 + Math.random() * 0.12})`;
      g.lineWidth = 0.9 + Math.random() * 1.2;
      g.beginPath();
      for (let t = 0; t <= BODY_L; t += 8) { const yy = Y(z + Math.sin(t * 0.02 + z) * 0.25); t === 0 ? g.moveTo(X(t), yy) : g.lineTo(X(t), yy); }
      g.stroke();
      z += step;
    }
    // purfling: dark-light-dark band 4 mm inside the edge
    const edge = (inset, lw, col) => {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      for (let s = -1; s <= 1; s += 2) {
        for (let t = 2; t <= BODY_L - 2; t += 1.5) {
          const w = Math.max(0, halfWidth(t) - inset);
          const xx = X(t), yy = Y(s * w);
          t === 2 ? g.moveTo(xx, yy) : g.lineTo(xx, yy);
        }
      }
      g.stroke();
    };
    edge(4.2, 4.2, '#24100a'); edge(4.2, 1.3, '#d8b88a');
    // f-holes
    g.fillStyle = '#140a06'; g.strokeStyle = '#140a06';
    for (const s of [-1, 1]) {
      const p = (t, zz) => [X(t), Y(s * zz)];
      g.lineCap = 'round';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(...p(172, 31));
      g.bezierCurveTo(...p(190, 30), ...p(196, 46), ...p(232, 47));
      g.stroke();
      g.lineWidth = 3;
      g.beginPath(); g.arc(...p(169, 30.5), 7.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(...p(236, 48), 9, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(...p(177, 33)); g.lineTo(...p(186, 37)); g.stroke();
      g.beginPath(); g.moveTo(...p(222, 44)); g.lineTo(...p(229, 50)); g.stroke();
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(...p(200, 36.5)); g.lineTo(...p(200, 33.5)); g.stroke();
    }
    return tex(c, THREE);
  }
  function mapleTexture(THREE, base, flames) {
    const c = canvas(512, 128), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < flames; i++) {
      const x = i * 512 / flames + Math.random() * 8;
      const gr = g.createLinearGradient(x, 0, x + 14, 0);
      gr.addColorStop(0, 'rgba(255,215,160,0)'); gr.addColorStop(0.5, 'rgba(255,215,160,0.22)'); gr.addColorStop(1, 'rgba(255,215,160,0)');
      g.fillStyle = gr;
      g.save(); g.translate(x, 0); g.transform(1, 0, -0.35, 1, 0, 0); g.fillRect(-10, 0, 26, 128); g.restore();
    }
    return tex(c, THREE, true);
  }
  function shadowTexture(THREE) {
    const c = canvas(256, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 64, 4, 128, 64, 124);
    gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.scale(1, 0.5); g.fillStyle = gr; g.translate(0, 64); g.fillRect(0, -64, 256, 256); g.restore();
    return new THREE.CanvasTexture(c);
  }
  function labelTexture(THREE, text, fill, ink, alpha = 1) {
    const c = canvas(128, 128), g = c.getContext('2d');
    g.globalAlpha = alpha;
    g.fillStyle = fill;
    g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
    g.fillStyle = ink;
    g.font = `700 ${text.length > 1 ? 44 : 74}px "Atkinson Hyperlegible Next", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // ------------------------------------------------------------------ geometry helpers
  function gridGeometry(THREE, rows, cols, fn, flip) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= cols; j++) {
        const r = fn(i / rows, j / cols);
        pos.push(r[0], r[1], r[2]);
        uv.push(r[3], r[4]);
      }
    }
    const W = cols + 1;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
        if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  /** Loft closed cross-sections (arrays of [y, z]) placed at x positions. */
  function loftGeometry(THREE, xs, sectionAt, capStart, capEnd) {
    const secs = xs.map(sectionAt);
    const n = secs[0].length;
    const pos = [], idx = [];
    secs.forEach((sec, i) => sec.forEach(([y, z]) => pos.push(xs[i], y, z)));
    for (let i = 0; i < secs.length - 1; i++) {
      for (let j = 0; j < n; j++) {
        const a = i * n + j, b = i * n + (j + 1) % n, c = a + n, d = b + n;
        idx.push(a, c, b, b, c, d);
      }
    }
    const cap = (i, reverse) => {
      const contour = secs[i].map(([y, z]) => new THREE.Vector2(z, y));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [p, q, r] of tris) reverse ? idx.push(i * n + p, i * n + r, i * n + q) : idx.push(i * n + p, i * n + q, i * n + r);
    };
    if (capStart) cap(0, false);
    if (capEnd) cap(secs.length - 1, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  function placeBetween(mesh, a, b, THREE) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.scale.set(1, len, 1);
  }

  // ------------------------------------------------------------------ class
  const VIEWS = {
    player: { pos: [395, 235, 0], target: [92, 12, 0], fov: 32 },
    board: { pos: [122, 380, 58], target: [122, 22, 0], fov: 32 },
    full: { pos: [-120, 430, 470], target: [200, 0, 0], fov: 36 },
  };
  const DEFAULT_PALETTE = { accent: '#1F6E94', good: '#2E7D4F', warn: '#B7791F', bad: '#C0392B', ink: '#142028' };

  class Violin3D {
    constructor(container, opts = {}) {
      this.el = container;
      this.opts = opts;
      this.palette = Object.assign({}, DEFAULT_PALETTE, opts.palette || {});
      this.reduced = !!opts.reducedMotion;
      this.ok = false;
      const THREE = window.THREE;
      const tr = (window.IT && window.IT.i18n ? window.IT.i18n.t : (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? p[x] : m)));
      if (!THREE || !THREE.OrbitControls) { this._fail(tr('3D-Ansicht nicht verfügbar – three.js wurde nicht geladen.')); return; }
      this.T = THREE;
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      } catch (e) {
        this._fail(tr('3D-Ansicht nicht verfügbar – dein Browser unterstützt kein WebGL.'));
        return;
      }
      this.ok = true;
      const r = this.renderer;
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      r.setClearColor(0x000000, 0);
      r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      container.textContent = '';
      container.appendChild(r.domElement);
      r.domElement.setAttribute('aria-hidden', 'true');
      r.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; }, false);
      r.domElement.addEventListener('webglcontextrestored', () => { this.lost = false; this.invalidate(); }, false);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(34, 1, 5, 4000);
      this._buildLights();
      this._buildViolin();
      this._buildMarkers();
      this._buildGuides();

      this.controls = new THREE.OrbitControls(this.camera, r.domElement);
      const c = this.controls;
      c.enablePan = false;
      c.enableDamping = true;
      c.dampingFactor = 0.12;
      c.minDistance = 110;
      c.maxDistance = 1300;
      c.rotateSpeed = 0.7;
      c.addEventListener('change', () => this.invalidate());
      c.addEventListener('start', () => { this._tween = null; });
      r.domElement.addEventListener('dblclick', () => this.setView(this.view));

      this.target = null; this.next = null;
      this.played = null; this.playedCur = null;
      this.vib = [0, 0, 0, 0];
      this.pulseUntil = 0;
      this._raf = 0; this._last = 0;
      this._frameBound = t => this._frame(t);
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(container);
      this.resize();
      const v = opts.view || (container.clientWidth / Math.max(1, container.clientHeight) > 1.3 ? 'board' : 'player');
      this.setView(v, false);
    }

    _fail(msg) {
      this.ok = false;
      this.el.innerHTML = '';
      const p = document.createElement('div');
      p.className = 'viewer-fallback';
      p.textContent = msg;
      this.el.appendChild(p);
    }

    // ---------------------------------------------------------------- scene
    _buildLights() {
      const T = this.T, s = this.scene;
      s.add(new T.HemisphereLight(0xfff6ec, 0x6b4a32, 0.75));
      const key = new T.DirectionalLight(0xffffff, 1.25);
      key.position.set(-260, 520, 320);
      s.add(key);
      const fill = new T.DirectionalLight(0xdfe9ff, 0.45);
      fill.position.set(500, 260, -260);
      s.add(fill);
      const rim = new T.DirectionalLight(0xffffff, 0.5);
      rim.position.set(700, 120, 420);
      s.add(rim);
    }

    _buildViolin() {
      const T = this.T, s = this.scene;
      const g = this.group = new T.Group();
      s.add(g);
      this._disposables = [];
      const keep = o => { this._disposables.push(o); return o; };

      const DS = T.DoubleSide;
      const varnish = keep(new T.MeshPhysicalMaterial({ map: keep(topTexture(T)), roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.28, metalness: 0, side: DS }));
      const maple = keep(new T.MeshPhysicalMaterial({ map: keep(mapleTexture(T, '#8f3f16', 16)), roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, side: DS }));
      const mapleLight = keep(new T.MeshPhysicalMaterial({ map: keep(mapleTexture(T, '#a8541f', 10)), roughness: 0.5, clearcoat: 0.5, side: DS }));
      const ebony = keep(new T.MeshStandardMaterial({ color: 0x120e0c, roughness: 0.55, metalness: 0.05, side: DS }));
      const bridgeMat = keep(new T.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.7, side: DS }));
      const metal = keep(new T.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.9, roughness: 0.3 }));
      this.mats = { varnish, maple, ebony, metal };

      // top & back plates (lofted along the outline, arched)
      const topGeo = keep(gridGeometry(T, 110, 44, (fi, fj) => {
        const t = BODY_L * (1 - Math.cos(Math.PI * fi)) / 2;
        const u = -Math.cos(Math.PI * fj);
        const w = halfWidth(t);
        return [BODY_X0 + t, archTop(t, u), u * w, t / BODY_L, (u * w + 110) / 220];
      }, true));
      g.add(new T.Mesh(topGeo, varnish));
      const backGeo = keep(gridGeometry(T, 70, 30, (fi, fj) => {
        const t = BODY_L * (1 - Math.cos(Math.PI * fi)) / 2;
        const u = -Math.cos(Math.PI * fj);
        const w = halfWidth(t);
        return [BODY_X0 + t, -30 - archBack(t, u), u * w, t / BODY_L * 3, (u + 1) / 2];
      }, false));
      g.add(new T.Mesh(backGeo, maple));
      // ribs + plate edges as one band around the outline
      const ring = [];
      for (let t = 0; t <= BODY_L; t += 2) ring.push([t, halfWidth(t)]);
      for (let t = BODY_L; t >= 0; t -= 2) ring.push([t, -halfWidth(t)]);
      const ribGeo = keep(gridGeometry(T, ring.length - 1, 3, (fi, fj) => {
        const [t, w] = ring[Math.round(fi * (ring.length - 1))];
        const inset = fj > 0 && fj < 1 ? 1.4 : 0;
        const ww = Math.sign(w) * Math.max(0, Math.abs(w) - inset);
        const y = fj === 0 ? archTop(t, Math.sign(w) || 1) : fj < 0.5 ? 0 : fj < 1 ? -30 : -30 - archBack(t, 1);
        return [BODY_X0 + t, y, ww, fi * 14, fj];
      }, true));
      g.add(new T.Mesh(ribGeo, maple));

      // neck, heel and fingerboard
      const fbBottom = x => fbCenterY(x) - (5 + 3.2 * clamp(x / FB_LEN, 0, 1));
      const neckXs = []; for (let x = -2; x <= 136; x += 4) neckXs.push(x);
      const neckGeo = keep(loftGeometry(T, neckXs, x => {
        const a = fbWidth(Math.max(0, x)) / 2 - 0.6;
        const top = fbBottom(Math.max(0, x));
        let depth = 16 + 2.5 * clamp(x / 110, 0, 1);
        if (x > 108) depth += Math.pow((x - 108) / 28, 1.6) * (top + 31 - depth);
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const th = Math.PI * i / 14;
          pts.push([top - Math.sin(th) * depth, -Math.cos(th) * a]);
        }
        return pts;
      }, true, true));
      g.add(new T.Mesh(neckGeo, mapleLight));
      const fbXs = []; for (let x = -1; x <= FB_LEN; x += 6) fbXs.push(x); fbXs[fbXs.length - 1] = FB_LEN;
      const fbGeo = keep(loftGeometry(T, fbXs, x => {
        const w = fbWidth(Math.max(0, x)) / 2;
        const pts = [];
        for (let i = 0; i <= 12; i++) { const z = -w + 2 * w * i / 12; pts.push([fbCenterY(Math.max(0, x)) - fbDrop(z), z]); }
        pts.push([fbBottom(Math.max(0, x)), w], [fbBottom(Math.max(0, x)), -w]);
        return pts.reverse();
      }, true, true));
      g.add(new T.Mesh(fbGeo, ebony));
      // nut
      const nutGeo = keep(loftGeometry(T, [-3.5, -0.4], () => {
        const w = 12.2, pts = [];
        for (let i = 0; i <= 10; i++) { const z = -w + 2 * w * i / 10; pts.push([fbCenterY(0) - fbDrop(z) + 1.1, z]); }
        pts.push([fbCenterY(0) - 9, w], [fbCenterY(0) - 9, -w]);
        return pts.reverse();
      }, true, true));
      g.add(new T.Mesh(nutGeo, ebony));

      // pegbox (U channel sloping down) and scroll
      const pbXs = []; for (let x = -4; x >= -74; x -= 5) pbXs.push(x);
      const pegboxGeo = keep(loftGeometry(T, pbXs, x => {
        const f = clamp(-x / 74, 0, 1);
        const W = 13 - 2.2 * f, wall = 3.4, top = fbCenterY(0) - 1 - 9 * f, bottom = top - 23 + 2 * f;
        return [[top, -W], [bottom + 4, -W], [bottom, -W + 4], [bottom, W - 4], [bottom + 4, W], [top, W], [top, W - wall], [bottom + wall, W - wall], [bottom + wall, -W + wall], [top, -W + wall]];
      }, true, true));
      g.add(new T.Mesh(pegboxGeo, mapleLight));
      const scroll = new T.Shape();
      const cx = -88, cy = -6;
      const spiral = (th, r0, k) => r0 * Math.exp(-k * th);
      const outer = [], inner = [];
      for (let i = 0; i <= 90; i++) {
        const th = i / 90 * 2.4 * Math.PI;
        const ro = spiral(th, 17, 0.2), ri = Math.max(1.2, ro - 6.5 * Math.exp(-0.12 * th));
        const a = 0.35 * Math.PI + th;
        outer.push([cx + ro * Math.cos(a), cy + ro * Math.sin(a)]);
        inner.push([cx + ri * Math.cos(a), cy + ri * Math.sin(a)]);
      }
      scroll.moveTo(outer[0][0], outer[0][1]);
      for (const p of outer) scroll.lineTo(p[0], p[1]);
      for (let i = inner.length - 1; i >= 0; i--) scroll.lineTo(inner[i][0], inner[i][1]);
      scroll.lineTo(outer[0][0], outer[0][1]);
      for (const [depth, off] of [[24, -12], [14, -7]]) {
        const sg = keep(new T.ExtrudeGeometry(scroll, { depth, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.2, bevelSegments: 2, curveSegments: 4 }));
        const m = new T.Mesh(sg, mapleLight);
        m.position.z = off;
        g.add(m);
      }
      const eye = new T.Mesh(keep(new T.SphereGeometry(2.6, 16, 10)), mapleLight);
      eye.position.set(cx, cy, 0); eye.scale.set(1, 1, 5.5);
      g.add(eye);

      // pegs: D and G on the bass side (+z), A and E on the treble side (−z)
      this.pegPos = [];
      const pegs = [[-25, 1], [-55, 1], [-46, -1], [-16, -1]];   // G D A E: [x, side]
      const pegGeo = keep(new T.CylinderGeometry(3.4, 2.6, 34, 14));
      const headGeo = keep(new T.SphereGeometry(1, 18, 12));
      pegs.forEach(([x, side], s) => {
        const f = clamp(-x / 74, 0, 1);
        const y = fbCenterY(0) - 9 - 7 * f;
        const shaft = new T.Mesh(pegGeo, ebony);
        shaft.position.set(x, y, side * 4);
        shaft.rotation.x = Math.PI / 2;
        g.add(shaft);
        const head = new T.Mesh(headGeo, ebony);
        head.position.set(x, y, side * 27);
        head.scale.set(11, 15, 3.4);
        g.add(head);
        const collar = new T.Mesh(keep(new T.TorusGeometry(3.3, 0.9, 8, 18)), ebony);
        collar.position.set(x, y, side * 22);
        g.add(collar);
        this.pegPos[s] = new T.Vector3(x, y + 1.5, side * -1.5);
      });

      // bridge (maple, feet on the arching)
      const footY = archTop(SCALE - BODY_X0, 20 / halfWidth(SCALE - BODY_X0));
      const br = new T.Shape();
      const bTop = z => {
        // a smooth arc through the string notches
        const s = (17 - z) / 34;               // 0 at G (+17), 1 at E (−17)
        const base = Y_BRIDGE[0] + (Y_BRIDGE[3] - Y_BRIDGE[0]) * s;
        return base + 2.1 * Math.sin(Math.PI * clamp(s, 0, 1)) + 0.9 - footY;
      };
      br.moveTo(-21, 0); br.lineTo(-13, 0); br.quadraticCurveTo(-11, 6, -8, 7.5); br.lineTo(8, 7.5); br.quadraticCurveTo(11, 6, 13, 0); br.lineTo(21, 0);
      br.quadraticCurveTo(20, 4, 18.5, 9); br.lineTo(19.5, bTop(19.5));
      for (let z = 19; z >= -19.5; z -= 1.5) br.lineTo(z, bTop(z));
      br.lineTo(-18.5, 9); br.quadraticCurveTo(-20, 4, -21, 0);
      const heart = new T.Path(); heart.absellipse(0, 17, 3.2, 4.2, 0, Math.PI * 2, false, 0); br.holes.push(heart);
      for (const sx of [-1, 1]) { const k = new T.Path(); k.absellipse(sx * 9.5, 13, 2, 4.2, 0, Math.PI * 2, false, 0); br.holes.push(k); }
      const bg = keep(new T.ExtrudeGeometry(br, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 1, curveSegments: 6 }));
      const bridge = new T.Mesh(bg, bridgeMat);
      bridge.rotation.y = Math.PI / 2;
      bridge.position.set(SCALE + 1.3, footY, 0);
      g.add(bridge);

      // tailpiece, fine tuner, saddle, end button, chinrest
      // tailpiece: shape in (length, width), extruded upward, tilted toward the end button
      const tp = new T.Shape();
      tp.moveTo(0, -20); tp.quadraticCurveTo(-5, 0, 0, 20); tp.lineTo(106, 9); tp.quadraticCurveTo(111, 0, 106, -9); tp.lineTo(0, -20);
      const tpg = keep(new T.ExtrudeGeometry(tp, { depth: 4.5, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.6, bevelSegments: 3, curveSegments: 10 }));
      const tail = new T.Mesh(tpg, ebony);
      tail.rotation.x = -Math.PI / 2;
      const tailPivot = new T.Group();
      tailPivot.position.set(383, 18, 0);
      tailPivot.rotation.z = -0.075;
      tailPivot.add(tail);
      g.add(tailPivot);
      this.tailY = x => 18 + 6.1 - (x - 383) * 0.075;
      const tuner = new T.Mesh(keep(new T.CylinderGeometry(2.4, 2.4, 9, 12)), metal);
      tuner.position.set(398, this.tailY(398) + 2, -14);
      g.add(tuner);
      const saddle = new T.Mesh(keep(new T.BoxGeometry(6, 5, 30)), ebony);
      saddle.position.set(BODY_X0 + BODY_L - 1, 3, 0);
      g.add(saddle);
      const button = new T.Mesh(keep(new T.SphereGeometry(4, 14, 10)), ebony);
      button.position.set(BODY_X0 + BODY_L + 2, -14, 0); button.scale.set(1, 1.2, 1);
      g.add(button);
      const chin = new T.Mesh(keep(new T.SphereGeometry(1, 28, 16)), ebony);
      chin.scale.set(36, 9, 30);
      chin.position.set(456, archTop(326, 0.4) + 8, 42);
      g.add(chin);

      // strings: nut → bridge (highlight + vibration), afterlength, pegbox part
      this.strings = [];
      const stringMat = s => new T.MeshStandardMaterial({ color: s === 3 ? 0xeef1f3 : s === 2 ? 0xd9dde1 : 0xc3c8cd, metalness: 0.92, roughness: s === 3 ? 0.22 : 0.34, emissive: 0x000000 });
      for (let s = 0; s < 4; s++) {
        const mat = keep(stringMat(s));
        const geo = keep(new T.CylinderGeometry(RADIUS[s], RADIUS[s], 1, 7, 40, true));
        const mesh = new T.Mesh(geo, mat);
        const a = this.stringPoint(s, 0), b = this.stringPoint(s, SCALE);
        placeBetween(mesh, a, b, T);
        g.add(mesh);
        const base = Float32Array.from(geo.attributes.position.array);
        // afterlength to the tailpiece
        const tx = s === 3 ? 400 : 392, tz = Z_BRIDGE[s] * 0.62;
        const after = new T.Mesh(keep(new T.CylinderGeometry(RADIUS[s], RADIUS[s], 1, 6, 1, true)), mat);
        placeBetween(after, b, new T.Vector3(tx, this.tailY(tx) + 1, tz), T);
        g.add(after);
        const head = new T.Mesh(keep(new T.CylinderGeometry(RADIUS[s], RADIUS[s], 1, 6, 1, true)), mat);
        placeBetween(head, a, this.pegPos[s], T);
        g.add(head);
        this.strings.push({ mesh, mat, geo, base, a, b });
      }

      // soft contact shadow
      const sh = new T.Mesh(keep(new T.PlaneGeometry(760, 330)), keep(new T.MeshBasicMaterial({ map: keep(shadowTexture(T)), transparent: true, depthWrite: false })));
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(200, -46, 0);
      g.add(sh);
    }

    _buildMarkers() {
      const T = this.T;
      const keep = o => { this._disposables.push(o); return o; };
      const tilt = Math.atan(0.1037);
      this.ringMat = keep(new T.MeshStandardMaterial({ color: this.palette.accent, emissive: this.palette.accent, emissiveIntensity: 0.55, roughness: 0.35 }));
      this.ring = new T.Mesh(keep(new T.TorusGeometry(4.4, 0.85, 12, 40)), this.ringMat);
      this.ring.rotation.order = 'ZXY';
      this.ring.rotation.set(Math.PI / 2, 0, tilt);
      this.ring.visible = false;
      this.scene.add(this.ring);
      this.disc = new T.Mesh(keep(new T.CircleGeometry(4.2, 32)), keep(new T.MeshBasicMaterial({ color: this.palette.accent, transparent: true, opacity: 0.22, depthWrite: false })));
      this.disc.rotation.order = 'ZXY';
      this.disc.rotation.set(-Math.PI / 2, 0, tilt);
      this.disc.visible = false;
      this.scene.add(this.disc);
      this.label = new T.Sprite(new T.SpriteMaterial({ depthTest: false, transparent: true }));
      this.label.renderOrder = 10;
      this.label.visible = false;
      this.scene.add(this.label);

      this.ghost = new T.Mesh(keep(new T.TorusGeometry(3.4, 0.5, 8, 28)), keep(new T.MeshBasicMaterial({ color: this.palette.accent, transparent: true, opacity: 0.35 })));
      this.ghost.rotation.order = 'ZXY';
      this.ghost.rotation.set(Math.PI / 2, 0, tilt);
      this.ghost.visible = false;
      this.scene.add(this.ghost);
      this.ghostLabel = new T.Sprite(new T.SpriteMaterial({ depthTest: false, transparent: true, opacity: 0.6 }));
      this.ghostLabel.renderOrder = 9;
      this.ghostLabel.visible = false;
      this.scene.add(this.ghostLabel);

      this.tipMat = keep(new T.MeshStandardMaterial({ color: this.palette.good, emissive: this.palette.good, emissiveIntensity: 0.45, roughness: 0.3, transparent: true, opacity: 0.95 }));
      this.tip = new T.Mesh(keep(new T.SphereGeometry(3.7, 24, 16)), this.tipMat);
      this.tip.visible = false;
      this.scene.add(this.tip);
      this.haloMat = keep(new T.MeshBasicMaterial({ color: this.palette.good, transparent: true, opacity: 0.3, depthWrite: false }));
      this.halo = new T.Mesh(keep(new T.CircleGeometry(6.5, 32)), this.haloMat);
      this.halo.rotation.order = 'ZXY';
      this.halo.rotation.set(-Math.PI / 2, 0, tilt);
      this.halo.visible = false;
      this.scene.add(this.halo);
      this.arrowMat = keep(new T.MeshBasicMaterial({ color: this.palette.good }));
      this.arrowShaft = new T.Mesh(keep(new T.CylinderGeometry(0.55, 0.55, 1, 8)), this.arrowMat);
      this.arrowHead = new T.Mesh(keep(new T.ConeGeometry(1.7, 4.2, 12)), this.arrowMat);
      this.arrowShaft.visible = this.arrowHead.visible = false;
      this.scene.add(this.arrowShaft, this.arrowHead);
      this._labelCache = new Map();
    }

    _buildGuides() {
      const T = this.T;
      this.guides = new T.Group();
      for (let k = 1; k <= 24; k++) {
        const x = fingerMM(k);
        if (x > FB_LEN - 3) break;
        const w = fbWidth(x) / 2 - 0.6, pts = [];
        for (let i = 0; i <= 8; i++) { const z = -w + 2 * w * i / 8; pts.push(new T.Vector3(x, fbCenterY(x) - fbDrop(z) + 0.15, z)); }
        const strong = k === 5 || k === 7 || k === 12;
        const mat = new T.LineBasicMaterial({ color: 0xdfe5ea, transparent: true, opacity: strong ? 0.5 : 0.17 });
        const geo = new T.BufferGeometry().setFromPoints(pts);
        this._disposables.push(mat, geo);
        this.guides.add(new T.Line(geo, mat));
        if (k === 7 || k === 12) {
          const dot = new T.Mesh(new T.CircleGeometry(k === 12 ? 1.1 : 0.85, 16), new T.MeshBasicMaterial({ color: 0xf2f4f6 }));
          dot.position.set(x, fbCenterY(x) - fbDrop(w + 0.6) - 1.4, w + 0.65);
          this.guides.add(dot);
          this._disposables.push(dot.geometry, dot.material);
        }
      }
      this.scene.add(this.guides);
    }

    // ---------------------------------------------------------------- geometry api
    stringPoint(s, d) {
      const t = d / SCALE;
      const z = Z_NUT[s] + (Z_BRIDGE[s] - Z_NUT[s]) * t;
      const y = yNut(s) + (Y_BRIDGE[s] - yNut(s)) * t;
      return new this.T.Vector3(d, y, z);
    }
    _pointFor(string, semis) {
      const d = semis <= 0.02 ? Math.max(3.5, fingerMM(Math.max(0, semis))) : fingerMM(semis);
      return this.stringPoint(string, clamp(d, -2, SCALE - 2));
    }
    _label(text, kind) {
      const key = kind + ':' + text + ':' + this.palette.accent;
      if (!this._labelCache.has(key)) {
        const ghost = kind === 'ghost';
        this._labelCache.set(key, labelTexture(this.T, text, this.palette.accent, '#ffffff', ghost ? 0.75 : 1));
      }
      return this._labelCache.get(key);
    }

    // ---------------------------------------------------------------- public api
    setTarget(t) {
      if (!this.ok) return;
      this.target = t;
      this.strings.forEach((st, s) => {
        const on = t && t.string === s;
        st.mat.emissive.set(on ? this.palette.accent : 0x000000);
        st.mat.emissiveIntensity = on ? 0.55 : 0;
      });
      if (!t) {
        this.ring.visible = this.disc.visible = this.label.visible = false;
        this.invalidate();
        return;
      }
      const p = this._pointFor(t.string, t.semis);
      const surf = p.clone(); surf.y = fbCenterY(clamp(p.x, 0, FB_LEN)) - fbDrop(p.z) + 0.25;
      if (p.x > FB_LEN) surf.y = p.y - 1;
      this._ringGoal = p.clone();
      this.disc.position.copy(surf);
      if (!this.ring.visible || this.reduced) this.ring.position.copy(p);
      this.ring.visible = this.disc.visible = true;
      const txt = t.label != null ? String(t.label) : String(t.finger);
      this.label.material.map = this._label(txt, 'target');
      this.label.material.needsUpdate = true;
      this.label.visible = true;
      this.pulseUntil = this.reduced ? 0 : performance.now() + 1800;
      this.invalidate();
    }

    setNext(n) {
      if (!this.ok) return;
      this.next = n;
      const same = n && this.target && n.string === this.target.string && Math.abs(n.semis - this.target.semis) < 0.01;
      if (!n || same) { this.ghost.visible = this.ghostLabel.visible = false; this.invalidate(); return; }
      const p = this._pointFor(n.string, n.semis);
      this.ghost.position.copy(p);
      this.ghost.visible = true;
      this.ghostLabel.material.map = this._label(String(n.finger), 'ghost');
      this.ghostLabel.material.needsUpdate = true;
      this.ghostLabel.userData.anchor = p;
      this.ghostLabel.visible = true;
      this.invalidate();
    }

    setPlayed(p) {
      if (!this.ok) return;
      this.played = p;
      if (p) {
        const col = p.state === 'idle' ? '#9aa4ad' : this.palette[p.state] || this.palette.good;
        if (this._tipCol !== col) {
          this._tipCol = col;
          this.tipMat.color.set(col); this.tipMat.emissive.set(col); this.arrowMat.color.set(col); this.haloMat.color.set(col);
          this.tipMat.opacity = p.state === 'idle' ? 0.5 : 0.95;
        }
      }
      this.invalidate();
    }

    setView(name, animate = true) {
      if (!this.ok || !VIEWS[name]) return;
      this.view = name;
      const v = VIEWS[name];
      const aspect = this.camera.aspect || 1.4;
      const pos = new this.T.Vector3(...v.pos), tgt = new this.T.Vector3(...v.target);
      // fit the fingerboard (nut … end, ≈ 330 mm) to the container width in the board view
      if (name === 'board') {
        const need = 330 / (2 * Math.tan(v.fov * Math.PI / 360) * aspect);
        const d = clamp(need, 260, 760);
        pos.sub(tgt).setLength(d).add(tgt);
      } else if (aspect < 1.2) {
        pos.sub(tgt).multiplyScalar(1 + (1.2 - aspect) * 0.9).add(tgt);
      }
      if (!animate || this.reduced) {
        this.camera.position.copy(pos);
        this.camera.fov = v.fov;
        this.camera.updateProjectionMatrix();
        this.controls.target.copy(tgt);
        this.controls.update();
        this._tween = null;
      } else {
        this._tween = { t0: performance.now(), dur: 650, fromPos: this.camera.position.clone(), fromTgt: this.controls.target.clone(), fromFov: this.camera.fov, pos, tgt, fov: v.fov };
      }
      this.invalidate();
    }

    setPalette(p) {
      if (!this.ok) return;
      Object.assign(this.palette, p || {});
      this.ringMat.color.set(this.palette.accent); this.ringMat.emissive.set(this.palette.accent);
      this.disc.material.color.set(this.palette.accent);
      this.ghost.material.color.set(this.palette.accent);
      for (const t of this._labelCache.values()) t.dispose();
      this._labelCache.clear();
      this._tipCol = null;
      this.setTarget(this.target);
      this.setNext(this.next);
      this.setPlayed(this.played);
    }

    pluck(string, amount = 1) {
      if (!this.ok || this.reduced || string == null || !this.strings[string]) return;
      this.vib[string] = Math.max(this.vib[string], clamp(amount, 0, 1.5));
      this.invalidate();
    }

    setGuides(on) { if (!this.ok) return; this.guides.visible = !!on; this.invalidate(); }

    resize() {
      if (!this.ok) return;
      const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
      if (w === this._w && h === this._h) return;
      this._w = w; this._h = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.invalidate();
    }

    invalidate() {
      if (!this.ok || this._raf || this._disposed) return;
      this._raf = requestAnimationFrame(this._frameBound);
    }

    dispose() {
      if (!this.ok) return;
      this._disposed = true;
      cancelAnimationFrame(this._raf);
      this._ro.disconnect();
      this.controls.dispose();
      for (const d of this._disposables) if (d && d.dispose) d.dispose();
      for (const t of this._labelCache.values()) t.dispose();
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    // ---------------------------------------------------------------- frame
    _frame(now) {
      this._raf = 0;
      if (this.lost || this._disposed) return;
      const T = this.T;
      const dt = Math.min(0.05, this._last ? (now - this._last) / 1000 : 0.016);
      this._last = now;
      let busy = false;

      // camera tween
      if (this._tween) {
        const tw = this._tween;
        const k = clamp((now - tw.t0) / tw.dur, 0, 1);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        this.camera.position.lerpVectors(tw.fromPos, tw.pos, e);
        this.controls.target.lerpVectors(tw.fromTgt, tw.tgt, e);
        this.camera.fov = tw.fromFov + (tw.fov - tw.fromFov) * e;
        this.camera.updateProjectionMatrix();
        if (k >= 1) this._tween = null; else busy = true;
      }
      if (this.controls.update()) busy = true;

      // target ring easing + pulse
      if (this.ring.visible && this._ringGoal) {
        const d = this.ring.position.distanceTo(this._ringGoal);
        if (d > 0.05) { this.ring.position.lerp(this._ringGoal, 1 - Math.exp(-dt / 0.045)); busy = true; }
        else this.ring.position.copy(this._ringGoal);
        const pulse = now < this.pulseUntil ? 1 + 0.16 * Math.sin((this.pulseUntil - now) / 1800 * Math.PI * 6) * ((this.pulseUntil - now) / 1800) : 1;
        this.ring.scale.setScalar(pulse);
        if (now < this.pulseUntil) busy = true;
      }

      // played fingertip (critically damped toward the measured position)
      const p = this.played;
      if (p && p.string != null && isFinite(p.semis)) {
        const goal = this._pointFor(p.string, p.semis);
        goal.y += 2.2;
        if (!this.tip.visible || !this.playedCur) { this.playedCur = goal.clone(); this.tip.visible = true; }
        const d = this.playedCur.distanceTo(goal);
        if (d > 0.03) { this.playedCur.lerp(goal, 1 - Math.exp(-dt / 0.06)); busy = true; }
        this.tip.position.copy(this.playedCur);
        const hx = clamp(this.playedCur.x, 0, FB_LEN);
        this.halo.position.set(this.playedCur.x, (this.playedCur.x <= FB_LEN ? fbCenterY(hx) - fbDrop(this.playedCur.z) : this.playedCur.y - 3) + 0.35, this.playedCur.z);
        this.halo.visible = true;
        // correction arrow along the string toward the target
        const t = this.target;
        if (t && t.string === p.string && this.ring.visible) {
          const a = this.playedCur.clone(); a.y -= 2.2;
          const b = this._ringGoal.clone();
          const len = a.distanceTo(b);
          if (len > 1.2) {
            const dir = b.clone().sub(a).normalize();
            const end = b.clone().addScaledVector(dir, -5.5);
            const start = a.clone().addScaledVector(dir, 3.2);
            if (start.distanceTo(b) > 6) {
              placeBetween(this.arrowShaft, start, end, T);
              this.arrowShaft.position.y += 1.2;
              this.arrowHead.position.copy(end).addScaledVector(dir, 2.1); this.arrowHead.position.y += 1.2;
              this.arrowHead.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
              this.arrowShaft.visible = this.arrowHead.visible = true;
            } else this.arrowShaft.visible = this.arrowHead.visible = false;
          } else this.arrowShaft.visible = this.arrowHead.visible = false;
        } else this.arrowShaft.visible = this.arrowHead.visible = false;
      } else {
        this.tip.visible = false;
        this.halo.visible = false;
        this.playedCur = null;
        this.arrowShaft.visible = this.arrowHead.visible = false;
      }

      // string vibration: a blurred spindle that decays
      for (let s = 0; s < 4; s++) {
        const st = this.strings[s], A = this.vib[s];
        if (A <= 0.002 && !st.dirty) continue;
        const pos = st.geo.attributes.position.array, base = st.base;
        const phase = Math.sin(now * 0.09 + s);
        for (let i = 0; i < pos.length; i += 3) {
          const sy = base[i + 1] + 0.5;                     // 0..1 along the string
          const k = 1 + A * 2.6 * Math.sin(Math.PI * sy) * (0.75 + 0.25 * phase);
          pos[i] = base[i] * k; pos[i + 2] = base[i + 2] * k;
        }
        st.geo.attributes.position.needsUpdate = true;
        st.dirty = A > 0.002;
        this.vib[s] = A > 0.002 ? A * Math.exp(-dt / 0.35) : 0;
        if (st.dirty) busy = true;
      }

      // labels: constant on-screen size, placed above their markers in screen space
      const screenUp = new T.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const place = (sprite, anchor, size) => {
        if (!sprite.visible || !anchor) return;
        const dist = this.camera.position.distanceTo(anchor);
        sprite.scale.setScalar(dist * size);
        sprite.position.copy(anchor).addScaledVector(screenUp, dist * size * 1.05);
      };
      place(this.label, this.ring.visible ? this.ring.position : null, 0.05);
      place(this.ghostLabel, this.ghostLabel.userData.anchor, 0.034);

      this.renderer.render(this.scene, this.camera);
      if (busy) this.invalidate();
    }

    static fingerPositionMM(semis) { return fingerMM(semis); }
  }

  IT.Violin3D = Violin3D;
})();
