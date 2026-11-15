// The match state: one object, owned by main.js, read by the HUD and the
// round machine and nobody else. Phases run menu -> buy -> live ->
// roundEnd -> buy ... -> matchEnd. The charge is the objective state:
// none, then planted with a fuse running; the defuse channel itself lives
// on the bot that is running it. All economy numbers live here so a
// balance change is one edit, not a hunt through the codebase.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 3.5;
export const FUSE_SECONDS = 35;
export const DEFUSE_SECONDS = 5;
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 325;
export const LOSS_REWARD = 190;
export const PLANT_REWARD = 300;

export function createMatchState() {
  return {
    phase: 'menu',
    round: 1,
    wins: 0,
    losses: 0,
    money: START_MONEY,
    timer: BUY_SECONDS,
    playerHealth: 100,
    playerAlive: true,
    kills: 0,
    // Which site FERRO is executing on this round ('A' or 'B'). The ally
    // bots plan around it; the player is free to ignore it.
    calledSite: 'A',
    plant: { status: 'none', site: null, progress: 0, fuse: 0 },
    feed: [],
  };
}

export function resetMatch(s) {
  s.phase = 'buy';
  s.round = 1;
  s.wins = 0;
  s.losses = 0;
  s.money = START_MONEY;
  s.timer = BUY_SECONDS;
  s.playerHealth = 100;
  s.playerAlive = true;
  s.kills = 0;
  s.calledSite = 'A';
  s.plant = { status: 'none', site: null, progress: 0, fuse: 0 };
  s.feed = [];
}

export function resetRound(s) {
  s.timer = BUY_SECONDS;
  s.phase = 'buy';
  s.playerHealth = 100;
  s.playerAlive = true;
  s.plant = { status: 'none', site: null, progress: 0, fuse: 0 };
}

export function addFeed(s, text, kind) {
  s.feed.push({ text, kind: kind || 'info' });
  if (s.feed.length > 5) s.feed.shift();
}

// The match is decided when a side has the rounds, or the round cap is hit.
// The caller owns the banner; this only answers the question.
export function matchDecided(s) {
  return s.wins >= ROUNDS_TO_WIN || s.losses >= ROUNDS_TO_WIN || s.round >= MAX_ROUNDS;
}
