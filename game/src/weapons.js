// The arsenal: seven hitscan weapons, two of them faction rifles with a
// FIXED recoil pattern — a table of [pitch, yaw] kicks, one per shot in a
// 20-round spray, that a player can learn and pull against. The defs own
// the numbers; main.js owns the ray and the damage (combat.js resolves
// the hit zone, falloff and armour). Spread punishes moving, airborne and
// sustained fire; crouching tightens it, and the scoped rifle is only
// truly accurate down its sight. One view model per weapon, swapped on
// select; the muzzle flash and its light are shared. The pistol is the
// free sidearm every FERRO carries from round one; the knife is free too
// — silent, and three times as deadly from behind.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Fixed recoil tables: [pitch, yaw] per shot of a spray. The Halberd
// climbs straight with a late right drift; the Reaper climbs harder and
// weaves left-right, so it pays more at range and costs more to learn.
const RECOIL_HALBERD = [
  [0.011, 0], [0.012, 0.001], [0.012, 0.001], [0.013, -0.001], [0.013, 0.002],
  [0.014, 0.001], [0.014, -0.002], [0.015, 0.002], [0.015, -0.001], [0.016, 0.003],
  [0.016, 0.002], [0.017, -0.003], [0.017, 0.002], [0.018, -0.002], [0.018, 0.003],
  [0.019, 0.002], [0.019, -0.003], [0.02, 0.003], [0.02, -0.002], [0.021, 0.003],
];
const RECOIL_REAPER = [
  [0.014, 0], [0.015, -0.002], [0.015, 0.003], [0.016, -0.003], [0.017, 0.004],
  [0.017, -0.004], [0.018, 0.004], [0.019, -0.005], [0.019, 0.005], [0.02, -0.004],
  [0.021, 0.005], [0.021, -0.005], [0.022, 0.006], [0.022, -0.006], [0.023, 0.005],
  [0.023, -0.005], [0.024, 0.006], [0.024, -0.006], [0.025, 0.006], [0.026, -0.006],
];

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'AR-41 Halberd', short: 'HALBERD', price: 0, damage: 34, headMult: 3,
    falloff: [25, 0.75], pen: 0.5, fireGap: 0.096, auto: true, mag: 30, reserve: 90, reload: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.011, pellets: 1, scoped: false,
    recoilTable: RECOIL_HALBERD, range: 60,
  },
  rifle2: {
    id: 'rifle2', name: 'KR-77 Reaper', short: 'REAPER', price: 1500, damage: 38, headMult: 3.5,
    falloff: [22, 0.7], pen: 0.65, fireGap: 0.104, auto: true, mag: 25, reserve: 75, reload: 2.1,
    spreadStill: 0.0028, spreadMove: 0.032, recoil: 0.014, pellets: 1, scoped: false,
    recoilTable: RECOIL_REAPER, range: 60,
  },
  smg: {
    id: 'smg', name: 'SMG-7 Hornet', short: 'HORNET', price: 600, damage: 25, headMult: 2,
    falloff: [16, 0.7], pen: 0.4, fireGap: 0.07, auto: true, mag: 32, reserve: 96, reload: 1.6,
    spreadStill: 0.004, spreadMove: 0.034, recoil: 0.007, pellets: 1, scoped: false,
    recoilTable: null, range: 45,
  },
  shotgun: {
    id: 'shotgun', name: 'SG-9 Mauler', short: 'MAULER', price: 700, damage: 13, headMult: 1.5,
    falloff: [10, 0.55], pen: 0.3, fireGap: 0.85, auto: false, mag: 6, reserve: 24, reload: 2.4,
    spreadStill: 0.02, spreadMove: 0.05, recoil: 0.035, pellets: 8, scoped: false,
    recoilTable: null, range: 30,
  },
  pistol: {
    id: 'pistol', name: 'P9 Sparrow', short: 'SPARROW', price: 0, damage: 26, headMult: 2,
    falloff: [20, 0.75], pen: 0.4, fireGap: 0.15, auto: false, mag: 12, reserve: 48, reload: 1.3,
    spreadStill: 0.003, spreadMove: 0.03, recoil: 0.008, pellets: 1, scoped: false,
    recoilTable: null, range: 45,
  },
  sniper: {
    id: 'sniper', name: 'LR-88 Longshot', short: 'LONGSHOT', price: 1100, damage: 88, headMult: 2.5,
    falloff: [40, 0.85], pen: 0.9, fireGap: 1.15, auto: false, mag: 5, reserve: 15, reload: 2.8,
    spreadStill: 0.0008, spreadMove: 0.06, recoil: 0.05, pellets: 1, scoped: true,
    recoilTable: null, range: 90,
  },
  knife: {
    id: 'knife', name: 'K-9 Shiv', short: 'SHIV', price: 0, damage: 40, headMult: 1,
    falloff: [2.2, 1], pen: 1, fireGap: 0.45, auto: false, mag: 0, reserve: 0, reload: 0,
    spreadStill: 0, spreadMove: 0, recoil: 0.002, pellets: 1, scoped: false,
    recoilTable: null, range: 2.2, melee: true, backstab: 3,
  },
};
export const GRENADE_PRICE = 300;
export const SMOKE_PRICE = 250;
export const FLASH_PRICE = 250;
export const ARMOR_PRICE = 650;
export const ARMOR_HELM_PRICE = 1000;
export const KIT_PRICE = 400;
export const WEAPON_ORDER = ['rifle', 'rifle2', 'smg', 'shotgun', 'pistol', 'sniper', 'knife'];
export const MAX_UTILITY = 2;

// A view-model part: a box of the given size and material, placed and
// optionally pitched. Every weapon is assembled from these parts.
function part(size, material, x, y, z, pitch = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(x, y, z);
  if (pitch) mesh.rotation.x = pitch;
  return mesh;
}

function buildModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.55, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.siteB), roughness: 0.15, metalness: 0.6, emissive: new THREE.Color(PALETTE.siteB), emissiveIntensity: 0.25 });
  const ember = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.3 });
  const group = new THREE.Group();
  if (def.id === 'rifle') {
    group.add(
      part([0.09, 0.1, 0.42], body, 0, 0, 0),
      part([0.045, 0.045, 0.4], grip, 0, 0.025, -0.38),
      part([0.075, 0.08, 0.22], grip, 0, -0.02, 0.3),
      part([0.03, 0.05, 0.08], grip, 0, 0.075, -0.05),
    );
  } else if (def.id === 'rifle2') {
    group.add(
      part([0.1, 0.11, 0.46], dark, 0, 0, 0),
      part([0.05, 0.05, 0.42], grip, 0, 0.03, -0.4),
      part([0.08, 0.09, 0.2], grip, 0, -0.02, 0.3),
      part([0.03, 0.04, 0.1], ember, 0, 0.08, -0.1),
      part([0.04, 0.06, 0.12], grip, 0, -0.09, 0.08, 0.2),
    );
  } else if (def.id === 'smg') {
    group.add(
      part([0.08, 0.09, 0.3], body, 0, 0, 0),
      part([0.04, 0.04, 0.22], grip, 0, 0.02, -0.25),
      part([0.05, 0.16, 0.07], grip, 0, -0.11, -0.02, 0.2),
      part([0.06, 0.06, 0.16], grip, 0, -0.01, 0.22),
    );
  } else if (def.id === 'shotgun') {
    group.add(
      part([0.1, 0.11, 0.34], body, 0, 0, 0),
      part([0.06, 0.06, 0.42], grip, 0, 0.03, -0.36),
      part([0.08, 0.07, 0.14], body, 0, -0.02, -0.3),
      part([0.08, 0.09, 0.2], grip, 0, -0.02, 0.26),
    );
  } else if (def.id === 'pistol') {
    group.add(
      part([0.05, 0.09, 0.2], body, 0, 0, 0),
      part([0.045, 0.13, 0.06], grip, 0, -0.1, 0.06, 0.25),
      part([0.03, 0.03, 0.1], grip, 0, 0.02, -0.14),
    );
  } else if (def.id === 'sniper') {
    group.add(
      part([0.08, 0.09, 0.62], body, 0, 0, 0),
      part([0.05, 0.05, 0.3], grip, 0, 0.02, -0.42),
      part([0.06, 0.07, 0.12], glass, 0, 0.08, -0.08),
      part([0.04, 0.06, 0.05], grip, 0, 0.05, -0.28),
      part([0.06, 0.12, 0.08], grip, 0, -0.09, 0.05, 0.2),
    );
  } else {
    group.add(
      part([0.02, 0.05, 0.34], body, 0, 0.01, -0.1, -0.12),
      part([0.04, 0.06, 0.12], dark, 0, -0.01, 0.12),
      part([0.03, 0.03, 0.06], ember, 0, 0.035, 0.02),
    );
  }
  group.position.set(0.27, -0.24, -0.58);
  group.scale.set(0.6, 0.6, 0.6);
  group.visible = false;
  return group;
}

export function createWeaponRig(camera, textures) {
  const models = {};
  for (const id of WEAPON_ORDER) {
    models[id] = buildModel(WEAPONS[id]);
    camera.add(models[id]);
  }
  models.rifle.visible = true;

  const flashTexture = textures.muzzle;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: flashTexture, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  flash.position.set(0.26, -0.19, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.17, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of WEAPON_ORDER) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const state = {
    current: 'rifle',
    owned: new Set(['rifle', 'pistol', 'knife']),
    ammo,
    grenades: 0,
    smoke: 0,
    flash: 0,
    armor: 0,
    kit: false,
    aiming: false,
    cooldown: 0,
    reloadLeft: 0,
    flashT: 0,
    kick: 0,
    heat: 0,
    spray: 0,
  };

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flashT = Math.max(0, state.flashT - dt);
    state.heat = Math.max(0, state.heat - dt * 0.55);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.58 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flashT > 0;
    flashLight.intensity = state.flashT > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      const d = def();
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = state.ammo[state.current];
        const take = Math.min(d.mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      const d = def();
      if (d.melee) return state.cooldown === 0 && state.reloadLeft === 0;
      return state.ammo[state.current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flashT = 0.06;
      state.kick = 0.055;
      state.heat = Math.min(1, state.heat + (d.id === 'shotgun' ? 0.5 : d.id === 'sniper' ? 0.4 : 0.09));
      flash.rotation.z = Math.random() * Math.PI * 2;
      // The spray counter drives the fixed recoil table: the same shots
      // kick the same way every time, so the pattern can be learned.
      if (d.recoilTable) state.spray = (state.spray + 1) % d.recoilTable.length;
      else state.spray = 0;
    },
    // Kick for the shot just fired: the table's step, or the flat recoil.
    recoilStep() {
      const d = def();
      if (!d.recoilTable) return [d.recoil, 0];
      return d.recoilTable[state.spray];
    },
    takeRound() {
      if (def().melee) return true;
      const a = state.ammo[state.current];
      if (a.mag <= 0) return false;
      a.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (d.melee) return;
      const a = state.ammo[state.current];
      if (state.reloadLeft > 0 || a.mag === d.mag || a.reserve === 0) return;
      state.reloadLeft = d.reload;
    },
    spread(speed, crouching, airborne) {
      const d = def();
      let spread = d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove + state.heat * 0.02;
      if (crouching) spread *= 0.6;
      if (airborne) spread *= 1.8;
      if (d.scoped) spread *= state.aiming ? 0.55 : 3.2;
      return spread;
    },
    select(id) {
      if (!state.owned.has(id) || state.reloadLeft > 0) return false;
      state.current = id;
      for (const key of WEAPON_ORDER) models[key].visible = key === id;
      state.cooldown = Math.max(state.cooldown, 0.25);
      state.spray = 0;
      return true;
    },
    buy(id) {
      const d = WEAPONS[id];
      if (!d || state.owned.has(id)) return -1;
      state.owned.add(id);
      state.ammo[id] = { mag: d.mag, reserve: d.reserve };
      return d.price;
    },
    resetRound() {
      for (const id of state.owned) {
        const d = WEAPONS[id];
        state.ammo[id] = { mag: d.mag, reserve: d.reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flashT = 0;
      state.kick = 0;
      state.heat = 0;
      state.spray = 0;
      state.armor = 0;
      state.kit = false;
      state.grenades = 0;
      state.smoke = 0;
      state.flash = 0;
      state.owned = new Set(['rifle', 'pistol', 'knife']);
      state.current = 'rifle';
      for (const key of WEAPON_ORDER) models[key].visible = key === 'rifle';
    },
    refillOwned() {
      for (const id of state.owned) {
        const d = WEAPONS[id];
        state.ammo[id] = { mag: d.mag, reserve: d.reserve };
      }
    },
  };
}
