// Utility grenades: frag, smoke and flashbang, thrown by the player and by
// bots. One shared pool of flying canisters with gravity and bounce; what
// happens when the fuse runs out depends on the kind. A frag is the old
// blast — the caller owns the damage. A smoke canister pops into a cloud
// of billboards that lives twelve seconds and blocks sight both ways: the
// segment test here is what combat's line-of-sight check calls. A
// flashbang bursts white: anyone facing it inside its reach, with a clear
// line to it, is blinded — the player gets a full-screen white-out, bots
// get a blind timer that stops their sensing and their fire.
import * as THREE from 'three';
import { overlapsAt } from './physics.js';
import { PALETTE } from './palette.js';

const POOL = 8;
const FRAG_FUSE = 1.6;
const SMOKE_FUSE = 1.1;
const FLASH_FUSE = 1.1;
const SMOKE_LIFE = 12;
const SMOKE_RADIUS = 3.4;
const SMOKE_PUFFS = 7;
const FLASH_REACH = 19;
const GRAVITY = 18;

export function createUtility(scene, colliders, textures, onBlast, onFlash) {
  const items = [];
  const fragGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const fragMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.4, metalness: 0.6 });
  const smokeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a929c'), roughness: 0.4, metalness: 0.7 });
  const flashMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e8ecf0'), roughness: 0.3, metalness: 0.4, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.4 });
  for (let i = 0; i < POOL; i += 1) {
    const mesh = new THREE.Mesh(fragGeo, fragMat);
    mesh.visible = false;
    scene.add(mesh);
    items.push({ mesh, velocity: new THREE.Vector3(), fuse: 0, alive: false, owner: 'player', kind: 'frag' });
  }
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 14);
  scene.add(blastLight);
  const flashLight = new THREE.PointLight(new THREE.Color('#ffffff'), 0, 22);
  scene.add(flashLight);
  let blastLife = 0;
  let flashLife = 0;

  // Live smoke clouds: { center, radius, until }. Each cloud is a cluster
  // of billboard puffs that swells after the pop, then thins as it dies.
  const clouds = [];
  const puffGeo = new THREE.PlaneGeometry(1, 1);
  function spawnCloud(at, now) {
    const group = new THREE.Group();
    const puffs = [];
    for (let i = 0; i < SMOKE_PUFFS; i += 1) {
      const mat = new THREE.SpriteMaterial({ map: textures.puff, transparent: true, opacity: 0.55, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      const a = (i / SMOKE_PUFFS) * Math.PI * 2;
      const r = 0.6 + (i % 3) * 0.7;
      sprite.position.set(Math.cos(a) * r, 0.6 + (i % 4) * 0.55, Math.sin(a) * r);
      const s = 2.4 + (i % 3) * 0.9;
      sprite.scale.set(s, s, 1);
      sprite.userData.spin = (i % 2 === 0 ? 1 : -1) * (0.1 + (i % 3) * 0.05);
      group.add(sprite);
      puffs.push(sprite);
    }
    group.position.copy(at);
    group.position.y = Math.max(0.4, at.y);
    scene.add(group);
    clouds.push({ center: group.position.clone(), radius: SMOKE_RADIUS, until: now + SMOKE_LIFE, group, puffs, born: now });
  }

  function throwOne(from, direction, owner, kind) {
    const item = items.find((entry) => !entry.alive);
    if (!item) return false;
    item.alive = true;
    item.owner = owner;
    item.kind = kind;
    item.fuse = kind === 'frag' ? FRAG_FUSE : kind === 'smoke' ? SMOKE_FUSE : FLASH_FUSE;
    item.mesh.material = kind === 'frag' ? fragMat : kind === 'smoke' ? smokeMat : flashMat;
    item.mesh.position.copy(from);
    item.mesh.visible = true;
    item.velocity.copy(direction).multiplyScalar(kind === 'frag' ? 14 : 12);
    item.velocity.y += kind === 'frag' ? 3.5 : 4.5;
    return true;
  }

  // Segment-sphere test: true when the segment from->to passes through any
  // live cloud. This is the smoke half of line of sight.
  const segDir = new THREE.Vector3();
  const toCenter = new THREE.Vector3();
  function segmentBlocked(from, to) {
    segDir.copy(to).sub(from);
    const lenSq = segDir.lengthSq();
    if (lenSq < 0.0001) return false;
    for (const cloud of clouds) {
      toCenter.copy(cloud.center).sub(from);
      let t = toCenter.dot(segDir) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = from.x + segDir.x * t;
      const cy = from.y + segDir.y * t;
      const cz = from.z + segDir.z * t;
      const dx = cloud.center.x - cx;
      const dy = cloud.center.y - cy;
      const dz = cloud.center.z - cz;
      if (dx * dx + dy * dy + dz * dz < cloud.radius * cloud.radius) return true;
    }
    return false;
  }

  // Flash strength at a viewer: 0 when out of reach, facing away, or
  // behind a wall; up to 1 for a burst dead ahead at close range. The
  // caller supplies the wall test and the viewer's forward vector.
  const toBurst = new THREE.Vector3();
  function flashStrength(viewerPos, viewerFwd, burstPos, clearShot) {
    toBurst.copy(burstPos).sub(viewerPos);
    const dist = toBurst.length();
    if (dist > FLASH_REACH || dist < 0.01) return dist < 0.01 ? 1 : 0;
    toBurst.normalize();
    const facing = toBurst.dot(viewerFwd);
    if (facing < -0.15) return 0;
    if (!clearShot(viewerPos, burstPos)) return 0;
    const rangeFall = 1 - dist / FLASH_REACH;
    const angleFall = Math.max(0, (facing + 0.15) / 1.15);
    return Math.min(1, (0.35 + 0.65 * rangeFall) * (0.35 + 0.65 * angleFall));
  }

  function step(dt, now) {
    if (blastLife > 0) {
      blastLife -= dt;
      blastLight.intensity = Math.max(0, blastLife / 0.25) * 60;
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashLight.intensity = Math.max(0, flashLife / 0.3) * 90;
    }
    for (const item of items) {
      if (!item.alive) continue;
      item.fuse -= dt;
      item.velocity.y -= GRAVITY * dt;
      const pos = item.mesh.position;
      const nextX = pos.x + item.velocity.x * dt;
      if (!overlapsAt(colliders, nextX, pos.y - 0.09, pos.z, 0.09, 0.18, 0.02)) pos.x = nextX;
      else item.velocity.x *= -0.45;
      const nextZ = pos.z + item.velocity.z * dt;
      if (!overlapsAt(colliders, pos.x, pos.y - 0.09, nextZ, 0.09, 0.18, 0.02)) pos.z = nextZ;
      else item.velocity.z *= -0.45;
      const nextY = pos.y + item.velocity.y * dt;
      if (nextY < 0.09) {
        pos.y = 0.09;
        item.velocity.y = Math.abs(item.velocity.y) * 0.45;
        item.velocity.x *= 0.8;
        item.velocity.z *= 0.8;
      } else if (!overlapsAt(colliders, pos.x, nextY - 0.09, pos.z, 0.09, 0.18, 0)) {
        pos.y = nextY;
      } else {
        item.velocity.y *= -0.45;
      }
      if (item.fuse > 0) continue;
      item.alive = false;
      item.mesh.visible = false;
      if (item.kind === 'frag') {
        blastLight.position.copy(pos);
        blastLight.intensity = 60;
        blastLife = 0.25;
        onBlast(pos, item.owner);
      } else if (item.kind === 'smoke') {
        spawnCloud(pos, now);
      } else {
        flashLight.position.copy(pos);
        flashLight.intensity = 90;
        flashLife = 0.3;
        onFlash(pos, item.owner);
      }
    }
    // Clouds swell, spin their puffs, thin out and die.
    for (let i = clouds.length - 1; i >= 0; i -= 1) {
      const cloud = clouds[i];
      const age = now - cloud.born;
      const lifeLeft = cloud.until - now;
      const swell = Math.min(1, age / 1.2);
      for (const puff of cloud.puffs) {
        puff.material.rotation += puff.userData.spin * dt;
        puff.material.opacity = 0.55 * swell * Math.min(1, lifeLeft / 3);
      }
      cloud.group.scale.setScalar(0.7 + 0.5 * swell);
      if (lifeLeft <= 0) {
        scene.remove(cloud.group);
        for (const puff of cloud.puffs) puff.material.dispose();
        clouds.splice(i, 1);
      }
    }
  }

  return {
    throwFrag: (from, dir, owner) => throwOne(from, dir, owner, 'frag'),
    throwSmoke: (from, dir, owner) => throwOne(from, dir, owner, 'smoke'),
    throwFlash: (from, dir, owner) => throwOne(from, dir, owner, 'flash'),
    // Place a live cloud directly, for staged captures: the same cloud a
    // popped canister makes, at a chosen spot.
    placeCloud: (at, now) => spawnCloud(at, now),
    step,
    segmentBlocked,
    flashStrength,
    cloudCount: () => clouds.length,
    clouds,
    anyFlying: () => items.some((item) => item.alive),
  };
}
