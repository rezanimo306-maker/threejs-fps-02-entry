// DUSKLINE — configuration: weapons, economy, rounds, teams, palette.
// One place for every number the rest of the game reads. No code here
// reaches the network or the DOM.
export const GAME_NAME = 'DUSKLINE';
export const MAP_NAME = 'Yard 7';

export const ROUND_TIME = 100; // seconds of live round time
export const FREEZE_TIME = 12; // seconds of buy time before a round starts
export const BOMB_TIME = 35; // seconds from plant to detonation
export const PLANT_TIME = 3; // seconds holding the plant key at a site
export const DEFUSE_TIME = 5; // seconds holding the defuse key at the bomb
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;

export const START_MONEY = 800;
export const WIN_MONEY = 325;
export const LOSS_MONEY = 150;
export const KILL_MONEY = 300;
export const PLANT_MONEY = 300;

export const PLAYER_HEALTH = 100;
export const PLAYER_RADIUS = 0.38; // collision radius, metres
export const PLAYER_HEIGHT = 1.7; // standing eye height
export const CROUCH_HEIGHT = 1.15;
export const WALK_SPEED = 4.4;
export const RUN_SPEED = 5.6;
export const CROUCH_SPEED = 2.6;
export const ACCEL = 42;
export const FRICTION = 11;
export const GRAVITY = 22;
export const JUMP_SPEED = 7.2;

// Headshots deal double damage. Armour absorbs 50% of the damage it takes.
export const HEADSHOT_MULT = 2;
export const ARMOR_ABSORB = 0.5;

export const TEAMS = {
  vanguard: { name: 'Vanguard', color: 0x3fa7ff, css: '#3fa7ff', dark: 0x1d4e89 },
  ember: { name: 'Ember', color: 0xff5a2a, css: '#ff5a2a', dark: 0x8a2f14 },
};

// Weapon table. spread is in degrees at rest, bloom adds per shot, moveMul
// multiplies spread while moving, kick is the recoil pitch in degrees.
export const WEAPONS = {
  rifle: {
    name: 'VK-47 Rifle', price: 2700, slot: 'primary', auto: true,
    damage: 34, headMult: 2, rpm: 600, mag: 30, reserve: 90,
    spread: 0.55, bloom: 0.35, maxBloom: 2.6, moveMul: 2.4, airMul: 3.2,
    kick: 0.55, kickRecover: 6, range: 90, reload: 2.4, zoom: 1,
  },
  smg: {
    name: 'K9 SMG', price: 1500, slot: 'primary', auto: true,
    damage: 24, headMult: 2, rpm: 780, mag: 32, reserve: 96,
    spread: 0.9, bloom: 0.3, maxBloom: 3.0, moveMul: 1.9, airMul: 2.8,
    kick: 0.35, kickRecover: 7, range: 55, reload: 2.0, zoom: 1,
  },
  shotgun: {
    name: 'M12 Scattergun', price: 1200, slot: 'primary', auto: false,
    damage: 13, headMult: 1.6, pellets: 8, rpm: 68, mag: 6, reserve: 24,
    spread: 3.4, bloom: 0.6, maxBloom: 4.0, moveMul: 2.2, airMul: 3.0,
    kick: 2.2, kickRecover: 4, range: 28, reload: 2.8, zoom: 1,
  },
  sniper: {
    name: 'L86 Longshot', price: 4750, slot: 'primary', auto: false,
    damage: 105, headMult: 2, rpm: 48, mag: 5, reserve: 15,
    spread: 0.08, bloom: 0.2, maxBloom: 1.2, moveMul: 5.0, airMul: 6.0,
    kick: 3.4, kickRecover: 3, range: 140, reload: 3.4, zoom: 2.4,
  },
  pistol: {
    name: 'P9 Sidearm', price: 0, slot: 'sidearm', auto: false,
    damage: 26, headMult: 2, rpm: 320, mag: 12, reserve: 48,
    spread: 0.7, bloom: 0.4, maxBloom: 2.8, moveMul: 2.2, airMul: 3.0,
    kick: 0.5, kickRecover: 6, range: 50, reload: 1.8, zoom: 1,
  },
  grenade: {
    name: 'Frag Grenade', price: 300, slot: 'grenade', auto: false,
    damage: 95, radius: 6.5, rpm: 60, mag: 1, reserve: 0,
    spread: 0, bloom: 0, maxBloom: 0, moveMul: 1, airMul: 1,
    kick: 0, kickRecover: 1, range: 0, reload: 0, zoom: 1,
  },
};

export const ARMOR_PRICE = 650;

// Dusk industrial palette: warm sodium light on teal steel and sand.
export const PALETTE = {
  skyTop: 0x2a2f55,
  skyBottom: 0xd97b3f,
  fog: 0x3a3348,
  ground: 0x8a7a63,
  groundDark: 0x6b5d4a,
  wall: 0x5d6b73,
  wallTrim: 0x54646e,
  containerTeal: 0x2e7f7a,
  containerRust: 0xb05a2a,
  containerSand: 0xc9a86a,
  containerGrey: 0x7a8288,
  crate: 0x9a7b4f,
  barrel: 0x8a2f22,
  accent: 0xffc24d,
  siteA: 0x3fa7ff,
  siteB: 0xff5a2a,
};
