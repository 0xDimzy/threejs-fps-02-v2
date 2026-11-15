// Night rain over the Ironworks Yard. ASHLINE v4 trades the old dusk for a
// wet night: cold slate and steel, rain-slick amber from the furnace and the
// floodlights, and the same two site colours (amber A, cyan B) so the HUD,
// the minimap and the site beacons all agree with each other. index.html's
// CSS variables repeat these names, so the page and the 3D scene stay in
// step when one of them changes.
export const PALETTE = {
  canvas: '#0d141d',
  surface: '#232f3d',
  hairline: '#46586a',
  ink: '#eef0e6',
  muted: '#8fa0ae',
  accent: '#f0a13a',
  enemy: '#e5484d',
  ally: '#3fc7a8',
  siteA: '#f0a13a',
  siteB: '#54b6e8',
  rain: '#9db4c8',
  furnace: '#ff7a2a',
  lamp: '#ffd9a0',
  containerA: '#7a3b2e',
  containerB: '#2e5a66',
  containerC: '#8a6d2f',
};

// The two sides, by name and colour. Everything that draws a team — HUD
// pips, minimap dots, bot visors, the score line — reads from here.
export const TEAM = {
  ferro: { name: 'FERRO', colour: PALETTE.ally },
  slag: { name: 'SLAG', colour: PALETTE.enemy },
};

export const SITE_COLOURS = {
  A: PALETTE.siteA,
  B: PALETTE.siteB,
};
