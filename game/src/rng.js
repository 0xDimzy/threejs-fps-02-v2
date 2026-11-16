// Deterministic randomness: one mulberry32 stream per game, seeded from
// the URL, so the ?shot= captures render the same frame every time and a
// round's bot decisions replay from the seed alone. Nothing in a match
// draws from Math.random.
export function mulberry32(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rnd, lo, hi) {
  return lo + rnd() * (hi - lo);
}

export function rangeInt(rnd, lo, hi) {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

export function chance(rnd, p) {
  return rnd() < p;
}

export function pick(rnd, list) {
  return list[Math.floor(rnd() * list.length)];
}
