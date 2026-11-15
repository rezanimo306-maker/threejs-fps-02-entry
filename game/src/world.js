// DUSKLINE — the map "Yard 7": an original dusk container yard.
// Builds the static three.js scene, the collision boxes, the spawn points,
// the two bomb sites and the waypoint graph the bots route on.
// Nothing here reads the network; every material is a plain colour.
import * as THREE from 'three';
import { PALETTE } from './config.js';

// One box obstacle: x/z centre, w/d footprint, h height, palette colour.
const BOXES = [
  // Perimeter walls (h 6).
  { x: 0, z: -24.5, w: 66, d: 1, h: 6, c: PALETTE.wall },
  { x: 0, z: 28.5, w: 66, d: 1, h: 6, c: PALETTE.wall },
  { x: -32.5, z: 2, w: 1, d: 54, h: 6, c: PALETTE.wall },
  { x: 32.5, z: 2, w: 1, d: 54, h: 6, c: PALETTE.wall },
  // Mid wall with a door gap at x in [-2.5, 2.5].
  { x: -12, z: 0, w: 19, d: 1, h: 4.5, c: PALETTE.wallTrim },
  { x: 12, z: 0, w: 19, d: 1, h: 4.5, c: PALETTE.wallTrim },
  // A-long cover. These sit at x ±28, off the lane itself: centred on the
  // lane (x ±24) they blocked the waypoint edge between the south and mid
  // waypoints, and a bot routed down the lane pressed against the
  // container's north face forever instead of reaching the site.
  { x: -28, z: 8, w: 6, d: 2.4, h: 2.4, c: PALETTE.containerTeal },
  { x: -27, z: -4, w: 2.4, d: 6, h: 2.4, c: PALETTE.containerRust },
  { x: -21, z: -10, w: 2, d: 2, h: 1.1, c: PALETTE.crate },
  // B-side cover.
  { x: 28, z: 8, w: 6, d: 2.4, h: 2.4, c: PALETTE.containerSand },
  { x: 27, z: -4, w: 2.4, d: 6, h: 2.4, c: PALETTE.containerTeal },
  { x: 21, z: -10, w: 2, d: 2, h: 1.1, c: PALETTE.crate },
  // Mid cover.
  { x: -5, z: 6, w: 2, d: 2, h: 1.1, c: PALETTE.crate },
  { x: 5, z: -6, w: 2, d: 2, h: 1.1, c: PALETTE.crate },
  { x: -6, z: -12, w: 4, d: 2.4, h: 2.4, c: PALETTE.containerGrey },
  { x: 6, z: -12, w: 4, d: 2.4, h: 2.4, c: PALETTE.containerRust },
  // Site A structures.
  { x: -28, z: -16, w: 2.4, d: 6, h: 2.4, c: PALETTE.containerTeal },
  { x: -20, z: -19, w: 6, d: 2.4, h: 2.4, c: PALETTE.containerSand },
  { x: -24, z: -12, w: 2, d: 2, h: 1.1, c: PALETTE.crate },
  // Site B structures.
  { x: 28, z: -16, w: 2.4, d: 6, h: 2.4, c: PALETTE.containerRust },
  { x: 20, z: -19, w: 6, d: 2.4, h: 2.4, c: PALETTE.containerTeal },
  { x: 24, z: -12, w: 2, d: 2, h: 1.1, c: PALETTE.crate },
  // Connector blocks. They sit at z 16, clear of waypoints 17/18 (±12, 12):
  // a crate on a waypoint's edge traps any bot routed through it, and the
  // bomb carrier would never reach a site.
  { x: -14, z: 16, w: 4, d: 2, h: 1.1, c: PALETTE.crate },
  { x: 14, z: 16, w: 4, d: 2, h: 1.1, c: PALETTE.crate },
  { x: -14, z: -6, w: 2, d: 2, h: 1.1, c: PALETTE.crate },
  { x: 14, z: -6, w: 2, d: 2, h: 1.1, c: PALETTE.crate },
  // Barrels (cylinders, drawn as boxes in collision).
  { x: -3, z: 16, w: 1.2, d: 1.2, h: 1.1, c: PALETTE.barrel, round: true },
  { x: 3, z: -16, w: 1.2, d: 1.2, h: 1.1, c: PALETTE.barrel, round: true },
  { x: -28, z: 18, w: 1.2, d: 1.2, h: 1.1, c: PALETTE.barrel, round: true },
  { x: 28, z: 18, w: 1.2, d: 1.2, h: 1.1, c: PALETTE.barrel, round: true },
];

// Waypoint graph: nodes on the lanes, edges between neighbours.
const WAYPOINTS = [
  { x: 0, z: 22 }, // 0 vanguard spawn
  { x: 0, z: 14 }, // 1 mid south
  { x: 0, z: 4 }, // 2 mid door
  { x: 0, z: -8 }, // 3 mid north
  { x: 0, z: -19 }, // 4 ember spawn
  { x: -24, z: 14 }, // 5 A long south
  { x: -24, z: 2 }, // 6 A long mid
  { x: -24, z: -8 }, // 7 A long north
  { x: -24, z: -14 }, // 8 site A
  { x: 24, z: 14 }, // 9 B east south
  { x: 24, z: 2 }, // 10 B east mid
  { x: 24, z: -8 }, // 11 B east north
  { x: 24, z: -14 }, // 12 site B
  { x: -12, z: 2 }, // 13 connector west
  { x: 12, z: 2 }, // 14 connector east
  { x: -12, z: -8 }, // 15 connector west north
  { x: 12, z: -8 }, // 16 connector east north
  { x: -12, z: 12 }, // 17 west mid
  { x: 12, z: 12 }, // 18 east mid
  { x: -18, z: -12 }, // 19 site A approach
  { x: 18, z: -12 }, // 20 site B approach
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [1, 17], [1, 18], [2, 13], [2, 14],
  [3, 15], [3, 16], [13, 5], [14, 9], [5, 6], [6, 7], [7, 8], [9, 10],
  [10, 11], [11, 12], [13, 17], [14, 18], [15, 7], [16, 11], [15, 19],
  [16, 20], [19, 8], [20, 12], [17, 5], [18, 9], [7, 19], [11, 20],
];

export const SITES = {
  A: { x: -24, z: -14, r: 4.5, color: PALETTE.siteA, letter: 'A' },
  B: { x: 24, z: -14, r: 4.5, color: PALETTE.siteB, letter: 'B' },
};

export const SPAWNS = {
  vanguard: [
    { x: -4, z: 22 }, { x: -2, z: 23 }, { x: 0, z: 22 },
    { x: 2, z: 23 }, { x: 4, z: 22 },
  ],
  ember: [
    { x: -4, z: -19 }, { x: -2, z: -20 }, { x: 0, z: -19 },
    { x: 2, z: -20 }, { x: 4, z: -19 },
  ],
};

const _matCache = new Map();
function material(color) {
  let m = _matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    _matCache.set(color, m);
  }
  return m;
}

// --- runtime canvas textures: the yard's surfaces are painted once at
// load (no files, no network), so flat colour blocks read as a place. ---
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
function hexCss(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}
function speckle(g, w, h, n, dark, light) {
  for (let i = 0; i < n; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? dark : light;
    g.globalAlpha = 0.05 + Math.random() * 0.12;
    const s = 1 + Math.random() * 3;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
}
// Ground: sand with concrete panel seams, stains and tyre scuffs.
function groundTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = hexCss(PALETTE.ground); g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2600, '#5d4f3c', '#a08e72');
    // Panel seams every 128 px.
    g.strokeStyle = 'rgba(40,30,20,0.35)'; g.lineWidth = 3;
    for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // Dark stains.
    for (let i = 0; i < 9; i++) {
      g.fillStyle = 'rgba(30,24,18,0.16)';
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 45, 12 + Math.random() * 26, Math.random() * 3, 0, Math.PI * 2); g.fill();
    }
    // Tyre scuffs: two curved dark arcs.
    g.strokeStyle = 'rgba(35,28,20,0.28)'; g.lineWidth = 7;
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 60 + Math.random() * 60, Math.random() * 3, Math.random() * 2 + 1); g.stroke();
    }
  });
}
// Centre lane: darker asphalt with a dashed amber centre line.
function laneTexture() {
  return canvasTexture(128, 512, (g, w, h) => {
    g.fillStyle = hexCss(PALETTE.groundDark); g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, '#4a3d2c', '#7d6c52');
    g.fillStyle = '#c9a86a';
    for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 3, y + 8, 6, 34);
  });
}
// Wall: concrete panels with seams and a darker base band.
function wallTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = hexCss(PALETTE.wall); g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, '#46545c', '#6d7d85');
    g.strokeStyle = 'rgba(30,38,44,0.5)'; g.lineWidth = 4;
    for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.fillStyle = 'rgba(20,26,30,0.35)'; g.fillRect(0, h - 26, w, 26);
  });
}
// Crate: planks with a nailed frame.
function crateTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = hexCss(PALETTE.crate); g.fillRect(0, 0, w, h);
    speckle(g, w, h, 260, '#7a5f38', '#b5935e');
    g.strokeStyle = 'rgba(60,44,22,0.55)'; g.lineWidth = 3;
    for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
}
// Container: corrugated steel with a stencil code and rust streaks.
// One texture per colour, cached; the stencil code is the box index.
const _containerTex = new Map();
function containerTexture(color, label) {
  const key = `${color}:${label}`;
  let t = _containerTex.get(key);
  if (t) return t;
  t = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = hexCss(color); g.fillRect(0, 0, w, h);
    // Corrugation: alternating light/dark vertical ridges.
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x, 0, 5, h);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + 8, 0, 5, h);
    }
    // Top and bottom rails.
    g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    // Rust streaks from the top rail.
    for (let i = 0; i < 7; i++) {
      g.fillStyle = 'rgba(90,40,20,0.28)';
      const x = Math.random() * w;
      g.fillRect(x, 10, 3 + Math.random() * 4, 18 + Math.random() * 40);
    }
    // Stencil code.
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, w / 2, h / 2 + 2);
  });
  t.repeat.set(2, 1);
  _containerTex.set(key, t);
  return t;
}
const _texMatCache = new Map();
function texturedMaterial(color, tex) {
  const key = `${color}:${tex.uuid}`;
  let m = _texMatCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, map: tex });
    _texMatCache.set(key, m);
  }
  return m;
}

function letterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fillStyle = 'rgba(10,10,16,0.55)'; g.fill();
  g.lineWidth = 6; g.strokeStyle = color; g.stroke();
  g.fillStyle = color; g.font = 'bold 72px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Dusk sky dome: a gradient sphere that never moves with the camera.
  const skyGeo = new THREE.SphereGeometry(220, 16, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      bottom: { value: new THREE.Color(PALETTE.skyBottom) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 1.6 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);

  // Low sun disc on the horizon.
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffb36b, fog: false });
  const sun = new THREE.Mesh(new THREE.CircleGeometry(14, 24), sunMat);
  sun.position.set(-90, 26, -160);
  sun.lookAt(0, 26, 0);
  group.add(sun);

  // Ground: sand with a darker centre lane.
  const groundTex = groundTexture();
  groundTex.repeat.set(4, 3);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(66, 54),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 2);
  ground.receiveShadow = true;
  group.add(ground);
  const laneTex = laneTexture();
  laneTex.repeat.set(1, 6);
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 54),
    new THREE.MeshLambertMaterial({ map: laneTex }),
  );
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.01, 2);
  lane.receiveShadow = true;
  group.add(lane);

  // Distant skyline silhouettes outside the walls.
  const silMat = new THREE.MeshBasicMaterial({ color: 0x241f33, fog: true });
  const silGeo = new THREE.BoxGeometry(1, 1, 1);
  const silhouettes = [
    [-60, 8, -50, 14, 16], [-40, 12, -58, 10, 24], [-15, 6, -60, 18, 12],
    [20, 10, -58, 12, 20], [48, 14, -52, 16, 28], [62, 9, -30, 10, 18],
    [-62, 10, 10, 12, 20], [64, 7, 20, 12, 14], [-55, 12, 45, 16, 24],
    [55, 8, 48, 14, 16],
  ];
  for (const [x, y, z, w, h] of silhouettes) {
    const s = new THREE.Mesh(silGeo, silMat);
    s.scale.set(w, h, 2);
    s.position.set(x, y, z);
    group.add(s);
  }

  // Obstacles: one shared box geometry, scaled per instance.
  // Textured where it reads: containers get corrugation + stencil, walls
  // get concrete panels, crates get planks; barrels stay plain.
  const wallTex = wallTexture();
  wallTex.repeat.set(3, 1);
  const crateTex = crateTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.6, 0.6, 1, 12);
  const colliders = [];
  for (let bi = 0; bi < BOXES.length; bi++) {
    const b = BOXES[bi];
    let mat;
    if (b.round) mat = material(b.c);
    else if (b.h >= 4.5) mat = texturedMaterial(b.c, wallTex);
    else if (b.c === PALETTE.crate) mat = texturedMaterial(b.c, crateTex);
    else mat = texturedMaterial(b.c, containerTexture(b.c, `Y7-${String(bi + 1).padStart(2, '0')}`));
    const mesh = new THREE.Mesh(b.round ? cylGeo : boxGeo, mat);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({
      minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
      top: b.h,
    });
  }

  // Floodlight poles: off the lanes and waypoints (so no bot routes into
  // one), solid so nobody walks through the mast. Each carries a warm
  // lamp and a glow halo.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,214,150,0.85)');
    grad.addColorStop(0.4, 'rgba(255,180,90,0.28)');
    grad.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 8);
  const lampGeo = new THREE.BoxGeometry(0.9, 0.22, 0.4);
  for (const [px, pz] of [[-8, 18], [8, 18], [-8, -16], [8, -16]]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(px, 3.5, pz);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(px, 7.0, pz);
    group.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, depthWrite: false,
    }));
    halo.scale.set(5, 5, 1);
    halo.position.set(px, 6.9, pz);
    group.add(halo);
    const pl = new THREE.PointLight(0xffc27a, 24, 24, 1.8);
    pl.position.set(px, 6.6, pz);
    group.add(pl);
    colliders.push({ minX: px - 0.2, maxX: px + 0.2, minZ: pz - 0.2, maxZ: pz + 0.2, top: 7 });
  }

  // Stars in the upper sky: a few hundred fixed points, no fog.
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.25 + Math.random() * 0.75;
    const r = 200;
    const horiz = Math.sqrt(1 - y * y);
    starPos[i * 3] = Math.cos(a) * horiz * r;
    starPos[i * 3 + 1] = y * r;
    starPos[i * 3 + 2] = Math.sin(a) * horiz * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8,
  }));
  group.add(stars);

  // Site markers: glowing ring + letter sprite on the ground.
  for (const key of Object.keys(SITES)) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    group.add(ring);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: letterTexture(s.letter, key === 'A' ? '#3fa7ff' : '#ff5a2a'),
      transparent: true, depthWrite: false,
    }));
    sprite.scale.set(3.2, 3.2, 1);
    sprite.position.set(s.x, 3.4, s.z);
    group.add(sprite);
    const light = new THREE.PointLight(s.color, 30, 18, 1.8);
    light.position.set(s.x, 4, s.z);
    group.add(light);
  }

  // Lights: dusk sun + hemisphere fill.
  const hemi = new THREE.HemisphereLight(0x8a7fb8, 0x4a3a28, 1.25);
  group.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xff9a4d, 1.6);
  sunLight.position.set(-40, 38, -60);
  sunLight.castShadow = false; // the main sun in main.js casts the shadows
  group.add(sunLight);

  scene.fog = new THREE.Fog(PALETTE.fog, 55, 190);

  return { group, colliders, waypoints: WAYPOINTS, edges: EDGES, sites: SITES, spawns: SPAWNS };
}

// Ground height at (x, z): the top of the tallest low obstacle under the
// point (crates and barrels can be stood on), else 0.
export function groundHeightAt(colliders, x, z) {
  let g = 0;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.top <= 1.3 && x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.top > g) {
      g = c.top;
    }
  }
  return g;
}

// Resolve a horizontal move (dx, dz) for a circle of radius r at height y.
// Returns the corrected position. Tall obstacles block; low ones (top <=
// ground + 0.55) can be stepped onto.
export function resolveMove(colliders, x, z, y, dx, dz, r) {
  let nx = x + dx;
  let nz = z + dz;
  // Clamp to the yard.
  nx = Math.max(-31.5 + r, Math.min(31.5 - r, nx));
  nz = Math.max(-23.5 + r, Math.min(27.5 - r, nz));
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.top <= y + 0.55) continue; // low enough to step onto
    // Circle vs AABB on each axis separately so sliding works.
    if (nz + r > c.minZ && nz - r < c.maxZ && nx + r > c.minX && nx - r < c.maxX) {
      const pushL = (nx + r) - c.minX;
      const pushR = c.maxX - (nx - r);
      const pushT = (nz + r) - c.minZ;
      const pushB = c.maxZ - (nz - r);
      const m = Math.min(pushL, pushR, pushT, pushB);
      if (m === pushL) nx = c.minX - r;
      else if (m === pushR) nx = c.maxX + r;
      else if (m === pushT) nz = c.minZ - r;
      else nz = c.maxZ + r;
    }
  }
  return { x: nx, z: nz };
}

// Breadth-first route through the waypoint graph, from the node nearest
// (sx, sz) to the node nearest (tx, tz). Returns an array of node indices.
export function findRoute(waypoints, edges, sx, sz, tx, tz) {
  const n = waypoints.length;
  let start = 0; let goal = 0; let bd = 1e9; let gd = 1e9;
  for (let i = 0; i < n; i++) {
    const ds = (waypoints[i].x - sx) ** 2 + (waypoints[i].z - sz) ** 2;
    const dg = (waypoints[i].x - tx) ** 2 + (waypoints[i].z - tz) ** 2;
    if (ds < bd) { bd = ds; start = i; }
    if (dg < gd) { gd = dg; goal = i; }
  }
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const prev = new Array(n).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const nb of adj[cur]) {
      if (prev[nb] === -1) { prev[nb] = cur; queue.push(nb); }
    }
  }
  if (prev[goal] === -1) return [goal];
  const path = [goal];
  let cur = goal;
  while (cur !== start) { cur = prev[cur]; path.push(cur); }
  path.reverse();
  return path;
}

// Segment (ax,az)-(bx,bz) blocked by any collider taller than h? Used for
// line of sight: a shot is blocked when the segment crosses a tall box.
export function segmentBlocked(colliders, ax, az, bx, bz, h) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.top < h) continue;
    if (segHitsBox(ax, az, bx, bz, c.minX, c.minZ, c.maxX, c.maxZ)) return true;
  }
  return false;
}

function segHitsBox(ax, az, bx, bz, minX, minZ, maxX, maxZ) {
  const dx = bx - ax; const dz = bz - az;
  let t0 = 0; let t1 = 1;
  // Slab test on x then z.
  if (Math.abs(dx) < 1e-9) {
    if (ax < minX || ax > maxX) return false;
  } else {
    let ta = (minX - ax) / dx; let tb = (maxX - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < minZ || az > maxZ) return false;
  } else {
    let ta = (minZ - az) / dz; let tb = (maxZ - az) / dz;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
