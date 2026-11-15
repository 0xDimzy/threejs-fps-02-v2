// Hitscan resolution: one ray per pellet against the world's shootables
// and the bots' hit meshes, nearest hit wins. Tracers and impact flashes
// come from fixed pools — nothing is allocated in the hot path. The caller
// owns damage; this module only says what was hit, where, and which body
// part. Line of sight takes an optional smoke test, so a smoke cloud
// between two agents really does blind them both ways.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 12;
const TRACER_LIFE = 0.07;
const IMPACT_COUNT = 10;
const IMPACT_LIFE = 0.16;
const RAY_FAR = 90;
const MISS_LENGTH = 80;

export function createCombat(scene) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = RAY_FAR;
  // Reused temporaries: shoot() and hasLineOfSight() run every frame.
  const direction = new THREE.Vector3();
  const end = new THREE.Vector3();

  // A round-robin pool: each slot is shown, then fades out over its life.
  // `build` creates one slot's object; `fade` animates it while alive.
  function makePool(count, build, fade) {
    const slots = [];
    for (let i = 0; i < count; i += 1) slots.push({ item: build(), life: 0 });
    let next = 0;
    return {
      show(setup, life) {
        const slot = slots[next];
        next = (next + 1) % count;
        setup(slot.item);
        slot.life = life;
      },
      step(dt) {
        for (const slot of slots) {
          if (slot.life <= 0) continue;
          slot.life -= dt;
          fade(slot.item, Math.max(0, slot.life));
        }
      },
    };
  }

  const accent = new THREE.Color(PALETTE.accent);
  const tracers = makePool(
    TRACER_COUNT,
    () => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      return line;
    },
    (line, life) => {
      line.material.opacity = life > 0 ? 0.85 : 0;
    },
  );

  const impactGeometry = new THREE.SphereGeometry(0.09, 8, 6);
  const impacts = makePool(
    IMPACT_COUNT,
    () => {
      const mesh = new THREE.Mesh(impactGeometry, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0 }));
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    },
    (mesh, life) => {
      if (life <= 0) {
        mesh.visible = false;
        return;
      }
      const scale = Math.max(0.01, life / IMPACT_LIFE);
      mesh.scale.set(scale, scale, scale);
      mesh.material.opacity = (life / IMPACT_LIFE) * 0.9;
    },
  );

  function showTracer(from, to) {
    tracers.show((line) => {
      const positions = line.geometry.attributes.position.array;
      positions[0] = from.x;
      positions[1] = from.y;
      positions[2] = from.z;
      positions[3] = to.x;
      positions[4] = to.y;
      positions[5] = to.z;
      line.geometry.attributes.position.needsUpdate = true;
      line.material.opacity = 0.85;
    }, TRACER_LIFE);
  }

  function showImpact(point) {
    impacts.show((mesh) => {
      mesh.position.copy(point);
      mesh.visible = true;
      mesh.material.opacity = 0.9;
      mesh.scale.set(1, 1, 1);
    }, IMPACT_LIFE);
  }

  function step(dt) {
    tracers.step(dt);
    impacts.step(dt);
  }

  // origin/direction are Vector3s; spread jitters each pellet's direction.
  // Returns the nearest hit or null.
  function shoot(origin, baseDirection, spread, random, targets, pelletCount = 1) {
    let best = null;
    for (let p = 0; p < pelletCount; p += 1) {
      direction.copy(baseDirection);
      direction.x += (random() * 2 - 1) * spread;
      direction.y += (random() * 2 - 1) * spread;
      direction.z += (random() * 2 - 1) * spread;
      direction.normalize();
      raycaster.set(origin, direction);
      const hit = raycaster.intersectObjects(targets, false)[0];
      end.copy(origin).addScaledVector(direction, hit ? hit.distance : MISS_LENGTH);
      showTracer(origin, end);
      if (hit) {
        showImpact(hit.point);
        if (!best || hit.distance < best.distance) {
          best = { object: hit.object, point: hit.point.clone(), distance: hit.distance, part: hit.object.userData.part || 'world' };
        }
      }
    }
    return best;
  }

  // Line of sight: true when nothing in `blockers` stands between the two
  // points and no live smoke cloud crosses the segment. `smokeTest` is a
  // caller-supplied (from, to) => boolean, or null when smoke is irrelevant.
  function hasLineOfSight(from, to, blockers, smokeTest = null) {
    direction.copy(to).sub(from);
    const distance = direction.length();
    if (distance < 0.01) return true;
    direction.normalize();
    raycaster.set(from, direction);
    raycaster.far = distance;
    try {
      if (raycaster.intersectObjects(blockers, false)[0]) return false;
    } finally {
      raycaster.far = RAY_FAR;
    }
    if (smokeTest && smokeTest(from, to)) return false;
    return true;
  }

  return { shoot, step, hasLineOfSight };
}
