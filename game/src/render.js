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
  // The group's local -z is forward (rotation.y = yaw puts -sin/-cos,
  // the shot direction, along local -z) — so the gun, arms and visor sit
  // on the -z side and the backpack on the +z side. R3 had the gun at +z,
  // pointing backwards.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85), gunmetal);
  gun.position.set(0.3, 1.12, -0.35);
  gun.castShadow = true;
  g.add(gun);
  // Arms reaching forward to hold the gun.
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), suit);
  armL.position.set(-0.28, 1.12, -0.2);
  armL.rotation.x = -0.35;
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.28;
  g.add(armR);
  // Backpack on the back (+z), team dark.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.18), dark);
  pack.position.set(0, 1.0, 0.28);
  pack.castShadow = true;
  g.add(pack);
  // Visor strip on the helmet front (-z), bright team colour so the
  // facing reads at a glance.
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.06),
    new THREE.MeshBasicMaterial({ color: TEAMS[team].color }));
  visor.position.set(0, 1.62, -0.22);
  g.add(visor);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 0.3), dark);
  legL.position.set(-0.18, 0.28, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.18;
  g.add(legR);
  g.userData = { legL, legR, gun };
  return g;
}

function flashTexture() {
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
  const t = new THREE.CanvasTexture(flashCanvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _sharedFlashTex = null;
function sharedFlashTex() {
  if (!_sharedFlashTex) _sharedFlashTex = flashTexture();
  return _sharedFlashTex;
}

// One viewmodel per weapon, so the pistol stops looking like a rifle and
// each gun reads at a glance in the first-person view. Each group carries
// its base position and, except the grenade, its muzzle flash.
function buildViewmodels() {
  const metal = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const metalLight = new THREE.MeshLambertMaterial({ color: 0x4a4e57 });
  const accent = new THREE.MeshLambertMaterial({ color: 0x3fa7ff });
  const olive = new THREE.MeshLambertMaterial({ color: 0x3a4a2a });
  const out = {};
  const mk = (key, base, build, flashAt, flashSize) => {
    const g = new THREE.Group();
    const box = (w, h, d, m, x, y, z, rx = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      if (rx) mesh.rotation.x = rx;
      g.add(mesh);
      return mesh;
    };
    const cyl = (r, len, m, x, y, z, rx = Math.PI / 2) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m);
      mesh.rotation.x = rx;
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    const add = (mesh) => { g.add(mesh); return mesh; };
    build(box, cyl, add);
    let flashMat = null;
    if (flashAt) {
      flashMat = new THREE.MeshBasicMaterial({
        map: sharedFlashTex(), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      });
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(flashSize, flashSize), flashMat);
      flash.position.set(flashAt[0], flashAt[1], flashAt[2]);
      g.add(flash);
    }
    g.userData = { flashMat, base };
    out[key] = g;
    return g;
  };
  // VK-47 Rifle: the R3 shape, refined with a lighter handguard.
  mk('rifle', [0.28, -0.26, -0.55], (box, cyl) => {
    box(0.09, 0.14, 0.55, metal, 0, 0, 0);
    cyl(0.025, 0.42, metal, 0, 0.02, -0.45);
    box(0.07, 0.22, 0.12, metal, 0, -0.16, -0.05, 0.15);
    box(0.05, 0.07, 0.12, accent, 0, 0.1, -0.1);
    box(0.08, 0.11, 0.22, metal, 0, -0.01, 0.36);
    box(0.08, 0.1, 0.2, metalLight, 0, -0.05, -0.28);
  }, [0, 0.02, -0.68], 0.22);
  // K9 SMG: short and light, no stock, foregrip under the barrel.
  mk('smg', [0.28, -0.25, -0.5], (box, cyl) => {
    box(0.09, 0.12, 0.38, metal, 0, 0, 0);
    cyl(0.02, 0.22, metal, 0, 0.02, -0.3);
    box(0.06, 0.18, 0.1, metal, 0, -0.14, -0.02, 0.1);
    box(0.06, 0.14, 0.08, metalLight, 0, -0.12, -0.22);
    box(0.04, 0.05, 0.08, accent, 0, 0.09, -0.05);
    box(0.07, 0.09, 0.12, metal, 0, -0.01, 0.22);
  }, [0, 0.02, -0.44], 0.2);
  // M12 Scattergun: wide receiver, thick barrel, pump under it.
  mk('shotgun', [0.28, -0.27, -0.55], (box, cyl) => {
    box(0.11, 0.15, 0.5, metal, 0, 0, 0);
    cyl(0.045, 0.5, metal, 0, 0.03, -0.48);
    box(0.09, 0.1, 0.22, metalLight, 0, -0.08, -0.35);
    box(0.09, 0.12, 0.24, metal, 0, -0.01, 0.36);
    box(0.02, 0.02, 0.02, accent, 0, 0.09, -0.3);
  }, [0, 0.03, -0.78], 0.26);
  // L86 Longshot: long thin barrel and a scope on top.
  mk('sniper', [0.28, -0.25, -0.6], (box, cyl) => {
    box(0.08, 0.12, 0.6, metal, 0, 0, 0);
    cyl(0.028, 0.7, metal, 0, 0.02, -0.62);
    cyl(0.05, 0.28, metalLight, 0, 0.11, -0.1);
    box(0.02, 0.02, 0.02, accent, 0, 0.11, 0.05);
    box(0.08, 0.11, 0.24, metal, 0, -0.01, 0.4);
    box(0.06, 0.16, 0.1, metal, 0, -0.13, -0.05, 0.1);
  }, [0, 0.02, -1.0], 0.26);
  // P9 Sidearm: a small slide and grip, held lower and closer.
  mk('pistol', [0.26, -0.3, -0.45], (box, cyl) => {
    box(0.07, 0.09, 0.24, metal, 0, 0, 0);
    box(0.06, 0.16, 0.08, metal, 0, -0.11, 0.08, 0.25);
    box(0.03, 0.03, 0.05, metalLight, 0, 0.01, -0.14);
    box(0.02, 0.03, 0.06, accent, 0, 0.06, -0.05);
  }, [0, 0.01, -0.2], 0.16);
  // Frag Grenade: a dark olive sphere with a pull ring, no muzzle flash.
  mk('grenade', [0.26, -0.28, -0.5], (box, cyl, add) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), olive);
    add(ball);
    box(0.02, 0.06, 0.02, metalLight, 0, 0.1, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12), metalLight);
    ring.position.set(0.06, 0.1, 0);
    add(ring);
  }, null, 0);
  return out;
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

  // Viewmodels, one per weapon; only the active weapon's is visible.
  const vms = buildViewmodels();
  for (const key of Object.keys(vms)) {
    const b = vms[key].userData.base;
    vms[key].position.set(b[0], b[1], b[2]);
    vms[key].visible = false;
    camera.add(vms[key]);
  }
  // Bot muzzle flashes: a pool of starburst billboards fed by the sim's
  // flash pool (the sim already records every shot; R3 never drew them).
  const botFlashes = [];
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: sharedFlashTex(), transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), mat);
    f.visible = false;
    f.frustumCulled = false;
    scene.add(f);
    botFlashes.push(f);
  }

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

  return { camera, scene, botGroups, vms, botFlashes, muzzleLight, tracers, impacts, blasts, bomb, walkT: 0 };
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
  // Dead players spectate a living Vanguard teammate instead of staring
  // at the floor where they fell: the round plays on for up to 100 s,
  // and a frozen death cam wastes all of it.
  if (!p.alive) {
    const spec = sim.entities.find((e) => e.team === 'vanguard' && e.isBot && e.alive);
    if (spec) {
      const eye = spec.pos.y + (spec.crouched ? 1.15 : 1.7);
      cam.position.set(spec.pos.x, eye, spec.pos.z);
      cam.rotation.order = 'YXZ';
      cam.rotation.y = spec.yaw;
      cam.rotation.x = spec.pitch;
      cam.rotation.z = 0;
    }
  } else {
    const eye = p.pos.y + (p.crouched ? 1.15 : 1.7);
    cam.position.set(p.pos.x, eye, p.pos.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = p.yaw;
    cam.rotation.x = p.pitch + (p.recoil || 0);
    cam.rotation.z = 0;
  }
  // Sniper scope narrows the view.
  const targetFov = p.scoped && p.weapon === 'sniper' ? 32 : 75;
  if (Math.abs(cam.fov - targetFov) > 0.1) {
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 14);
    cam.updateProjectionMatrix();
  }

  // Viewmodel: the active weapon's model only, with walk bob, recoil
  // kick and a reload dip, each relative to that weapon's base pose.
  rs.walkT += dt * (p.moving > 0.5 ? p.moving * 1.6 : 0);
  const bobY = Math.sin(rs.walkT * 2) * 0.012 * Math.min(1, p.moving / 4);
  const bobX = Math.cos(rs.walkT) * 0.008 * Math.min(1, p.moving / 4);
  const activeVm = rs.vms[p.weapon] || rs.vms.rifle;
  for (const key of Object.keys(rs.vms)) rs.vms[key].visible = false;
  const base = activeVm.userData.base;
  activeVm.position.set(base[0] + bobX, base[1] + bobY, base[2] + (p.recoil || 0) * 1.6);
  activeVm.rotation.x = (p.recoil || 0) * 1.4;
  if (p.reloading) activeVm.position.y -= 0.12;
  activeVm.visible = p.alive;
  // Muzzle flash on a fresh PLAYER shot only (bots' shots light their own
  // tracers, not the viewmodel).
  const playerFired = p.lastShot > 0 && sim.time - p.lastShot < 0.06;
  if (activeVm.userData.flashMat) activeVm.userData.flashMat.opacity = playerFired ? 0.95 : 0;
  rs.muzzleLight.intensity = playerFired ? 26 : 0;

  // Bot muzzle flashes: billboard the sim's flash pool at each shot's
  // position (player shots are skipped — the viewmodel flash covers them).
  for (let i = 0; i < rs.botFlashes.length; i++) {
    const f = rs.botFlashes[i];
    const t = sim.flashes.items[i];
    if (!t || t.ttl <= 0 || t.byPlayer) { f.visible = false; continue; }
    f.visible = true;
    f.position.set(t.x, t.y, t.z);
    f.lookAt(cam.position);
    f.material.opacity = Math.min(1, t.ttl / t.maxTtl);
  }

  // Bots. Groups are created lazily: createRenderState runs at load when
  // sim.entities is still empty (spawnTeams only runs on startMatch), so
  // R3 built no groups at all and every bot was invisible — the sim
  // played but the yard looked empty. A group is made the first frame its
  // entity is seen and kept (ids are stable across rounds, same teams).
  for (const e of sim.entities) {
    if (e.isPlayer) continue;
    let g = rs.botGroups.get(e.id);
    if (!g) {
      g = botBody(e.team);
      rs.scene.add(g);
      rs.botGroups.set(e.id, g);
    }
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
