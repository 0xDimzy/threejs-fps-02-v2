// The arsenal: five hitscan weapons. The defs own the numbers; main.js
// owns the ray and the damage. Spread punishes moving, airborne and
// sustained fire; crouching tightens it, and the scoped rifle is only
// truly accurate down its sight. One view model per weapon, swapped on
// select; the muzzle flash and its light are shared by all five. The
// pistol is the free sidearm every FERRO carries from round one; the
// scoped rifle is the expensive long-angle answer to the mid catwalk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'AR-41 Halberd', short: 'HALBERD', price: 0, damage: 34, headMult: 3,
    fireGap: 0.096, auto: true, mag: 30, reserve: 90, reload: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.011, pellets: 1, scoped: false,
  },
  smg: {
    id: 'smg', name: 'SMG-7 Hornet', short: 'HORNET', price: 600, damage: 25, headMult: 2,
    fireGap: 0.07, auto: true, mag: 32, reserve: 96, reload: 1.6,
    spreadStill: 0.004, spreadMove: 0.034, recoil: 0.007, pellets: 1, scoped: false,
  },
  shotgun: {
    id: 'shotgun', name: 'SG-9 Mauler', short: 'MAULER', price: 700, damage: 13, headMult: 1.5,
    fireGap: 0.85, auto: false, mag: 6, reserve: 24, reload: 2.4,
    spreadStill: 0.02, spreadMove: 0.05, recoil: 0.035, pellets: 8, scoped: false,
  },
  pistol: {
    id: 'pistol', name: 'P9 Sparrow', short: 'SPARROW', price: 0, damage: 26, headMult: 2,
    fireGap: 0.15, auto: false, mag: 12, reserve: 48, reload: 1.3,
    spreadStill: 0.003, spreadMove: 0.03, recoil: 0.008, pellets: 1, scoped: false,
  },
  sniper: {
    id: 'sniper', name: 'LR-88 Longshot', short: 'LONGSHOT', price: 1100, damage: 88, headMult: 2.5,
    fireGap: 1.15, auto: false, mag: 5, reserve: 15, reload: 2.8,
    spreadStill: 0.0008, spreadMove: 0.06, recoil: 0.05, pellets: 1, scoped: true,
  },
};
export const GRENADE_PRICE = 300;
export const SMOKE_PRICE = 250;
export const FLASH_PRICE = 250;
export const ARMOR_PRICE = 650;
export const WEAPON_ORDER = ['rifle', 'smg', 'shotgun', 'pistol', 'sniper'];
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
  const glass = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.siteB), roughness: 0.15, metalness: 0.6, emissive: new THREE.Color(PALETTE.siteB), emissiveIntensity: 0.25 });
  const group = new THREE.Group();
  if (def.id === 'rifle') {
    group.add(
      part([0.09, 0.1, 0.42], body, 0, 0, 0),
      part([0.045, 0.045, 0.4], grip, 0, 0.025, -0.38),
      part([0.075, 0.08, 0.22], grip, 0, -0.02, 0.3),
      part([0.03, 0.05, 0.08], grip, 0, 0.075, -0.05),
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
  } else {
    group.add(
      part([0.08, 0.09, 0.62], body, 0, 0, 0),
      part([0.05, 0.05, 0.3], grip, 0, 0.02, -0.42),
      part([0.06, 0.07, 0.12], glass, 0, 0.08, -0.08),
      part([0.04, 0.06, 0.05], grip, 0, 0.05, -0.28),
      part([0.06, 0.12, 0.08], grip, 0, -0.09, 0.05, 0.2),
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

  // Muzzle flash: a small radial-glow sprite painted once on a canvas (no
  // image file), so the flash reads as light, not as a flat card.
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
    owned: new Set(['rifle', 'pistol']),
    ammo,
    grenades: 0,
    smoke: 0,
    flash: 0,
    armor: false,
    aiming: false,
    cooldown: 0,
    reloadLeft: 0,
    flashT: 0,
    kick: 0,
    heat: 0,
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
      return state.ammo[state.current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flashT = 0.06;
      state.kick = 0.055;
      state.heat = Math.min(1, state.heat + (d.id === 'shotgun' ? 0.5 : d.id === 'sniper' ? 0.4 : 0.09));
      // Spin the flash sprite to a random angle so consecutive shots do not
      // show the same radial pattern.
      flash.rotation.z = Math.random() * Math.PI * 2;
    },
    takeRound() {
      const a = state.ammo[state.current];
      if (a.mag <= 0) return false;
      a.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      const a = state.ammo[state.current];
      if (state.reloadLeft > 0 || a.mag === d.mag || a.reserve === 0) return;
      state.reloadLeft = d.reload;
    },
    // Spread: still < crouched < moving < airborne, plus heat from sustained
    // fire. The scoped rifle is near-laser down its sight and wild from the
    // hip — the scope is the weapon.
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
      state.armor = false;
      state.grenades = 0;
      state.smoke = 0;
      state.flash = 0;
      state.owned = new Set(['rifle', 'pistol']);
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
