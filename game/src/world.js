// The yard, built from MAP and the procedural textures: every box is a
// mesh, a collider and a surface a bullet stops on. On top of the boxes
// sit the night-rain dressing — a skybox with a lit skyline, falling rain,
// splash rings, puddles that catch the floodlights, a glowing furnace
// mouth with rising embers, steam vents, sagging cables and blinking crane
// beacons. Nothing is fetched; the whole mood is painted at boot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { buildTextures, scatterPoints } from './textures.js';
import { mulberry32, range } from './rng.js';

const RAIN_COUNT = 1100;
const EMBER_COUNT = 90;

export function createWorld(scene, seed = 7) {
  const rnd = mulberry32(seed * 31 + 5);
  const tex = buildTextures(seed);
  const group = new THREE.Group();
  scene.add(group);
  const plain = {};
  for (const name of Object.keys(PALETTE)) {
    plain[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // Textured variants: concrete walls, three container paints, hazard
  // striping for the catwalk edge, asphalt for the floor.
  const textured = {
    surface: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.85, metalness: 0.05 }),
    hairline: new THREE.MeshStandardMaterial({ map: tex.concrete, color: new THREE.Color('#5a6b7d'), roughness: 0.8, metalness: 0.08 }),
    containerA: new THREE.MeshStandardMaterial({ map: tex.containerA, roughness: 0.7, metalness: 0.25 }),
    containerB: new THREE.MeshStandardMaterial({ map: tex.containerB, roughness: 0.7, metalness: 0.25 }),
    containerC: new THREE.MeshStandardMaterial({ map: tex.containerC, roughness: 0.7, metalness: 0.25 }),
    accent: new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.6, metalness: 0.1 }),
    canvas: new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.55, metalness: 0.12 }),
  };
  function materialFor(name) {
    return textured[name] || plain[name];
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materialFor(mat));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
    ));
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, mat] of MAP.boxes) box(w, h, d, x, y, z, mat);

  // Cylinders: barrels, cable reels and wall pipes. Only the flagged ones
  // block movement; the wall pipes sit flush against the walls.
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
  for (const [r, h, x, z, mat, solid] of MAP.cylinders) {
    const mesh = new THREE.Mesh(cylGeo, materialFor(mat));
    mesh.scale.set(r, h, r);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, h, z + r)));
      shootables.push(mesh);
    }
  }

  // Painted lane strips: flat boxes just above the floor, never colliders.
  for (const [w, d, x, z, mat] of MAP.strips) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.02, d),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[mat]), roughness: 0.9, transparent: true, opacity: 0.3 }),
    );
    strip.position.set(x, 0.02, z);
    strip.receiveShadow = true;
    group.add(strip);
  }

  // Puddles: dark, near-mirror ellipses that catch the floodlights.
  const puddleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0c141d'), roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.88 });
  for (const [x, z, rx, rz] of MAP.puddles) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 24), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.scale.set(rx, rz, 1);
    puddle.position.set(x, 0.025, z);
    puddle.receiveShadow = true;
    group.add(puddle);
  }

  // Site beacons: a glowing floor ring, a low post and a point light each.
  const beacons = [];
  for (const site of MAP.sites) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(MAP.plantRadius - 0.25, MAP.plantRadius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[site.color]), transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.04, site.z);
    group.add(ring);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), plain[site.color === 'siteA' ? 'accent' : 'surface']);
    post.position.set(site.x, 1.3, site.z - MAP.plantRadius - 0.4);
    post.castShadow = true;
    group.add(post);
    const light = new THREE.PointLight(new THREE.Color(PALETTE[site.color]), 26, 14);
    light.position.set(site.x, 3.0, site.z);
    scene.add(light);
    beacons.push({ site, ring, light });
  }

  // Floodlight poles: emissive lamp heads plus two real spotlights, one
  // washing mid, one washing the north sites. The other two heads glow
  // without a light of their own.
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp) });
  const lampGeo = new THREE.BoxGeometry(0.7, 0.28, 0.28);
  for (const [x, z] of [[-18.5, 8.5], [18.5, 8.5], [-18.5, -5.5], [18.5, -12.5]]) {
    const head = new THREE.Mesh(lampGeo, lampMat);
    head.position.set(x, 5.0, z);
    head.lookAt(0, 0, 0);
    group.add(head);
  }
  const spots = [];
  for (const [x, z, tx, tz, color] of [[-18.5, 8.5, -4, -2, '#ffd9a0'], [18.5, -12.5, 6, -10, '#cfe4ff']]) {
    const spot = new THREE.SpotLight(new THREE.Color(color), 420, 34, 0.62, 0.55, 1.4);
    spot.position.set(x, 5.0, z);
    spot.target.position.set(tx, 0, tz);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    scene.add(spot, spot.target);
    spots.push(spot);
  }

  // Furnace mouth: a hot emissive slab on the east wall, a flickering
  // orange point light, and a column of rising embers.
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.furnace) }),
  );
  mouth.position.set(17.4, 0.7, -6.6);
  mouth.rotation.y = -Math.PI / 2;
  group.add(mouth);
  const furnaceLight = new THREE.PointLight(new THREE.Color(PALETTE.furnace), 30, 12);
  furnaceLight.position.set(16.4, 1.2, -6.6);
  scene.add(furnaceLight);
  const emberGeo = new THREE.BufferGeometry();
  const emberPos = scatterPoints(rnd, EMBER_COUNT, 16.2, 17.6, 0.6, 4.5, -7.4, -5.8);
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    map: tex.ember, size: 0.22, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color('#ff9a4a'),
  }));
  embers.frustumCulled = false;
  scene.add(embers);

  // Skybox: the painted night skyline on the inside of a big sphere, plus
  // a low hemisphere wash so the rain never reads pitch black.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(110, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#33465c'), new THREE.Color('#0d141d'), 1.5);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(new THREE.Color('#b9c8dd'), 0.85);
  moon.position.set(18, 26, -14);
  scene.add(moon);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 1.5);
  key.position.set(-14, 18, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  // Rain: a thousand short streaks falling over the whole yard, recycled
  // from the top once they hit the floor.
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = scatterPoints(rnd, RAIN_COUNT, -21, 21, 0, 22, -17, 17);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    map: tex.rainStreak, size: 0.55, transparent: true, opacity: 0.5,
    depthWrite: false, color: new THREE.Color(PALETTE.rain), sizeAttenuation: true,
  }));
  rain.frustumCulled = false;
  scene.add(rain);
  const rainVel = new Float32Array(RAIN_COUNT);
  for (let i = 0; i < RAIN_COUNT; i += 1) rainVel[i] = 16 + rnd() * 9;

  // Splash rings: small flat rings on the puddles that grow and fade in a
  // slow cycle, so the rain reads as hitting the ground, not just falling.
  const splashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#a8c0d4'), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const splashes = [];
  for (let i = 0; i < 22; i += 1) {
    const [px, pz] = MAP.puddles[i % MAP.puddles.length];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 16), splashMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(px + range(rnd, -1, 1), 0.035, pz + range(rnd, -0.7, 0.7));
    ring.userData.phase = rnd();
    scene.add(ring);
    splashes.push(ring);
  }

  // Steam vents: three slow puffs drifting up from the pipe rack and the
  // furnace, reusing the smoke sprite at low opacity.
  const steamMat = new THREE.SpriteMaterial({ map: tex.puff, transparent: true, opacity: 0.16, depthWrite: false });
  const steams = [];
  for (const [x, y, z, s] of [[0, 1.6, -15.2, 2.2], [16.8, 3.6, -8, 1.8], [-16, 2.0, -2, 1.6]]) {
    const sprite = new THREE.Sprite(steamMat);
    sprite.position.set(x, y, z);
    sprite.scale.set(s, s, 1);
    sprite.userData.baseY = y;
    sprite.userData.phase = rnd() * Math.PI * 2;
    scene.add(sprite);
    steams.push(sprite);
  }

  // Sagging cables between the floodlight poles and the crane, as line
  // segments — cheap geometry, a lot of silhouette.
  const cableMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#0a0e12'), transparent: true, opacity: 0.9 });
  const cablePts = [];
  function sag(a, b, sagAmount) {
    const steps = 10;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      const y = 5.0 - Math.sin(t * Math.PI) * sagAmount;
      cablePts.push(new THREE.Vector3(x, y, z));
    }
  }
  sag([-18.5, 8.5], [18.5, 8.5], 0.9);
  sag([-18.5, -5.5], [-18.5, 8.5], 0.7);
  sag([18.5, -12.5], [-18.5, -14.5], 1.1);
  const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePts);
  const cables = new THREE.LineSegments(cableGeo, cableMat);
  cables.frustumCulled = false;
  scene.add(cables);

  // Crane beacons: two small red lamps on the jib that blink out of phase.
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b30') });
  const craneBeacons = [];
  for (const x of [-12, 12]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), beaconMat.clone());
    lamp.position.set(x, 6.9, -14.5);
    scene.add(lamp);
    craneBeacons.push(lamp);
  }

  let elapsed = 0;
  function step(dt) {
    elapsed += dt;
    // Rain falls and recycles.
    const arr = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      arr[i * 3 + 1] -= rainVel[i] * dt;
      arr[i * 3] += dt * 1.4;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 20 + rnd() * 3;
        arr[i * 3] = range(rnd, -21, 21);
        arr[i * 3 + 2] = range(rnd, -17, 17);
      }
      if (arr[i * 3] > 21) arr[i * 3] = -21;
    }
    rainGeo.attributes.position.needsUpdate = true;
    // Embers rise, wobble and recycle.
    const earr = emberGeo.attributes.position.array;
    for (let i = 0; i < EMBER_COUNT; i += 1) {
      earr[i * 3 + 1] += dt * (0.9 + (i % 5) * 0.22);
      earr[i * 3] += Math.sin(elapsed * 2.2 + i) * dt * 0.35;
      if (earr[i * 3 + 1] > 5.2) {
        earr[i * 3 + 1] = 0.6;
        earr[i * 3] = range(rnd, 16.2, 17.6);
        earr[i * 3 + 2] = range(rnd, -7.4, -5.8);
      }
    }
    emberGeo.attributes.position.needsUpdate = true;
    // Furnace light breathes; crane beacons blink out of phase.
    furnaceLight.intensity = 26 + Math.sin(elapsed * 7.3) * 5 + Math.sin(elapsed * 13.1) * 3;
    craneBeacons[0].material.opacity = 0.4 + 0.6 * (Math.sin(elapsed * 2.4) > 0 ? 1 : 0.15);
    craneBeacons[0].material.transparent = true;
    craneBeacons[1].material.opacity = 0.4 + 0.6 * (Math.sin(elapsed * 2.4 + Math.PI) > 0 ? 1 : 0.15);
    craneBeacons[1].material.transparent = true;
    // Splash rings grow and fade on their own phase.
    for (const ring of splashes) {
      const t = (elapsed * 0.9 + ring.userData.phase) % 1;
      const s = 0.4 + t * 2.4;
      ring.scale.set(s, s, 1);
      ring.material.opacity = 0.4 * (1 - t);
    }
    // Steam drifts upward and breathes.
    for (const sprite of steams) {
      sprite.position.y = sprite.userData.baseY + Math.sin(elapsed * 0.5 + sprite.userData.phase) * 0.5 + 0.3;
      sprite.material.opacity = 0.1 + 0.08 * Math.sin(elapsed * 0.8 + sprite.userData.phase);
    }
    // Site rings pulse gently so the objective reads at a glance.
    for (const b of beacons) {
      b.ring.material.opacity = 0.45 + 0.2 * Math.sin(elapsed * 1.8 + b.site.x);
    }
  }

  return { colliders, shootables, group, beacons, step, textures: tex };
}
