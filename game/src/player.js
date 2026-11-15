// Player movement: acceleration, friction, gravity, crouch and jump on
// top of the shared AABB mover. Crouching lowers the eye and the body
// height and tightens weapon spread (weapons.js reads crouching); standing
// back up is refused while a ceiling is overhead, so the catwalk and the
// gantry deck can pin you if you crouch under them.
import { createBody, moveBody, overlapsAt, groundSpeed } from './physics.js';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const JUMP_SPEED = 6.4;

export function createPlayer(colliders, spawnX, spawnZ) {
  const body = createBody(colliders, spawnX, spawnZ);
  const player = {
    body,
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    height: STAND_HEIGHT,
  };

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
      body.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && player.crouching) {
      const blocked = overlapsAt(colliders, body.position.x, body.position.y, body.position.z, body.radius, STAND_HEIGHT, 0.02);
      if (!blocked) {
        player.crouching = false;
        player.height = STAND_HEIGHT;
        body.height = STAND_HEIGHT;
      }
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wishX = 0;
    let wishZ = 0;
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wishX = -sin * forward + cos * strafe;
      wishZ = -cos * forward - sin * strafe;
      const len = Math.hypot(wishX, wishZ) || 1;
      wishX /= len;
      wishZ /= len;
    }
    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    moveBody(body, dt, wishX, wishZ, speed, body.onGround ? GROUND_ACCEL : AIR_ACCEL, FRICTION);
    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return groundSpeed(body);
    },
    reset(x, z) {
      body.position.set(x, 0, z);
      body.velocity.set(0, 0, 0);
      body.height = STAND_HEIGHT;
      player.yaw = 0;
      player.pitch = 0;
      player.eye = STAND_EYE;
      player.crouching = false;
      player.height = STAND_HEIGHT;
    },
  };
}
