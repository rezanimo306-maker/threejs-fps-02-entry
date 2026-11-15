# DUSKLINE — Tactical FPS

A complete CS-style round-based tactical FPS in the browser, built on three.js 0.187.0 (vendored, no network).

## The game

You are **Vanguard**, attacking a dusk-lit container yard ("Yard 7") against the **Ember** defenders. First to 5 rounds wins the match (max 9).

- **First-person combat** — mouse look, WASD movement with acceleration and friction, sprint/walk, jump, crouch. Five weapons (rifle, SMG, shotgun, sniper with scope, pistol) plus frag grenades, each with its own damage, fire rate, spread, recoil and reload.
- **Real opponents** — four Vanguard bots and five Ember bots that route through the yard on a waypoint graph, hold angles, engage what they see (with skill-based aim error and reaction delay), react to gunfire, and play the objective: Vanguard bots carry the charge to a site and plant it; Ember bots rotate to defuse.
- **The objective** — plant the charge at Site A or Site B (hold E, standing still, inside the site) or eliminate the other team. A planted charge detonates after 35 seconds unless defused. The charge can be dropped and picked up.
- **Economy** — win $325, lose $150, $300 per kill, $300 per plant. Buy during the 12-second freeze phase (rifle $2700, SMG $1500, shotgun $1200, sniper $4750, grenade $300, Kevlar $650).
- **HUD** — health and armour, ammunition, money, round timer, score, kill feed, live minimap, crosshair that widens with spread, hitmarkers, damage flash, plant progress, and a buy menu.
- **Presentation** — dusk lighting with long shadows, a container yard with two lanes, mid, and two bomb sites, procedural WebAudio gunfire, and a first-person viewmodel with walk bob and recoil.

## How to play

Open `game/index.html` in a browser (or serve `game/` statically). Click **DEPLOY**, then click the game to capture the mouse.

- **W A S D** move · **Shift** walk · **Space** jump · **Ctrl** crouch
- **Mouse** aim · **Click** fire · **Right-click** sniper scope
- **R** reload · **1 / 2 / 3** weapons · **Q** last weapon · **E** plant (hold) · **B** buy menu during freeze

## Layout

- `game/` — the playable game: `index.html` + `src/` (one-job modules: `config`, `world`, `audio`, `weapons`, `combat`, `player`, `bots`, `sim`, `hud`, `render`, `main`) + `vendor/three/` (three.js 0.187.0, byte-for-byte from the kit)
- `screenshots/` — real renders captured from the game in a browser
- `main.ts` — copies `game/` + `screenshots/` to the output directory and writes `dossier.json`
- `vendor/makefun-threejs.ts` — the kit's dossier builder, unchanged

## Notes

- The simulation runs at a fixed 60 Hz step, separate from rendering; bots and the player share the same movement, collision and shooting code.
- No network: every reference is relative and resolves inside `game/`.
