// Shared AABB movement for the player and all nine bots, so collision
// behaves the same for everyone. A body is a vertical box; each axis is
// tested and resolved on its own, so a wall never swallows a body and
// sliding along a wall just works. Gravity is plain, with a floor at y=0
// and a landing test against the colliders.
import * as THREE from 'three';

const GRAVITY = 20;

export function createBody(colliders, x, z, radius = 0.34, height = 1.72) {
  return {
    colliders,
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    radius,
    height,
    onGround: true,
  };
}

const probe = new THREE.Box3();

export function overlapsAt(colliders, x, y, z, radius, height, lift = 0) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (const c of colliders) {
    if (probe.intersectsBox(c)) return c;
  }
  return null;
}

// wishX/wishZ is a unit (or zero) ground-plane direction; speed is the
// target speed. Acceleration steers velocity toward the wish, friction
// damps it to a stop when there is no wish.
export function moveBody(body, dt, wishX, wishZ, speed, accel, friction) {
  const blend = Math.min(1, (accel * dt) / Math.max(speed, 0.01));
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }
  body.velocity.y -= GRAVITY * dt;
  const lift = 0.04;
  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlapsAt(body.colliders, nextX, body.position.y, body.position.z, body.radius, body.height, lift)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlapsAt(body.colliders, body.position.x, body.position.y, nextZ, body.radius, body.height, lift)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlapsAt(body.colliders, body.position.x, body.position.y, body.position.z, body.radius, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

export function groundSpeed(body) {
  return Math.hypot(body.velocity.x, body.velocity.z);
}
