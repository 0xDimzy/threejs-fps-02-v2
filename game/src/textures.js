// Procedural textures, painted once on canvases at boot — no image files,
// no network. Every surface in the yard gets a real texture instead of a
// flat colour: wet concrete, corrugated container steel in three paint
// jobs, hazard striping, rain-darkened asphalt with painted lane lines, a
// night skybox with a lit skyline, and the soft sprites for rain, smoke,
// muzzle flash and furnace embers. All of it is seeded, so the look is
// stable from one load to the next.
import * as THREE from 'three';
import { mulberry32, range } from './rng.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, rnd, w, h, n, colors, size) {
  for (let i = 0; i < n; i += 1) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.globalAlpha = 0.05 + rnd() * 0.22;
    const s = 1 + rnd() * size;
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function streaks(ctx, rnd, w, h, n, color, maxLen) {
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i += 1) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 8 + rnd() * maxLen;
    ctx.globalAlpha = 0.05 + rnd() * 0.16;
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 4, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function concreteTexture(rnd) {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#2a3542';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, rnd, 256, 256, 2600, ['#35424f', '#232e3a', '#3d4a58', '#1c2530'], 3);
  streaks(ctx, rnd, 256, 256, 46, '#141c24', 60);
  ctx.strokeStyle = 'rgba(12,18,25,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    let x = rnd() * 256;
    let y = rnd() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s += 1) {
      x += (rnd() - 0.5) * 46;
      y += (rnd() - 0.5) * 46;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function containerTexture(rnd, base, rust, bay) {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, 0, 5, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x + 9, 0, 3, 256);
  }
  streaks(ctx, rnd, 256, 256, 34, rust, 90);
  speckle(ctx, rnd, 256, 256, 900, ['rgba(0,0,0,0.35)', rust], 2);
  ctx.fillStyle = 'rgba(230,235,225,0.75)';
  ctx.font = 'bold 44px ui-monospace, monospace';
  ctx.fillText(bay, 18, 52);
  ctx.fillStyle = 'rgba(230,235,225,0.28)';
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.fillText('ASHLINE YARD', 18, 236);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function hazardTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#c98f1e';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#14181d';
  for (let i = -2; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 32, 128);
    ctx.lineTo(i * 32 + 32, 128);
    ctx.lineTo(i * 32 + 64, 0);
    ctx.lineTo(i * 32 + 32, 0);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function asphaltTexture(rnd) {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#181f27';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, rnd, 512, 512, 5200, ['#202832', '#12181f', '#28313d', '#0e141a'], 3);
  for (let i = 0; i < 9; i += 1) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 24 + rnd() * 60;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(6,10,14,0.5)');
    g.addColorStop(1, 'rgba(6,10,14,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(240,161,58,0.16)';
  ctx.fillRect(60, 0, 4, 512);
  ctx.fillStyle = 'rgba(84,182,232,0.14)';
  ctx.fillRect(448, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

function skyTexture(rnd) {
  const [c, ctx] = makeCanvas(1024, 512);
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#04070d');
  sky.addColorStop(0.45, '#0a1524');
  sky.addColorStop(0.72, '#16283c');
  sky.addColorStop(1, '#0a141f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);
  const glow = ctx.createRadialGradient(180, 380, 10, 180, 380, 260);
  glow.addColorStop(0, 'rgba(240,161,58,0.34)');
  glow.addColorStop(1, 'rgba(240,161,58,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 512);
  const glowB = ctx.createRadialGradient(860, 380, 10, 860, 380, 240);
  glowB.addColorStop(0, 'rgba(84,182,232,0.26)');
  glowB.addColorStop(1, 'rgba(84,182,232,0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, 1024, 512);
  const moon = ctx.createRadialGradient(760, 92, 4, 760, 92, 60);
  moon.addColorStop(0, 'rgba(238,240,230,0.95)');
  moon.addColorStop(0.25, 'rgba(238,240,230,0.5)');
  moon.addColorStop(1, 'rgba(238,240,230,0)');
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(760, 92, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eef0e6';
  ctx.beginPath();
  ctx.arc(760, 92, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#05090f';
  let x = 0;
  while (x < 1024) {
    const w = 26 + rnd() * 70;
    const h = 40 + rnd() * 130;
    ctx.fillRect(x, 400 - h, w, h);
    for (let wy = 400 - h + 8; wy < 392; wy += 14) {
      for (let wx = x + 5; wx < x + w - 5; wx += 11) {
        if (rnd() < 0.22) {
          ctx.fillStyle = rnd() < 0.7 ? 'rgba(255,214,140,0.85)' : 'rgba(150,210,240,0.85)';
          ctx.fillRect(wx, wy, 4, 6);
          ctx.fillStyle = '#05090f';
        }
      }
    }
    x += w + 4 + rnd() * 22;
  }
  ctx.fillStyle = '#05090f';
  ctx.fillRect(0, 398, 1024, 114);
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = `rgba(120,150,180,${0.04 + rnd() * 0.05})`;
    const y = 40 + rnd() * 220;
    ctx.fillRect(rnd() * 1024, y, 180 + rnd() * 260, 5 + rnd() * 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function streakSprite() {
  const [c, ctx] = makeCanvas(16, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(157,180,200,0)');
  g.addColorStop(0.5, 'rgba(157,180,200,0.85)');
  g.addColorStop(1, 'rgba(157,180,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(6, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

function puffSprite() {
  const [c, ctx] = makeCanvas(128, 128);
  const rnd = mulberry32(77);
  for (let i = 0; i < 26; i += 1) {
    const x = 34 + rnd() * 60;
    const y = 34 + rnd() * 60;
    const r = 14 + rnd() * 26;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(200,205,210,0.32)');
    g.addColorStop(1, 'rgba(200,205,210,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

function glowSprite(inner, outer) {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, outer);
  g.addColorStop(1, 'rgba(240,161,58,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// One label sprite per callout name: pale text on a dark plate, floating
// above the lane so the map reads its own names in the 3D view.
export function labelSprite(text) {
  const [c, ctx] = makeCanvas(256, 48);
  ctx.fillStyle = 'rgba(10,14,18,0.62)';
  ctx.fillRect(0, 0, 256, 48);
  ctx.strokeStyle = 'rgba(200,212,222,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 46);
  ctx.fillStyle = '#c8d4de';
  ctx.font = 'bold 26px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 26);
  return new THREE.CanvasTexture(c);
}

export function buildTextures(seed = 7) {
  const rnd = mulberry32(seed);
  return {
    concrete: concreteTexture(rnd),
    containerA: containerTexture(rnd, '#7a3b2e', '#4a241c', '07'),
    containerB: containerTexture(rnd, '#2e5a66', '#1c3942', '12'),
    containerC: containerTexture(rnd, '#8a6d2f', '#54401a', '23'),
    hazard: hazardTexture(),
    asphalt: asphaltTexture(rnd),
    sky: skyTexture(rnd),
    rainStreak: streakSprite(),
    puff: puffSprite(),
    muzzle: glowSprite('rgba(255,244,214,1)', 'rgba(240,161,58,0.9)'),
    ember: glowSprite('rgba(255,170,80,1)', 'rgba(255,122,42,0.85)'),
  };
}

export function scatterPoints(rnd, count, x0, x1, y0, y1, z0, z1) {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    out[i * 3] = range(rnd, x0, x1);
    out[i * 3 + 1] = range(rnd, y0, y1);
    out[i * 3 + 2] = range(rnd, z0, z1);
  }
  return out;
}
