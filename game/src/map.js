// Ironworks Yard, night rain edition: the map as data. One source of truth
// — world.js builds meshes, colliders and lights from BOXES and CYLINDERS,
// hud.js draws the minimap from the same boxes, bots.js walks ROUTES.
// Coordinates: x east, z south; the yard is 40 x 32 m, the two sites sit at
// the north end (z = -11), FERRO spawns south (z = +13.5), SLAG spawns
// north. Three lanes join them: A-long down the west side past the
// furnace, mid through the container canyon, B-tunnel under the gantry
// east. A low catwalk and stacked containers add a second level you can
// jump onto; the rain does the rest of the mood.
//
// CALLOUTS name every fighting position: the bots call them over the radio
// ("pushing A LONG", "one CATWALK"), the minimap prints them, and the
// kill feed names where a charge was dropped.
export const MAP = {
  bounds: { minX: -20, maxX: 20, minZ: -16, maxZ: 16 },
  playerSpawn: [0, 13.5],
  allySpawns: [[-4, 14.5], [-1.5, 14.8], [1.5, 14.8], [4, 14.5]],
  enemySpawns: [[-16, -13.5], [-8, -14], [0, -14.2], [8, -14], [16, -13.5]],
  plantRadius: 3.4,
  sites: [
    { id: 'A', name: 'Site A', x: -14, z: -11, color: 'siteA' },
    { id: 'B', name: 'Site B', x: 14, z: -11, color: 'siteB' },
  ],
  // [width, height, depth, x, y, z, palette material]
  boxes: [
    [40.8, 0.4, 32.8, 0, -0.2, 0, 'canvas'],
    [0.4, 5.2, 32.8, -20.2, 2.6, 0, 'surface'],
    [0.4, 5.2, 32.8, 20.2, 2.6, 0, 'surface'],
    [40.8, 5.2, 0.4, 0, 2.6, -16.2, 'surface'],
    [40.8, 5.2, 0.4, 0, 2.6, 16.2, 'surface'],
    [2.6, 3.4, 2.2, 17.5, 1.7, -8, 'hairline'],
    [1.4, 1.1, 1.4, 17.5, 3.95, -8, 'accent'],
    [2.2, 1.4, 0.6, 17.5, 0.7, -6.6, 'furnace'],
    [0.9, 6.4, 0.9, -18.5, 3.2, -14.5, 'hairline'],
    [0.9, 6.4, 0.9, 18.5, 3.2, -14.5, 'hairline'],
    [38.0, 0.8, 0.9, 0, 6.4, -14.5, 'containerC'],
    [1.6, 1.0, 1.2, -6, 5.6, -14.5, 'accent'],
    [0.8, 1.15, 4.4, -12.4, 0.58, -4, 'hairline'],
    [1.5, 1.1, 1.5, -15.5, 0.55, 2.5, 'hairline'],
    [1.5, 1.1, 1.5, -15.5, 0.55, 4.2, 'surface'],
    [1.2, 2.2, 1.2, -10.5, 1.1, -9.5, 'surface'],
    [3.0, 1.0, 1.6, -17.8, 0.5, 0.5, 'containerA'],
    [3.0, 2.4, 1.6, -17.8, 2.2, 0.5, 'containerB'],
    [2.4, 2.4, 1.6, -17.8, 1.2, -2.6, 'containerC'],
    [5.4, 2.6, 1.6, -4.2, 1.3, 1.5, 'containerA'],
    [5.4, 2.6, 1.6, 4.2, 1.3, 1.5, 'containerB'],
    [5.4, 2.6, 1.6, -4.2, 3.9, 1.5, 'containerC'],
    [1.6, 1.1, 1.6, -1.2, 0.55, -3.5, 'hairline'],
    [1.6, 1.1, 1.6, 1.4, 0.55, -3.5, 'hairline'],
    [1.2, 2.4, 1.2, 0, 1.2, -8.5, 'hairline'],
    [4.4, 1.0, 1.8, 0, 0.5, 4.6, 'hairline'],
    [4.4, 0.14, 0.3, 0, 1.07, 3.8, 'accent'],
    [1.0, 3.6, 1.0, -6.5, 1.8, -9.5, 'surface'],
    [1.0, 3.6, 1.0, 6.5, 1.8, -9.5, 'surface'],
    [1.0, 4.4, 1.0, -6.5, 2.2, -13.5, 'surface'],
    [1.0, 4.4, 1.0, 6.5, 2.2, -13.5, 'surface'],
    [7.0, 0.5, 6.0, 15.5, 2.85, 3.5, 'surface'],
    [0.8, 2.6, 0.8, 12.4, 1.3, 1.0, 'hairline'],
    [0.8, 2.6, 0.8, 12.4, 1.3, 6.0, 'hairline'],
    [0.8, 2.6, 0.8, 18.6, 1.3, 1.0, 'hairline'],
    [0.8, 2.6, 0.8, 18.6, 1.3, 6.0, 'hairline'],
    [1.5, 1.1, 1.5, 16.5, 0.55, -3.5, 'hairline'],
    [1.5, 2.2, 1.5, 11.0, 1.1, -6.5, 'surface'],
    [3.0, 2.4, 1.6, 17.8, 1.2, -0.5, 'containerB'],
    [3.0, 1.0, 1.6, 17.8, 0.5, 1.8, 'containerA'],
    [2.6, 1.3, 1.4, 10.5, 0.65, -12.5, 'hairline'],
    [2.6, 1.0, 1.2, -3.0, 0.5, 9.0, 'hairline'],
    [2.6, 1.0, 1.2, 3.0, 0.5, 9.0, 'hairline'],
    [1.2, 1.0, 1.2, 0, 0.5, 11.5, 'surface'],
    [1.4, 2.0, 1.4, -7, 1.0, 6.5, 'surface'],
    [1.4, 2.0, 1.4, 7, 1.0, 6.5, 'surface'],
    [2.2, 1.0, 1.2, -10.5, 0.5, 10.5, 'containerC'],
    [2.2, 1.0, 1.2, 10.5, 0.5, 10.5, 'containerA'],
    [2.4, 0.7, 0.9, -3.5, 0.35, -6.5, 'surface'],
    [2.4, 0.7, 0.9, 3.5, 0.35, -6.5, 'surface'],
    [2.4, 0.7, 0.9, -3.5, 0.35, 8.5, 'hairline'],
    [2.4, 0.7, 0.9, 3.5, 0.35, 8.5, 'hairline'],
    [6.0, 0.9, 0.9, 0, 0.45, -15.4, 'hairline'],
    [6.0, 0.9, 0.9, 0, 1.35, -15.4, 'surface'],
    [0.35, 5.0, 0.35, -18.5, 2.5, 8.5, 'hairline'],
    [0.35, 5.0, 0.35, 18.5, 2.5, 8.5, 'hairline'],
    [0.35, 5.0, 0.35, -18.5, 2.5, -5.5, 'hairline'],
    [0.35, 5.0, 0.35, 18.5, 2.5, -12.5, 'hairline'],
    [1.1, 1.1, 1.1, -17.0, 0.55, -13.5, 'hairline'],
    [1.1, 1.1, 1.1, -11.0, 0.55, -13.5, 'hairline'],
    [1.1, 1.1, 1.1, 11.0, 0.55, -13.5, 'hairline'],
    [1.1, 1.1, 1.1, 17.0, 0.55, -13.5, 'hairline'],
    [3.2, 1.0, 0.8, -14, 0.5, -7.6, 'hairline'],
    [3.2, 1.0, 0.8, 14, 0.5, -7.6, 'hairline'],
    [1.6, 0.9, 1.2, -9.5, 0.45, 3.0, 'containerC'],
    [1.6, 0.9, 1.2, 9.5, 0.45, 3.0, 'containerA'],
    [1.6, 0.9, 1.2, -2.0, 0.45, -11.5, 'hairline'],
    [1.6, 0.9, 1.2, 2.0, 0.45, -11.5, 'hairline'],
  ],
  // Cylinders: [radius, height, x, z, material, collider?] — barrels, cable
  // reels and pipe runs. The last flag says whether it blocks movement.
  cylinders: [
    [0.42, 1.05, -18.5, -5, 'hairline', true],
    [0.42, 1.05, 18.5, -5, 'hairline', true],
    [0.42, 1.05, -6, 12.5, 'hairline', true],
    [0.42, 1.05, 6, 12.5, 'hairline', true],
    [0.42, 1.05, -18.5, 12.5, 'hairline', true],
    [0.42, 1.05, 18.5, 12.5, 'hairline', true],
    [0.42, 1.05, -13.5, -13.8, 'containerA', true],
    [0.42, 1.05, 13.5, -13.8, 'containerB', true],
    [0.55, 0.9, -11.5, 6.0, 'containerC', true],
    [0.55, 0.9, 11.5, 6.0, 'containerA', true],
    [0.3, 2.2, -19.6, 2.0, 'surface', false],
    [0.3, 2.2, -19.6, -2.0, 'surface', false],
    [0.3, 2.2, 19.6, 2.0, 'surface', false],
    [0.3, 2.2, 19.6, -2.0, 'surface', false],
  ],
  // Visual-only floor strips (no collider): [width, depth, x, z, material].
  strips: [
    [2.2, 24, -14, -2, 'siteA'],
    [2.2, 24, 14, -2, 'siteB'],
    [2.2, 20, 0, 2, 'hairline'],
    [1.0, 24, -8, -2, 'hairline'],
    [1.0, 24, 8, -2, 'hairline'],
  ],
  // Puddles: [x, z, radiusX, radiusZ] — rain-slick reflective patches.
  puddles: [
    [-6, 2, 2.2, 1.4],
    [5, -4, 1.8, 1.2],
    [0, -10, 2.6, 1.5],
    [-14, -4, 1.6, 1.1],
    [14, -4, 1.6, 1.1],
    [-10, 11, 2.0, 1.3],
    [10, 11, 2.0, 1.3],
    [0, 8, 1.5, 1.0],
  ],
  // Named fighting positions. Bots radio them, the minimap prints them.
  callouts: [
    { name: 'A LONG', x: -15.5, z: -2 },
    { name: 'FURNACE', x: 17.5, z: -8 },
    { name: 'CATWALK', x: 0, z: 4.6 },
    { name: 'MID', x: 0, z: 7 },
    { name: 'CANYON', x: 0, z: -1 },
    { name: 'B TUNNEL', x: 15, z: 0 },
    { name: 'GANTRY', x: 15.5, z: 3.5 },
    { name: 'SITE A', x: -14, z: -11 },
    { name: 'SITE B', x: 14, z: -11 },
    { name: 'A DOOR', x: -14, z: -7 },
    { name: 'B DOOR', x: 14, z: -7 },
    { name: 'SPAWN', x: 0, z: 13.5 },
  ],
  // Waypoint graph: id -> [x, z]. Bots follow ROUTES; a hunting bot steers
  // to the nearest node, then along nodes toward its target.
  nodes: {
    spawn: [0, 13],
    aCorner: [-15, 6],
    aLong: [-16, -2],
    aDoor: [-14, -7],
    aSite: [-14, -11],
    aMid: [-8, -2],
    aTop: [-17.8, 0.5],
    midLow: [0, 7],
    midCanyon: [0, -1],
    midDoor: [0, -7],
    midWalk: [0, 4.6],
    bCorner: [15, 6],
    bTun: [15, 0],
    bDoor: [14, -7],
    bSite: [14, -11],
    bMid: [8, -2],
    northMid: [0, -12],
    aBack: [-18, -13],
    bBack: [18, -13],
  },
  // FERRO routes (player's side): one per ally bot, last node is the hold.
  ferroRoutes: [
    ['aCorner', 'aLong', 'aDoor', 'aSite'],
    ['midLow', 'midCanyon', 'midDoor', 'northMid'],
    ['bCorner', 'bTun', 'bDoor', 'bSite'],
    ['aMid', 'midCanyon', 'aMid', 'bMid'],
  ],
  // SLAG routes: one per defender, last node is the hold.
  slagRoutes: [
    ['aCorner', 'aLong', 'aDoor', 'aSite'],
    ['midLow', 'midCanyon', 'midDoor', 'northMid'],
    ['bCorner', 'bTun', 'bDoor', 'bSite'],
    ['aMid', 'midCanyon', 'aMid', 'bMid'],
    ['bMid', 'midCanyon', 'midDoor', 'aSite'],
  ],
  // Where each bot holds: [x, z, facing yaw]. Yaw 0 faces south; a bot
  // watching the FERRO spawn uses yaw Math.PI.
  ferroHolds: [
    [-14, -9.5, Math.PI],
    [0, -11.5, Math.PI],
    [14, -9.5, Math.PI],
    [-8, -2, Math.PI * 0.75],
  ],
  slagHolds: [
    [-14, -9.5, Math.PI],
    [0, -11.5, Math.PI],
    [14, -9.5, Math.PI],
    [-8, -2, Math.PI * 0.75],
    [8, -2, Math.PI * 1.25],
  ],
};

// Nearest named position to (x, z), or null when nowhere near one. Used
// for radio calls and for naming where a charge was dropped.
export function calloutAt(x, z) {
  let best = null;
  let bestGap = 36;
  for (const c of MAP.callouts) {
    const gap = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
    if (gap < bestGap) {
      bestGap = gap;
      best = c.name;
    }
  }
  return best;
}
