// Nine agents, two teams. FERRO fields the player plus four ally bots
// (ANVIL, FLINT, GALE, WREN); SLAG fields five defenders (RUST, SOOT,
// CINDER, EMBER, ASH). Each round runs a PLAYBOOK: a called site, a
// staging time, an entry group, and one lurker working the other lane.
// The attackers gather, then execute in stages — smoke on the entry,
// flash into the site, then the push — and after a plant they hold the
// site's exits. Defenders walk their lanes, hold angles, rotate on radio
// calls, and retake with a flash; one of them carries a defuse kit and
// channels the defuse in 3.6 s instead of 7. Perception is a sight cone
// (narrow when calm, wide when alerted), shared sightings over the radio,
// and hearing: a gunshot inside earshot drags a patrolling agent toward
// the noise. Spotting is a genuine ray against the yard's shootables and
// the live smoke, so a wall — or a cloud — between two agents really
// does hide one from the other. Return fire is a short aimed volley after
// a reaction pause, fired while sidestepping, and the hit chance falls
// off with range, the target's pace, and crouching — and grows as the
// shooter settles on the target. Bots shoot bots, too: every agent on
// the field is a valid target for the other side, and the caller resolves
// the damage. Bots shop like the player: pistol rounds early, rifles once
// the team economy allows, and a vest from round three on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { createBody, moveBody } from './physics.js';
import { range, chance } from './rng.js';
import { PLANT_SECONDS, DEFUSE_SECONDS, DEFUSE_KIT_SECONDS } from './state.js';

const FERRO_CALLSIGNS = ['ANVIL', 'FLINT', 'GALE', 'WREN'];
const SLAG_CALLSIGNS = ['RUST', 'SOOT', 'CINDER', 'EMBER', 'ASH'];
const VITALITY = 100;
const PATROL_PACE = 3.6;
const CHASE_PACE = 4.4;
const VISUAL_REACH = 46;
const EARSHOT = 28;
const OPTIC_HEIGHT = 1.5;
const UTIL_COOLDOWN = 9;
const CONE_CALM = 1.15;
const CONE_ALERT = 1.9;
const PATROL = 'patrol';
const OVERWATCH = 'overwatch';
const PURSUE = 'pursue';
const CONVERGE = 'converge';
const DISARM = 'disarm';
const SHADOW = 'shadow';
const EXECUTE = 'execute';
const PLANT = 'plant';
const PICKUP = 'pickup';
const DOWN = 'down';

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
  const stomachGeo = new THREE.BoxGeometry(0.5, 0.3, 0.3);
  const skullGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const shinGeo = new THREE.BoxGeometry(0.2, 0.62, 0.2);
  const barrelGeo = new THREE.BoxGeometry(0.07, 0.09, 0.62);
  const lensGeo = new THREE.BoxGeometry(0.24, 0.05, 0.05);
  const markGeo = new THREE.ConeGeometry(0.09, 0.22, 4);
  const caseGeo = new THREE.BoxGeometry(0.3, 0.18, 0.22);
  const caseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.6 });

  const allies = [];
  const enemies = [];
  const hitMeshes = [];

  function makeAgent(team, slot) {
    const isFerro = team === 'ferro';
    const rig = new THREE.Group();
    const chest = new THREE.Mesh(chestGeo, (isFerro ? ferroMat : slagMat).clone());
    chest.position.y = 1.05;
    chest.userData.part = 'torso';
    const stomach = new THREE.Mesh(stomachGeo, gloomMat);
    stomach.position.y = 0.72;
    stomach.userData.part = 'stomach';
    const skull = new THREE.Mesh(skullGeo, gloomMat);
    skull.position.y = 1.58;
    skull.userData.part = 'head';
    const lens = new THREE.Mesh(lensGeo, isFerro ? ferroLens : slagLens);
    lens.position.set(0, 1.58, -0.14);
    const shinL = new THREE.Mesh(shinGeo, gloomMat);
    shinL.position.set(-0.14, 0.31, 0);
    shinL.userData.part = 'legs';
    const shinR = new THREE.Mesh(shinGeo, gloomMat);
    shinR.position.set(0.14, 0.31, 0);
    shinR.userData.part = 'legs';
    const barrel = new THREE.Mesh(barrelGeo, gloomMat);
    barrel.position.set(0.2, 1.15, -0.35);
    rig.add(chest, stomach, skull, lens, shinL, shinR, barrel);
    let mark = null;
    if (isFerro) {
      mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ally) }));
      mark.position.y = 1.92;
      mark.rotation.x = Math.PI;
      rig.add(mark);
    }
    const chargeMark = new THREE.Mesh(caseGeo, caseMat);
    chargeMark.position.set(0, 1.25, 0.22);
    chargeMark.visible = false;
    rig.add(chargeMark);
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
      stomach,
      shinL,
      shinR,
      mark,
      chargeMark,
      hull: createBody(barriers, spawn[0], spawn[1]),
      vitality: VITALITY,
      up: true,
      facing: isFerro ? 0 : Math.PI,
      mode: isFerro ? (slot === 0 ? SHADOW : EXECUTE) : PATROL,
      role: isFerro ? (slot === 0 ? 'shadow' : slot === 3 ? 'lurker' : 'entry') : (slot === 4 ? 'roam' : 'defend'),
      defending: false,
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
      carrying: false,
      plantProgress: 0,
      gunDmg: 9,
      gunGap: 0.5,
      armor: 0,
      kit: false,
    };
    chest.userData.bot = bot;
    skull.userData.bot = bot;
    stomach.userData.bot = bot;
    shinL.userData.bot = bot;
    shinR.userData.bot = bot;
    hitMeshes.push(chest, stomach, skull, shinL, shinR);
    (isFerro ? allies : enemies).push(bot);
    return bot;
  }

  for (let slot = 0; slot < 4; slot += 1) makeAgent('ferro', slot);
  for (let slot = 0; slot < 5; slot += 1) makeAgent('slag', slot);
  const squad = allies.concat(enemies);

  const nodeKeys = Object.keys(MAP.nodes);
  const eyeTmp = new THREE.Vector3();
  const chestTmp = new THREE.Vector3();
  const goalTmp = new THREE.Vector3();

  // The round's playbook: which site the attackers hit, when the execute
  // starts (the entry group stages until then), and which slot lurks the
  // other lane. Rebuilt every round by rearmSquad.
  let plan = { site: 'A', executeAt: 7, lurker: 3 };

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
  // `swapped` flips the sides at the half: FERRO defends, SLAG attacks
  // with one carrier. Bots shop by the round: pistols early, rifles once
  // the economy allows, a vest from round three, and one SLAG defender
  // always carries a defuse kit.
  function rearmSquad(swapped, calledSite, round) {
    plan = { site: calledSite, executeAt: 6 + seeded() * 2, lurker: 3 };
    for (const bot of squad) {
      const spawn = bot.team === 'ferro'
        ? (swapped ? MAP.enemySpawns[bot.slot] : MAP.allySpawns[bot.slot])
        : (swapped ? MAP.allySpawns[bot.slot] : MAP.enemySpawns[bot.slot]);
      bot.hull.position.set(spawn[0], 0, spawn[1]);
      bot.hull.velocity.set(0, 0, 0);
      bot.vitality = VITALITY;
      bot.up = true;
      bot.facing = bot.team === 'ferro' ? (swapped ? Math.PI : 0) : (swapped ? 0 : Math.PI);
      bot.defending = bot.team === 'ferro' ? swapped : !swapped;
      bot.mode = bot.defending ? PATROL : (bot.team === 'ferro' && bot.role === 'shadow' ? SHADOW : EXECUTE);
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
      bot.carrying = false;
      bot.plantProgress = 0;
      bot.rig.rotation.set(0, 0, 0);
      bot.rig.position.set(spawn[0], 0, spawn[1]);
      bot.rig.visible = true;
      bot.chest.material.emissive = new THREE.Color(0x000000);
      bot.chest.material.emissiveIntensity = 0;
      bot.firedAt = -99;
      bot.bypass = null;
      bot.stalledAt = 0;
      bot.lastKnown.set(spawn[0], 0, spawn[1]);
      bot.chargeMark.visible = false;
      // Shopping: round 1 is pistols; from round 2 the rifles come out.
      if (round <= 1) {
        bot.gunDmg = 9;
        bot.gunGap = 0.5;
      } else if (seeded() < 0.6) {
        bot.gunDmg = 12;
        bot.gunGap = 0.3;
      } else {
        bot.gunDmg = 10;
        bot.gunGap = 0.24;
      }
      bot.armor = round >= 3 && seeded() < 0.4 ? 1 : 0;
      bot.kit = bot.team === 'slag' && bot.slot === 2;
    }
    // The second-half carrier: one SLAG attacker carries the charge.
    if (swapped) {
      const carrier = enemies[0];
      carrier.carrying = true;
      carrier.chargeMark.visible = true;
    }
  }

  // Apply a hit. A vest halves it. A wounded agent that was still on its
  // lane or on post abandons the plan and goes after the shooter. The
  // caller owns the charge drop when a carrier falls. Returns true on a kill.
  function wound(bot, amount, part) {
    if (!bot.up) return false;
    if (bot.armor > 0 && part !== 'head') amount = Math.ceil(amount * 0.5);
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

  function foesOf(bot, feed) {
    if (bot.team === 'ferro') {
      return feed.enemies.map((e) => ({ where: e.hull.position, up: e.up, pace: 0, ref: e }));
    }
    const out = feed.allies.map((a) => ({ where: a.hull.position, up: a.up, pace: 0, ref: a }));
    out.push({ where: feed.player.where, up: feed.player.up, pace: feed.player.pace, ref: null });
    return out;
  }

  // Eyes, checked on a staggered schedule so the nine rays land on
  // different frames instead of all at once. A sight cone — narrow while
  // calm, wide once alerted — plus range and a real ray: smoke and walls
  // both break it; a flashbang blanks it entirely. A fresh sighting sets
  // the reaction pause, and is radioed to the team: allies who hear it
  // turn toward the same spot.
  function senseFoe(bot, feed, clock) {
    if ((feed.tick + bot.global) % 6 !== 0) return;
    if (clock < bot.flashUntil) {
      bot.spotting = false;
      bot.target = null;
      return;
    }
    const spot = bot.hull.position;
    eyeTmp.set(spot.x, OPTIC_HEIGHT, spot.z);
    const alerted = bot.mode === PURSUE || bot.mode === CONVERGE || bot.mode === DISARM;
    const cone = alerted ? CONE_ALERT : CONE_CALM;
    let best = null;
    let bestGap = VISUAL_REACH;
    for (const foe of foesOf(bot, feed)) {
      if (!foe.up) continue;
      chestTmp.set(foe.where.x, foe.where.y + 1.2, foe.where.z);
      const gap = Math.hypot(foe.where.x - spot.x, foe.where.z - spot.z);
      if (gap >= bestGap) continue;
      const want = Math.atan2(-(foe.where.x - spot.x), -(foe.where.z - spot.z));
      if (Math.abs(wrapAngle(want, bot.facing)) > cone) continue;
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
    if (fresh) {
      bot.engageAt = clock + range(seeded, 0.45, 0.85);
      feed.radio = { x: best.where.x, z: best.where.z, when: clock, team: bot.team, kind: 'contact' };
    }
    if (bot.mode === PATROL || bot.mode === OVERWATCH || bot.mode === EXECUTE || bot.mode === SHADOW) bot.mode = PURSUE;
  }

  // Radio: a fresh call from a teammate turns patrolling and posted
  // agents toward the same spot. Defenders rotate; attackers converge.
  function hearRadio(bot, feed, clock) {
    const call = feed.radio;
    if (!call || call.team !== bot.team) return;
    if (clock - call.when > 1.5) return;
    if (bot.mode !== PATROL && bot.mode !== OVERWATCH) return;
    if (bot.spotting) return;
    bot.quarry.set(call.x, 0, call.z);
    bot.mode = PURSUE;
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

  // The execute: stage until the playbook's execute time, then push along
  // the lane toward the called site. The lurker works the mid lane instead
  // of the called site, so the defence cannot stack one angle. Inside
  // twelve metres of the site the entry bots spend their utility once —
  // smoke across the entry, flash into the site — then keep pushing in.
  function executePush(bot, feed, dt) {
    const clock = feed.clock;
    const site = MAP.sites.find((s) => s.id === plan.site) || MAP.sites[0];
    const spot = bot.hull.position;
    const dist = Math.hypot(site.x - spot.x, site.z - spot.z);
    if (bot.role === 'lurker') {
      const node = MAP.nodes[MAP.ferroRoutes[3][Math.min(bot.leg, 3)]];
      const arrived = advanceToward(bot, node[0], node[1], CHASE_PACE, dt);
      turnToward(bot, node[0], node[1], dt, 6);
      if (arrived && bot.leg < 3) bot.leg += 1;
      if (bot.leg >= 3) {
        bot.mode = OVERWATCH;
        bot.post = [spot.x, spot.z, Math.PI * 0.75];
      }
      return;
    }
    if (clock < plan.executeAt) {
      const legs = bot.team === 'ferro' ? MAP.ferroRoutes[bot.slot] : MAP.slagRoutes[bot.slot];
      const node = MAP.nodes[legs[0]];
      advanceToward(bot, node[0], node[1], PATROL_PACE, dt);
      turnToward(bot, node[0], node[1], dt, 5);
      return;
    }
    if (bot.carrying) {
      if (dist < 2.2) {
        bot.mode = PLANT;
        bot.plantProgress = 0;
        return;
      }
    } else if (dist < 2.2) {
      bot.mode = OVERWATCH;
      bot.post = [spot.x, spot.z, Math.atan2(-(feed.player.where.x - spot.x), -(feed.player.where.z - spot.z))];
      return;
    }
    if (!bot.executed && dist < 13 && bot.role === 'entry') {
      bot.executed = true;
      feed.throwUtility(bot, 'smoke', { x: site.x, y: 1.2, z: site.z + 3.5 });
      if (chance(seeded, 0.8)) feed.throwUtility(bot, 'flash', { x: site.x, y: 1.6, z: site.z });
    }
    const legs = bot.team === 'ferro' ? MAP.ferroRoutes[bot.slot] : MAP.slagRoutes[bot.slot];
    const node = MAP.nodes[legs[Math.min(bot.leg, legs.length - 1)]];
    const arrived = advanceToward(bot, node[0], node[1], CHASE_PACE, dt);
    turnToward(bot, node[0], node[1], dt, 6);
    if (arrived && bot.leg < legs.length - 1) bot.leg += 1;
  }

  // The carrier plants: hold still in the site and channel. The caller
  // ends the round when the channel completes.
  function plantChannel(bot, feed, dt) {
    bot.plantProgress += dt;
    if (Math.floor(bot.plantProgress * 2) !== Math.floor((bot.plantProgress - dt) * 2)) feed.onPlantTick();
    if (bot.plantProgress >= PLANT_SECONDS) {
      bot.carrying = false;
      bot.chargeMark.visible = false;
      feed.onPlanted(MAP.sites.find((s) => s.id === plan.site), bot);
    }
  }

  // Pick up a dropped charge: walk to it, then carry it to the site.
  function pickupCharge(bot, feed, dt) {
    const charge = feed.charge;
    const spot = bot.hull.position;
    const arrived = advanceToward(bot, charge.x, charge.z, CHASE_PACE, dt);
    turnToward(bot, charge.x, charge.z, dt, 7);
    if (!arrived && Math.hypot(charge.x - spot.x, charge.z - spot.z) > 1) return;
    bot.carrying = true;
    bot.chargeMark.visible = true;
    feed.onPickup(bot);
    bot.mode = EXECUTE;
    bot.leg = 0;
  }

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

  // Channel the disarm: 7 s, or 3.6 s with a defuse kit. Spotting the
  // intruder after the reaction pause breaks it off and sends the agent
  // hunting again; otherwise the beeps tick at two per second until the
  // channel completes and the caller ends the round.
  function disarmChannel(bot, feed, dt) {
    const clock = feed.clock;
    if (bot.spotting && clock > bot.engageAt) {
      bot.mode = PURSUE;
      bot.disarm = 0;
      return;
    }
    bot.disarm += dt;
    if (Math.floor(bot.disarm * 2) !== Math.floor((bot.disarm - dt) * 2)) feed.onDisarmTick();
    const need = bot.kit ? DEFUSE_KIT_SECONDS : DEFUSE_SECONDS;
    if (bot.disarm >= need) feed.onDisarmed(bot);
  }

  // Open up: once the reaction pause has passed, fire in short volleys
  // with a gap between them. Aim settles the longer the target stays in
  // view, so a first glimpse is a wild shot and a tracked target is a
  // dead one. While a volley is firing the agent plants its feet —
  // counter-strafe — instead of drifting sideways. A flashbang blanks it.
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
      bot.nextVolleyAt = clock + bot.gunGap;
      bot.firedAt = clock;
      const settle = Math.min(1, 0.55 + (clock - bot.spottedAt) * 0.35);
      feed.fireAt(bot, foe, settle);
    }
    if (clock > bot.sidestepUntil) {
      bot.sidestepUntil = clock + range(seeded, 0.6, 1.2);
      bot.sidestep = seeded() < 0.5 ? -1 : 1;
    }
    const firing = bot.volleyLeft > 0;
    const sideX = Math.cos(bot.facing) * bot.sidestep;
    const sideZ = -Math.sin(bot.facing) * bot.sidestep;
    moveBody(bot.hull, dt, sideX, sideZ, firing ? 0.6 : 1.6, 30, 8);
  }

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

  const MODE_MOVES = {
    [PATROL]: patrolLeg,
    [OVERWATCH]: overwatchSweep,
    [PURSUE]: chaseQuarry,
    [CONVERGE]: chaseQuarry,
    [DISARM]: disarmChannel,
    [SHADOW]: shadowFollow,
    [EXECUTE]: executePush,
    [PLANT]: plantChannel,
    [PICKUP]: pickupCharge,
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
      hearRadio(bot, feed, clock);
      listenForShots(bot, feed, clock);
      defensiveSmoke(bot, feed, clock);
      // A dropped charge is the attacking side's first job: the nearest
      // living attacker goes and picks it up.
      if (feed.charge.status === 'dropped' && !bot.defending && bot.mode !== PICKUP && bot.mode !== PLANT) {
        const carrier = squad.find((b) => b.up && !b.defending && b.carrying);
        if (!carrier) {
          const attackers = squad.filter((b) => b.up && !b.defending);
          const nearest = attackers.reduce((best, b) => {
            const d = Math.hypot(b.hull.position.x - feed.charge.x, b.hull.position.z - feed.charge.z);
            return !best || d < best.d ? { b, d } : best;
          }, null);
          if (nearest && nearest.b === bot) bot.mode = PICKUP;
        }
      }
      if (feed.charge.status === 'planted') {
        if (bot.team === 'slag' && bot.mode !== DISARM) bot.mode = CONVERGE;
        else if (bot.team === 'ferro' && (bot.mode === EXECUTE || bot.mode === SHADOW || bot.mode === PATROL)) {
          // Post-plant: hold the site's exits instead of the lane.
          const site = feed.charge.site;
          bot.mode = OVERWATCH;
          bot.post = [site.x + (bot.slot % 2 ? 3.5 : -3.5), site.z + 3.5, Math.PI];
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
    plan: () => plan,
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
