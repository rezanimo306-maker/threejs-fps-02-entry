# DUSKLINE — Tactical FPS

A complete CS-style round-based tactical FPS in the browser, built on three.js 0.187.0 (vendored, no network).

## The game

You are **Vanguard**, attacking a dusk-lit container yard ("Yard 7") against the **Ember** defenders. First to 5 rounds wins the match (max 9).

- **First-person combat** — mouse look, WASD movement with acceleration and friction, sprint/walk, jump, crouch. Five weapons (rifle, SMG, shotgun, sniper with scope, pistol) plus frag grenades, each with its own damage, fire rate, spread, recoil and reload.
- **Real opponents** — four Vanguard bots and five Ember bots that route through the yard on a waypoint graph, hold angles, engage what they see (with skill-based aim error and reaction delay), react to gunfire, and play the objective: Vanguard bots carry the charge to a site and plant it; Ember bots rotate to defuse.
- **The objective** — plant the charge at Site A or Site B (hold E, standing still, inside the site) or eliminate the other team. The charge goes to a Vanguard attacker each round — usually a bot, but in about two rounds out of five it is you, and the HUD names your target site. A planted charge detonates after 35 seconds unless defused (it beeps while it ticks). The charge can be dropped and picked up.
- **Economy** — win $325, lose $150, $300 per kill, $300 per plant. Buy during the 12-second freeze phase (rifle $2700, SMG $1500, shotgun $1200, sniper $4750, grenade $300, Kevlar $650). Ammunition is kept per weapon: switching away and back restores what that weapon had left; only a fresh purchase refills it.
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

## Round 2 — bot AI and map fixes

Round 1 shipped with the objective loop broken in practice: the bomb carrier
never reached a site. The fixes, all verified in headless Chrome:

- **Routes are stable.** A bot only re-plans when it has no route or its
  destination moved; before, every think tick reset the route to the
  nearest waypoint and the carrier oscillated in place.
- **Planting and defusing accumulate.** Progress used to reset every think
  tick, so a bot could never finish the 3 s plant or the 5 s defuse.
- **The lanes are clear.** Two containers sat on the A-long and B-east
  waypoint edges and a crate sat on a connector waypoint; bots routed down
  those lanes pressed against the obstacle forever. All three are moved off
  the lane.
- **A dropped charge is fetched.** The nearest Vanguard bot that is not in
  a fight goes for it — and a bot in a fight still breaks off for a charge
  close enough to grab safely, so the charge is not left at the team's
  feet while everyone shoots.
- **The carrier pushes.** It only stops to fight inside 14 m, and attackers
  close the distance while shooting at long range instead of strafing in
  place; defenders hold their angle. Escorts follow the carrier so the
  plant is a team push.
- **Vision range 35 m.** The mid door gives a line of sight across the
  whole map; at longer ranges both teams opened a 40 m firefight from
  their spawns and never pushed the objective.

In bot-only test rounds the carrier now reaches the site and plants (about
1 in 5 rounds in a 4-v-5 test with the player dead; the charge detonates),
where round 1 planted 0 in 5 and the carrier never left its spawn.
