// DUSKLINE — rendering: the three.js camera, bot bodies, the first-person
// viewmodel, tracers, impacts, blasts and the bomb. Every mesh is created
// once and reused; the hot path allocates nothing.
import * as THREE from 'three';
import { TEAMS } from './config.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

function botBody(team) {
  const g = new THREE.Group();
  const suit = new THREE.MeshLambertMaterial({ color: TEAMS[team].color });
  // Team-tinted dark for the vest and legs: reads as the team at distance
  // instead of a black blob.
  const dark = new THREE.MeshLambertMaterial({ color: TEAMS[team].dark });
  const gunmetal = new THREE.MeshLambertMaterial({ color: 0x22242c });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9a186 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.38), suit);
  body.position.y = 0.95;
  body.castShadow = true;
  g.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.4, 0.42), dark);
  vest.position.y = 1.05;
  vest.castShadow = true;
  g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skin);
  head.position.y = 1.58;
  head.castShadow = true;
  g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), suit);
  helmet.position.y = 1.62;
  g.add(helmet);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85), gunmetal);
  gun.position.set(0.3, 1.12, 0.35);
  gun.castShadow = true;
  g.add(gun);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 0.3), dark);
  legL.position.set(-0.18, 0.28, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.18;
  g.add(legR);
  g.userData = { legL, legR, gun };
  return g;
}

function viewmodel() {
  const g = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const accent = new THREE.MeshLambertMaterial({ color: 0x3fa7ff });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.55), metal);
  g.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.45);
  g.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.12), metal);
  mag.position.set(0, -0.16, -0.05);
  mag.rotation.x = 0.15;
  g.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.12), accent);
  sight.position.set(0, 0.1, -0.1);
  g.add(sight);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.22), metal);
  stock.position.set(0, -0.01, 0.36);
  g.add(stock);
  // Muzzle flash: a starburst texture on a small plane at the barrel tip.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64; flashCanvas.height = 64;
  const fg = flashCanvas.getContext('2d');
  fg.clearRect(0, 0, 64, 64);
  fg.fillStyle = '#ffd27a';
  fg.beginPath();
  fg.moveTo(32, 2); fg.lineTo(38, 26); fg.lineTo(62, 32); fg.lineTo(38, 38);
  fg.lineTo(32, 62); fg.lineTo(26, 38); fg.lineTo(2, 32); fg.lineTo(26, 26);
  fg.closePath(); fg.fill();
  fg.fillStyle = '#fff3c4';
  fg.beginPath(); fg.arc(32, 32, 9, 0, Math.PI * 2); fg.fill();
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const flashMat = new THREE.MeshBasicMaterial({
    map: flashTex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0, 0.02, -0.68);
  g.add(flash);
  g.userData = { flash, flashMat };
  return g;
}

export function createRenderState(scene, sim) {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.08, 500);
  scene.add(camera);

  // One bot group per entity, reused for the whole match.
  const botGroups = new Map();
  for (const e of sim.entities) {
    if (e.isPlayer) continue;
    const g = botBody(e.team);
    scene.add(g);
    botGroups.set(e.id, g);
  }

  // Viewmodel attached to the camera.
  const vm = viewmodel();
  vm.position.set(0.28, -0.26, -0.55);
  camera.add(vm);

  // Muzzle light for the player's shots.
  const muzzleLight = new THREE.PointLight(0xffc27a, 0, 9, 2);
  camera.add(muzzleLight);
  muzzleLight.position.set(0.28, -0.1, -0.8);

  // Tracer pool: lines whose endpoints are rewritten each frame.
  const tracers = [];
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.85,
    }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push(line);
  }

  // Impact pool: small sparks.
  const impacts = [];
  const impactGeo = new THREE.SphereGeometry(0.07, 6, 5);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(impactGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true }));
    m.visible = false;
    scene.add(m);
    impacts.push(m);
  }

  // Blast pool: expanding shells.
  const blasts = [];
  const blastGeo = new THREE.SphereGeometry(1, 16, 12);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({
      color: 0xff7a2a, transparent: true, opacity: 0, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    blasts.push(m);
  }

  // The bomb: a dark case with a blinking light.
  const bomb = new THREE.Group();
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x1c1e24 }));
  caseMesh.castShadow = true;
  bomb.add(caseMesh);
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  blink.position.set(0.12, 0.14, 0);
  bomb.add(blink);
  bomb.visible = false;
  scene.add(bomb);

  return { camera, botGroups, vm, muzzleLight, tracers, impacts, blasts, bomb, walkT: 0 };
}

export function syncRender(rs, sim, dt, now) {
  const p = sim.player;
  const cam = rs.camera;
  if (!p) {
    // Menu state: no player yet — hold a high view over the yard so the
    // menu has a live backdrop instead of a black frame.
    cam.position.set(0, 30, 34);
    cam.lookAt(0, 0, -4);
    return;
  }

  // First-person camera: feet + eye height, yaw/pitch + recoil kick.
  const eye = p.pos.y + (p.crouched ? 1.15 : 1.7);
  cam.position.set(p.pos.x, eye, p.pos.z);
  cam.rotation.order = 'YXZ';
  cam.rotation.y = p.yaw;
  cam.rotation.x = p.pitch + (p.recoil || 0);
  cam.rotation.z = 0;
  // Sniper scope narrows the view.
  const targetFov = p.scoped && p.weapon === 'sniper' ? 32 : 75;
  if (Math.abs(cam.fov - targetFov) > 0.1) {
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 14);
    cam.updateProjectionMatrix();
  }

  // Viewmodel: walk bob, recoil kick, reload dip.
  rs.walkT += dt * (p.moving > 0.5 ? p.moving * 1.6 : 0);
  const bobY = Math.sin(rs.walkT * 2) * 0.012 * Math.min(1, p.moving / 4);
  const bobX = Math.cos(rs.walkT) * 0.008 * Math.min(1, p.moving / 4);
  rs.vm.position.set(0.28 + bobX, -0.26 + bobY, -0.55 + (p.recoil || 0) * 1.6);
  rs.vm.rotation.x = (p.recoil || 0) * 1.4;
  if (p.reloading) rs.vm.position.y -= 0.12;
  rs.vm.visible = p.alive;
  // Muzzle flash on a fresh PLAYER shot only (bots' shots light their own
  // tracers, not the viewmodel).
  const playerFired = p.lastShot > 0 && sim.time - p.lastShot < 0.06;
  rs.vm.userData.flashMat.opacity = playerFired ? 0.95 : 0;
  rs.muzzleLight.intensity = playerFired ? 26 : 0;

  // Bots.
  for (const e of sim.entities) {
    if (e.isPlayer) continue;
    const g = rs.botGroups.get(e.id);
    if (!g) continue;
    g.visible = true;
    if (!e.alive) {
      // Fallen: lie on the side.
      g.position.set(e.pos.x, 0.3, e.pos.z);
      g.rotation.set(0, e.yaw, Math.PI / 2);
      continue;
    }
    g.position.set(e.pos.x, e.pos.y, e.pos.z);
    g.rotation.set(0, e.yaw, 0);
    const swing = Math.sin(now * 9 + e.id) * 0.5 * Math.min(1, e.moving / 4);
    g.userData.legL.rotation.x = swing;
    g.userData.legR.rotation.x = -swing;
    g.userData.gun.rotation.x = e.pitch * 0.5;
  }

  // Tracers.
  for (let i = 0; i < rs.tracers.length; i++) {
    const t = sim.tracers.items[i];
    const line = rs.tracers[i];
    if (!t || t.ttl <= 0) { line.visible = false; continue; }
    line.visible = true;
    const attr = line.geometry.getAttribute('position');
    attr.array[0] = t.x1; attr.array[1] = t.y1; attr.array[2] = t.z1;
    attr.array[3] = t.x2; attr.array[4] = t.y2; attr.array[5] = t.z2;
    attr.needsUpdate = true;
    line.material.opacity = Math.max(0, t.ttl / t.maxTtl) * 0.85;
  }

  // Impacts.
  for (let i = 0; i < rs.impacts.length; i++) {
    const t = sim.impacts.items[i];
    const m = rs.impacts[i];
    if (!t || t.ttl <= 0) { m.visible = false; continue; }
    m.visible = true;
    m.position.set(t.x, t.y, t.z);
    const s = Math.max(0.2, t.ttl / t.maxTtl);
    m.scale.setScalar(s);
    m.material.opacity = s;
    if (t.team) m.material.color.setHex(t.team === 'vanguard' ? 0x3fa7ff : 0xff5a2a);
    else m.material.color.setHex(0xffe9a8);
  }

  // Blasts.
  for (let i = 0; i < rs.blasts.length; i++) {
    const t = sim.blasts.items[i];
    const m = rs.blasts[i];
    if (!t || t.ttl <= 0) { m.visible = false; continue; }
    m.visible = true;
    m.position.set(t.x, t.y, t.z);
    const k = 1 - t.ttl / t.maxTtl;
    m.scale.setScalar(0.5 + k * 7);
    m.material.opacity = (t.ttl / t.maxTtl) * 0.55;
  }

  // Bomb.
  const b = sim.bomb;
  if (b.state === 'planted' || b.state === 'dropped') {
    rs.bomb.visible = true;
    rs.bomb.position.set(b.x, 0.12, b.z);
    rs.bomb.children[1].material.color.setHex(Math.sin(now * 8) > 0 ? 0xff2a2a : 0x550000);
  } else if (b.state === 'carried' && b.carrier) {
    rs.bomb.visible = true;
    rs.bomb.position.set(b.carrier.pos.x, b.carrier.pos.y + 1.0, b.carrier.pos.z);
  } else {
    rs.bomb.visible = false;
  }
}
