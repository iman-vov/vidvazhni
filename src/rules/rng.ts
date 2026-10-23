// Seeded RNG (mulberry32). The seed lives in GameState, so seed + action log always
// reproduces the same game. Never use the global random generator inside src/rules/.

export interface RngState {
  seed: number;
}

export function nextFloat(rng: RngState): number {
  rng.seed = (rng.seed + 0x6d2b79f5) | 0;
  let t = rng.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: RngState, maxExclusive: number): number {
  return Math.floor(nextFloat(rng) * maxExclusive);
}

/** Fisher–Yates shuffle in place; returns the same array. */
export function shuffle<T>(rng: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}
