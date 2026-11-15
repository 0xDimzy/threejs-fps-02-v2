// Nine agents, two teams. FERRO fields the player plus four ally bots
// (ANVIL, FLINT, GALE, WREN); SLAG fields five defenders (RUST, SOOT,
// CINDER, EMBER, ASH). The allies are not scenery: one shadows the
// player and covers their angles, the others execute on the round's
// called site together — smoke on the entry, flash into the site, then
// the push — and after a plant they hold the site with the player. The
// defenders walk their lanes, hold angles, peek, and react to what they
// see and hear; after a plant they converge and one of them channels the
// disarm while the rest hunt. Spotting is a genuine ray against the
// yard's shootables and the live smoke, so a wall — or a cloud — between
// two agents really does hide one from the other. Return fire is a short
// aimed volley after a reaction pause, fired while sidestepping, and the
// hit chance falls off with range, the target's pace, and crouching.
// Bots shoot bots, too: every agent on the field is a valid target for
// the other side, and the caller resolves the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { createBody, moveBody } from './physics.js';
import { range, chance } from './rng.js';

const FERRO_CALLSIGNS = ['ANVIL', 'FLINT', 'GALE', 'WREN'];
const SLAG_CALLSIGNS = ['RUST', 'SOOT', 'CINDER', 'EMBER', 'ASH'];
const VITALITY = 100;
const PATROL_PACE = 3.6;
const CHASE_PACE = 4.4;
const VISUAL_REACH = 46;
const EARSHOT = 28;
const OPTIC_HEIGHT = 1.5;
const DISARM_SECONDS = 5;
const UTIL_COOLDOWN = 9;
const PATROL = 'patrol';
const OVERWATCH = 'overwatch';
const PURSUE = 'pursue';
const CONVERGE = 'converge';
const DISARM = 'disarm';
const SHADOW = 'shadow';
const EXECUTE = 'execute';
const DOWN = 'down';

// Shortest signed turn from `current` to `target`, folded into (-PI, PI].
function wrapAngle(target, current) {
  let gap = target - current;
  while (gap > Math.PI) gap -= Math.PI * 2;
  while (gap < -Math.PI) gap += Math.PI * 2;
  return gap;
}

export function createBots(scene, barriers, targets, seeded) {
  const ferroMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ally), roughness: 0.6, metalness: 0.05 });
  const slagMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.6, metalness: 0.05 });
  const gloomMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232830'), roughness: 0.85 });
  const ferroLens = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ally), roughness: 0.3, metalness: 0.2, emissive: new THREE.Color(PALETTE.ally), emissiveIntensity: 0.5 });
  const slagLens = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.3, metalness: 0.2, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35 });
  const chestGeo = new THREE.BoxGeometry(0.55, 0.78, 0.32);
  const skullGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const shinGeo = new THREE.BoxGeometry(0.2, 0.62, 0.2);
  const barrelGeo = new THREE.BoxGeometry(0.07, 0.09, 0.62);
  const lensGeo = new THREE.BoxGeometry(0.24, 0.05, 0.05);
  const markGeo = new THREE.ConeGeometry(0.09, 0.22, 4);

  const allies = [];
  const enemies = [];
  const hitMeshes = [];

  // One agent: a low-poly figure assembled from boxes and a sphere, with
  // its own cloned shell material so the hit flash lights up one bot only.
  // The chest and skull meshes carry the bot on userData, which is how the
  // hitscan code in the caller finds out what a ray struck. Allies wear a
  // small teal chevron over the helmet so the player can read the teams
  // at a glance through the rain.
  function makeAgent(team, slot) {
    const isFerro = team === 'ferro';
    const rig = new THREE.Group();
    const chest = new THREE.Mesh(chestGeo, (isFerro ? ferroMat : slagMat).clone());
    chest.position.y = 1.05;
    chest.userData.part = 'torso';
    const skull = new THREE.Mesh(skullGeo, gloomMat);
    skull.position.y = 1.58;
    skull.userData.part = 'head';
    const lens = new THREE.Mesh(lensGeo, isFerro ? ferroLens : slagLens);
    lens.position.set(0, 1.58, -0.14);
    const shinL = new THREE.Mesh(shinGeo, gloomMat);
    shinL.position.set(-0.14, 0.31, 0);
    const shinR = new THREE.Mesh(shinGeo, gloomMat);
    shinR.position.set(0.14, 0.31, 0);
    const barrel = new THREE.Mesh(barrelGeo, gloomMat);
    barrel.position.set(0.2, 1.15, -0.35);
    rig.add(chest, skull, lens, shinL, shinR, barrel);
    let mark = null;
    if (isFerro) {
      mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ally) }));
      mark.position.y = 1.92;
      mark.rotation.x = Math.PI;
      rig.add(mark);
    }
    rig.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(rig);
    const spawn = isFerro ? MAP.allySpawns[slot] : MAP.enemySpawns[slot];
    const bot = {
      team,
      slot,
      global: isFerro ? slot : 4 + slot,
      callsign: isFerro ? FERRO_CALLSIGNS[slot] : SLAG_CALLSIGNS[slot],
      rig,
      chest,
      skull,
      mark,
      hull: createBody(barriers, spawn[0], spawn[1]),
      vitality: VITALITY,
      up: true,
      facing: isFerro ? 0 : Math.PI,
      mode: isFerro ? (slot === 0 ? SHADOW : EXECUTE) : PATROL,
      role: isFerro ? (slot === 0 ? 'shadow' : slot === 3 ? 'anchor' : 'entry') : (slot === 4 ? 'roam' : 'defend'),
      leg: 0,
      post: isFerro ? MAP.ferroHolds[slot] : MAP.slagHolds[slot],
      quarry: new THREE.Vector3(),
      target: null,
      spottedAt: -99,
      spotting: false,
      engageAt: 0,
      volleyLeft: 0,
      nextVolleyAt: 0,
      sidestep: 1,
      sidestepUntil: 0,
      heardWhen: -99,
      heardWhere: new THREE.Vector3(),
      disarm: 0,
      topple: 0,
      firedAt: -99,
      stalledAt: 0,
      lastKnown: new THREE.Vector3(),
      bypass: null,
      glint: 0,
      flashUntil: -99,
      smokeAt: -99,
      flashAt: -99,
      executed: false,
      retaken: false,
    };
    chest.userData.bot = bot;
    skull.userData.bot = bot;
    hitMeshes.push(chest, skull);
    (isFerro ? allies : enemies).push(bot);
    return bot;
  }

  for (let slot = 0; slot < 4; slot += 1) makeAgent('ferro', slot);
  for (let slot = 0; slot < 5; slot += 1) makeAgent('slag', slot);
  const squad = allies.concat(enemies);

  const nodeKeys = Object.keys(MAP.nodes);
  // Scratch vectors shared by the per-frame work, so the tick never allocates.
  const eyeTmp = new THREE.Vector3();
  const chestTmp = new THREE.Vector3();
  const goalTmp = new THREE.Vector3();

  function nearestPost(x, z) {
    let best = nodeKeys[0];
    let bestGap = Infinity;
    for (const key of nodeKeys) {
      const [nx, nz] = MAP.nodes[key];
      const gap = (nx - x) * (nx - x) + (nz - z) * (nz - z);
      if (gap < bestGap) {
        bestGap = gap;
        best = key;
      }
    }
    return best;
  }

  function turnToward(bot, x, z, dt, rate) {
    const want = Math.atan2(-(x - bot.hull.position.x), -(z - bot.hull.position.z));
    const gap = wrapAngle(want, bot.facing);
    bot.facing += Math.max(-rate * dt, Math.min(rate * dt, gap));
  }

  function advanceToward(bot, x, z, pace, dt) {
    const dx = x - bot.hull.position.x;
    const dz = z - bot.hull.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return true;
    moveBody(bot.hull, dt, dx / len, dz / len, pace, 30, 8);
    return len < 0.6;
  }

  // Put every agent back on its spawn with a clean slate for a new round.
  // Allies start in execute/shadow by role; defenders start on patrol.
  function rearmSquad() {
    for (const bot of squad) {
      const spawn = bot.team === 'ferro' ? MAP.allySpawns[bot.slot] : MAP.enemySpawns[bot.slot];
      bot.hull.position.set(spawn[0], 0, spawn[1]);
      bot.hull.velocity.set(0, 0, 0);
      bot.vitality = VITALITY;
      bot.up = true;
      bot.facing = bot.team === 'ferro' ? 0 : Math.PI;
      bot.mode = bot.team === 'ferro' ? (bot.role === 'shadow' ? SHADOW : EXECUTE) : PATROL;
      bot.leg = 0;
      bot.post = bot.team === 'ferro' ? MAP.ferroHolds[bot.slot] : MAP.slagHolds[bot.slot];
      bot.quarry.set(0, 0, 0);
      bot.target = null;
      bot.spottedAt = -99;
      bot.spotting = false;
      bot.engageAt = 0;
      bot.volleyLeft = 0;
      bot.nextVolleyAt = 0;
      bot.sidestepUntil = 0;
      bot.sidestep = 1;
      bot.heardWhen = -99;
      bot.heardWhere.set(0, 0, 0);
      bot.disarm = 0;
      bot.topple = 0;
      bot.glint = 0;
      bot.flashUntil = -99;
      bot.smokeAt = -99;
      bot.flashAt = -99;
      bot.executed = false;
      bot.retaken = false;
      bot.rig.rotation.set(0, 0, 0);
      bot.rig.position.set(spawn[0], 0, spawn[1]);
      bot.rig.visible = true;
      bot.chest.material.emissive = new THREE.Color(0x000000);
      bot.chest.material.emissiveIntensity = 0;
      bot.firedAt = -99;
      bot.bypass = null;
      bot.stalledAt = 0;
      bot.lastKnown.set(spawn[0], 0, spawn[1]);
    }
  }

  // Apply a hit. A wounded agent that was still on its lane or on post
  // abandons the plan and goes after the shooter. Returns true on a kill.
  function wound(bot, amount, part) {
    if (!bot.up) return false;
    bot.vitality -= amount;
    bot.glint = 0.12;
    bot.chest.material.emissive = new THREE.Color(PALETTE.accent);
    bot.chest.material.emissiveIntensity = 0.9;
    if (bot.vitality > 0) {
      if (bot.mode === PATROL || bot.mode === OVERWATCH || bot.mode === EXECUTE || bot.mode === SHADOW) bot.mode = PURSUE;
      return false;
    }
    bot.up = false;
    bot.topple = 0;
    bot.mode = DOWN;
    return true;
  }

  // The agents this bot can shoot: the other side, plus the player when
  // the bot is a defender. Each foe is { where: Vector3, up, pace, ref }
  // where ref is null for the player and the bot object for a bot.
  function foesOf(bot, feed) {
    if (bot.team === 'ferro') {
      return feed.enemies.map((e) => ({ where: e.hull.position, up: e.up, pace: 0, ref: e }));
    }
    const out = feed.allies.map((a) => ({ where: a.hull.position, up: a.up, pace: 0, ref: a }));
    out.push({ where: feed.player.where, up: feed.player.up, pace: feed.player.pace, ref: null });
    return out;
  }

  // Eyes, checked on a staggered schedule so the nine rays land on
  // different frames instead of all at once. A fresh sighting sets the
  // reaction pause before the agent is allowed to open up. Smoke and
  // walls both break the ray; a flashbang blanks it entirely.
  function senseFoe(bot, feed, clock) {
    if ((feed.tick + bot.global) % 6 !== 0) return;
    if (clock < bot.flashUntil) {
      bot.spotting = false;
      bot.target = null;
      return;
    }
    const spot = bot.hull.position;
    eyeTmp.set(spot.x, OPTIC_HEIGHT, spot.z);
    let best = null;
    let bestGap = VISUAL_REACH;
    for (const foe of foesOf(bot, feed)) {
      if (!foe.up) continue;
      chestTmp.set(foe.where.x, foe.where.y + 1.2, foe.where.z);
      const gap = Math.hypot(foe.where.x - spot.x, foe.where.z - spot.z);
      if (gap >= bestGap) continue;
      if (!feed.clearShot(eyeTmp, chestTmp, targets)) continue;
      best = foe;
      bestGap = gap;
    }
    bot.spotting = !!best;
    if (!best) {
      bot.target = null;
      return;
    }
    bot.target = best;
    const fresh = clock - bot.spottedAt > 1.2;
    bot.spottedAt = clock;
    bot.quarry.set(best.where.x, 0, best.where.z);
    if (fresh) bot.engageAt = clock + range(seeded, 0.5, 0.9);
    if (bot.mode === PATROL || bot.mode === OVERWATCH || bot.mode === EXECUTE || bot.mode === SHADOW) bot.mode = PURSUE;
  }

  // Ears: a gunshot inside earshot, heard recently, drags a patrolling or
  // posted agent toward the noise. A two-second refractory keeps one burst
  // from re-triggering the same agent over and over.
  function listenForShots(bot, feed, clock) {
    const echo = feed.echo;
    if (echo.when <= 0 || clock - echo.when >= 1.5) return;
    const spot = bot.hull.position;
    const gap = Math.hypot(echo.where.x - spot.x, echo.where.z - spot.z);
    if (gap >= EARSHOT || clock - bot.heardWhen <= 2) return;
    bot.heardWhen = clock;
    bot.heardWhere.copy(echo.where);
    if (bot.mode === PATROL || bot.mode === OVERWATCH || bot.mode === EXECUTE || bot.mode === SHADOW) {
      bot.mode = PURSUE;
      bot.quarry.copy(echo.where);
    }
  }

  // Walk the lane's waypoints in order; reaching the last one posts the
  // agent up on its assigned angle.
  function patrolLeg(bot, feed, dt, pace) {
    const legs = bot.team === 'ferro' ? MAP.ferroRoutes[bot.slot] : MAP.slagRoutes[bot.slot];
    const node = MAP.nodes[legs[bot.leg]];
    const arrived = advanceToward(bot, node[0], node[1], pace, dt);
    turnToward(bot, node[0], node[1], dt, 6);
    if (!arrived) return;
    bot.leg += 1;
    if (bot.leg >= legs.length) {
      bot.mode = OVERWATCH;
      bot.facing = bot.post[2];
    }
  }

  // Hold the angle: a slow sweep around the post's facing, with small
  // sideways peeks so the agent is never quite where the intruder last aimed.
  function overwatchSweep(bot, feed, dt) {
    const clock = feed.clock;
    bot.facing = bot.post[2] + Math.sin(clock * 0.5 + bot.global * 1.7) * 0.45;
    if (clock > bot.sidestepUntil) {
      bot.sidestepUntil = clock + range(seeded, 1.5, 3);
      bot.sidestep = seeded() < 0.5 ? -1 : 1;
    }
    const side = Math.cos(bot.facing) * bot.sidestep * 0.4;
    const fwd = -Math.sin(bot.facing) * bot.sidestep * 0.4;
    moveBody(bot.hull, dt, fwd, side, 0.8, 30, 8);
  }

  // The shadow stays a few metres off the player's flank and watches the
  // player's back: it trails the player, never leads, and holds when the
  // player holds. If the player dies it joins the execute.
  function shadowFollow(bot, feed, dt) {
    const anchor = feed.player.where;
    const dx = bot.hull.position.x - anchor.x;
    const dz = bot.hull.position.z - anchor.z;
    const gap = Math.hypot(dx, dz);
    if (gap > 5) {
      const tx = anchor.x + (dx / gap) * 4;
      const tz = anchor.z + (dz / gap) * 4;
      advanceToward(bot, tx, tz, PATROL_PACE, dt);
      turnToward(bot, anchor.x, anchor.z, dt, 5);
    } else {
      turnToward(bot, anchor.x - Math.sin(bot.facing) * 4, anchor.z - Math.cos(bot.facing) * 4, dt, 3);
      bot.facing += Math.sin(feed.clock * 0.4 + bot.global) * 0.01;
    }
    if (!feed.player.up) bot.mode = EXECUTE;
  }

  // The execute: push along the lane toward the called site. Inside twelve
  // metres of the site the entry bots spend their utility once — smoke
  // across the entry, flash into the site — then keep pushing in.
  function executePush(bot, feed, dt) {
    const site = MAP.sites.find((s) => s.id === feed.calledSite) || MAP.sites[0];
    const spot = bot.hull.position;
    const dist = Math.hypot(site.x - spot.x, site.z - spot.z);
    if (!bot.executed && dist < 13 && bot.role === 'entry') {
      bot.executed = true;
      feed.throwUtility(bot, 'smoke', { x: site.x, y: 1.2, z: site.z + 3.5 });
      if (chance(seeded, 0.8)) feed.throwUtility(bot, 'flash', { x: site.x, y: 1.6, z: site.z });
    }
    if (dist < 2.2) {
      bot.mode = OVERWATCH;
      bot.post = [spot.x, spot.z, Math.atan2(-(feed.player.where.x - spot.x), -(feed.player.where.z - spot.z))];
      return;
    }
    // Steer through the lane nodes toward the site, like a patrol whose
    // last waypoint is the site itself.
    const legs = MAP.ferroRoutes[bot.slot];
    const node = MAP.nodes[legs[Math.min(bot.leg, legs.length - 1)]];
    const arrived = advanceToward(bot, node[0], node[1], CHASE_PACE, dt);
    turnToward(bot, node[0], node[1], dt, 6);
    if (arrived && bot.leg < legs.length - 1) bot.leg += 1;
  }

  // Chase the quarry — or, when the charge is down, the planted site. If
  // the agent barely moved for a second it is wedged on something, so it
  // detours through the nearest waypoint before carrying on. Reaching the
  // site starts the disarm; reaching the quarry's last known spot with no
  // fresh sighting for two seconds posts the agent up right there.
  // Defenders retaking a planted site spend a flash on the way in, once.
  function chaseQuarry(bot, feed, dt, pace) {
    const clock = feed.clock;
    const spot = bot.hull.position;
    const charge = feed.charge;
    if (bot.mode === CONVERGE && charge.site) goalTmp.set(charge.site.x, 0, charge.site.z);
    else goalTmp.copy(bot.quarry);
    if (clock - bot.stalledAt > 1) {
      const moved = Math.hypot(spot.x - bot.lastKnown.x, spot.z - bot.lastKnown.z);
      bot.lastKnown.copy(spot);
      bot.stalledAt = clock;
      if (moved < 0.25 && !bot.bypass) bot.bypass = MAP.nodes[nearestPost(spot.x, spot.z)];
    }
    let gx = goalTmp.x;
    let gz = goalTmp.z;
    if (bot.bypass) {
      gx = bot.bypass[0];
      gz = bot.bypass[1];
      if (Math.hypot(gx - spot.x, gz - spot.z) < 0.8) bot.bypass = null;
    }
    const arrived = advanceToward(bot, gx, gz, pace, dt);
    turnToward(bot, gx, gz, dt, 7);
    if (bot.mode === CONVERGE && charge.site) {
      const siteGap = Math.hypot(charge.site.x - spot.x, charge.site.z - spot.z);
      if (!bot.retaken && siteGap < 14 && bot.team === 'slag') {
        bot.retaken = true;
        feed.throwUtility(bot, 'flash', { x: charge.site.x, y: 1.6, z: charge.site.z });
        if (clock - bot.smokeAt > UTIL_COOLDOWN) {
          bot.smokeAt = clock;
          feed.throwUtility(bot, 'smoke', { x: (charge.site.x + spot.x) / 2, y: 1.2, z: (charge.site.z + spot.z) / 2 });
        }
      }
      if (siteGap < 1.6) {
        bot.mode = DISARM;
        bot.disarm = 0;
      }
    } else if (bot.mode === PURSUE && arrived && clock - bot.spottedAt > 2) {
      bot.mode = OVERWATCH;
      bot.post = [spot.x, spot.z, bot.facing];
    }
  }

  // Channel the disarm. Spotting the intruder after the reaction pause
  // breaks it off and sends the agent hunting again; otherwise the beeps
  // tick at two per second until the channel completes and the caller
  // ends the round.
  function disarmChannel(bot, feed, dt) {
    const clock = feed.clock;
    if (bot.spotting && clock > bot.engageAt) {
      bot.mode = PURSUE;
      bot.disarm = 0;
      return;
    }
    bot.disarm += dt;
    if (Math.floor(bot.disarm * 2) !== Math.floor((bot.disarm - dt) * 2)) feed.onDisarmTick();
    if (bot.disarm >= DISARM_SECONDS) feed.onDisarmed(bot);
  }

  // Open up: once the reaction pause has passed, fire in short volleys
  // with a gap between them, sidestepping the whole time so the target
  // cannot sit on a pre-aimed head. The actual ray and hit roll live in
  // the caller; a flashbang blanks the whole thing.
  function openFire(bot, feed, dt, clock) {
    if (!bot.spotting || !bot.target || clock < bot.engageAt) return;
    if (clock < bot.flashUntil) return;
    const foe = bot.target;
    if (!foe.up) return;
    turnToward(bot, foe.where.x, foe.where.z, dt, 10);
    if (bot.volleyLeft <= 0 && clock >= bot.nextVolleyAt) {
      bot.volleyLeft = 3 + Math.floor(seeded() * 3);
      bot.nextVolleyAt = clock + range(seeded, 0.5, 0.9);
    }
    if (bot.volleyLeft > 0 && clock >= bot.nextVolleyAt) {
      bot.volleyLeft -= 1;
      bot.nextVolleyAt = clock + 0.13;
      bot.firedAt = clock;
      feed.fireAt(bot, foe);
    }
    if (clock > bot.sidestepUntil) {
      bot.sidestepUntil = clock + range(seeded, 0.6, 1.2);
      bot.sidestep = seeded() < 0.5 ? -1 : 1;
    }
    const sideX = Math.cos(bot.facing) * bot.sidestep;
    const sideZ = -Math.sin(bot.facing) * bot.sidestep;
    moveBody(bot.hull, dt, sideX, sideZ, 1.6, 30, 8);
  }

  // A defender that hears a push but cannot see it yet smokes the lane
  // between itself and the noise, on a cooldown, so the attackers have
  // to walk through a cloud or wait it out.
  function defensiveSmoke(bot, feed, clock) {
    if (bot.team !== 'slag') return;
    if (clock - bot.smokeAt <= UTIL_COOLDOWN) return;
    if (clock - bot.heardWhen > 1.5 || bot.mode !== PURSUE) return;
    if (bot.spotting) return;
    bot.smokeAt = clock;
    feed.throwUtility(bot, 'smoke', {
      x: (bot.hull.position.x + bot.heardWhere.x) / 2,
      y: 1.2,
      z: (bot.hull.position.z + bot.heardWhere.z) / 2,
    });
  }

  // One mode handler per movement mode; pursuit and convergence share the
  // same chase, the difference is only what the goal is.
  const MODE_MOVES = {
    [PATROL]: patrolLeg,
    [OVERWATCH]: overwatchSweep,
    [PURSUE]: chaseQuarry,
    [CONVERGE]: chaseQuarry,
    [DISARM]: disarmChannel,
    [SHADOW]: shadowFollow,
    [EXECUTE]: executePush,
  };

  function tick(dt, feed) {
    const clock = feed.clock;
    for (const bot of squad) {
      if (!bot.up) {
        bot.topple = Math.min(1, bot.topple + dt / 0.4);
        bot.rig.rotation.x = -bot.topple * 1.45;
        bot.rig.position.y = -bot.topple * 0.08;
        continue;
      }
      if (bot.glint > 0) {
        bot.glint -= dt;
        if (bot.glint <= 0) bot.chest.material.emissiveIntensity = 0;
      }
      senseFoe(bot, feed, clock);
      listenForShots(bot, feed, clock);
      defensiveSmoke(bot, feed, clock);
      if (feed.charge.status === 'planted') {
        if (bot.team === 'slag' && bot.mode !== DISARM) bot.mode = CONVERGE;
        else if (bot.team === 'ferro' && (bot.mode === EXECUTE || bot.mode === SHADOW || bot.mode === PATROL)) {
          bot.mode = OVERWATCH;
          bot.post = [bot.hull.position.x, bot.hull.position.z, bot.facing];
        }
      }
      const pace = bot.mode === PURSUE || bot.mode === CONVERGE || bot.mode === EXECUTE ? CHASE_PACE : PATROL_PACE;
      const mover = MODE_MOVES[bot.mode];
      if (mover) mover(bot, feed, dt, pace);
      openFire(bot, feed, dt, clock);
      bot.rig.position.set(bot.hull.position.x, bot.rig.position.y, bot.hull.position.z);
      bot.rig.rotation.y = bot.facing;
      if (bot.mark) bot.mark.position.y = 1.92 + Math.sin(clock * 3 + bot.global) * 0.03;
    }
  }

  return {
    bots: squad,
    allies,
    enemies,
    hitMeshes,
    reset: rearmSquad,
    damage: wound,
    step: tick,
    aliveCount(team) {
      const list = team === 'ferro' ? allies : enemies;
      return list.filter((bot) => bot.up).length;
    },
    positions() {
      return squad.map((bot) => ({
        x: bot.hull.position.x, z: bot.hull.position.z, alive: bot.up,
        lastShotAt: bot.firedAt, yaw: bot.facing, team: bot.team,
      }));
    },
  };
}
