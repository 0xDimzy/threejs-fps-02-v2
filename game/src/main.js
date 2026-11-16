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
import { createWeaponRig, WEAPONS, WEAPON_ORDER, GRENADE_PRICE, SMOKE_PRICE, FLASH_PRICE, ARMOR_PRICE, ARMOR_HELM_PRICE, KIT_PRICE } from './weapons.js';
import { createCombat, resolveDamage } from './combat.js';
import { createBots } from './bots.js';
import { createUtility, FRAG_RADIUS } from './utility.js';
import { createAudio } from './audio.js';
import { showMenu, hideMenu, isMenuVisible, flashBanner, hideBanner, flashWhite, fadeFlash, updateHud } from './hud.js';
import {
  createMatchState, resetMatch, resetRound, addFeed, matchDecided, lossBonus,
  BUY_SECONDS, ROUND_SECONDS, PLANT_SECONDS, FUSE_SECONDS, DEFUSE_SECONDS,
  DEFUSE_KIT_SECONDS, ROUNDS_TO_WIN, MAX_ROUNDS, START_MONEY, KILL_REWARD,
  KNIFE_REWARD, WIN_REWARD, PLANT_REWARD, DEFUSE_REWARD, BUY_KEYS, CATALOG,
} from './state.js';
import { mulberry32, range } from './rng.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;
const seeded = mulberry32(seed);
const shotMode = params.get('shot') || null;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0e13');
scene.fog = new THREE.Fog(new THREE.Color('#0a0e13'), 30, 95);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene, seed);
const colliders = world.colliders;
const shootables = world.shootables;
const audio = createAudio();
const combat = createCombat(scene);
const bots = createBots(scene, colliders, shootables, seeded);
const rig = createWeaponRig(camera, world.textures);
const match = createMatchState();

// Spawns must clear every collider: the yard's lamp posts are solid
// cylinders with AABB colliders, and the old attack spawn (-19, 12) sat
// 0.64 m from the (-18.5, 12.5) post — inside its box — pinning the
// player in place. MAP.playerSpawn (0, 13.5) is the designed, clear
// attack spawn; (0, -13) is the clear defend spawn.
const PLAYER_SPAWNS = { attack: [0, 13.5], defend: [0, -13] };
const player = createPlayer(colliders, PLAYER_SPAWNS.attack[0], PLAYER_SPAWNS.attack[1]);

const sim = {
  clock: 0,
  tick: 0,
  paused: false,
  echo: { when: -99, where: new THREE.Vector3() },
  radio: null,
  fuseLeft: FUSE_SECONDS,
  plantProgress: 0,
  defuseProgress: 0,
  defuser: null,
  postTimer: 0,
  roundWinner: null,
  roundReason: '',
  blindUntil: -99,
  blindStrength: 0,
  purchased: new Set(),
  frozen: false,
  shotFrames: 0,
};

function siteById(id) {
  return MAP.sites.find((s) => s.id === id) || MAP.sites[0];
}

function feedLine(text, kind) {
  addFeed(match, text, kind);
}

function gunNameFor(bot) {
  if (bot.gunDmg >= 12) return 'HALBERD';
  if (bot.gunDmg >= 10) return 'HORNET';
  return 'SPARROW';
}

// --- charge handling -------------------------------------------------------
function dropCharge(x, z, who) {
  match.plant.status = 'dropped';
  match.plant.carrier = null;
  match.plant.x = x;
  match.plant.z = z;
  match.plant.progress = 0;
  world.showCharge(x, z);
  feedLine(`${who} dropped the charge`, 'warn');
}

function onBotKilled(bot, killerName, weaponName, reward) {
  feedLine(`${killerName} ▸ ${bot.callsign} [${weaponName}]`, 'kill');
  if (killerName === 'YOU') {
    match.kills += 1;
    match.money += reward;
    audio.kill();
  }
  if (bot.carrying) {
    bot.carrying = false;
    bot.chargeMark.visible = false;
    dropCharge(bot.hull.position.x, bot.hull.position.z, bot.callsign);
  }
}

function damagePlayer(amount, fromName) {
  if (!match.playerAlive || match.phase !== 'round') return;
  let dmg = amount;
  if (rig.state.armor > 0) dmg = Math.ceil(dmg * 0.5);
  match.playerHealth -= dmg;
  audio.hurt();
  if (match.playerHealth > 0) return;
  match.playerHealth = 0;
  match.playerAlive = false;
  feedLine(`${fromName} ▸ YOU`, 'death');
  if (match.plant.status === 'carried' && match.plant.carrier === 'player') {
    dropCharge(player.state.body.position.x, player.state.body.position.z, 'YOU');
  }
}

// --- utility callbacks -----------------------------------------------------
function clearShotFn(from, to) {
  return combat.hasLineOfSight(from, to, shootables, (a, b) => utility.segmentBlocked(a, b));
}

const eyeTmp = new THREE.Vector3();
const fwdTmp = new THREE.Vector3();
const burstTmp = new THREE.Vector3();

function onBlast(pos, owner) {
  audio.boom();
  const victims = [];
  const pb = player.state.body.position;
  const pd = Math.hypot(pb.x - pos.x, pb.z - pos.z);
  if (match.playerAlive && pd < FRAG_RADIUS) victims.push({ kind: 'player', dist: pd });
  for (const bot of bots.bots) {
    if (!bot.up) continue;
    const d = Math.hypot(bot.hull.position.x - pos.x, bot.hull.position.z - pos.z);
    if (d < FRAG_RADIUS) victims.push({ kind: 'bot', bot, dist: d });
  }
  for (const v of victims) {
    const dmg = Math.max(10, Math.round(140 * (1 - v.dist / FRAG_RADIUS)));
    if (v.kind === 'player') {
      damagePlayer(dmg, owner === 'player' ? 'YOUR FRAG' : 'FRAG');
    } else {
      const killed = bots.damage(v.bot, dmg, 'torso');
      if (killed) {
        const killer = owner === 'player' ? 'YOU' : (bots.bots.find((b) => b === owner) || {}).callsign || 'FRAG';
        onBotKilled(v.bot, killer, 'FRAG', KILL_REWARD);
      }
    }
  }
}

function onFlash(pos, owner) {
  audio.flash();
  if (match.playerAlive) {
    eyeTmp.set(player.state.body.position.x, player.state.eye, player.state.body.position.z);
    fwdTmp.set(-Math.sin(player.state.yaw), 0, -Math.cos(player.state.yaw));
    const s = utility.flashStrength(eyeTmp, fwdTmp, pos, clearShotFn);
    if (s > 0.12) {
      sim.blindUntil = sim.clock + s * 4;
      sim.blindStrength = s;
      flashWhite(s);
    }
  }
  for (const bot of bots.bots) {
    if (!bot.up) continue;
    burstTmp.set(bot.hull.position.x, 1.5, bot.hull.position.z);
    fwdTmp.set(-Math.sin(bot.facing), 0, -Math.cos(bot.facing));
    const s = utility.flashStrength(burstTmp, fwdTmp, pos, clearShotFn);
    if (s > 0.12) bot.flashUntil = sim.clock + s * 4;
  }
}

const utility = createUtility(scene, colliders, world.textures, onBlast, onFlash);

function throwUtilityFrom(bot, kind, target) {
  const from = new THREE.Vector3(bot.hull.position.x, 1.4, bot.hull.position.z);
  const dir = new THREE.Vector3(target.x - from.x, (target.y || 1.2) - from.y, target.z - from.z).normalize();
  if (kind === 'frag') utility.throwFrag(from, dir, bot);
  else if (kind === 'smoke') utility.throwSmoke(from, dir, bot);
  else utility.throwFlash(from, dir, bot);
}

// --- bot fire resolution ---------------------------------------------------
function fireAt(bot, foe, settle) {
  const from = new THREE.Vector3(bot.hull.position.x, 1.5, bot.hull.position.z);
  const to = new THREE.Vector3(foe.where.x, foe.where.y + 1.2, foe.where.z);
  const dist = from.distanceTo(to);
  const pace = foe.pace || 0;
  let p = 0.62 * settle;
  p -= Math.max(0, dist - 10) * 0.006;
  p -= pace * 0.05;
  if (foe.ref === null && player.state.crouching) p += 0.08;
  p = Math.max(0.08, Math.min(0.9, p));
  sim.echo.when = sim.clock;
  sim.echo.where.copy(from);
  if (seeded() >= p) return;
  const def = { damage: bot.gunDmg, headMult: 2, falloff: [25, 0.75], pen: 0.4 };
  combat.showImpact(to);
  if (foe.ref === null) {
    const dmg = resolveDamage(def, 'torso', dist, rig.state.armor);
    damagePlayer(dmg, bot.callsign);
    return;
  }
  const dmg = resolveDamage(def, 'torso', dist, foe.ref.armor);
  const killed = bots.damage(foe.ref, dmg, 'torso');
  if (killed) onBotKilled(foe.ref, bot.callsign, gunNameFor(bot), 0);
}

// --- bots feed ---------------------------------------------------------------
const feed = {
  get clock() { return sim.clock; },
  get tick() { return sim.tick; },
  player: { where: player.state.body.position, up: true, pace: 0 },
  allies: bots.allies,
  enemies: bots.enemies,
  echo: sim.echo,
  charge: {
    get status() { return match.plant.status; },
    get site() { return match.plant.site; },
    get x() { return match.plant.x; },
    get z() { return match.plant.z; },
  },
  get calledSite() { return match.calledSite; },
  plan: bots.plan(),
  get radio() { return sim.radio; },
  set radio(v) { sim.radio = v; },
  clearShot: clearShotFn,
  onDisarmTick: () => audio.defuseBeep(),
  onDisarmed: (bot) => {
    endRound(bot.team === 'ferro' ? 'ferro' : 'slag', `${bot.callsign} defused the charge`);
  },
  onPlantTick: () => audio.plantBeep(),
  onPlanted: (site, bot) => {
    match.plant.status = 'planted';
    match.plant.site = site;
    match.plant.carrier = null;
    sim.fuseLeft = FUSE_SECONDS;
    audio.planted();
    feedLine(`${bot.callsign} planted the charge at ${site.id}`, 'warn');
  },
  onPickup: (bot) => {
    match.plant.status = 'carried';
    match.plant.carrier = 'enemy';
    match.plant.x = bot.hull.position.x;
    match.plant.z = bot.hull.position.z;
    world.hideCharge();
    audio.pickup();
    feedLine(`${bot.callsign} picked up the charge`, 'warn');
  },
  throwUtility: throwUtilityFrom,
  fireAt,
};

// --- input -------------------------------------------------------------------
const input = createInput(renderer.domElement, (locked) => {
  if (!locked && match.phase === 'round' && !shotMode) {
    sim.paused = true;
    flashBanner('PAUSED\nclick to resume', PALETTE.siteB);
  } else if (locked && sim.paused) {
    sim.paused = false;
    hideBanner();
  }
});

renderer.domElement.addEventListener('click', () => {
  if (match.phase === 'menu') {
    startMatch();
    input.requestLock();
  } else if (match.phase === 'matchEnd') {
    startMatch();
    input.requestLock();
  } else if (sim.paused || !input.state.locked) {
    input.requestLock();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (match.phase === 'buy') {
    if (event.code === 'KeyG') {
      if (isMenuVisible()) hideMenu();
      else showMenu(CATALOG, match.money, sim.purchased, match.plant.carrier === 'player');
      return;
    }
    if (event.code === 'KeyZ' || event.code === 'KeyX') {
      const site = event.code === 'KeyZ' ? 'A' : 'B';
      match.calledSite = site;
      match.plant.site = siteById(site);
      bots.plan().site = site;
      if (isMenuVisible()) showMenu(CATALOG, match.money, sim.purchased, match.plant.carrier === 'player');
      return;
    }
    const itemId = BUY_KEYS[event.code];
    if (itemId) buyItem(itemId);
    return;
  }
  if (match.phase === 'round') {
    if (event.code === 'KeyR') {
      rig.reload();
      audio.reload();
    }
    if (event.code === 'KeyQ') {
      const idx = WEAPON_ORDER.indexOf(rig.state.current);
      rig.select(WEAPON_ORDER[(idx + 1) % WEAPON_ORDER.length]);
    }
    if (event.code.startsWith('Digit')) {
      const n = parseInt(event.code.slice(5), 10);
      if (n >= 1 && n <= WEAPON_ORDER.length) rig.select(WEAPON_ORDER[n - 1]);
    }
    if (event.code === 'KeyF') throwPlayerUtility('frag');
    if (event.code === 'KeyV') throwPlayerUtility('smoke');
    if (event.code === 'KeyB') throwPlayerUtility('flash');
    if (event.code === 'KeyM') audio.mute();
  }
});

function buyItem(itemId) {
  const item = CATALOG[itemId];
  if (!item) return;
  if (sim.purchased.has(itemId)) {
    audio.denied();
    return;
  }
  if (match.money < item.price) {
    audio.denied();
    return;
  }
  if (itemId === 'rifle2' || itemId === 'smg' || itemId === 'shotgun' || itemId === 'sniper') {
    const price = rig.buy(itemId);
    if (price < 0) {
      audio.denied();
      return;
    }
    match.money -= price;
    rig.select(itemId);
  } else if (itemId === 'vest') {
    if (rig.state.armor >= 1) { audio.denied(); return; }
    rig.state.armor = 1;
    match.money -= item.price;
  } else if (itemId === 'vesthelm') {
    if (rig.state.armor >= 2) { audio.denied(); return; }
    rig.state.armor = 2;
    match.money -= item.price;
  } else if (itemId === 'kit') {
    if (rig.state.kit) { audio.denied(); return; }
    rig.state.kit = true;
    match.money -= item.price;
  } else if (itemId === 'frag') {
    if (rig.state.grenades >= 2) { audio.denied(); return; }
    rig.state.grenades += 1;
    match.money -= item.price;
  } else if (itemId === 'smoke') {
    if (rig.state.smoke >= 2) { audio.denied(); return; }
    rig.state.smoke += 1;
    match.money -= item.price;
  } else if (itemId === 'flash') {
    if (rig.state.flash >= 2) { audio.denied(); return; }
    rig.state.flash += 1;
    match.money -= item.price;
  }
  sim.purchased.add(itemId);
  audio.buy();
  if (isMenuVisible()) showMenu(CATALOG, match.money, sim.purchased, match.plant.carrier === 'player');
}

function throwPlayerUtility(kind) {
  if (!match.playerAlive || match.phase !== 'round') return;
  const count = kind === 'frag' ? rig.state.grenades : kind === 'smoke' ? rig.state.smoke : rig.state.flash;
  if (count <= 0) {
    audio.denied();
    return;
  }
  const from = new THREE.Vector3(
    player.state.body.position.x,
    player.state.body.position.y + player.state.eye,
    player.state.body.position.z,
  );
  const dir = new THREE.Vector3(-Math.sin(player.state.yaw) * Math.cos(player.state.pitch), Math.sin(player.state.pitch), -Math.cos(player.state.yaw) * Math.cos(player.state.pitch)).normalize();
  let ok = false;
  if (kind === 'frag') ok = utility.throwFrag(from, dir, 'player');
  else if (kind === 'smoke') ok = utility.throwSmoke(from, dir, 'player');
  else ok = utility.throwFlash(from, dir, 'player');
  if (!ok) return;
  if (kind === 'frag') rig.state.grenades -= 1;
  else if (kind === 'smoke') rig.state.smoke -= 1;
  else rig.state.flash -= 1;
}

// --- round machine -----------------------------------------------------------
function startMatch() {
  resetMatch(match);
  hideBanner();
  startRound();
}

function startRound() {
  resetRound(match);
  match.calledSite = seeded() < 0.5 ? 'A' : 'B';
  match.plant.site = siteById(match.calledSite);
  match.plant.status = 'carried';
  sim.clock = 0;
  sim.fuseLeft = FUSE_SECONDS;
  sim.plantProgress = 0;
  sim.defuseProgress = 0;
  sim.defuser = null;
  sim.blindUntil = -99;
  sim.blindStrength = 0;
  sim.purchased = new Set();
  sim.paused = false;
  const spawn = match.swapped ? PLAYER_SPAWNS.defend : PLAYER_SPAWNS.attack;
  player.reset(spawn[0], spawn[1]);
  player.state.yaw = match.swapped ? Math.PI : 0;
  rig.resetRound();
  bots.reset(match.swapped, match.calledSite, match.round);
  world.hideCharge();
  showMenu(CATALOG, match.money, sim.purchased, match.plant.carrier === 'player');
  feedLine(`R${match.round} · ${match.swapped ? 'FERRO def' : 'FERRO atk'} · call ${match.calledSite}`, 'info');
}

function beginRound() {
  match.phase = 'round';
  match.timer = ROUND_SECONDS;
  sim.clock = 0;
  hideMenu();
  audio.round();
  flashBanner(`ROUND ${match.round}\nplant at ${match.calledSite} — first to ${ROUNDS_TO_WIN}`, PALETTE.accent);
  setTimeout(() => { if (match.phase === 'round') hideBanner(); }, 2200);
}

function endRound(winner, reason) {
  if (match.phase !== 'round') return;
  match.phase = 'post';
  sim.postTimer = 3.5;
  sim.roundWinner = winner;
  sim.roundReason = reason;
  if (winner === 'ferro') {
    match.wins += 1;
    match.lossStreak = 0;
    match.money += WIN_REWARD;
  } else {
    match.losses += 1;
    match.lossStreak += 1;
    match.money += lossBonus(match);
  }
  hideMenu();
  audio.round();
  const score = `${match.wins} — ${match.losses}`;
  flashBanner(`${winner === 'ferro' ? 'FERRO' : 'SLAG'} WINS THE ROUND\n${reason}\n${score}`, winner === 'ferro' ? PALETTE.ally : PALETTE.accent);
  feedLine(`${winner === 'ferro' ? 'FERRO' : 'SLAG'} wins the round — ${reason}`, 'info');
}

function endMatch() {
  match.phase = 'matchEnd';
  const winner = match.wins >= ROUNDS_TO_WIN ? 'FERRO' : 'SLAG';
  flashBanner(`${winner} WINS THE MATCH\n${match.wins} — ${match.losses}\nclick to play again`, winner === 'ferro' ? PALETTE.ally : PALETTE.accent);
  feedLine(`${winner} wins the match ${match.wins} — ${match.losses}`, 'info');
}

// --- player combat -----------------------------------------------------------
const shootDir = new THREE.Vector3();
const shootOrigin = new THREE.Vector3();

function playerFire() {
  const def = rig.def();
  if (!rig.ready()) {
    if (rig.state.ammo[rig.state.current].mag === 0 && !def.melee) {
      rig.reload();
      audio.reload();
    }
    return;
  }
  if (!rig.takeRound()) return;
  rig.pullTrigger();
  const [pitchKick, yawKick] = rig.recoilStep();
  player.recoil(pitchKick, yawKick);
  audio.shot(def.id === 'rifle' || def.id === 'rifle2' ? 'rifle' : def.id === 'smg' ? 'smg' : def.id === 'shotgun' ? 'shotgun' : def.id === 'sniper' ? 'sniper' : 'pistol');
  const p = player.state;
  shootOrigin.set(p.body.position.x, p.body.position.y + p.eye, p.body.position.z);
  shootDir.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)).normalize();
  if (def.melee) {
    let best = null;
    let bestGap = def.range;
    for (const bot of bots.enemies) {
      if (!bot.up) continue;
      const dx = bot.hull.position.x - p.body.position.x;
      const dz = bot.hull.position.z - p.body.position.z;
      const gap = Math.hypot(dx, dz);
      if (gap >= bestGap) continue;
      const dot = (dx / gap) * shootDir.x + (dz / gap) * shootDir.z;
      if (dot < 0.5) continue;
      best = bot;
      bestGap = gap;
    }
    if (!best) return;
    const toPlayer = new THREE.Vector3(p.body.position.x - best.hull.position.x, 0, p.body.position.z - best.hull.position.z).normalize();
    const fwd = new THREE.Vector3(-Math.sin(best.facing), 0, -Math.cos(best.facing));
    const backstab = fwd.dot(toPlayer) < -0.3;
    const dmg = Math.round(def.damage * (backstab ? def.backstab : 1));
    const killed = bots.damage(best, dmg, 'torso');
    if (killed) onBotKilled(best, 'YOU', backstab ? 'SHIV (backstab)' : 'SHIV', KNIFE_REWARD);
    else audio.hit();
    return;
  }
  const spread = rig.spread(player.groundSpeed(), p.crouching, !p.body.onGround);
  const targets = shootables.concat(bots.hitMeshes);
  const hit = combat.shoot(shootOrigin, shootDir, spread, seeded, targets, def.pellets);
  if (!hit || !hit.object.userData.bot) return;
  const bot = hit.object.userData.bot;
  const dmg = resolveDamage(def, hit.part, hit.distance, bot.armor);
  const killed = bots.damage(bot, dmg, hit.part);
  if (killed) onBotKilled(bot, 'YOU', def.short, KILL_REWARD);
  else audio.hit();
}

// --- round tick ---------------------------------------------------------------
function tickRound(dt) {
  sim.clock += dt;
  sim.tick += 1;
  match.timer -= dt;
  const keys = input.state.keys;
  const look = input.takeLook();
  if (match.playerAlive && input.state.locked) {
    player.look(look.x, look.y);
    player.step(dt, keys);
  }
  if (sim.clock < sim.blindUntil) {
    fadeFlash(dt * 0.35);
  }
  rig.state.aiming = input.state.aiming && rig.def().scoped;
  camera.fov = rig.state.aiming ? 32 : 75;
  camera.updateProjectionMatrix();
  rig.step(dt);
  if (match.playerAlive && input.state.firing && match.phase === 'round' && sim.clock >= sim.blindUntil) {
    playerFire();
  }
  // Charge channels: plant (attacking) and defuse (defending).
  const site = match.plant.site;
  const pb = player.state.body.position;
  const nearSite = site && Math.hypot(pb.x - site.x, pb.z - site.z) < MAP.plantRadius;
  if (match.playerAlive && match.plant.status === 'carried' && match.plant.carrier === 'player' && nearSite && keys.has('KeyE')) {
    sim.plantProgress += dt;
    if (Math.floor(sim.plantProgress * 2) !== Math.floor((sim.plantProgress - dt) * 2)) audio.plantBeep();
    if (sim.plantProgress >= PLANT_SECONDS) {
      match.plant.status = 'planted';
      sim.fuseLeft = FUSE_SECONDS;
      sim.plantProgress = 0;
      match.money += PLANT_REWARD;
      audio.planted();
      feedLine(`YOU planted the charge at ${site.id} (+$${PLANT_REWARD})`, 'info');
    }
  } else {
    sim.plantProgress = Math.max(0, sim.plantProgress - dt * 2);
  }
  if (match.playerAlive && match.plant.status === 'planted' && match.swapped && nearSite && keys.has('KeyE')) {
    sim.defuseProgress += dt;
    if (Math.floor(sim.defuseProgress * 2) !== Math.floor((sim.defuseProgress - dt) * 2)) audio.defuseBeep();
    const need = rig.state.kit ? DEFUSE_KIT_SECONDS : DEFUSE_SECONDS;
    if (sim.defuseProgress >= need) {
      match.money += DEFUSE_REWARD;
      audio.defused();
      endRound('ferro', `you defused the charge (+$${DEFUSE_REWARD})`);
    }
  } else {
    sim.defuseProgress = Math.max(0, sim.defuseProgress - dt * 2);
  }
  // Pick up a dropped charge by walking over it.
  if (match.playerAlive && match.plant.status === 'dropped') {
    const gap = Math.hypot(pb.x - match.plant.x, pb.z - match.plant.z);
    if (gap < 1.2) {
      match.plant.status = 'carried';
      match.plant.carrier = 'player';
      world.hideCharge();
      audio.pickup();
      feedLine('YOU picked up the charge', 'info');
    }
  }
  // Fuse.
  if (match.plant.status === 'planted') {
    sim.fuseLeft -= dt;
    if (sim.fuseLeft <= 0) {
      endRound(match.swapped ? 'slag' : 'ferro', 'the charge detonated');
    }
  }
  // Which bot, if any, is mid-disarm right now.
  sim.defuser = bots.bots.find((b) => b.up && b.mode === 'disarm') || null;
  // Bots fight.
  feed.player.up = match.playerAlive;
  feed.player.pace = player.groundSpeed();
  bots.step(dt, feed);
  utility.step(dt, sim.clock);
  combat.step(dt);
  // Win checks.
  if (match.phase === 'round') {
    const slagAlive = bots.aliveCount('slag');
    const ferroAlive = bots.aliveCount('ferro') + (match.playerAlive ? 1 : 0);
    if (match.plant.status !== 'planted') {
      if (slagAlive === 0) endRound('ferro', 'all defenders eliminated');
      else if (ferroAlive === 0) endRound('slag', 'all attackers eliminated');
      else if (match.timer <= 0) endRound(match.swapped ? 'ferro' : 'slag', 'time — defenders hold');
    } else if (ferroAlive === 0 && match.swapped) {
      // No defender left alive to defuse: the fuse decides.
    }
  }
}

function tickBuy(dt) {
  sim.clock += dt;
  match.timer -= dt;
  if (match.timer <= 0) beginRound();
}

function tickPost(dt) {
  sim.postTimer -= dt;
  match.timer = Math.max(0, sim.postTimer);
  if (sim.postTimer <= 0) {
    if (matchDecided(match)) {
      endMatch();
    } else {
      match.round += 1;
      startRound();
    }
  }
}

// --- staged shots -------------------------------------------------------------
function stageShot(kind) {
  if (kind === 'start') {
    match.phase = 'menu';
    camera.position.set(-16, 3.2, 12);
    camera.lookAt(0, 1, -4);
    sim.frozen = true;
  } else if (kind === 'buy') {
    startMatch();
    camera.position.set(player.state.body.position.x, 1.6, player.state.body.position.z);
    camera.rotation.set(0, player.state.yaw, 0);
    sim.frozen = true;
  } else if (kind === 'play') {
    startMatch();
    beginRound();
    player.state.body.position.set(-8, 0, 8);
    player.state.yaw = -0.6;
    player.state.pitch = 0;
    // Run a second and a half of live sim so the frame has motion in it.
    for (let i = 0; i < 90; i += 1) tickRound(1 / 60);
    sim.frozen = true;
  } else if (kind === 'retake') {
    startMatch();
    beginRound();
    // Script a post-plant retake: the charge is live at B with the fuse
    // running, one defender down, the player holding the retake angle.
    match.plant.status = 'planted';
    match.plant.site = siteById('B');
    sim.fuseLeft = 28;
    player.state.body.position.set(2, 0, 6);
    player.state.yaw = 0.5;
    player.state.pitch = -0.02;
    bots.enemies[0].rig.visible = false;
    bots.enemies[0].up = false;
    bots.enemies[0].mode = 'down';
    for (let i = 0; i < 60; i += 1) tickRound(1 / 60);
    sim.frozen = true;
  } else if (kind === 'end') {
    startMatch();
    match.wins = 3;
    match.losses = 2;
    match.round = 6;
    match.phase = 'post';
    sim.postTimer = 3.5;
    match.timer = 3.5;
    hideMenu();
    flashBanner('FERRO WINS THE ROUND\nthe charge detonated\n3 — 2', PALETTE.ally);
    sim.frozen = true;
  }
  window.__shotReady = false;
}

// --- main loop ------------------------------------------------------------------
const STEP = 1 / 60;
let accumulator = 0;
let last = performance.now();

// Push the whole match state into the HUD. Frozen staged shots call this
// too — otherwise their frames would show an empty HUD.
function pushHud() {
  updateHud({
    phase: match.phase,
    round: match.round,
    rounds: { ferro: match.wins, slag: match.losses },
    clock: match.timer,
    fuseLeft: sim.fuseLeft,
    charge: { status: match.plant.status, site: match.plant.site, x: match.plant.x, z: match.plant.z },
    carrying: match.plant.carrier === 'player' && match.plant.status === 'carried',
    planting: {
      active: sim.plantProgress > 0.05 && match.plant.status === 'carried' && match.plant.carrier === 'player',
      site: match.plant.site ? match.plant.site.id : '',
      progress: sim.plantProgress,
    },
    carrierName: match.plant.carrier === 'enemy' ? 'RUST' : null,
    disarm: {
      active: !!sim.defuser,
      name: sim.defuser ? sim.defuser.callsign : '',
      kit: sim.defuser ? sim.defuser.kit : false,
      progress: sim.defuser ? sim.defuser.disarm : 0,
    },
    hp: match.playerHealth,
    money: match.money,
    armor: rig.state.armor,
    kit: rig.state.kit,
    mag: rig.state.ammo[rig.state.current].mag,
    reserve: rig.state.ammo[rig.state.current].reserve,
    reload: rig.state.reloadLeft > 0,
    gun: rig.def().name,
    fireMode: rig.def().auto ? 'AUTO' : 'SEMI',
    accuracy: rig.state.aiming ? 'SCOPED' : player.state.crouching ? 'STEADY' : 'ON THE MOVE',
    feed: match.feed.map((f) => f.text),
    pointerLocked: input.state.locked,
    crouch: player.state.crouching,
    playerX: player.state.body.position.x,
    playerZ: player.state.body.position.z,
    yaw: player.state.yaw,
    allies: bots.allies.map((b) => ({ x: b.hull.position.x, z: b.hull.position.z, alive: b.up })),
    enemies: bots.enemies.map((b) => ({ x: b.hull.position.x, z: b.hull.position.z, alive: b.up })),
  });
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sim.frozen) {
    pushHud();
    renderer.render(scene, camera);
    if (!window.__shotReady) {
      sim.shotFrames += 1;
      if (sim.shotFrames >= 2) window.__shotReady = true;
    }
    return;
  }
  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    accumulator -= STEP;
    steps += 1;
    world.step(STEP);
    if (match.phase === 'buy') tickBuy(STEP);
    else if (match.phase === 'round' && !sim.paused) tickRound(STEP);
    else if (match.phase === 'post') tickPost(STEP);
    else if (match.phase === 'menu') {
      // Slow orbit over the yard behind the start screen.
      const t = now / 1000;
      camera.position.set(Math.sin(t * 0.08) * 18, 4.5, Math.cos(t * 0.08) * 16);
      camera.lookAt(0, 1, -4);
      world.step(STEP);
      utility.step(STEP, t);
      combat.step(STEP);
    }
  }
  // Camera follows the player whenever a round is live.
  if (match.phase === 'buy' || match.phase === 'round' || match.phase === 'post') {
    const p = player.state;
    camera.position.set(p.body.position.x, p.body.position.y + p.eye, p.body.position.z);
    camera.rotation.set(p.pitch, p.yaw, 0);
  }
  pushHud();
  renderer.render(scene, camera);
  if (shotMode && !window.__shotReady) {
    sim.shotFrames += 1;
    if (sim.shotFrames >= 2) window.__shotReady = true;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Boot: menu first, unless a staged shot was requested.
if (shotMode) stageShot(shotMode);
else {
  match.phase = 'menu';
  flashBanner('ASHLINE\nFERRO vs SLAG — first to 7\nclick to play', PALETTE.accent);
}
requestAnimationFrame(frame);
