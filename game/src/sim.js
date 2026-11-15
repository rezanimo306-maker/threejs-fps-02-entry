// DUSKLINE — the simulation: one state object, a fixed 60 Hz step, rounds,
// the bomb objective and the economy. Rendering reads this state; input
// writes intents; nothing here touches the DOM or three.js directly.
import {
  ROUND_TIME, FREEZE_TIME, BOMB_TIME, PLANT_TIME, DEFUSE_TIME,
  ROUNDS_TO_WIN, MAX_ROUNDS, START_MONEY, WIN_MONEY, LOSS_MONEY,
  PLANT_MONEY, PLAYER_HEALTH, PLAYER_RADIUS,
} from './config.js';
import { createBot, botBuy, stepBot } from './bots.js';
import { stepPlayer } from './player.js';
import { shoot, explodeGrenade } from './combat.js';
import {
  giveWeapon, buyWeapon, buyArmor, switchWeapon,
  startReload, finishReload, recoverWeapon, throwGrenade, consumeShot,
} from './weapons.js';
import { segmentBlocked } from './world.js';
import * as audio from './audio.js';

export const STEP = 1 / 60;

// A fixed-size ring pool: preallocated objects, no allocation in the loop.
function makePool(n, init) {
  const items = [];
  for (let i = 0; i < n; i++) items.push(init());
  return { items, cursor: 0, n };
}
function poolAdd(pool, fill) {
  const it = pool.items[pool.cursor];
  pool.cursor = (pool.cursor + 1) % pool.n;
  fill(it);
  it.ttl = it.maxTtl;
  return it;
}

export function createSim(world) {
  const sim = {
    world,
    colliders: world.colliders,
    waypoints: world.waypoints,
    edges: world.edges,
    sites: world.sites,
    time: 0,
    phase: 'menu',
    phaseAt: 0,
    round: 1,
    score: { vanguard: 0, ember: 0 },
    timeLeft: ROUND_TIME,
    freezeLeft: FREEZE_TIME,
    entities: [],
    player: null,
    grenades: [],
    bomb: { state: 'carried', carrier: null, x: 0, z: 0, site: null, timer: 0 },
    tracers: makePool(24, () => ({ x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0, ttl: 0, maxTtl: 0.09 })),
    impacts: makePool(16, () => ({ x: 0, y: 0, z: 0, team: null, ttl: 0, maxTtl: 0.35 })),
    blasts: makePool(4, () => ({ x: 0, y: 0, z: 0, ttl: 0, maxTtl: 0.6 })),
    flashes: makePool(8, () => ({ x: 0, y: 0, z: 0, ttl: 0, maxTtl: 0.06 })),
    events: [],
    lastShotPos: null,
    winner: null,
    winReason: '',
    rng: Math.random,
  };
  // Hooks the other modules call as sim methods (bound here so combat and
  // bots never reach outside the state object).
  sim.addTracer = (x1, y1, z1, x2, y2, z2) => addTracer(sim, x1, y1, z1, x2, y2, z2);
  sim.addImpact = (x, y, z, team) => addImpact(sim, x, y, z, team);
  sim.addBlast = (x, y, z) => addBlast(sim, x, y, z);
  sim.wallBetween = (a, b, h) => wallBetween(sim, a, b, h);
  sim.onShotFired = (shooter) => onShotFired(sim, shooter);
  sim.onPlayerHurt = () => onPlayerHurt(sim);
  sim.onKill = (attacker, target, isHead, now) => onKill(sim, attacker, target, isHead, now);
  sim.onPlantComplete = (planter) => onPlantComplete(sim, planter);
  sim.onDefuseComplete = (defuser) => onDefuseComplete(sim, defuser);
  return sim;
}

export function makeEntity(id, team, isPlayer, spawn, skill) {
  const base = {
    id, team, isBot: !isPlayer, isPlayer,
    name: isPlayer ? 'You' : '',
    pos: { x: spawn.x, y: 0, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: team === 'vanguard' ? 0 : Math.PI, pitch: 0,
    hp: PLAYER_HEALTH, armor: false, alive: true,
    weapon: 'pistol', primary: 'pistol', sidearm: 'pistol',
    mag: 12, reserve: 48, grenades: 0, bloom: 0, recoil: 0,
    ammo: { pistol: { mag: 12, reserve: 48 } }, // per-weapon ammunition
    reloading: false, reloadEnd: 0, lastShot: -10,
    money: START_MONEY, kills: 0, deaths: 0,
    crouched: false, onGround: true, moving: 0, height: 1.7,
    hasBomb: false, planting: 0, defusing: 0, scoped: false,
    stepAcc: 0, lastDryAt: -10, assignedSite: null,
    lastDamageFrom: null, lastDamageAt: -10,
  };
  if (!isPlayer) return createBot(id, team, spawn, skill, base.name);
  return base;
}

export function startMatch(sim, input) {
  sim.score.vanguard = 0;
  sim.score.ember = 0;
  sim.round = 1;
  sim.events = [];
  sim.winner = null;
  sim.winReason = '';
  spawnTeams(sim);
  startRound(sim);
}

function spawnTeams(sim) {
  sim.entities = [];
  sim.grenades = [];
  const vSpawns = sim.world.spawns.vanguard;
  const eSpawns = sim.world.spawns.ember;
  const player = makeEntity(0, 'vanguard', true, vSpawns[2], 0);
  sim.player = player;
  sim.entities.push(player);
  for (let i = 0; i < 4; i++) {
    const bot = makeEntity(1 + i, 'vanguard', false, vSpawns[i === 2 ? 0 : i], 0.45 + sim.rng() * 0.35);
    sim.entities.push(bot);
  }
  for (let i = 0; i < 5; i++) {
    const bot = makeEntity(5 + i, 'ember', false, eSpawns[i], 0.45 + sim.rng() * 0.35);
    sim.entities.push(bot);
  }
}

export function startRound(sim) {
  sim.phase = 'buy';
  sim.phaseAt = sim.time;
  sim.freezeLeft = FREEZE_TIME;
  sim.timeLeft = ROUND_TIME;
  sim.grenades = [];
  // Reset everyone to their spawn, full health, kept money and weapons.
  const vSpawns = sim.world.spawns.vanguard;
  const eSpawns = sim.world.spawns.ember;
  let vi = 0; let ei = 0;
  for (const e of sim.entities) {
    const sp = e.team === 'vanguard' ? vSpawns[vi++ % vSpawns.length] : eSpawns[ei++ % eSpawns.length];
    e.pos.x = sp.x; e.pos.y = 0; e.pos.z = sp.z;
    e.vel.x = 0; e.vel.y = 0; e.vel.z = 0;
    e.yaw = e.team === 'vanguard' ? 0 : Math.PI;
    e.pitch = 0;
    e.hp = PLAYER_HEALTH;
    e.alive = true;
    e.reloading = false;
    e.bloom = 0; e.recoil = 0;
    e.planting = 0; e.defusing = 0;
    e.hasBomb = false;
    e.crouched = false;
    if (e.isBot) botBuy(e, sim.rng);
  }
  // The bomb goes to a Vanguard attacker: usually a bot, but in about two
  // rounds out of five it is the player, so the human can run the objective
  // instead of waiting for a bot to drop the charge.
  const attackers = sim.entities.filter((e) => e.team === 'vanguard');
  let carrier;
  if (sim.player && sim.rng() < 0.4) carrier = sim.player;
  else {
    const bots = attackers.filter((e) => e.isBot);
    carrier = bots[Math.floor(sim.rng() * bots.length)];
  }
  carrier.hasBomb = true;
  carrier.assignedSite = sim.rng() < 0.5 ? 'A' : 'B';
  sim.bomb = { state: 'carried', carrier, x: carrier.pos.x, z: carrier.pos.z, site: null, timer: 0 };
  pushEvent(sim, `Round ${sim.round} — plant the charge at Site ${carrier.assignedSite} or eliminate Ember.`, null);
}

// --- hooks used by combat.js, bots.js and the player ---
export function addTracer(sim, x1, y1, z1, x2, y2, z2) {
  poolAdd(sim.tracers, (t) => { t.x1 = x1; t.y1 = y1; t.z1 = z1; t.x2 = x2; t.y2 = y2; t.z2 = z2; });
}
export function addImpact(sim, x, y, z, team) {
  poolAdd(sim.impacts, (t) => { t.x = x; t.y = y; t.z = z; t.team = team; });
}
export function addBlast(sim, x, y, z) {
  poolAdd(sim.blasts, (t) => { t.x = x; t.y = y; t.z = z; });
}
export function wallBetween(sim, a, b, h) {
  return segmentBlocked(sim.colliders, a.x, a.z, b.x, b.z, h);
}

function pushEvent(sim, text, team) {
  sim.events.push({ text, team, at: sim.time });
  if (sim.events.length > 6) sim.events.shift();
}

export function onShotFired(sim, shooter) {
  sim.lastShotPos = { x: shooter.pos.x, z: shooter.pos.z, team: shooter.team, at: sim.time };
  const eye = shooter.pos.y + (shooter.crouched ? 1.15 : 1.7);
  poolAdd(sim.flashes, (f) => { f.x = shooter.pos.x; f.y = eye; f.z = shooter.pos.z; });
  if (shooter.isPlayer) audio.playShot(shooter.weapon);
  else if (sim.player && sim.player.alive) {
    const d = Math.hypot(shooter.pos.x - sim.player.pos.x, shooter.pos.z - sim.player.pos.z);
    if (d < 40) audio.playShot(shooter.weapon, true);
  }
}

export function onPlayerHurt(sim) {
  audio.playHurt();
}

export function onKill(sim, attacker, target, isHead, now) {
  const aName = attacker ? attacker.name : 'The yard';
  pushEvent(sim, `${aName} ${isHead ? '◉ ' : ''}eliminated ${target.name}`, attacker ? attacker.team : null);
  if (target.isPlayer) audio.playRoundLose();
  else if (attacker && attacker.isPlayer) audio.playKill();
  if (target.hasBomb) {
    target.hasBomb = false;
    sim.bomb.state = 'dropped';
    sim.bomb.x = target.pos.x;
    sim.bomb.z = target.pos.z;
    sim.bomb.carrier = null;
    pushEvent(sim, 'The charge was dropped.', null);
  }
  checkElimination(sim);
}

function checkElimination(sim) {
  const vAlive = sim.entities.some((e) => e.team === 'vanguard' && e.alive);
  const eAlive = sim.entities.some((e) => e.team === 'ember' && e.alive);
  if (!vAlive) endRound(sim, 'ember', 'Vanguard eliminated');
  else if (!eAlive) endRound(sim, 'vanguard', 'Ember eliminated');
}

export function onPlantComplete(sim, planter) {
  if (sim.bomb.state === 'planted') return;
  const site = siteAt(sim, planter.pos.x, planter.pos.z);
  if (!site) return;
  sim.bomb.state = 'planted';
  sim.bomb.site = site;
  sim.bomb.x = planter.pos.x;
  sim.bomb.z = planter.pos.z;
  sim.bomb.timer = BOMB_TIME;
  sim.bomb.carrier = null;
  planter.hasBomb = false;
  planter.money += PLANT_MONEY;
  planter.planting = 0;
  audio.playPlant();
  pushEvent(sim, `Charge planted at Site ${site} — ${BOMB_TIME}s to detonation.`, 'vanguard');
}

export function onDefuseComplete(sim, defuser) {
  if (sim.bomb.state !== 'planted') return;
  sim.bomb.state = 'defused';
  defuser.defusing = 0;
  endRound(sim, 'ember', 'Charge defused');
}

export function siteAt(sim, x, z) {
  for (const key of Object.keys(sim.sites)) {
    const s = sim.sites[key];
    if (Math.hypot(x - s.x, z - s.z) < s.r) return key;
  }
  return null;
}

function endRound(sim, winner, reason) {
  if (sim.phase !== 'round') return;
  sim.phase = 'roundEnd';
  sim.phaseAt = sim.time;
  sim.score[winner] += 1;
  sim.winReason = reason;
  for (const e of sim.entities) {
    e.money += e.team === winner ? WIN_MONEY : LOSS_MONEY;
  }
  if (winner === 'vanguard') audio.playRoundWin();
  else audio.playRoundLose();
  pushEvent(sim, `${winner === 'vanguard' ? 'Vanguard' : 'Ember'} takes round ${sim.round} — ${reason}.`, winner);
}

function nextRound(sim) {
  if (sim.score.vanguard >= ROUNDS_TO_WIN || sim.score.ember >= ROUNDS_TO_WIN || sim.round >= MAX_ROUNDS) {
    sim.phase = 'matchEnd';
    sim.phaseAt = sim.time;
    if (sim.score.vanguard > sim.score.ember) { sim.winner = 'vanguard'; sim.winReason = 'Match won'; }
    else if (sim.score.ember > sim.score.vanguard) { sim.winner = 'ember'; sim.winReason = 'Match lost'; }
    else { sim.winner = 'draw'; sim.winReason = 'Match drawn'; }
    return;
  }
  sim.round += 1;
  startRound(sim);
}

// --- the fixed step ---
export function step(sim, input, dt) {
  sim.time += dt;
  // Age the effect pools.
  for (const p of [sim.tracers, sim.impacts, sim.blasts, sim.flashes]) {
    for (const it of p.items) if (it.ttl > 0) it.ttl -= dt;
  }

  if (sim.phase === 'buy') {
    // Frozen feet, free look: the player may aim around while buying.
    const p = sim.player;
    if (p) {
      p.yaw -= input.lookDX * 0.0023;
      p.pitch -= input.lookDY * 0.0023;
      p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch));
      input.lookDX = 0;
      input.lookDY = 0;
    }
    sim.freezeLeft -= dt;
    handleBuyKeys(sim, input);
    if (sim.freezeLeft <= 0) {
      sim.phase = 'round';
      sim.phaseAt = sim.time;
      pushEvent(sim, `Round ${sim.round} — go.`, null);
    }
    return;
  }

  if (sim.phase === 'roundEnd') {
    if (sim.time - sim.phaseAt > 3.5) nextRound(sim);
    return;
  }
  if (sim.phase !== 'round') return;

  // Round timer (only while the bomb is not planted).
  if (sim.bomb.state !== 'planted') {
    sim.timeLeft -= dt;
    if (sim.timeLeft <= 0) {
      endRound(sim, 'ember', 'Time expired — charge never planted');
      return;
    }
  } else {
    sim.bomb.timer -= dt;
    if (sim.bomb.timer <= 0) {
      sim.bomb.state = 'exploded';
      endRound(sim, 'vanguard', 'Charge detonated');
      return;
    }
    // The planted charge beeps once a second while it ticks down.
    if (Math.floor(sim.bomb.timer) !== Math.floor(sim.bomb.timer + dt)) audio.playBeep();
  }

  const player = sim.player;

  // Player: movement, weapon, plant.
  if (player.alive) {
    player.scoped = player.weapon === 'sniper' && !!input.scoping;
    stepPlayer(sim, player, input, dt);
    // Footsteps: a soft step every ~2.4 m on the ground.
    player.stepAcc += player.moving * dt;
    if (player.onGround && player.stepAcc > 2.4) { player.stepAcc = 0; audio.playStep(); }
    handlePlayerKeys(sim, player, input);
    if (input.firing && player.weapon !== 'grenade') {
      const res = shoot(sim, player, sim.time);
      // Dry-fire click on an empty magazine, throttled so holding the
      // trigger does not rattle.
      if (res === 'dry' && player.mag === 0 && !player.reloading
        && sim.time - player.lastDryAt > 0.35) {
        player.lastDryAt = sim.time;
        audio.playDryFire();
      }
    } else if (input.firing && player.weapon === 'grenade') {
      input.firing = false;
      if (consumeShot(player, sim.time)) {
        throwGrenade(sim, player);
        giveWeapon(player, player.primary);
      }
    }
    if (player.reloading && sim.time >= player.reloadEnd) finishReload(player);
    recoverWeapon(player, dt);
    // Pick up a dropped charge.
    if (sim.bomb.state === 'dropped') {
      const d = Math.hypot(sim.bomb.x - player.pos.x, sim.bomb.z - player.pos.z);
      if (d < 1.4) {
        sim.bomb.state = 'carried';
        sim.bomb.carrier = player;
        player.hasBomb = true;
        pushEvent(sim, 'You picked up the charge.', 'vanguard');
      }
    }
    // Planting: hold E, still, inside a site, carrying the charge.
    if (player.hasBomb) {
      const site = siteAt(sim, player.pos.x, player.pos.z);
      const still = player.moving < 0.6;
      if (site && input.keys.has('KeyE') && still) {
        player.planting += dt;
        if (player.planting >= PLANT_TIME) onPlantComplete(sim, player);
      } else {
        player.planting = 0;
      }
    } else {
      player.planting = 0;
    }
  }

  // Bots.
  for (const e of sim.entities) {
    if (e.isBot) stepBot(sim, e, dt, sim.time, sim.rng);
  }

  // Grenades in flight.
  for (let i = sim.grenades.length - 1; i >= 0; i--) {
    const g = sim.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    const ox = g.pos.x; const oz = g.pos.z;
    g.pos.x += g.vel.x * dt;
    g.pos.y += g.vel.y * dt;
    g.pos.z += g.vel.z * dt;
    // A wall stops the grenade: it bounces back instead of passing through.
    if (segmentBlocked(sim.colliders, ox, oz, g.pos.x, g.pos.z, Math.max(0.2, g.pos.y))) {
      g.pos.x = ox; g.pos.z = oz;
      g.vel.x = -g.vel.x * 0.4;
      g.vel.z = -g.vel.z * 0.4;
      g.bounced += 1;
    }
    if (g.pos.y <= 0.15) {
      g.pos.y = 0.15;
      g.vel.y = -g.vel.y * 0.35;
      g.vel.x *= 0.7; g.vel.z *= 0.7;
      g.bounced += 1;
    }
    if (g.fuse <= 0 || g.bounced > 3) {
      audio.playExplode();
      explodeGrenade(sim, g, sim.time);
      sim.grenades.splice(i, 1);
    }
  }

  // A Vanguard bot can pick up the dropped charge.
  if (sim.bomb.state === 'dropped') {
    for (const e of sim.entities) {
      if (e.team === 'vanguard' && e.isBot && e.alive) {
        const d = Math.hypot(sim.bomb.x - e.pos.x, sim.bomb.z - e.pos.z);
        if (d < 1.4) {
          sim.bomb.state = 'carried';
          sim.bomb.carrier = e;
          e.hasBomb = true;
          e.assignedSite = sim.rng() < 0.5 ? 'A' : 'B';
          pushEvent(sim, `${e.name} picked up the charge.`, 'vanguard');
          break;
        }
      }
    }
  }
}

// Keys handled during the buy phase (and the number keys during a round).
function handleBuyKeys(sim, input) {
  const p = sim.player;
  if (!p) return;
  if (input.keys.has('Digit1')) { if (buyWeapon(p, 'rifle')) audio.playBuy(); input.keys.delete('Digit1'); }
  if (input.keys.has('Digit2')) { if (buyWeapon(p, 'smg')) audio.playBuy(); input.keys.delete('Digit2'); }
  if (input.keys.has('Digit3')) { if (buyWeapon(p, 'shotgun')) audio.playBuy(); input.keys.delete('Digit3'); }
  if (input.keys.has('Digit4')) { if (buyWeapon(p, 'sniper')) audio.playBuy(); input.keys.delete('Digit4'); }
  if (input.keys.has('Digit5')) { if (buyWeapon(p, 'grenade')) audio.playBuy(); input.keys.delete('Digit5'); }
  if (input.keys.has('Digit6')) { if (buyArmor(p)) audio.playBuy(); input.keys.delete('Digit6'); }
}

function handlePlayerKeys(sim, player, input) {
  if (input.keys.has('KeyR')) { if (startReload(player, sim.time)) audio.playReload(); input.keys.delete('KeyR'); }
  if (input.keys.has('Digit1')) { switchWeapon(player, 'primary'); input.keys.delete('Digit1'); }
  if (input.keys.has('Digit2')) { switchWeapon(player, 'sidearm'); input.keys.delete('Digit2'); }
  if (input.keys.has('Digit3')) { switchWeapon(player, 'grenade'); input.keys.delete('Digit3'); }
  if (input.keys.has('KeyQ')) {
    switchWeapon(player, player.weapon === player.primary ? 'sidearm' : 'primary');
    input.keys.delete('KeyQ');
  }
}
