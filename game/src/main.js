// Boot plus the one loop: a fixed 60 Hz simulation under a render running
// at the display's rate. This file alone understands rounds, the economy,
// the charge and the teams — the hero moves, the loadout fires, nine bots
// fight a 5v5 across the yard in the rain, and the code here decides what
// any of it is worth. ?shot=start|play|buy|end with &seed=N stages a
// deterministic frame for a capture, paints it twice, then holds it still
// and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS, GRENADE_PRICE, SMOKE_PRICE, FLASH_PRICE, ARMOR_PRICE } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createUtility } from './utility.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import {
  createMatchState, resetMatch, resetRound, addFeed, matchDecided,
  BUY_SECONDS, ROUND_SECONDS, PLANT_SECONDS, FUSE_SECONDS, ROUNDS_TO_WIN, MAX_ROUNDS,
  START_MONEY, KILL_REWARD, WIN_REWARD, LOSS_REWARD, PLANT_REWARD,
} from './state.js';
import { mulberry32 } from './rng.js';

const TICK = 1 / 60;
const SHOP_HINT = 'Buy phase — press 1-7 to buy, B to hide';
const query = new URLSearchParams(window.location.search);
const shotKind = query.get('shot');
const grain = Number.parseInt(query.get('seed') ?? '1', 10) || 1;
const seeded = mulberry32(grain);

const gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
gl.setSize(window.innerWidth, window.innerHeight);
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(gl.domElement);

const court = new THREE.Scene();
court.background = new THREE.Color(PALETTE.canvas);
court.fog = new THREE.Fog(new THREE.Color('#0d141d'), 26, 95);
const lens = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
court.add(lens);

const sfx = createAudio();
const yard = createWorld(court, grain);
const gunnery = createCombat(court);
const loadout = createWeaponRig(lens, yard.textures);
const panel = createHud();
const hero = createPlayer(yard.colliders, MAP.playerSpawn[0], MAP.playerSpawn[1]);
const squad = createBots(court, yard.colliders, yard.shootables, seeded);
const controls = createInput(gl.domElement, onCaptureChange);
const marks = yard.shootables.concat(squad.hitMeshes);
const duel = createMatchState();

const heroState = hero.state;
const hull = heroState.body;
const echo = { where: new THREE.Vector3(), when: -99 };
const aimVec = new THREE.Vector3();
// Defender-fire scratch: one volley runs per burst, so these vectors live
// here rather than being built fresh for every shot.
const muzzleVec = new THREE.Vector3();
const fwdVec = new THREE.Vector3();
const chestVec = new THREE.Vector3();
const fromVec = new THREE.Vector3();
const toVec = new THREE.Vector3();
let clock = 0;
let iced = false;
let begun = false;
let backlog = 0;
let priorStamp = performance.now();
let tickCount = 0;
let tremor = 0;
let lastClickAt = -99;
let lastChargeBeep = -99;
let lastChartAt = -99;
let priorKeys = new Set();

function ferroAlive() {
  return (duel.playerAlive ? 1 : 0) + squad.aliveCount('ferro');
}

function slagAlive() {
  return squad.aliveCount('slag');
}

function firstLivingAlly() {
  return squad.allies.find((bot) => bot.up) || null;
}

function alignLens() {
  // A dead hero spectates the first living ally from their shoulder.
  if (!duel.playerAlive && duel.phase === 'live') {
    const ally = firstLivingAlly();
    if (ally) {
      lens.position.set(ally.hull.position.x, ally.hull.position.y + 1.7, ally.hull.position.z);
      lens.rotation.set(0, ally.facing, 0, 'YXZ');
      return;
    }
  }
  lens.position.set(hull.position.x, hull.position.y + heroState.eye, hull.position.z);
  lens.rotation.set(heroState.pitch, heroState.yaw, 0, 'YXZ');
  if (tremor > 0.001) {
    lens.position.x += (seeded() * 2 - 1) * tremor * 0.12;
    lens.position.y += (seeded() * 2 - 1) * tremor * 0.12;
    tremor *= 0.86;
  }
}

function pointLens(spot) {
  const dx = spot.x - hull.position.x;
  const dy = spot.y - (hull.position.y + heroState.eye);
  const dz = spot.z - hull.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  heroState.yaw = Math.atan2(-dx, -dz);
  heroState.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  alignLens();
}

function paintPanel() {
  panel.setHealth(duel.playerHealth, loadout.state.armor);
  panel.setAmmo(loadout.state.ammo[loadout.state.current].mag, loadout.state.ammo[loadout.state.current].reserve, WEAPONS[loadout.state.current].short, loadout.state.grenades, loadout.state.smoke, loadout.state.flash);
  panel.setMoney(duel.money);
  panel.setScore(duel.wins, duel.losses, duel.round);
  panel.setAlive(ferroAlive(), slagAlive());
}

function openShop() {
  panel.hideBanner();
  panel.setObjective(SHOP_HINT);
  panel.showBuy(true, loadout.state.owned, duel.money, { grenade: loadout.state.grenades, smoke: loadout.state.smoke, flash: loadout.state.flash });
  paintPanel();
}

function pickCalledSite() {
  duel.calledSite = seeded() < 0.5 ? 'A' : 'B';
}

function beginDuel() {
  resetMatch(duel);
  pickCalledSite();
  loadout.resetRound();
  hero.reset(MAP.playerSpawn[0], MAP.playerSpawn[1]);
  squad.reset();
  panel.setPlant(null, null);
  openShop();
  begun = true;
}

function openRound() {
  duel.phase = 'live';
  duel.timer = ROUND_SECONDS;
  panel.showBuy(false);
  panel.banner(`ROUND ${duel.round}`, `Plant the charge at Site A or Site B — execute ${duel.calledSite} with your team`);
  panel.setObjective('Plant the charge at Site A or Site B');
  sfx.unlock();
}

function closeRound(won, why) {
  if (duel.phase !== 'live') return;
  duel.phase = 'roundEnd';
  duel.timer = 4.5;
  if (won) {
    duel.wins += 1;
    duel.money += WIN_REWARD;
    sfx.roundWin();
  } else {
    duel.losses += 1;
    duel.money += LOSS_REWARD;
    sfx.roundLose();
  }
  panel.banner(won ? 'ROUND WON' : 'ROUND LOST', why, 4200);
  panel.setObjective(won ? 'Round won' : 'Round lost');
  panel.setPlant(null, null);
  addFeed(duel, `${won ? 'Round won' : 'Round lost'} — ${why}`, won ? 'kill' : 'death');
  panel.feed(`${won ? 'Round won' : 'Round lost'} — ${why}`, won ? 'kill' : 'death');
  paintPanel();
  if (document.pointerLockElement) document.exitPointerLock();
}

function advanceRound() {
  if (matchDecided(duel)) {
    duel.phase = 'matchEnd';
    const wonDuel = duel.wins > duel.losses;
    panel.showOverlay('matchEnd', wonDuel
      ? `FERRO takes the match ${duel.wins} — ${duel.losses}. The yard is yours.`
      : `SLAG takes the match ${duel.losses} — ${duel.wins}. The yard holds.`);
    return;
  }
  duel.round += 1;
  resetRound(duel);
  pickCalledSite();
  hero.reset(MAP.playerSpawn[0], MAP.playerSpawn[1]);
  squad.reset();
  loadout.refillOwned();
  loadout.state.grenades = 0;
  loadout.state.smoke = 0;
  loadout.state.flash = 0;
  loadout.state.armor = false;
  openShop();
}

function onCaptureChange(captured) {
  if (shotKind) return;
  if (captured) {
    begun = true;
    panel.hideOverlay();
  } else if (duel.phase === 'live' && duel.playerAlive) {
    panel.showOverlay('paused');
  }
}

function buyGun(id) {
  const def = WEAPONS[id];
  if (loadout.state.owned.has(id) || duel.money < def.price) return false;
  duel.money -= def.price;
  loadout.buy(id);
  loadout.select(id);
  sfx.buy();
  panel.feed(`Bought ${def.name}`, 'info');
  return true;
}

function buyFrag() {
  if (loadout.state.grenades >= 2 || duel.money < GRENADE_PRICE) return false;
  duel.money -= GRENADE_PRICE;
  loadout.state.grenades += 1;
  sfx.buy();
  panel.feed('Bought Frag-7 grenade', 'info');
  return true;
}

function buySmoke() {
  if (loadout.state.smoke >= 2 || duel.money < SMOKE_PRICE) return false;
  duel.money -= SMOKE_PRICE;
  loadout.state.smoke += 1;
  sfx.buy();
  panel.feed('Bought smoke grenade', 'info');
  return true;
}

function buyFlash() {
  if (loadout.state.flash >= 2 || duel.money < FLASH_PRICE) return false;
  duel.money -= FLASH_PRICE;
  loadout.state.flash += 1;
  sfx.buy();
  panel.feed('Bought flashbang', 'info');
  return true;
}

function buyVest() {
  if (loadout.state.armor || duel.money < ARMOR_PRICE) return false;
  duel.money -= ARMOR_PRICE;
  loadout.state.armor = true;
  sfx.buy();
  panel.feed('Bought plate vest', 'info');
  return true;
}

const SHOP = {
  smg: () => buyGun('smg'),
  shotgun: () => buyGun('shotgun'),
  sniper: () => buyGun('sniper'),
  grenade: buyFrag,
  smoke: buySmoke,
  flash: buyFlash,
  armor: buyVest,
};

function purchase(id) {
  if (duel.phase !== 'buy') return;
  const sold = SHOP[id] ? SHOP[id]() : false;
  if (!sold) return;
  panel.showBuy(true, loadout.state.owned, duel.money, { grenade: loadout.state.grenades, smoke: loadout.state.smoke, flash: loadout.state.flash });
  paintPanel();
}

function hurtHero(amount, byName) {
  if (!duel.playerAlive || duel.phase !== 'live') return;
  if (loadout.state.armor) amount = Math.ceil(amount / 2);
  duel.playerHealth -= amount;
  panel.damageFlash();
  sfx.hurt();
  if (duel.playerHealth > 0) {
    paintPanel();
    return;
  }
  duel.playerHealth = 0;
  duel.playerAlive = false;
  panel.feed(`Eliminated by ${byName}`, 'death');
  addFeed(duel, `Eliminated by ${byName}`, 'death');
  paintPanel();
  if (duel.plant.status === 'planted') {
    panel.setObjective('Eliminated — the charge is still ticking');
  } else if (ferroAlive() > 0) {
    panel.setObjective('Eliminated — your team fights on');
  }
}

function onBlast(at, owner) {
  sfx.explosion();
  const foeGap = Math.hypot(at.x - hull.position.x, at.z - hull.position.z);
  if (foeGap < 12) tremor = Math.max(tremor, 1.2 - foeGap * 0.08);
  for (const bot of squad.bots) {
    if (!bot.up) continue;
    const gap = Math.hypot(at.x - bot.hull.position.x, at.z - bot.hull.position.z);
    if (gap > 6.5) continue;
    const dmg = Math.max(15, Math.round(100 - gap * 12));
    const felled = squad.damage(bot, dmg, 'torso');
    bot.quarry.copy(hull.position);
    if (felled && owner === 'player' && bot.team === 'slag') {
      duel.money += KILL_REWARD;
      duel.kills += 1;
      panel.feed(`${bot.callsign} caught in the blast (+$${KILL_REWARD})`, 'kill');
      sfx.kill();
    } else if (felled) {
      panel.feed(`${bot.callsign} caught in the blast`, bot.team === 'ferro' ? 'death' : 'kill');
    }
  }
  if (foeGap < 6.5 && duel.playerAlive) {
    hurtHero(Math.max(10, Math.round((100 - foeGap * 12) * 0.6)), 'the blast');
  }
  paintPanel();
}

function onFlash(at, owner) {
  sfx.flashPop();
  // The player: a white-out scaled by how squarely they were facing it.
  lens.getWorldDirection(fwdVec);
  const strength = util.flashStrength(lens.position, fwdVec, at, (a, b) => gunnery.hasLineOfSight(a, b, yard.shootables));
  if (strength > 0.05 && duel.playerAlive) {
    panel.flashWhite(strength, Math.round(400 + strength * 1800));
  }
  // The bots: a hard blind that stops sensing and fire while it lasts.
  for (const bot of squad.bots) {
    if (!bot.up) continue;
    fromVec.set(bot.hull.position.x, 1.5, bot.hull.position.z);
    fwdVec.set(-Math.sin(bot.facing), 0, -Math.cos(bot.facing));
    const blind = util.flashStrength(fromVec, fwdVec, at, (a, b) => gunnery.hasLineOfSight(a, b, yard.shootables));
    if (blind > 0.35) bot.flashUntil = clock + 0.5 + blind * 2.0;
  }
}

const util = createUtility(court, yard.colliders, yard.textures, onBlast, onFlash);

// The link the bots think through: their clock, the hero's whereabouts,
// the last gunshot echo, the charge, the called site, and the things they
// ask the caller to do — check a sightline (walls and smoke), fire a
// volley at a target, and throw utility at a point.
const squadCtx = {
  clock: 0,
  tick: 0,
  player: { where: hull.position, up: true, pace: 0 },
  allies: squad.allies,
  enemies: squad.enemies,
  echo,
  charge: duel.plant,
  calledSite: 'A',
  clearShot: (from, to, blockers) => gunnery.hasLineOfSight(from, to, blockers, (a, b) => util.segmentBlocked(a, b)),
  onDisarmTick: () => sfx.defuseBeep(),
  onDisarmed: () => {
    if (duel.phase === 'live' && duel.plant.status === 'planted') {
      closeRound(false, 'Charge defused by SLAG');
    }
  },
  throwUtility: (bot, kind, target) => {
    fromVec.set(bot.hull.position.x, 1.4, bot.hull.position.z);
    toVec.set(target.x - fromVec.x, target.y - fromVec.y, target.z - fromVec.z).normalize();
    const ok = kind === 'smoke'
      ? util.throwSmoke(fromVec, toVec, bot.callsign)
      : util.throwFlash(fromVec, toVec, bot.callsign);
    if (ok && kind === 'smoke') setTimeout(() => sfx.smokePop(), 1100);
    return ok;
  },
  fireAt: (bot, foe) => {
    muzzleVec.set(bot.hull.position.x, 1.4, bot.hull.position.z);
    fwdVec.set(-Math.sin(bot.facing), 0, -Math.cos(bot.facing));
    muzzleVec.addScaledVector(fwdVec, 0.4);
    const isPlayer = foe.ref === null;
    const targetPos = foe.where;
    const targetPace = isPlayer ? hero.groundSpeed() : Math.hypot(foe.ref.hull.velocity.x, foe.ref.hull.velocity.z);
    const targetCrouch = isPlayer ? heroState.crouching : false;
    chestVec.set(targetPos.x, targetPos.y + 1.2, targetPos.z);
    const dist = muzzleVec.distanceTo(chestVec);
    aimVec.copy(chestVec).sub(muzzleVec).normalize();
    const spread = 0.02 + dist * 0.0012 + (targetPace > 3 ? 0.01 : 0) - (targetCrouch ? 0.006 : 0);
    // The ray has to clear the yard first; a wall between shooter and
    // target stops the shot even when the hit roll would have landed.
    const hit = gunnery.shoot(muzzleVec, aimVec, spread, seeded, yard.shootables, 1);
    if (hit && hit.distance < dist - 0.5) return;
    const chance = Math.max(0.06, Math.min(0.38, 0.42 - dist * 0.007 - targetPace * 0.025 - (targetCrouch ? 0.1 : 0)));
    if (seeded() < chance) {
      const head = seeded() < 0.12;
      const dmg = Math.round(11 * (head ? 2 : 1) * (dist > 25 ? 0.7 : 1));
      if (isPlayer) {
        hurtHero(dmg, bot.callsign);
      } else {
        const victim = foe.ref;
        const felled = squad.damage(victim, dmg, head ? 'head' : 'torso');
        if (felled) {
          panel.feed(`${bot.callsign} eliminated ${victim.callsign}${head ? ' (headshot)' : ''}`, victim.team === 'ferro' ? 'death' : 'kill');
          addFeed(duel, `${bot.callsign} eliminated ${victim.callsign}`, victim.team === 'ferro' ? 'death' : 'kill');
          paintPanel();
        }
      }
    }
    sfx.enemyShot();
  },
};

function fire(spreadLock) {
  const def = loadout.def();
  if (!loadout.takeRound()) {
    if (clock - lastClickAt > 0.3) {
      lastClickAt = clock;
      sfx.dry();
    }
    return false;
  }
  lens.getWorldDirection(aimVec);
  const spread = spreadLock === 0 ? 0 : loadout.spread(hero.groundSpeed(), heroState.crouching, !hull.onGround);
  const origin = lens.position;
  const hit = gunnery.shoot(origin, aimVec, spread, seeded, marks, def.pellets);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const falloff = hit.distance > 25 ? 0.75 : 1;
    const dmg = Math.round(def.damage * (hit.part === 'head' ? def.headMult : 1) * falloff);
    bot.quarry.copy(hull.position);
    const felled = squad.damage(bot, dmg, hit.part);
    panel.hitMarker(felled, shotKind ? 4000 : 90);
    if (felled) {
      if (bot.team === 'slag') {
        duel.money += KILL_REWARD;
        duel.kills += 1;
        panel.feed(`${bot.callsign} eliminated ${hit.part === 'head' ? '(headshot)' : ''} (+$${KILL_REWARD})`, 'kill');
        sfx.kill();
      } else {
        panel.feed(`Friendly fire — ${bot.callsign} down`, 'death');
        sfx.kill();
      }
    } else {
      sfx.hit();
    }
    paintPanel();
  }
  loadout.pullTrigger();
  sfx.shot(def.id);
  hero.recoil(def.recoil + seeded() * 0.004, (seeded() * 2 - 1) * 0.004);
  echo.where.copy(hull.position);
  echo.when = clock;
  panel.setAmmo(loadout.state.ammo[loadout.state.current].mag, loadout.state.ammo[loadout.state.current].reserve, def.short, loadout.state.grenades, loadout.state.smoke, loadout.state.flash);
  return true;
}

function chargeStep(dt, keys) {
  const charge = duel.plant;
  if (charge.status === 'planted') {
    charge.fuse -= dt;
    panel.setPlant(null, charge.fuse, `CHARGE FUSE — SITE ${charge.site.id}`);
    if (charge.fuse <= 0) {
      sfx.explosion();
      tremor = 2;
      closeRound(true, `Charge detonated at Site ${charge.site.id}`);
    }
    return;
  }
  let site = null;
  for (const candidate of MAP.sites) {
    const dist = Math.hypot(candidate.x - hull.position.x, candidate.z - hull.position.z);
    if (dist < MAP.plantRadius) {
      site = candidate;
      break;
    }
  }
  if (site && duel.playerAlive && keys.has('KeyE')) {
    charge.progress += dt;
    if (clock - lastChargeBeep > 0.5) {
      lastChargeBeep = clock;
      sfx.plantBeep();
    }
    panel.setPlant(charge.progress / PLANT_SECONDS, null, 'PLANTING THE CHARGE');
    if (charge.progress >= PLANT_SECONDS) {
      charge.status = 'planted';
      charge.site = site;
      charge.progress = 0;
      charge.fuse = FUSE_SECONDS;
      duel.money += PLANT_REWARD;
      sfx.plantDone();
      panel.banner('CHARGE PLANTED', `Defend Site ${site.id} — 35 seconds to detonation`, 3000);
      panel.feed(`Charge planted at Site ${site.id} (+$${PLANT_REWARD})`, 'objective');
      panel.setObjective(`Charge planted — defend Site ${site.id}`);
      paintPanel();
    }
  } else {
    charge.progress = Math.max(0, charge.progress - dt * 2);
    if (charge.progress > 0) panel.setPlant(charge.progress / PLANT_SECONDS, null, 'PLANTING THE CHARGE');
    else panel.setPlant(null, null);
  }
}

function tick(dt) {
  clock += dt;
  squadCtx.clock = clock;
  squadCtx.tick = tickCount;
  squadCtx.calledSite = duel.calledSite;
  squadCtx.player.up = duel.playerAlive;
  squadCtx.player.pace = hero.groundSpeed();
  yard.step(dt);
  if (duel.phase === 'buy') {
    duel.timer -= dt;
    if (duel.playerAlive) hero.step(dt, controls.state.keys);
    loadout.step(dt);
    if (duel.timer <= 0) openRound();
  } else if (duel.phase === 'live') {
    if (duel.plant.status !== 'planted') duel.timer -= dt;
    if (duel.playerAlive) hero.step(dt, controls.state.keys);
    loadout.step(dt);
    squad.step(dt, squadCtx);
    util.step(dt, clock);
    gunnery.step(dt);
    // A dead hero still needs the fuse to run down to detonation.
    if (duel.playerAlive || duel.plant.status === 'planted') chargeStep(dt, controls.state.keys);
    if (duel.phase === 'live' && slagAlive() === 0) {
      closeRound(true, duel.plant.status === 'planted' ? 'Site secured' : 'SLAG team eliminated');
    } else if (duel.phase === 'live' && ferroAlive() === 0 && duel.plant.status !== 'planted') {
      closeRound(false, 'FERRO team eliminated');
    } else if (duel.phase === 'live' && duel.plant.status !== 'planted' && duel.timer <= 0) {
      closeRound(false, 'Time expired — charge never planted');
    }
  } else if (duel.phase === 'roundEnd') {
    duel.timer -= dt;
    loadout.step(dt);
    util.step(dt, clock);
    gunnery.step(dt);
    if (duel.timer <= 0) advanceRound();
  } else {
    loadout.step(dt);
    gunnery.step(dt);
  }
  if (tremor > 0.001) tremor *= Math.pow(0.02, dt);
  alignLens();
}

function justPressed(code) {
  return controls.state.keys.has(code) && !priorKeys.has(code);
}

const SHOP_KEYS = { Digit1: 'smg', Digit2: 'shotgun', Digit3: 'grenade', Digit4: 'armor', Digit5: 'sniper', Digit6: 'smoke', Digit7: 'flash' };
const SWAP_KEYS = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'pistol', Digit5: 'sniper' };

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - priorStamp) / 1000, 0.1);
  priorStamp = now;
  tickCount += 1;
  if (!iced) {
    const look = controls.takeLook();
    hero.look(look.x, look.y);
    const keys = controls.state.keys;
    // Scope: right mouse, only on the scoped rifle. The field of view
    // eases toward the zoom instead of snapping.
    const wantScope = controls.state.aiming && loadout.def().scoped;
    loadout.state.aiming = wantScope;
    const targetFov = wantScope ? 26 : 74;
    if (Math.abs(lens.fov - targetFov) > 0.2) {
      lens.fov += (targetFov - lens.fov) * Math.min(1, dt * 14);
      lens.updateProjectionMatrix();
    }
    panel.setScoped(wantScope);
    if (duel.phase === 'buy') {
      for (const [code, id] of Object.entries(SHOP_KEYS)) {
        if (justPressed(code)) purchase(id);
      }
      if (justPressed('KeyB')) panel.showBuy(document.getElementById('buy').hidden, loadout.state.owned, duel.money, { grenade: loadout.state.grenades, smoke: loadout.state.smoke, flash: loadout.state.flash });
    } else if (duel.phase === 'live') {
      for (const [code, id] of Object.entries(SWAP_KEYS)) {
        if (justPressed(code)) loadout.select(id);
      }
      if (justPressed('KeyG') && loadout.state.grenades > 0 && duel.playerAlive) {
        lens.getWorldDirection(aimVec);
        if (util.throwFrag(lens.position, aimVec, 'player')) {
          loadout.state.grenades -= 1;
          paintPanel();
        }
      }
      if (justPressed('KeyH') && loadout.state.smoke > 0 && duel.playerAlive) {
        lens.getWorldDirection(aimVec);
        if (util.throwSmoke(lens.position, aimVec, 'player')) {
          loadout.state.smoke -= 1;
          setTimeout(() => sfx.smokePop(), 1100);
          paintPanel();
        }
      }
      if (justPressed('KeyJ') && loadout.state.flash > 0 && duel.playerAlive) {
        lens.getWorldDirection(aimVec);
        if (util.throwFlash(lens.position, aimVec, 'player')) {
          loadout.state.flash -= 1;
          paintPanel();
        }
      }
      if (controls.state.firing && loadout.ready() && duel.playerAlive) fire();
      if (keys.has('KeyR')) loadout.reload();
    }
    priorKeys = new Set(keys);
    backlog += dt;
    let steps = 0;
    while (backlog >= TICK && steps < 5) {
      tick(TICK);
      backlog -= TICK;
      steps += 1;
    }
    if (backlog > TICK * 5) backlog = 0;
    panel.setSpread(3 + loadout.spread(hero.groundSpeed(), heroState.crouching, !hull.onGround) * 400);
    if (clock - lastChartAt > 0.15) {
      lastChartAt = clock;
      panel.drawMinimap(hull.position.x, hull.position.z, heroState.yaw, squad.positions(), duel.plant, clock);
    }
    if (duel.phase === 'buy') panel.setTimer(duel.timer, 'buy');
    else if (duel.phase === 'live') panel.setTimer(duel.plant.status === 'planted' ? duel.plant.fuse : duel.timer, duel.plant.status === 'planted' ? 'fuse' : 'live');
    else panel.setTimer(duel.timer, duel.phase);
  }
  gl.render(court, lens);
}

function simmer(n) {
  for (let i = 0; i < n; i += 1) tick(TICK);
}

function stageBot(i, x, z, facing, mode) {
  const bot = squad.bots[i];
  bot.hull.position.set(x, 0, z);
  bot.hull.velocity.set(0, 0, 0);
  bot.rig.position.set(x, 0, z);
  bot.facing = facing;
  bot.mode = mode;
  bot.rig.rotation.y = facing;
}

function dropBotForShot(i, x, z) {
  const bot = squad.bots[i];
  bot.up = false;
  bot.topple = 1;
  bot.mode = 'down';
  bot.hull.position.set(x, 0, z);
  bot.rig.position.set(x, -0.08, z);
  bot.rig.rotation.x = -1.45;
}

function stageShot(name) {
  panel.hideOverlay();
  panel.hideBanner();
  loadout.resetRound();
  squad.reset();
  Object.assign(duel, { wins: 0, losses: 0, money: START_MONEY, kills: 0 });
  // squad.bots is allies 0-3 then enemies 4-8.
  switch (name) {
    case 'start': {
      Object.assign(duel, { phase: 'buy', round: 1, timer: BUY_SECONDS });
      hero.reset(0, 13.5);
      stageBot(0, -3.5, 10.5, 0, 'overwatch');
      stageBot(1, 3.5, 10.5, 0, 'overwatch');
      stageBot(4, -8, -2, Math.PI, 'overwatch');
      stageBot(5, 0, -4, Math.PI, 'overwatch');
      stageBot(6, 8, -2, Math.PI, 'overwatch');
      stageBot(7, -14, -8, Math.PI * 0.75, 'overwatch');
      stageBot(8, 10, -9, Math.PI * 1.2, 'overwatch');
      simmer(20);
      pointLens(new THREE.Vector3(0, 1.4, -8));
      panel.showBuy(false);
      panel.setObjective(SHOP_HINT);
      panel.showOverlay('start');
      paintPanel();
      break;
    }
    case 'play': {
      Object.assign(duel, { phase: 'live', round: 1, wins: 1, timer: 71, money: 1100, playerHealth: 82, kills: 1 });
      hero.reset(0, 6);
      loadout.state.ammo.rifle = { mag: 24, reserve: 90 };
      loadout.state.grenades = 1;
      loadout.state.smoke = 1;
      loadout.state.flash = 1;
      stageBot(0, -4, 8, 0, 'overwatch');
      stageBot(1, 4, 8, 0, 'overwatch');
      stageBot(4, -8, -2, Math.PI, 'overwatch');
      stageBot(5, 0, -6, Math.PI, 'overwatch');
      stageBot(6, -6, -8, Math.PI * 0.8, 'overwatch');
      stageBot(7, 10, -9, Math.PI * 1.2, 'overwatch');
      simmer(20);
      // A live smoke cloud mid-frame: an ally's execute smoke, placed in
      // the open mid-lane so the utility reads in the screenshot, then
      // given time to swell before the capture.
      util.placeCloud(new THREE.Vector3(2.5, 0.6, -2.5), clock);
      simmer(75);
      pointLens(new THREE.Vector3(0, 1.58, -6));
      fire(0);
      loadout.step(0);
      dropBotForShot(5, 0, -6);
      simmer(1);
      panel.setObjective('Plant the charge at Site A or B');
      paintPanel();
      panel.setHealth(82, false);
      panel.setAmmo(23, 90, 'HALBERD', 1, 1, 1);
      break;
    }
    case 'buy': {
      Object.assign(duel, { phase: 'buy', round: 2, wins: 1, timer: 12, money: 1400 });
      hero.reset(0, 13.5);
      loadout.buy('smg');
      duel.money = 1400;
      stageBot(0, -4, 12, 0, 'overwatch');
      stageBot(1, 4, 12, 0, 'overwatch');
      stageBot(4, -16, -13.5, Math.PI, 'overwatch');
      stageBot(5, -5, -13.5, Math.PI, 'overwatch');
      stageBot(6, 5, -13.5, Math.PI, 'overwatch');
      stageBot(7, 16, -13.5, Math.PI, 'overwatch');
      simmer(20);
      pointLens(new THREE.Vector3(0, 1.4, -8));
      panel.showBuy(true, loadout.state.owned, 1400, { grenade: 0, smoke: 0, flash: 0 });
      panel.setObjective(SHOP_HINT);
      paintPanel();
      break;
    }
    default: {
      Object.assign(duel, { phase: 'roundEnd', round: 3, wins: 2, losses: 1, timer: 4.5, money: 1425, playerHealth: 64 });
      hero.reset(0, 2);
      loadout.state.ammo.rifle = { mag: 12, reserve: 90 };
      dropBotForShot(4, -12, -9);
      dropBotForShot(5, -15, -12);
      stageBot(0, -3, 4, 0, 'overwatch');
      stageBot(6, 8, -6, Math.PI, 'overwatch');
      stageBot(7, 14, -8, Math.PI, 'overwatch');
      simmer(20);
      pointLens(new THREE.Vector3(-14, 1.4, -11));
      panel.feed('Charge detonated at Site A (+$325)', 'objective');
      panel.feed('RUST eliminated (+$300)', 'kill');
      panel.setObjective('Round won');
      panel.showOverlay('roundEnd', 'FERRO 2 — 1 SLAG · Charge detonated at Site A');
      paintPanel();
      panel.setHealth(64, true);
      panel.setAmmo(12, 90, 'HALBERD', 0, 0, 0);
      break;
    }
  }
  panel.setTimer(duel.timer, duel.phase);
  panel.drawMinimap(hull.position.x, hull.position.z, heroState.yaw, squad.positions(), duel.plant, clock);
  renderTwiceThenSignal();
}

function renderTwiceThenSignal() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    alignLens();
    gl.render(court, lens);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      iced = true;
    }
  }
  requestAnimationFrame(paint);
}

panel.onPlay(() => {
  if (shotKind) return;
  sfx.unlock();
  if (duel.phase === 'menu' || duel.phase === 'matchEnd') beginDuel();
  controls.requestLock();
});

gl.domElement.addEventListener('click', () => {
  if (shotKind || duel.phase === 'menu' || duel.phase === 'matchEnd') return;
  if (!controls.state.locked && duel.phase !== 'roundEnd') controls.requestLock();
});

panel.onBuy((id) => purchase(id));

window.addEventListener('resize', () => {
  lens.aspect = window.innerWidth / window.innerHeight;
  lens.updateProjectionMatrix();
  gl.setSize(window.innerWidth, window.innerHeight);
});

// Read-only snapshot for automated checks: phase, score, team strength,
// utility state. It never mutates anything.
window.__ASHLINE = {
  snapshot() {
    return {
      phase: duel.phase,
      round: duel.round,
      wins: duel.wins,
      losses: duel.losses,
      money: duel.money,
      timer: Math.round(duel.timer * 10) / 10,
      playerHealth: duel.playerHealth,
      playerAlive: duel.playerAlive,
      ferroAlive: ferroAlive(),
      slagAlive: slagAlive(),
      kills: duel.kills,
      calledSite: duel.calledSite,
      plant: duel.plant.status,
      clouds: util.cloudCount(),
      flying: util.anyFlying(),
      grenades: loadout.state.grenades,
      smoke: loadout.state.smoke,
      flash: loadout.state.flash,
      weapon: loadout.state.current,
      owned: [...loadout.state.owned],
    };
  },
};

alignLens();
paintPanel();
if (shotKind) stageShot(shotKind);
else requestAnimationFrame(loop);
