// DUSKLINE — the HUD: health, armour, ammunition, money, the round timer
// and score, the crosshair, hitmarkers, the kill feed, the buy menu, round
// banners and a top-down minimap. DOM only; it never steps the simulation.
import { WEAPONS } from './config.js';

const $ = (id) => document.getElementById(id);

export function buildHud() {
  return {
    health: $('hud-health'),
    healthBar: $('hud-health-bar'),
    armor: $('hud-armor'),
    ammo: $('hud-ammo'),
    reserve: $('hud-reserve'),
    weapon: $('hud-weapon'),
    money: $('hud-money'),
    timer: $('hud-timer'),
    score: $('hud-score'),
    round: $('hud-round'),
    crosshair: $('hud-crosshair'),
    hitmarker: $('hud-hitmarker'),
    feed: $('hud-feed'),
    banner: $('hud-banner'),
    bannerTitle: $('hud-banner-title'),
    bannerSub: $('hud-banner-sub'),
    buy: $('buy-menu'),
    buyMoney: $('buy-money'),
    bomb: $('hud-bomb'),
    bombBar: $('hud-bomb-bar'),
    minimap: $('hud-minimap'),
    flash: $('hud-flash'),
    hint: $('hud-hint'),
    scope: $('scope-overlay'),
    dmgDir: $('hud-dmg-dir'),
    lastFeedAt: -1,
    lastBanner: '',
    flashAt: -1,
    dmgAt: -1,
  };
}

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function updateHud(hud, sim, input) {
  const p = sim.player;
  if (!p) return;

  hud.health.textContent = Math.ceil(p.hp);
  hud.healthBar.style.width = `${Math.max(0, p.hp)}%`;
  hud.healthBar.style.background = p.hp > 50 ? '#7dd87d' : p.hp > 25 ? '#ffcf4d' : '#ff5a4d';
  hud.armor.textContent = p.armor ? 'ARMOUR' : '';
  const w = WEAPONS[p.weapon];
  hud.weapon.textContent = w.name;
  hud.ammo.textContent = p.weapon === 'grenade' ? p.grenades : p.mag;
  hud.reserve.textContent = p.weapon === 'grenade' ? '' : `/${p.reserve}`;
  hud.money.textContent = `$${p.money}`;
  hud.timer.textContent = sim.bomb.state === 'planted'
    ? fmtTime(sim.bomb.timer)
    : sim.phase === 'buy' ? `BUY ${fmtTime(sim.freezeLeft)}` : fmtTime(sim.timeLeft);
  hud.timer.style.color = sim.bomb.state === 'planted' ? '#ff5a4d' : '#fff';
  hud.score.textContent = `${sim.score.vanguard} — ${sim.score.ember}`;
  hud.round.textContent = `ROUND ${sim.round}`;

  // Crosshair: gap grows with spread, so stopping to aim is visible.
  // Hidden while dead (spectating a teammate needs no crosshair).
  hud.crosshair.style.display = p.alive ? '' : 'none';
  const spread = p.weapon === 'grenade' ? 0 : 6 + (p.bloom || 0) * 6 + (p.moving > 0.6 ? 6 : 0);
  hud.crosshair.style.setProperty('--gap', `${spread.toFixed(1)}px`);

  // Bomb status line.
  if (p.hasBomb) hud.bomb.textContent = `YOU CARRY THE CHARGE — reach Site ${p.assignedSite || 'A or B'}, hold E to plant`;
  else if (sim.bomb.state === 'planted') hud.bomb.textContent = `CHARGE PLANTED AT SITE ${sim.bomb.site} — ${Math.ceil(sim.bomb.timer)}s`;
  else if (sim.bomb.state === 'dropped') hud.bomb.textContent = 'CHARGE DROPPED — walk over it to pick it up';
  else hud.bomb.textContent = '';
  hud.bombBar.style.width = p.planting > 0 ? `${(p.planting / 3) * 100}%` : '0%';

  // Buy menu visibility and money.
  const buying = sim.phase === 'buy';
  hud.buy.classList.toggle('open', buying);
  if (buying) hud.buyMoney.textContent = `$${p.money}`;

  // Kill feed.
  if (sim.events.length && sim.events[sim.events.length - 1].at !== hud.lastFeedAt) {
    hud.lastFeedAt = sim.events[sim.events.length - 1].at;
    hud.feed.innerHTML = sim.events.slice(-4).map((e) =>
      `<div class="feed-line${e.team ? ` team-${e.team}` : ''}">${e.text}</div>`).join('');
  }

  // Banners.
  let title = ''; let sub = '';
  if (sim.phase === 'buy') { title = `ROUND ${sim.round}`; sub = 'Buy your kit — the round starts soon'; }
  else if (sim.phase === 'roundEnd') {
    title = sim.winReason;
    sub = `Vanguard ${sim.score.vanguard} — ${sim.score.ember} Ember`;
  } else if (sim.phase === 'matchEnd') {
    title = sim.winner === 'vanguard' ? 'VICTORY' : sim.winner === 'ember' ? 'DEFEAT' : 'DRAW';
    sub = `${sim.winReason} — Vanguard ${sim.score.vanguard} — ${sim.score.ember} Ember. Press R to play again.`;
  }
  const key = `${sim.phase}:${title}`;
  if (key !== hud.lastBanner) {
    hud.lastBanner = key;
    if (title) {
      hud.bannerTitle.textContent = title;
      hud.bannerSub.textContent = sub;
      hud.banner.classList.add('show');
    } else {
      hud.banner.classList.remove('show');
    }
  }

  // Sniper scope overlay.
  hud.scope.classList.toggle('on', !!(p.scoped && p.weapon === 'sniper'));

  // Damage flash + direction: the wedge points at the attacker, so the
  // player can turn toward the shot instead of spinning blind.
  if (p.lastDamageAt > hud.flashAt) {
    hud.flashAt = p.lastDamageAt;
    hud.flash.classList.remove('flash');
    void hud.flash.offsetWidth;
    hud.flash.classList.add('flash');
    const from = p.lastDamageFrom;
    if (from && from.pos && hud.dmgDir) {
      const dx = from.pos.x - p.pos.x;
      const dz = from.pos.z - p.pos.z;
      // World bearing to the attacker, in the same yaw convention as
      // turnToward: yaw = atan2(-dx, -dz). CSS rotate is clockwise
      // positive, so the wedge turns by the negated relative angle.
      let rel = Math.atan2(-dx, -dz) - p.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      hud.dmgDir.style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(1)}deg)`;
      hud.dmgDir.classList.remove('show');
      void hud.dmgDir.offsetWidth;
      hud.dmgDir.classList.add('show');
    }
  }

  drawMinimap(hud, sim);
}

// Top-down minimap: yard outline, sites, alive players as dots, the bomb.
function drawMinimap(hud, sim) {
  const c = hud.minimap;
  if (!c) return;
  const g = c.getContext('2d');
  const W = c.width; const H = c.height;
  const x2px = (x) => ((x + 33) / 66) * W;
  const z2py = (z) => ((z + 25) / 54) * H;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(12,14,22,0.72)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.strokeRect(x2px(-32), z2py(-24), x2px(32) - x2px(-32), z2py(28) - z2py(-24));
  // Sites.
  for (const key of Object.keys(sim.sites)) {
    const s = sim.sites[key];
    g.fillStyle = key === 'A' ? '#3fa7ff' : '#ff5a2a';
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center';
    g.fillText(key, x2px(s.x), z2py(s.z) + 4);
  }
  // Bomb.
  if (sim.bomb.state === 'planted' || sim.bomb.state === 'dropped') {
    g.fillStyle = '#ffcf4d';
    g.beginPath();
    g.arc(x2px(sim.bomb.x), z2py(sim.bomb.z), 4, 0, Math.PI * 2);
    g.fill();
  }
  // Entities.
  for (const e of sim.entities) {
    if (!e.alive) continue;
    g.fillStyle = e.team === 'vanguard' ? '#3fa7ff' : '#ff5a2a';
    g.beginPath();
    g.arc(x2px(e.pos.x), z2py(e.pos.z), e.isPlayer ? 4 : 3, 0, Math.PI * 2);
    g.fill();
    if (e.isPlayer) {
      g.strokeStyle = '#fff';
      g.beginPath();
      g.moveTo(x2px(e.pos.x), z2py(e.pos.z));
      g.lineTo(x2px(e.pos.x) - Math.sin(e.yaw) * 8, z2py(e.pos.z) - Math.cos(e.yaw) * 8);
      g.stroke();
    }
  }
}

export function showHitmarker(hud, head) {
  hud.hitmarker.classList.remove('show', 'head');
  void hud.hitmarker.offsetWidth;
  hud.hitmarker.classList.add('show');
  if (head) hud.hitmarker.classList.add('head');
  setTimeout(() => hud.hitmarker.classList.remove('show', 'head'), 120);
}
