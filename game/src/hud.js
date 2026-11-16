// Every overlay in the game, kept apart from the simulation so a style
// tweak never touches the rules. Two layers: the top bar (round, score
// first to seven, phase and clock, charge line, disarm line, armour and
// kit, weapon and magazines) and the centred screens (buy menu, round
// banner, pause, results). The buy menu is a real HUD panel — nine rows,
// key hints, prices, and a running total — drawn from the same catalogue
// the rules enforce. A second, lighter strip at the bottom left is the
// death feed: the last few kills, newest first, with the gun name
// between them. When the round is over the HUD dims and the panel shows
// the board: rounds won, money banked, and a line that says exactly what
// ended the round — planted, defused, won on time, or cleared.
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { BUY_KEYS, PLANT_SECONDS } from './state.js';

const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:monospace;z-index:20;color:#d8e2ea';
const rows = {
  top: document.createElement('div'),
  charge: document.createElement('div'),
  disarm: document.createElement('div'),
  health: document.createElement('div'),
  ammo: document.createElement('div'),
  gun: document.createElement('div'),
  feed: document.createElement('div'),
  cross: document.createElement('div'),
  banner: document.createElement('div'),
  map: document.createElement('canvas'),
  menu: document.createElement('div'),
};
rows.top.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);font-size:15px;letter-spacing:1px;text-shadow:0 1px 2px #000,0 0 8px #000;background:rgba(8,12,16,.55);padding:8px 16px;border-radius:8px;border:1px solid rgba(216,226,234,.18)';
rows.charge.style.cssText = 'position:absolute;top:60px;left:50%;transform:translateX(-50%);font-size:15px;font-weight:bold;letter-spacing:1px;text-shadow:0 1px 2px #000;background:rgba(8,12,16,.55);padding:6px 14px;border-radius:8px;border:1px solid rgba(255,138,0,.5);color:#ff9a3d';
rows.disarm.style.cssText = 'position:absolute;top:104px;left:50%;transform:translateX(-50%);font-size:15px;font-weight:bold;letter-spacing:1px;text-shadow:0 1px 2px #000;background:rgba(8,12,16,.55);padding:6px 14px;border-radius:8px;border:1px solid rgba(255,214,64,.5);color:#ffd640';
rows.health.style.cssText = 'position:absolute;left:18px;bottom:16px;font-size:22px;font-weight:bold;text-shadow:0 1px 2px #000,0 0 8px #000';
rows.ammo.style.cssText = 'position:absolute;right:18px;bottom:16px;font-size:20px;text-align:right;text-shadow:0 1px 2px #000,0 0 8px #000';
rows.gun.style.cssText = 'position:absolute;right:18px;bottom:46px;font-size:13px;color:#9fb4c4;text-shadow:0 1px 2px #000';
// Kill feed sits below the top bar, not beside it: at top:14px its
// longest line ran under the centred score pill and crossed its edge.
rows.feed.style.cssText = 'position:absolute;left:18px;top:64px;font-size:12px;line-height:1.7;color:#9fb4c4;text-shadow:0 1px 2px #000';
rows.cross.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:14px;color:#d8e2ea;text-shadow:0 0 3px #000';
rows.banner.style.cssText = 'position:absolute;left:50%;top:32%;transform:translate(-50%,-50%);font-size:30px;font-weight:bold;text-align:center;text-shadow:0 2px 6px #000,0 0 18px #000;white-space:pre-line';
rows.map.style.cssText = 'position:absolute;left:14px;bottom:64px;border-radius:8px;background:rgba(8,12,16,.6);border:1px solid rgba(216,226,234,.18)';
rows.map.width = 148;
rows.map.height = 124;
const calloutCtx = rows.map.getContext('2d');
rows.menu.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:560px;max-width:92vw;background:rgba(8,12,16,.94);border:1px solid rgba(216,226,234,.25);border-radius:10px;padding:16px 20px;font-size:14px;pointer-events:none';
hud.append(rows.top, rows.charge, rows.disarm, rows.health, rows.ammo, rows.gun, rows.feed, rows.cross, rows.banner, rows.map, rows.menu);
document.body.append(hud);

function fmtClock(seconds) {
  const t = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

let menuVisible = false;
function buildMenu(catalog, balance, purchased, carrying) {
  const bought = new Set(purchased);
  const keys = Object.keys(BUY_KEYS);
  let lines = `<div style="font-size:18px;font-weight:bold;letter-spacing:2px;margin-bottom:2px">BUY MENU <span style="color:#ffd640">— $${balance}</span></div>`;
  lines += '<div style="color:#9fb4c4;margin-bottom:10px">buy while the shop is open · keys 1–9 · G to close · the charge is not for sale</div>';
  for (const key of keys) {
    // BUY_KEYS maps key codes (Digit1..Digit0) to item ids; the catalogue
    // is keyed by item id, so look the item up through the map — a direct
    // catalog[key] lookup misses every row and renders an empty menu.
    const itemId = BUY_KEYS[key];
    const item = catalog[itemId];
    if (!item) continue;
    const owned = bought.has(itemId) || item.owned;
    const tag = owned ? 'OWNED' : `$${item.price}`;
    lines += `<div style="display:flex;justify-content:space-between;padding:5px 4px;border-top:1px solid rgba(216,226,234,.12)"><span><b style="color:#ffd640">[${key.replace('Digit', '')}]</b> ${item.label}${item.note ? ` <span style="color:#9fb4c4">— ${item.note}</span>` : ''}</span><span style="color:${owned ? '#7fd08a' : '#d8e2ea'}">${tag}</span></div>`;
  }
  lines += '<div style="margin-top:10px;color:#9fb4c4;font-size:12px">knife stays free, always · buy order: vest+helm, then a rifle, then grenades · the carry stays with the carrier, money stays with the buyer</div>';
  if (carrying) lines += '<div style="margin-top:6px;color:#ff9a3d">you are carrying the charge — plant it at A or B</div>';
  rows.menu.innerHTML = lines;
}

export function showMenu(catalog, balance, purchased, carrying) {
  menuVisible = true;
  buildMenu(catalog, balance, purchased, carrying);
  rows.menu.style.display = 'block';
}
export function hideMenu() {
  menuVisible = false;
  rows.menu.style.display = 'none';
}
export function isMenuVisible() {
  return menuVisible;
}
export function flashBanner(text, color = PALETTE.accent) {
  rows.banner.textContent = text;
  rows.banner.style.color = color;
  rows.banner.style.display = 'block';
}
export function hideBanner() {
  rows.banner.style.display = 'none';
}

let flashOverlay = null;
export function flashWhite(strength) {
  if (!flashOverlay) {
    flashOverlay = document.createElement('div');
    flashOverlay.style.cssText = 'position:fixed;inset:0;background:#fff;pointer-events:none;z-index:30;opacity:0';
    document.body.append(flashOverlay);
  }
  flashOverlay.style.opacity = String(Math.max(0, Math.min(1, strength)));
}
export function fadeFlash(amount) {
  if (flashOverlay) flashOverlay.style.opacity = String(Math.max(0, parseFloat(flashOverlay.style.opacity || '0') - amount));
}

function buildMapCtx(x, z, w, h) {
  const px = 6 + ((x + 21) / 42) * (w - 12);
  const py = 6 + ((z + 17) / 34) * (h - 12);
  return [px, py];
}

function renderMap(state) {
  const ctx = calloutCtx;
  const w = rows.map.width;
  const h = rows.map.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(20,26,34,0.9)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(216,226,234,0.22)';
  ctx.strokeRect(1, 1, w - 2, h - 2);
  for (const box of MAP.boxes) {
    if (box[1] <= 0.4) continue;
    const [x0] = buildMapCtx(box[3] - box[0] / 2, box[5] - box[2] / 2, w, h);
    const [x1] = buildMapCtx(box[3] + box[0] / 2, box[5] + box[2] / 2, w, h);
    const [, y0] = buildMapCtx(box[3], box[5] - box[2] / 2, w, h);
    const [, y1] = buildMapCtx(box[3], box[5] + box[2] / 2, w, h);
    ctx.fillStyle = 'rgba(216,226,234,0.30)';
    ctx.fillRect(x0, y0, Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
  for (const [w2, d2, x, z] of MAP.strips) {
    const [x0] = buildMapCtx(x - w2 / 2, z - d2 / 2, w, h);
    const [x1] = buildMapCtx(x + w2 / 2, z + d2 / 2, w, h);
    const [, y0] = buildMapCtx(x, z - d2 / 2, w, h);
    const [, y1] = buildMapCtx(x, z + d2 / 2, w, h);
    ctx.fillStyle = 'rgba(255,138,0,0.35)';
    ctx.fillRect(x0, y0, Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
  for (const site of MAP.sites) {
    const [px, py] = buildMapCtx(site.x, site.z, w, h);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff8a00';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ff8a00';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(site.id, px - 3, py - 8);
  }
  for (const c of MAP.callouts) {
    const [px, py] = buildMapCtx(c.x, c.z, w, h);
    ctx.fillStyle = 'rgba(216,226,234,0.75)';
    ctx.font = '8px monospace';
    ctx.fillText(c.name, px + 3, py + 3);
  }
  const [cx, cy] = buildMapCtx(state.playerX, state.playerZ, w, h);
  ctx.fillStyle = '#7fd08a';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7fd08a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(state.yaw) * -8, cy + Math.cos(state.yaw) * -8);
  ctx.stroke();
  for (const ally of state.allies) {
    if (!ally.alive) continue;
    const [ax, ay] = buildMapCtx(ally.x, ally.z, w, h);
    ctx.fillStyle = '#7fb4d8';
    ctx.beginPath();
    ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const [ex, ey] = buildMapCtx(enemy.x, enemy.z, w, h);
    ctx.fillStyle = '#ff6b5e';
    ctx.beginPath();
    ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.charge && state.charge.status === 'dropped') {
    const [px, py] = buildMapCtx(state.charge.x, state.charge.z, w, h);
    ctx.fillStyle = '#ff8a00';
    ctx.fillRect(px - 3, py - 3, 6, 6);
  }
}

export function updateHud(state) {
  const phaseText = state.phase === 'buy' ? 'BUY' : state.phase === 'round' ? 'ROUND' : state.phase === 'post' ? 'POST' : state.phase;
  const siteText = state.charge.site ? ` · SITE ${state.charge.site.id}` : '';
  rows.top.textContent = `FERRO ${state.rounds.ferro} — ${state.rounds.slag} SLAG · FIRST TO 7 · ROUND ${state.round} · ${phaseText} ${fmtClock(state.clock)}${state.charge.status === 'planted' ? ` · FUSE ${fmtClock(state.fuseLeft)}` : ''}`;
  if (state.charge.status === 'carried' && state.carrying) {
    rows.charge.style.display = 'block';
    if (state.planting && state.planting.active) {
      rows.charge.textContent = `PLANTING AT ${state.planting.site} — ${state.planting.progress.toFixed(1)}s / ${PLANT_SECONDS}s — keep holding E`;
    } else {
      rows.charge.textContent = `CHARGE ON YOU — plant at ${state.charge.site ? state.charge.site.id : 'A or B'} (hold E)`;
    }
  } else if (state.charge.status === 'dropped') {
    rows.charge.style.display = 'block';
    rows.charge.textContent = 'CHARGE DROPPED — pick it up (walk over it)';
  } else if (state.charge.status === 'planted') {
    rows.charge.style.display = 'block';
    rows.charge.textContent = `CHARGE PLANTED${siteText} — ${fmtClock(state.fuseLeft)} to detonation`;
  } else if (state.charge.status === 'carried' && state.carrierName) {
    rows.charge.style.display = 'block';
    rows.charge.textContent = `CHARGE WITH ${state.carrierName} — cover the carrier`;
  } else {
    rows.charge.style.display = 'none';
  }
  if (state.charge.status === 'planted' && state.disarm.active) {
    rows.disarm.style.display = 'block';
    const kit = state.disarm.kit ? ' (kit — 3.6s)' : ' (7s)';
    rows.disarm.textContent = `DEFUSE IN PROGRESS — ${state.disarm.name}${kit} · ${state.disarm.progress.toFixed(1)}s`;
  } else {
    rows.disarm.style.display = 'none';
  }
  const hpColor = state.hp > 60 ? '#7fd08a' : state.hp > 30 ? '#ffd640' : '#ff6b5e';
  const armorLine = state.armor > 0 ? ` · ARMOUR ${state.armor === 2 ? 'VEST+HELM' : 'VEST'}` : '';
  const kitLine = state.kit ? ' · KIT' : '';
  rows.health.innerHTML = `<span style="color:${hpColor}">${Math.ceil(state.hp)} HP</span><span style="font-size:13px;color:#9fb4c4"> · $${state.money}${armorLine}${kitLine}</span>`;
  rows.ammo.textContent = state.reload ? 'RELOADING…' : `${state.mag}/${state.reserve}`;
  rows.gun.textContent = `${state.gun} · ${state.fireMode} · ${state.accuracy}`;
  rows.feed.innerHTML = state.feed.map((line) => `<div>${line}</div>`).join('');
  rows.cross.textContent = state.phase === 'round' && state.pointerLocked ? '+' : '';
  rows.cross.style.fontSize = state.crouch ? '11px' : '14px';
  renderMap(state);
}

export function clearHud() {
  rows.top.textContent = '';
  rows.charge.style.display = 'none';
  rows.disarm.style.display = 'none';
  rows.feed.innerHTML = '';
  rows.banner.style.display = 'none';
}
