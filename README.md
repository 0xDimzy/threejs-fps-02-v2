# ASHLINE v5 — a three.js tactical FPS

A round-based tactical shooter in the Counter-Strike style, built on three.js 0.187.0
(vendored, offline, no build step). You are FERRO, one of five: four ally bots
fight beside you against five SLAG defenders in the Ironworks Yard, in the rain.
Win rounds by eliminating the enemy team or by planting the sabotage charge at
Site A or Site B and holding it until detonation.

## How a match plays

- **First to 7 rounds** (max 12), side swap at the half: FERRO attacks rounds 1–6,
  defends 7–12. Each round: 7 s buy phase, then 105 s live.
- **Money:** start $800. Kill +$300, knife kill +$1500, round win +$325, round loss
  +$140–$290 (growing loss bonus), plant +$300, defuse +$300. Spend it in the buy
  menu (G) during the buy phase.
- **Arsenal:** AR-41 Halberd rifle (owned), P9 Sparrow pistol (owned), K-9 Shiv
  knife (owned, 3x from behind), KR-77 Reaper rifle $1500, SMG-7 Hornet $600,
  SG-9 Mauler shotgun $700, LR-88 Longshot scoped rifle $1100, Frag grenade $300,
  smoke grenade $250, flashbang $250, vest $650, vest + helmet $1000, defuse kit
  $400. Grenades are capped at 2 of each per round; armour and the kit are per round.
- **Objective:** the charge starts with the attacking carrier — you, in rounds
  1–6. Hold E for 3.2 s inside a site to plant it; the 40 s fuse then runs.
  If the carrier dies the charge drops where they fell — walk over it to pick it
  up. A bot carrier plants on its own if it reaches the site. Defenders defuse
  by holding E at the planted site: 7 s, or 3.6 s with a defuse kit. If the fuse
  runs out, the site blows and the attackers win the round. If the timer runs out
  unplanted, or the whole attacking team is eliminated, the defenders hold.

## Gunplay

Hitscan weapons with hit zones: head 2.5–4x (per weapon), stomach 1.25x, legs
0.75x, torso 1x. A vest halves body damage; vest + helmet halves head damage too.
Armour penetration softens the vest's cut. The two rifles — Halberd and Reaper —
have fixed 20-shot recoil tables: the same shots kick the same way every time,
so the pattern can be learned and pulled against. Spread punishes moving, airborne
and sustained fire; crouching tightens it, and the scoped Longshot is only truly
accurate down its sight.

## Bots

Nine agents with a playbook: the attackers call a site, stage, then execute —
smoke on the entry, flash into the site, push in, plant, and hold the exits.
One lurker works the other lane. Defenders walk their lanes, hold angles, rotate
on radio calls, and retake with a flash; one carries a defuse kit. Perception is
a sight cone (narrow when calm, wide when alerted), shared sightings over the
radio, and hearing: a gunshot inside earshot drags a patrolling agent toward the
noise. Spotting is a genuine ray against the yard and the live smoke, so a wall
— or a cloud — between two agents really does hide one from the other. Bots
shoot bots, and they shop like you: pistols early, rifles once the economy
allows, a vest from round three.

## The yard

The Ironworks Yard, at night in the rain: two plant sites (A by the furnace,
B by the gantry), named callouts — Furnace, Gantry, Mid, Crates, Pipes, Yard,
Alley, Crane — painted on the minimap and floating over the lanes. Rain, splash
rings, puddles, a glowing furnace mouth with rising embers, steam vents, sagging
cables, blinking crane beacons.

## Controls

- **W A S D** move · **Mouse** look · **Click** fire · **RMB** scope (Longshot)
- **R** reload · **1–7** weapons · **Q** next weapon
- **F** frag · **V** smoke · **B** flash
- **E** hold to plant / defuse (inside a site)
- **G** buy menu (buy phase) · **Z / X** call site A / B (buy phase)
- **Ctrl** crouch · **Space** jump · **M** mute

## Run it

```
node serve.ts          # http://localhost:8080
node main.ts           # writes /output (or $MAKEFUN_OUTPUT_DIR)
```

Staged screenshots: `?shot=play|buy|retake|end&seed=N` freezes a deterministic
frame and sets `window.__shotReady` when it is painted.
