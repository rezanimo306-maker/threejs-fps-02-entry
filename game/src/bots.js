// DUSKLINE — bot AI: teammates and opponents that route through the map,
// hold angles, engage what they see, react to gunfire, and play the bomb
// objective (plant for Vanguard, defuse for Ember).
import { RUN_SPEED, CROUCH_SPEED, PLAYER_RADIUS, PLANT_TIME, DEFUSE_TIME } from './config.js';
import { findRoute, segmentBlocked, groundHeightAt, resolveMove } from './world.js';
import { buyWeapon, buyArmor, giveWeapon, startReload, finishReload } from './weapons.js';
import { shoot } from './combat.js';

const CALLSIGNS = ['Ghost', 'Viper', 'Havoc', 'Blitz', 'Rook', 'Nomad', 'Frost', 'Onyx', 'Wraith', 'Sable'];
const EYE = 1.4; // height bots check line of sight at

export function createBot(id, team, spawn, skill, name) {
  return {
    id, team, isBot: true, isPlayer: false, name: name || CALLSIGNS[id % CALLSIGNS.length],
    pos: { x: spawn.x, y: 0, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: team === 'vanguard' ? 0 : Math.PI, pitch: 0,
    hp: 100, armor: false, alive: true,
    weapon: 'pistol', primary: 'pistol', sidearm: 'pistol',
    mag: 12, reserve: 48, grenades: 0, bloom: 0, recoil: 0,
    reloading: false, reloadEnd: 0, lastShot: -10,
    money: 800, kills: 0, deaths: 0,
    crouched: false, onGround: true, moving: 0, height: 1.7,
    skill, state: 'route', route: [], routeIdx: 0,
    target: null, firstSeenAt: 0, burstLeft: 0, burstPauseUntil: 0,
    holdUntil: 0, holdPos: null, thinkAt: 0, aimYaw: 0, aimPitch: 0,
    assignedSite: null, hasBomb: false, planting: 0, defusing: 0,
    investigate: null, lastDamageFrom: null, lastDamageAt: -10,
  };
}

// Spend the round's money: rifle when affordable, else SMG, armour, grenade.
export function botBuy(bot, rng) {
  bot.money = Math.min(bot.money, 9000);
  if (bot.money >= 2700 && rng() < 0.8) buyWeapon(bot, 'rifle');
  else if (bot.money >= 1500) buyWeapon(bot, 'smg');
  else if (bot.money >= 1200) buyWeapon(bot, 'shotgun');
  if (bot.money >= 650 && rng() < 0.6) buyArmor(bot);
  if (bot.money >= 300 && rng() < 0.4) buyWeapon(bot, 'grenade');
  if (bot.weapon === 'pistol') giveWeapon(bot, bot.primary);
}

function nearestVisible(sim, bot) {
  let best = null; let bestD = 60;
  for (let i = 0; i < sim.entities.length; i++) {
    const e = sim.entities[i];
    if (e.team === bot.team || !e.alive) continue;
    const dx = e.pos.x - bot.pos.x; const dz = e.pos.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    if (segmentBlocked(sim.colliders, bot.pos.x, bot.pos.z, e.pos.x, e.pos.z, EYE)) continue;
    best = e; bestD = d;
  }
  return best ? { ent: best, dist: bestD } : null;
}

function turnToward(bot, tx, tz, ty, dt, rate) {
  const wantYaw = Math.atan2(-(tx - bot.pos.x), -(tz - bot.pos.z));
  let dy = wantYaw - bot.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, dy));
  bot.yaw += step;
  const dx = tx - bot.pos.x; const dz = tz - bot.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const wantPitch = Math.asin(Math.max(-1, Math.min(1, (ty - (bot.pos.y + 1.4)) / dist)));
  bot.pitch += Math.max(-rate * dt, Math.min(rate * dt, wantPitch - bot.pitch));
}

// Aim error in radians: worse for low skill, far or fast targets.
function aimError(bot, dist, targetSpeed) {
  const base = (1 - bot.skill) * 0.055 + 0.008;
  return base + dist * 0.0009 + targetSpeed * 0.004;
}

export function stepBot(sim, bot, dt, now, rng) {
  if (!bot.alive) return;

  // Think at ~8 Hz, staggered by id.
  if (now >= bot.thinkAt) {
    bot.thinkAt = now + 0.11 + rng() * 0.05;
    think(sim, bot, now, rng);
  }

  // Act on the current state.
  if (bot.state === 'engage' && bot.target && bot.target.alive) {
    const t = bot.target;
    const dx = t.pos.x - bot.pos.x; const dz = t.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    const ty = t.pos.y + (t.crouched ? 1.0 : 1.35);
    turnToward(bot, t.pos.x, t.pos.z, ty, dt, 5.5);
    // Aim error applied as a small offset when firing.
    const err = aimError(bot, dist, Math.hypot(t.vel.x, t.vel.z));
    const fireYaw = bot.yaw + (rng() - 0.5) * 2 * err;
    const firePitch = bot.pitch + (rng() - 0.5) * 2 * err;
    const saveYaw = bot.yaw; const savePitch = bot.pitch;
    // Strafe while fighting, sometimes crouch.
    const strafe = Math.sin(now * 0.9 + bot.id * 2.1) > 0.2 ? 1 : -1;
    const mx = Math.cos(bot.yaw) * strafe;
    const mz = -Math.sin(bot.yaw) * strafe;
    moveBot(sim, bot, mx, mz, dt, RUN_SPEED * 0.55);
    if (now > bot.burstPauseUntil) {
      if (bot.burstLeft <= 0) {
        bot.burstLeft = 3 + Math.floor(rng() * 3);
        bot.burstPauseUntil = now + 0.35 + rng() * 0.5;
      }
      if (bot.burstLeft > 0 && now - bot.firstSeenAt > 0.25 + (1 - bot.skill) * 0.45) {
        bot.yaw = fireYaw; bot.pitch = firePitch;
        const res = shoot(sim, bot, now);
        bot.yaw = saveYaw; bot.pitch = savePitch;
        if (res !== 'dry') bot.burstLeft -= 1;
        else if (bot.mag === 0) bot.burstLeft = 0;
      }
    }
    // Reload when the magazine runs dry out of a burst.
    if (bot.mag === 0 && !bot.reloading) startReload(bot, now);
  } else if (bot.state === 'plant') {
    bot.planting += dt;
    if (bot.planting >= PLANT_TIME) sim.onPlantComplete(bot);
  } else if (bot.state === 'defuse') {
    bot.defusing += dt;
    if (bot.defusing >= DEFUSE_TIME) sim.onDefuseComplete(bot);
  } else if (bot.route.length > 0) {
    // Follow the waypoint route.
    const wp = sim.waypoints[bot.route[bot.routeIdx]];
    if (!wp) { bot.route = []; return; }
    const dx = wp.x - bot.pos.x; const dz = wp.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      bot.routeIdx += 1;
      if (bot.routeIdx >= bot.route.length) {
        bot.route = [];
        bot.holdUntil = now + 2 + rng() * 4;
        bot.state = 'hold';
        bot.holdPos = { x: bot.pos.x, z: bot.pos.z };
      }
      return;
    }
    const speed = bot.crouched ? CROUCH_SPEED : RUN_SPEED * 0.85;
    moveBot(sim, bot, dx / d, dz / d, dt, speed);
    bot.yaw = Math.atan2(-dx, -dz);
  } else if (bot.state === 'hold') {
    // Hold the angle: slow scan, sometimes crouch.
    bot.yaw += Math.sin(now * 0.5 + bot.id) * 0.25 * dt;
    if (now > bot.holdUntil) {
      bot.state = 'route';
      assignRoute(sim, bot, rng);
    }
  }

  // Reload completion.
  if (bot.reloading && now >= bot.reloadEnd) finishReload(bot);

  // Weapon recovery + gravity (bots stay grounded).
  bot.bloom = Math.max(0, bot.bloom - 4 * dt);
  bot.recoil = Math.max(0, bot.recoil - 0.2 * dt);
  bot.pos.y = groundHeightAt(sim.colliders, bot.pos.x, bot.pos.z);
  bot.onGround = true;
  bot.moving = Math.hypot(bot.vel.x, bot.vel.z);
}

function moveBot(sim, bot, dx, dz, dt, speed) {
  const len = Math.hypot(dx, dz) || 1;
  bot.vel.x = (dx / len) * speed;
  bot.vel.z = (dz / len) * speed;
  const moved = resolveMove(sim.colliders, bot.pos.x, bot.pos.z, bot.pos.y,
    bot.vel.x * dt, bot.vel.z * dt, PLAYER_RADIUS);
  bot.pos.x = moved.x;
  bot.pos.z = moved.z;
}

function think(sim, bot, now, rng) {
  // Bomb states override routing.
  if (sim.bomb.state === 'planted') {
    if (bot.team === 'ember') {
      bot.state = 'route';
      bot.route = findRoute(sim.waypoints, sim.edges, bot.pos.x, bot.pos.z, sim.bomb.x, sim.bomb.z);
      bot.routeIdx = 0;
      const d = Math.hypot(sim.bomb.x - bot.pos.x, sim.bomb.z - bot.pos.z);
      if (d < 2.2) { bot.state = 'defuse'; bot.defusing = 0; }
      return;
    }
    // Vanguard holds the planted site.
    bot.state = 'hold';
    return;
  }

  // Visible enemy beats everything else.
  const seen = nearestVisible(sim, bot);
  if (seen) {
    if (bot.target !== seen.ent) { bot.target = seen.ent; bot.firstSeenAt = now; }
    bot.state = 'engage';
    bot.planting = 0; bot.defusing = 0;
    return;
  }
  bot.target = null;

  // Carrier plants at its assigned site.
  if (bot.hasBomb && bot.assignedSite) {
    const s = sim.sites[bot.assignedSite];
    const d = Math.hypot(s.x - bot.pos.x, s.z - bot.pos.z);
    if (d < s.r * 0.8) { bot.state = 'plant'; bot.planting = 0; return; }
    bot.state = 'route';
    bot.route = findRoute(sim.waypoints, sim.edges, bot.pos.x, bot.pos.z, s.x, s.z);
    bot.routeIdx = 0;
    return;
  }

  // Gunfire nearby: go look.
  const heard = sim.lastShotPos;
  if (heard && now - heard.at < 3 && heard.team !== bot.team) {
    const d = Math.hypot(heard.x - bot.pos.x, heard.z - bot.pos.z);
    if (d < 26 && bot.state !== 'engage') {
      bot.state = 'route';
      bot.route = findRoute(sim.waypoints, sim.edges, bot.pos.x, bot.pos.z, heard.x, heard.z);
      bot.routeIdx = 0;
      return;
    }
  }

  // Defenders hold near their sites; attackers push to theirs.
  if (bot.state === 'engage' || bot.state === 'plant' || bot.state === 'defuse') {
    bot.state = 'route';
    assignRoute(sim, bot, rng);
  }
  if (bot.state !== 'route' && bot.state !== 'hold') {
    bot.state = 'route';
    assignRoute(sim, bot, rng);
  }
}

function assignRoute(sim, bot, rng) {
  const sites = ['A', 'B'];
  let tx; let tz;
  if (bot.team === 'ember') {
    // Defenders split between the sites and mid.
    const pick = rng();
    const site = pick < 0.4 ? 'A' : pick < 0.8 ? 'B' : null;
    if (site) { tx = sim.sites[site].x; tz = sim.sites[site].z; }
    else { tx = 0; tz = -8; }
  } else {
    const site = bot.assignedSite || sites[Math.floor(rng() * 2)];
    tx = sim.sites[site].x + (rng() - 0.5) * 3;
    tz = sim.sites[site].z + (rng() - 0.5) * 3;
  }
  bot.route = findRoute(sim.waypoints, sim.edges, bot.pos.x, bot.pos.z, tx, tz);
  bot.routeIdx = 0;
}
