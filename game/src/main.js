// DUSKLINE — entry point: builds the scene, wires input and pointer lock,
// runs the fixed-step loop and keeps the HUD in sync.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createSim, startMatch, step, STEP } from './sim.js';
import { createRenderer, createRenderState, syncRender } from './render.js';
import { createPlayerInput, attachInput, requestLock } from './player.js';
import { buildHud, updateHud, showHitmarker } from './hud.js';
import { initAudio, resumeAudio, playHit, playBuy } from './audio.js';
import { buyWeapon, buyArmor } from './weapons.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1420);
scene.fog = new THREE.Fog(0x0e1420, 55, 150);

// Dusk lighting: low warm sun + cool sky fill.
const hemi = new THREE.HemisphereLight(0x8fa3c7, 0x3a2f26, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
sun.position.set(-35, 42, -20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x6b8cff, 0.9);
fill.position.set(30, 20, 30);
scene.add(fill);

const world = buildWorld(scene);
const sim = createSim(world);
const input = createPlayerInput();
const rs = createRenderState(scene, sim);
const hud = buildHud();
initAudio();

// Hitmarker hook for the combat module: a marker and a tick on every hit.
sim.onHit = (head) => { showHitmarker(hud, head); playHit(); };

// --- input ---
let locked = false;
let paused = false;
const overlay = document.getElementById('menu');
const pauseOverlay = document.getElementById('pause');

attachInput(input, canvas, {
  onKey: () => resumeAudio(),
  onLock: (isLocked) => {
    locked = isLocked;
    if (!locked && (sim.phase === 'round' || sim.phase === 'buy')) {
      paused = true;
      pauseOverlay.classList.add('show');
    }
    if (locked) {
      paused = false;
      pauseOverlay.classList.remove('show');
      overlay.classList.remove('show');
    }
  },
});

canvas.addEventListener('click', () => {
  if (!locked) requestLock(canvas);
});
pauseOverlay.addEventListener('click', () => requestLock(canvas));

document.getElementById('start-btn').addEventListener('click', () => {
  resumeAudio();
  startMatch(sim, input);
  overlay.classList.remove('show');
  requestLock(canvas);
});

// Restart after a match ends.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && sim.phase === 'matchEnd') {
    startMatch(sim, input);
    overlay.classList.remove('show');
    requestLock(canvas);
  }
});

// Buy menu buttons.
document.querySelectorAll('#buy-menu [data-buy]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const p = sim.player;
    if (!p || sim.phase !== 'buy') return;
    const kind = btn.getAttribute('data-buy');
    const ok = kind === 'armor' ? buyArmor(p) : buyWeapon(p, kind);
    if (ok) playBuy();
  });
});

// --- sizing ---
function resize() {
  const w = window.innerWidth; const h = window.innerHeight;
  renderer.setSize(w, h, false);
  rs.camera.aspect = w / h;
  rs.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- fixed-step loop ---
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // tab was hidden
  if (!paused && sim.phase !== 'menu') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      step(sim, input, STEP);
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0; // drop backlog rather than spiral
  }
  syncRender(rs, sim, dt, sim.time);
  updateHud(hud, sim, input);
  renderer.render(scene, rs.camera);
}

// Menu state: show the title overlay until the player starts.
overlay.classList.add('show');
requestAnimationFrame(frame);

// Debug / test hook: lets an automated smoke test drive the game without a
// pointer lock or a mouse (move, fire, force phases, read the state).
window.__DUSKLINE__ = {
  sim, input, rs, world,
  start: () => { startMatch(sim, input); overlay.classList.remove('show'); },
  // Freeze the page's own loop so a test can drive the sim step by step.
  pause: (v) => { paused = v; },
  step: (n = 1) => { for (let i = 0; i < n; i++) step(sim, input, STEP); },
  version: '0.3.0',
};
