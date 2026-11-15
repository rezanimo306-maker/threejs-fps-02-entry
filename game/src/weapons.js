// DUSKLINE — weapons: loadouts, the buy menu's prices, spread and recoil,
// reloading, and the frag grenade's flight. Shooting itself lives in
// combat.js; this module only decides whether a shot may happen and what
// its spread and kick are.
import { WEAPONS, ARMOR_PRICE } from './config.js';

// An entity's weapon state lives on the entity: weapon (key), mag, reserve,
// grenades, bloom (degrees of extra spread), recoil (radians of pitch kick),
// reloading (bool), reloadEnd (sim time), lastShot (sim time).
// Ammo is kept PER WEAPON in ent.ammo: switching weapons restores what that
// weapon had left instead of refilling it (a switch used to hand back a
// full magazine and reserve, so ammunition never really ran out).
export function saveAmmo(ent) {
  if (!ent.ammo) ent.ammo = {};
  ent.ammo[ent.weapon] = { mag: ent.mag, reserve: ent.reserve };
}

export function giveWeapon(ent, key) {
  const w = WEAPONS[key];
  saveAmmo(ent); // keep the outgoing weapon's ammunition
  ent.weapon = key;
  if (!ent.ammo) ent.ammo = {};
  const saved = ent.ammo[key];
  if (saved) { ent.mag = saved.mag; ent.reserve = saved.reserve; }
  else {
    ent.mag = w.mag;
    ent.reserve = w.reserve;
    ent.ammo[key] = { mag: w.mag, reserve: w.reserve };
  }
  ent.bloom = 0;
  ent.reloading = false;
}

export function buyWeapon(ent, key) {
  const w = WEAPONS[key];
  if (!w || ent.money < w.price) return false;
  if (key === 'grenade') {
    if (ent.grenades >= 2) return false;
    ent.money -= w.price;
    ent.grenades += 1;
    return true;
  }
  ent.money -= w.price;
  if (w.slot === 'primary') ent.primary = key;
  else ent.sidearm = key;
  // A fresh purchase comes with full ammunition, whatever that weapon
  // had left before.
  if (!ent.ammo) ent.ammo = {};
  ent.ammo[key] = { mag: w.mag, reserve: w.reserve };
  giveWeapon(ent, key);
  return true;
}

export function buyArmor(ent) {
  if (ent.armor || ent.money < ARMOR_PRICE) return false;
  ent.money -= ARMOR_PRICE;
  ent.armor = true;
  return true;
}

export function switchWeapon(ent, slot) {
  const key = slot === 'primary' ? ent.primary : slot === 'sidearm' ? ent.sidearm : 'grenade';
  if (!key || key === ent.weapon) return false;
  if (slot === 'grenade' && ent.grenades <= 0) return false;
  giveWeapon(ent, key);
  return true;
}

// Spread in degrees for the next shot: base, plus bloom, worse while moving
// or in the air, better while crouched. Stopping to aim pays.
export function currentSpread(ent) {
  const w = WEAPONS[ent.weapon];
  let s = w.spread + ent.bloom;
  const speed = Math.hypot(ent.vel.x, ent.vel.z);
  if (!ent.onGround) s *= w.airMul;
  else if (speed > 0.6) s *= w.moveMul;
  if (ent.crouched) s *= 0.65;
  return s;
}

export function canFire(ent, now) {
  const w = WEAPONS[ent.weapon];
  if (ent.reloading) return false;
  if (now - ent.lastShot < 60 / w.rpm) return false;
  if (ent.weapon === 'grenade') return ent.grenades > 0;
  return ent.mag > 0;
}

// Consume one shot's ammo and apply its recoil. Returns false when the
// weapon is dry or still inside its fire interval (the caller plays the
// dry-fire click).
export function consumeShot(ent, now) {
  if (!canFire(ent, now)) return false;
  const w = WEAPONS[ent.weapon];
  if (ent.weapon === 'grenade') {
    if (ent.grenades <= 0) return false;
    ent.grenades -= 1;
    ent.lastShot = now;
    return true;
  }
  if (ent.mag <= 0) return false;
  ent.mag -= 1;
  ent.lastShot = now;
  ent.bloom = Math.min(w.maxBloom, ent.bloom + w.bloom);
  ent.recoil = Math.min(0.12, (ent.recoil || 0) + (w.kick * Math.PI) / 180);
  return true;
}

export function startReload(ent, now) {
  const w = WEAPONS[ent.weapon];
  if (ent.reloading || ent.mag >= w.mag || ent.reserve <= 0 || ent.weapon === 'grenade') return false;
  ent.reloading = true;
  ent.reloadEnd = now + w.reload;
  return true;
}

export function finishReload(ent) {
  const w = WEAPONS[ent.weapon];
  const need = w.mag - ent.mag;
  const take = Math.min(need, ent.reserve);
  ent.mag += take;
  ent.reserve -= take;
  ent.reloading = false;
}

// Recoil and bloom recover over time; call every fixed step.
export function recoverWeapon(ent, dt) {
  const w = WEAPONS[ent.weapon];
  ent.bloom = Math.max(0, ent.bloom - w.kickRecover * 0.6 * dt);
  ent.recoil = Math.max(0, (ent.recoil || 0) - w.kickRecover * 0.03 * dt);
}

// --- Grenades ---
export function throwGrenade(sim, ent) {
  const dir = aimDir(ent);
  const speed = 17;
  sim.grenades.push({
    pos: { x: ent.pos.x, y: ent.pos.y + 1.45, z: ent.pos.z },
    vel: { x: dir.x * speed, y: dir.y * speed + 3.2, z: dir.z * speed },
    fuse: 1.6,
    owner: ent,
    bounced: 0,
  });
}

// Unit aim direction of an entity (yaw around Y, pitch up positive).
// Writes into `out` when given, else returns a fresh vector.
export function aimDir(ent, out = {}) {
  const cp = Math.cos(ent.pitch + (ent.recoil || 0));
  out.x = -Math.sin(ent.yaw) * cp;
  out.y = Math.sin(ent.pitch + (ent.recoil || 0));
  out.z = -Math.cos(ent.yaw) * cp;
  return out;
}
