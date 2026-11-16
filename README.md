[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)

[![rank](https://make.fun/badge/threejs-fps-02/0xDimzy/threejs-fps-02-v2/rank.svg)](https://make.fun/bounty/threejs-fps-02)

[![reward](https://make.fun/badge/threejs-fps-02/0xDimzy/threejs-fps-02-v2/reward.svg)](https://make.fun/bounty/threejs-fps-02)

# ASHLINE v4 — a three.js tactical FPS

A round-based tactical shooter in the Counter-Strike style, built on three.js 0.187.0
(vendored, offline, no build step). You are FERRO, one of five: four ally bots
fight beside you against five SLAG defenders in the Ironworks Yard, in the rain.
Win rounds by eliminating the enemy team or by planting the sabotage charge at
Site A or Site B and holding it until detonation.

## How a match plays

- **First to 5 rounds** (max 9). Each round: 15 s buy phase, then 100 s live.
- **Money:** start $800. Kill +$300, round win +$325, round loss +$190, plant +$300.
  Spend it in the buy menu (B) between rounds.
- **Arsenal:** AR-41 Halberd rifle (owned), P9 Sparrow pistol (owned), SMG-7 Hornet
  $600, SG-9 Mauler shotgun $700, LR-88 Longshot scoped rifle $1100, Frag-7
  grenade $300, smoke grenade $250, flashbang $250, plate vest $650 (halves damage
  taken). Grenades are capped at 2 of each per round.
- **Objective:** carry the charge (E, hold 3.5 s inside a site) to plant it. The
  35 s fuse then runs; SLAG bots push the site and try to defuse (5 s channel).
  If the fuse runs out, the site blows and FERRO wins the round. If the timer
  runs out unplanted, or the whole FERRO team is eliminated, the round is lost.

## Gunplay

Hitscan weapons with headshots (3x damage on the rifle, 2x on the SMG and pistol,
2.5x on the scoped rifle, 1.5x on the shotgun). Recoil kicks the view up and
recovers; spread grows with movement speed, firing while airborne, and sustained
fire — stopping to aim pays. The Longshot is near-laser down its scope (right
mouse) and wild from the hip. Crouch (Ctrl/C) tightens spread and lowers your
profile; movement has acceleration and friction; collision is an axis-separated
AABB test against every wall and crate.

## Utility

Smoke grenades bloom into clouds that block sight both ways for 12 seconds —
bots will not shoot through them, and neither will you. Flashbangs white out
anyone facing the burst inside 19 m with a clear line to it: the player gets a
full-screen white-out, bots go blind and stop sensing and firing for up to
2.5 s. Bots use both: FERRO allies smoke the entry and flash the site on the
execute, SLAG defenders smoke a lane they hear you pushing and flash the site
on the retake.

## Bots

Four FERRO allies and five SLAG defenders. One ally shadows you and covers your
angles; the others execute on the round's called site together. Defenders take
fixed routes through the yard (A-long, mid, B-tunnel), hold angles, peek, and
react to what they see and hear: gunfire within earshot pulls them to
investigate, line of sight triggers a reaction delay then aimed bursts with
strafing. After a plant the defenders converge on the site; one defuses while
the others hunt you. Bots shoot bots — every agent on the field is a valid
target for the other side.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to capture) |
| Click | Fire |
| Right mouse | Scope (Longshot) |
| R | Reload |
| 1 / 2 / 3 / 4 / 5 | Rifle / SMG / Shotgun / Pistol / Longshot |
| G / H / J | Frag / Smoke / Flashbang |
| E (hold) | Plant the charge (inside a site) |
| B | Buy menu (buy phase) |
| Ctrl / C | Crouch |
| Space | Jump |

## The map — Ironworks Yard, night rain

An original industrial yard, 40 x 32 m: two bomb sites (A west, B east) joined by
three lanes — A-long past the furnace, mid through the container canyon, B-tunnel
under the gantry — with crates, containers and walls giving corners, cover and
long sightlines. Night rain: a painted skybox with a lit skyline, falling rain
with splash rings, puddles that catch the floodlights, a glowing furnace mouth
with rising embers, steam vents, sagging cables, a crane with blinking beacons,
and a low catwalk you can jump onto for the long mid angle. Site beacons glow
amber (A) and cyan (B).

## Run it

```sh
node serve.ts        # serves game/ at http://localhost:8080
```

Open the page in desktop Chrome, click to play. No network request is made;
all sound is synthesized with WebAudio, including a looped rain bed.
Screenshots in `screenshots/` are real renders of this code
(`?shot=start|play|buy|end&seed=1` stages deterministic frames for capture).

## Files

- `game/index.html` — page, HUD DOM, import map for three.js
- `game/src/main.js` — boot, fixed-step loop, round/economy/team state machine
- `game/src/state.js` — the one match-state object
- `game/src/map.js` — map data: boxes, cylinders, puddles, sites, spawns, routes
- `game/src/textures.js` — procedural canvas textures and the night skybox
- `game/src/world.js` — meshes, colliders, lights, rain, embers, steam
- `game/src/physics.js` — shared AABB mover (player and bots)
- `game/src/player.js` — movement, crouch, jump, look, recoil
- `game/src/weapons.js` — weapon defs, view models, spread, reload, scope
- `game/src/combat.js` — hitscan resolution, tracers, impacts, line of sight
- `game/src/bots.js` — bot AI: 5v5 teams, coordination, routes, hearing, defuse
- `game/src/utility.js` — frag, smoke and flashbang grenades
- `game/src/audio.js` — synthesized WebAudio effects and the rain bed
- `game/src/hud.js` — HUD, buy menu, kill feed, minimap, flash white-out
- `game/src/input.js` — keyboard, mouse, pointer lock, scope button
- `game/src/palette.js`, `game/src/rng.js` — palette, seeded RNG

## License

MIT — see `LICENSE`.
