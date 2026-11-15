// The DOM HUD: health, armour, ammo, money, timer, score, team pips,
// kill feed, round banner, plant bar, buy menu and the minimap. It never
// touches the simulation; main.js pushes numbers in and reads the play/buy
// callbacks out. The minimap is drawn from the same MAP boxes the world is
// built from, and its static layer is rendered once to an offscreen canvas
// — each frame only blits it and draws the moving dots and player arrow.
// Five pips a side now: FERRO is the player plus four allies, SLAG is
// five defenders. Ally dots are always on the map; enemies only show once
// heard, or always once the charge is planted.
import { MAP } from './map.js';

const COPY = {
  start: {
    title: 'ASHLINE',
    copy: 'FERRO vs SLAG in the Ironworks Yard, in the rain. Five against five — plant the charge at Site A or Site B, or eliminate all five defenders. First to 5 rounds.',
    action: 'Click to play',
  },
  paused: {
    title: 'ASHLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

// World bounds the minimap covers: x in [-20, 20], z in [-16, 16].
function project(x, z, width, height) {
  return [((x + 20) / 40) * width, ((z + 16) / 32) * height];
}

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoBox = $('ammo');
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const armorInd = $('armor-ind');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const roundScore = $('round-score-text');
  const aliveV = $('alive-v');
  const aliveC = $('alive-c');
  const objective = $('objective');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const buyPanel = $('buy');
  const buyMoney = $('buy-money');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const flash = $('flash');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');
  const mapStatic = document.createElement('canvas');
  mapStatic.width = minimap.width;
  mapStatic.height = minimap.height;
  let staticBuilt = false;

  function buildStaticMap() {
    const ctx = mapStatic.getContext('2d');
    const width = mapStatic.width;
    const height = mapStatic.height;
    ctx.fillStyle = 'rgba(13,17,24,0.88)';
    ctx.fillRect(0, 0, width, height);
    for (const [w, h, d, x, y, z] of MAP.boxes) {
      if (h < 1.5 || y < 0) continue;
      const [px, py] = project(x - w / 2, z - d / 2, width, height);
      ctx.fillStyle = 'rgba(143,160,174,0.55)';
      ctx.fillRect(px, py, Math.max(1, (w / 40) * width), Math.max(1, (d / 32) * height));
    }
    for (const site of MAP.sites) {
      const [px, py] = project(site.x, site.z, width, height);
      ctx.fillStyle = site.id === 'A' ? '#f0a13a' : '#54b6e8';
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f141b';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(site.id, px, py);
    }
    staticBuilt = true;
  }

  let hitTimer = 0;
  let bannerTimer = 0;
  let flashTimer = 0;
  let last = {};
  let buyHandler = null;

  // Skip DOM writes whose value did not change — the HUD updates every
  // frame, and most of its text is the same from one frame to the next.
  function setText(element, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value;
  }

  buyPanel.querySelectorAll('[data-buy]').forEach((button) => {
    button.addEventListener('click', () => {
      if (buyHandler) buyHandler(button.dataset.buy);
    });
  });

  return {
    setHealth(hp, armor) {
      setText(healthNum, String(Math.max(0, Math.ceil(hp))), 'hp');
      healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      healthFill.classList.toggle('low', hp <= 30);
      armorInd.hidden = !armor;
    },
    setAmmo(mag, reserve, weapon, grenades, smoke, flashCount) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'res');
      setText(weaponName, weapon, 'wpn');
      const parts = [];
      if (grenades > 0) parts.push(`◉ ${grenades}`);
      if (smoke > 0) parts.push(`☁ ${smoke}`);
      if (flashCount > 0) parts.push(`✦ ${flashCount}`);
      setText(grenadeCount, parts.join(' · '), 'grn');
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(moneyValue, `$${value}`, 'money');
      setText(buyMoney, `$${value}`, 'buymoney');
    },
    setTimer(seconds, phase) {
      const value = `${Math.max(0, Math.ceil(seconds))}`;
      setText(timerValue, value, 'timer');
      timerValue.classList.toggle('urgent', seconds <= 10 && phase === 'live');
      timerValue.classList.toggle('fuse', phase === 'fuse');
    },
    setScore(wins, losses, round) {
      setText(roundScore, `FERRO ${wins} — ${losses} SLAG · R${round}`, 'score');
    },
    setAlive(ferro, slag) {
      setText(aliveV, '●'.repeat(ferro) + '○'.repeat(Math.max(0, 5 - ferro)), 'av');
      setText(aliveC, '●'.repeat(slag) + '○'.repeat(Math.max(0, 5 - slag)), 'ac');
    },
    setObjective(text) {
      setText(objective, text, 'obj');
    },
    feed(text, kind) {
      const entry = document.createElement('div');
      entry.className = `feed-${kind || 'info'}`;
      entry.textContent = text;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => {
        if (entry.parentNode) entry.parentNode.removeChild(entry);
      }, 6000);
    },
    banner(titleText, subText, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText || '';
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    setPlant(progress, fuse, label) {
      if (progress === null && fuse === null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      if (progress !== null) {
        plantFill.style.width = `${Math.round(progress * 100)}%`;
        plantFill.classList.remove('fuse-fill');
      } else {
        plantFill.style.width = `${Math.round((fuse / 35) * 100)}%`;
        plantFill.classList.add('fuse-fill');
      }
      setText(plantLabel, label || '', 'plantlabel');
    },
    showBuy(show, owned, money, counts) {
      buyPanel.hidden = !show;
      if (!show) return;
      buyPanel.querySelectorAll('[data-buy]').forEach((button) => {
        const id = button.dataset.buy;
        const price = Number(button.dataset.price);
        const stateEl = button.querySelector('.buy-state');
        if (id === 'smg' || id === 'shotgun' || id === 'sniper') {
          const isOwned = owned.has(id);
          button.disabled = isOwned || money < price;
          button.classList.toggle('owned', isOwned);
          stateEl.textContent = isOwned ? 'OWNED' : `$${price}`;
        } else {
          const held = counts ? (counts[id] || 0) : 0;
          button.disabled = held >= 2 || money < price;
          button.classList.toggle('owned', held > 0);
          stateEl.textContent = held > 0 ? `×${held} · $${price}` : `$${price}`;
        }
      });
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on', 'kill');
      }, holdMs);
    },
    damageFlash() {
      damage.classList.remove('flash');
      void damage.offsetWidth;
      damage.classList.add('flash');
    },
    flashWhite(strength, holdMs) {
      flash.style.opacity = String(Math.min(1, strength));
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flash.style.opacity = '0';
      }, holdMs);
    },
    setScoped(scoped) {
      crosshair.classList.toggle('scoped', scoped);
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    drawMinimap(playerX, playerZ, yaw, bots, plant, time) {
      const width = minimap.width;
      const height = minimap.height;
      if (!staticBuilt) buildStaticMap();
      mapCtx.clearRect(0, 0, width, height);
      mapCtx.drawImage(mapStatic, 0, 0);
      // A planted site blinks on top of its static marker.
      if (plant.status === 'planted' && plant.site) {
        const [px, py] = project(plant.site.x, plant.site.z, width, height);
        mapCtx.globalAlpha = Math.floor(time * 3) % 2 === 0 ? 1 : 0.35;
        mapCtx.fillStyle = plant.site.id === 'A' ? '#f0a13a' : '#54b6e8';
        mapCtx.beginPath();
        mapCtx.arc(px, py, 5, 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.globalAlpha = 1;
      }
      for (const bot of bots) {
        if (!bot.alive) continue;
        const [px, py] = project(bot.x, bot.z, width, height);
        if (bot.team === 'ferro') {
          mapCtx.fillStyle = '#3fc7a8';
          mapCtx.beginPath();
          mapCtx.arc(px, py, 3, 0, Math.PI * 2);
          mapCtx.fill();
          continue;
        }
        // Enemies only show once heard: they appear for 3 s after their last
        // shot, or always once the charge is planted.
        if (plant.status !== 'planted' && time - bot.lastShotAt > 3) continue;
        mapCtx.fillStyle = '#e5484d';
        mapCtx.beginPath();
        mapCtx.arc(px, py, 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      const [px, py] = project(playerX, playerZ, width, height);
      mapCtx.save();
      mapCtx.translate(px, py);
      mapCtx.rotate(Math.atan2(-Math.sin(yaw), -Math.cos(yaw)));
      mapCtx.fillStyle = '#3fc7a8';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4, 5);
      mapCtx.lineTo(-4, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
    showOverlay(mode, scoreText) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'roundEnd' || mode === 'matchEnd' ? scoreText || text.copy : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
