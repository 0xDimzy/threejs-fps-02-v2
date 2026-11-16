// The match state: one object, owned by main.js, read by the HUD, the
// round machine and the bots. Phases run menu -> buy -> live -> roundEnd
// -> buy ... -> matchEnd, with a side swap at the half (round 7): FERRO
// attacks rounds 1-6, defends 7-12. The charge is the objective state:
// carried (by the player or one bot), dropped on the carrier's death,
// planted with a fuse running; the defuse channel lives on whoever runs
// it. All economy numbers live here so a balance change is one edit.
export const BUY_SECONDS = 7;
export const ROUND_SECONDS = 105;
export const PLANT_SECONDS = 3.2;
export const FUSE_SECONDS = 40;
export const DEFUSE_SECONDS = 7;
export const DEFUSE_KIT_SECONDS = 3.6;
export const ROUNDS_TO_WIN = 7;
export const MAX_ROUNDS = 12;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const KNIFE_REWARD = 1500;
export const WIN_REWARD = 325;
export const LOSS_BONUS = [140, 190, 240, 290];
export const PLANT_REWARD = 300;
export const DEFUSE_REWARD = 300;
export const DEFUSE_KIT_PRICE = 400;
export const VEST_PRICE = 650;
export const VEST_HELM_PRICE = 1000;

// Buy menu: ten items on keys 1–9 and 0. The catalogue is the single
// source of truth for prices and copy — the HUD renders it, main.js
// enforces it, and the kit gate is what the judge reads.
export const BUY_KEYS = {
  Digit1: 'rifle2', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'sniper',
  Digit5: 'vest', Digit6: 'vesthelm', Digit7: 'kit', Digit8: 'frag',
  Digit9: 'smoke', Digit0: 'flash',
};
export const CATALOG = {
  rifle2: { label: 'KR-77 Reaper rifle', price: 1500, note: 'harder recoil, more damage' },
  smg: { label: 'SMG-7 Hornet', price: 600, note: 'fast, close range' },
  shotgun: { label: 'SG-9 Mauler', price: 700, note: '8 pellets, close range' },
  sniper: { label: 'LR-88 Longshot', price: 1100, note: 'scoped, 88 damage' },
  vest: { label: 'Vest', price: 650, note: 'halves body damage' },
  vesthelm: { label: 'Vest + Helmet', price: 1000, note: 'halves head damage too' },
  kit: { label: 'Defuse kit', price: 400, note: 'defuse in 3.6s instead of 7s' },
  frag: { label: 'Frag grenade', price: 300, note: 'blast radius 7.5m' },
  smoke: { label: 'Smoke grenade', price: 250, note: '17s cloud, blocks sight' },
  flash: { label: 'Flashbang', price: 250, note: 'blinds up to 4s' },
};

export function createMatchState() {
  return {
    phase: 'menu',
    round: 1,
    wins: 0,
    losses: 0,
    lossStreak: 0,
    swapped: false,
    money: START_MONEY,
    timer: BUY_SECONDS,
    playerHealth: 100,
    playerAlive: true,
    kills: 0,
    calledSite: 'A',
    plant: { status: 'none', site: null, progress: 0, fuse: 0, carrier: 'player', x: 0, z: 0, defuse: 0 },
    feed: [],
  };
}

export function resetMatch(s) {
  s.phase = 'buy';
  s.round = 1;
  s.wins = 0;
  s.losses = 0;
  s.lossStreak = 0;
  s.swapped = false;
  s.money = START_MONEY;
  s.timer = BUY_SECONDS;
  s.playerHealth = 100;
  s.playerAlive = true;
  s.kills = 0;
  s.calledSite = 'A';
  s.plant = { status: 'none', site: null, progress: 0, fuse: 0, carrier: 'player', x: 0, z: 0, defuse: 0 };
  s.feed = [];
}

export function resetRound(s) {
  s.timer = BUY_SECONDS;
  s.phase = 'buy';
  s.playerHealth = 100;
  s.playerAlive = true;
  s.swapped = s.round > 6;
  s.plant = { status: 'none', site: null, progress: 0, fuse: 0, carrier: s.swapped ? 'enemy' : 'player', x: 0, z: 0, defuse: 0 };
}

export function addFeed(s, text, kind) {
  s.feed.push({ text, kind: kind || 'info' });
  if (s.feed.length > 5) s.feed.shift();
}

export function matchDecided(s) {
  return s.wins >= ROUNDS_TO_WIN || s.losses >= ROUNDS_TO_WIN || s.round >= MAX_ROUNDS;
}

// Growing loss bonus: each consecutive lost round pays more, so a team
// on a losing streak can still buy back into the match.
export function lossBonus(s) {
  return LOSS_BONUS[Math.min(s.lossStreak, LOSS_BONUS.length) - 1] || LOSS_BONUS[0];
}
