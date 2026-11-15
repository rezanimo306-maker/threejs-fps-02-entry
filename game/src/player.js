// DUSKLINE — the human player: keyboard + mouse-look input, movement with
// acceleration and friction, crouching, jumping, and AABB collision.
// The player writes only intents; sim.js steps them.
import {
  WALK_SPEED, RUN_SPEED, CROUCH_SPEED, ACCEL, FRICTION,
  GRAVITY, JUMP_SPEED, PLAYER_RADIUS, PLAYER_HEIGHT, CROUCH_HEIGHT,
} from './config.js';
import { groundHeightAt, resolveMove } from './world.js';

export function createPlayerInput() {
  return {
    keys: new Set(),
    lookDX: 0, lookDY: 0, // accumulated mouse deltas, consumed by the sim
    firing: false,
    scoping: false, // right mouse held (sniper scope)
    pointerLocked: false,
  };
}

// Attach listeners to the canvas element. Returns a cleanup function.
export function attachInput(input, canvas, callbacks) {
  const onKeyDown = (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    if (callbacks.onKey) callbacks.onKey(e.code, true);
    if (e.code === 'Space') e.preventDefault();
  };
  const onKeyUp = (e) => {
    input.keys.delete(e.code);
    if (callbacks.onKey) callbacks.onKey(e.code, false);
  };
  const onMouseMove = (e) => {
    if (!input.pointerLocked) return;
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  };
  const onMouseDown = (e) => {
    if (e.button === 0) input.firing = true;
    if (e.button === 2) input.scoping = true;
    if (callbacks.onMouse) callbacks.onMouse(e.button, true);
  };
  const onMouseUp = (e) => {
    if (e.button === 0) input.firing = false;
    if (e.button === 2) input.scoping = false;
    if (callbacks.onMouse) callbacks.onMouse(e.button, false);
  };
  const onLockChange = () => {
    input.pointerLocked = document.pointerLockElement === canvas;
    if (callbacks.onLock) callbacks.onLock(input.pointerLocked);
  };
  const onBlur = () => { input.keys.clear(); input.firing = false; input.scoping = false; };
  const onContext = (e) => e.preventDefault();
  canvas.addEventListener('contextmenu', onContext);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('pointerlockchange', onLockChange);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('contextmenu', onContext);
  };
}

export function requestLock(canvas) {
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
}

// One fixed step of player movement. Reads input, writes pos/vel/yaw/pitch.
export function stepPlayer(sim, ent, input, dt) {
  // Look: mouse deltas turn yaw/pitch. Sensitivity is fixed so aim is
  // repeatable; recoil is a separate offset added at render and shot time.
  const SENS = 0.0023;
  ent.yaw -= input.lookDX * SENS;
  ent.pitch -= input.lookDY * SENS;
  const maxPitch = 1.55;
  if (ent.pitch > maxPitch) ent.pitch = maxPitch;
  if (ent.pitch < -maxPitch) ent.pitch = -maxPitch;
  input.lookDX = 0;
  input.lookDY = 0;

  const k = input.keys;
  const crouched = k.has('ControlLeft') || k.has('KeyC');
  ent.crouched = crouched;

  // Wish direction in world space from yaw.
  let fx = 0; let fz = 0;
  if (k.has('KeyW')) { fx += -Math.sin(ent.yaw); fz += -Math.cos(ent.yaw); }
  if (k.has('KeyS')) { fx -= -Math.sin(ent.yaw); fz -= -Math.cos(ent.yaw); }
  if (k.has('KeyA')) { fx += -Math.cos(ent.yaw); fz += Math.sin(ent.yaw); }
  if (k.has('KeyD')) { fx -= -Math.cos(ent.yaw); fz -= Math.sin(ent.yaw); }
  const fl = Math.hypot(fx, fz);
  if (fl > 0) { fx /= fl; fz /= fl; }

  const speed = crouched ? CROUCH_SPEED : (k.has('ShiftLeft') ? WALK_SPEED : RUN_SPEED);
  const targetVX = fx * speed;
  const targetVZ = fz * speed;
  // Exponential approach to the wish velocity: quick to accelerate,
  // friction when no input.
  const rate = fl > 0 ? ACCEL : FRICTION;
  const a = 1 - Math.exp(-rate * dt);
  ent.vel.x += (targetVX - ent.vel.x) * a;
  ent.vel.z += (targetVZ - ent.vel.z) * a;

  // Jump.
  if (k.has('Space') && ent.onGround) {
    ent.vel.y = JUMP_SPEED;
    ent.onGround = false;
  }

  // Integrate with collision.
  const moved = resolveMove(
    sim.colliders, ent.pos.x, ent.pos.z, ent.pos.y,
    ent.vel.x * dt, ent.vel.z * dt, PLAYER_RADIUS,
  );
  ent.pos.x = moved.x;
  ent.pos.z = moved.z;

  // Vertical: gravity, ground is the yard floor or a low crate top.
  ent.vel.y -= GRAVITY * dt;
  let ny = ent.pos.y + ent.vel.y * dt;
  const ground = groundHeightAt(sim.colliders, ent.pos.x, ent.pos.z);
  if (ny <= ground) {
    ny = ground;
    ent.vel.y = 0;
    ent.onGround = true;
  } else {
    ent.onGround = false;
  }
  ent.pos.y = ny;

  ent.height = crouched ? CROUCH_HEIGHT : PLAYER_HEIGHT;
  ent.moving = Math.hypot(ent.vel.x, ent.vel.z);
}
