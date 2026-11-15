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
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(66, 54),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 2);
  ground.receiveShadow = true;
  group.add(ground);
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 54),
    new THREE.MeshLambertMaterial({ color: PALETTE.groundDark }),
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
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.6, 0.6, 1, 12);
  const colliders = [];
  for (const b of BOXES) {
    const mesh = new THREE.Mesh(b.round ? cylGeo : boxGeo, material(b.c));
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
