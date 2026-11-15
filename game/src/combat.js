// DUSKLINE — combat: hitscan shooting, hitboxes, damage, grenade blasts.
// All geometry is plain numbers here (no three.js in the hot path): a shot
// is a ray tested against wall boxes and entity hitboxes, nearest hit wins.
import { WEAPONS, HEADSHOT_MULT, ARMOR_ABSORB } from './config.js';
import { currentSpread, consumeShot } from './weapons.js';

const DEG = Math.PI / 180;

// Eye height of an entity (feet position + this).
function eyeHeight(ent) {
  return ent.crouched ? 1.15 : 1.7;
}

// Ray vs axis-aligned box. Returns the distance along the ray, or -1.
function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxD) {
  let t0 = 0; let t1 = maxD;
  let o, d, mn, mx;
  o = ox; d = dx; mn = minX; mx = maxX;
  if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return -1; }
  else {
    let a = (mn - o) / d; let b = (mx - o) / d;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  o = oy; d = dy; mn = minY; mx = maxY;
  if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return -1; }
  else {
    let a = (mn - o) / d; let b = (mx - o) / d;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  o = oz; d = dz; mn = minZ; mx = maxZ;
  if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return -1; }
  else {
    let a = (mn - o) / d; let b = (mx - o) / d;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  return t0;
}

// Ray vs sphere. Returns distance, or -1.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxD) {
  const lx = cx - ox; const ly = cy - oy; const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const t = tca - Math.sqrt(r2 - d2);
  return t <= maxD ? t : -1;
}

// One hitscan pellet from shooter. dir is a unit vector. Returns the hit.
export function firePellet(sim, shooter, dir, now) {
  const w = WEAPONS[shooter.weapon];
  const ox = shooter.pos.x;
  const oy = shooter.pos.y + eyeHeight(shooter);
  const oz = shooter.pos.z;
  const maxD = w.range;
  let best = maxD; let hitEnt = null; let hitHead = false; let hx = 0; let hy = 0; let hz = 0;

  // Walls first: the nearest wall caps the shot.
  for (let i = 0; i < sim.colliders.length; i++) {
    const c = sim.colliders[i];
    const t = rayBox(ox, oy, oz, dir.x, dir.y, dir.z,
      c.minX, 0, c.minZ, c.maxX, c.top, c.maxZ, maxD);
    if (t >= 0 && t < best) {
      best = t; hitEnt = null;
      hx = ox + dir.x * t; hy = oy + dir.y * t; hz = oz + dir.z * t;
    }
  }
  // Ground.
  if (dir.y < -1e-6) {
    const t = -oy / dir.y;
    if (t >= 0 && t < best) {
      best = t; hitEnt = null;
      hx = ox + dir.x * t; hy = 0; hz = oz + dir.z * t;
    }
  }
  // Entities: head sphere, then body box.
  for (let i = 0; i < sim.entities.length; i++) {
    const e = sim.entities[i];
    if (e === shooter || !e.alive) continue;
    const headY = e.pos.y + (e.crouched ? 1.05 : 1.55);
    let t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, e.pos.x, headY, e.pos.z, 0.26, best);
    if (t >= 0) {
      best = t; hitEnt = e; hitHead = true;
      hx = ox + dir.x * t; hy = oy + dir.y * t; hz = oz + dir.z * t;
      continue;
    }
    const bodyTop = e.pos.y + (e.crouched ? 1.05 : 1.45);
    t = rayBox(ox, oy, oz, dir.x, dir.y, dir.z,
      e.pos.x - 0.42, e.pos.y, e.pos.z - 0.42,
      e.pos.x + 0.42, bodyTop, e.pos.z + 0.42, best);
    if (t >= 0) {
      best = t; hitEnt = e; hitHead = false;
      hx = ox + dir.x * t; hy = oy + dir.y * t; hz = oz + dir.z * t;
    }
  }

  const endX = ox + dir.x * best;
  const endY = oy + dir.y * best;
  const endZ = oz + dir.z * best;
  sim.addTracer(ox, oy, oz, endX, endY, endZ);
  if (hitEnt) {
    let dmg = w.damage * (hitHead ? (w.headMult || HEADSHOT_MULT) : 1);
    // Damage falls off past half the weapon's range.
    const fall = best > w.range * 0.5 ? 1 - 0.4 * ((best - w.range * 0.5) / (w.range * 0.5)) : 1;
    dmg *= Math.max(0.6, fall);
    damageEntity(sim, hitEnt, dmg, shooter, hitHead, now);
    sim.addImpact(hx, hy, hz, hitEnt.team);
    return { hit: true, head: hitHead, dist: best };
  }
  sim.addImpact(endX, endY, endZ, null);
  return { hit: false, head: false, dist: best };
}

// Full shot: spread cone, pellets, ammo, sound and tracer hooks.
export function shoot(sim, shooter, now) {
  if (!consumeShot(shooter, now)) return 'dry';
  const w = WEAPONS[shooter.weapon];
  const spreadDeg = currentSpread(shooter);
  const pellets = w.pellets || 1;
  let anyHit = false;
  let anyHead = false;
  for (let p = 0; p < pellets; p++) {
    const dir = spreadDir(shooter, spreadDeg);
    const r = firePellet(sim, shooter, dir, now);
    if (r.hit) { anyHit = true; if (r.head) anyHead = true; }
  }
  sim.onShotFired(shooter);
  return anyHead ? 'head' : anyHit ? 'hit' : 'miss';
}

// A direction inside the spread cone around the entity's aim.
const _d = { x: 0, y: 0, z: 0 };
function spreadDir(ent, spreadDeg) {
  const cp = Math.cos(ent.pitch + (ent.recoil || 0));
  const fwd = _d;
  fwd.x = -Math.sin(ent.yaw) * cp;
  fwd.y = Math.sin(ent.pitch + (ent.recoil || 0));
  fwd.z = -Math.cos(ent.yaw) * cp;
  // Random point in a disc perpendicular to fwd, radius tan(spread).
  const r = Math.tan(spreadDeg * DEG) * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  // Right and up vectors (yaw only, pitch ignored for the disc basis).
  const rx = Math.cos(ent.yaw); const rz = -Math.sin(ent.yaw);
  const ux = -Math.sin(ent.yaw) * Math.sin(ent.pitch);
  const uy = Math.cos(ent.pitch);
  const uz = -Math.cos(ent.yaw) * Math.sin(ent.pitch);
  const ox = fwd.x + (rx * Math.cos(a) + ux * Math.sin(a)) * r;
  const oy = fwd.y + (0 * Math.cos(a) + uy * Math.sin(a)) * r;
  const oz = fwd.z + (rz * Math.cos(a) + uz * Math.sin(a)) * r;
  const len = Math.hypot(ox, oy, oz) || 1;
  return { x: ox / len, y: oy / len, z: oz / len };
}

export function damageEntity(sim, target, dmg, attacker, isHead, now) {
  if (!target.alive) return;
  let left = dmg;
  if (target.armor && left > 0) {
    const absorbed = left * ARMOR_ABSORB;
    left -= absorbed;
  }
  target.hp -= left;
  target.lastDamageFrom = attacker;
  target.lastDamageAt = now;
  if (target.isPlayer) sim.onPlayerHurt();
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deaths += 1;
    if (attacker && attacker !== target) {
      attacker.kills += 1;
      attacker.money += 300;
    }
    sim.onKill(attacker, target, isHead, now);
  }
}

// Grenade blast: damage falls with distance, walls between the blast and a
// target cut the damage to a quarter.
export function explodeGrenade(sim, g, now) {
  const w = WEAPONS.grenade;
  sim.addBlast(g.pos.x, g.pos.y, g.pos.z);
  for (let i = 0; i < sim.entities.length; i++) {
    const e = sim.entities[i];
    if (!e.alive) continue;
    const dx = e.pos.x - g.pos.x;
    const dy = (e.pos.y + 0.9) - g.pos.y;
    const dz = e.pos.z - g.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > w.radius) continue;
    let dmg = w.damage * (1 - (dist / w.radius) * 0.7);
    if (sim.wallBetween(g.pos, { x: e.pos.x, y: e.pos.y + 0.9, z: e.pos.z }, 1.2)) dmg *= 0.25;
    damageEntity(sim, e, dmg, g.owner, false, now);
  }
}
