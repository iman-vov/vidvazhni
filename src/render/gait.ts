// Walking on the board without foot sliding: how far a figure's walk and run clips carry it per
// cycle, which of the two to play at a given pace, how fast to play it, and how long a walk takes
// when the legs cannot keep up with the board's pace. Pure (no three.js), so it is unit-tested.

/** Ground covered by one cycle of the walk and run clips, in figure heights (so it holds at any
 *  board height). Measured from the planted feet: the speed of a foot on the ground relative to
 *  the body times the clip length (docs/art/gait/README.md). The quadrupeds' run is their walk
 *  played 1.5× faster, so the stride is the same. Models missing here (fliers, the slime) keep
 *  the board's pace and the clip's own speed. */
export const MODEL_STRIDE: Record<string, { walk: number; run: number }> = {
  warden: { walk: 0.82, run: 1.71 },
  'wind-archer': { walk: 1.34, run: 1.79 },
  herbalist: { walk: 0.69, run: 1.18 },
  rogue: { walk: 0.95, run: 1.72 },
  elementalist: { walk: 0.78, run: 1.14 },
  tinker: { walk: 0.77, run: 1.59 },
  'tinker-button': { walk: 0.6, run: 0.6 },
  'cellar-rat': { walk: 0.85, run: 0.85 },
  gremlin: { walk: 0.95, run: 1.47 },
  thornling: { walk: 0.57, run: 1.06 },
  'grey-wolf': { walk: 0.69, run: 0.69 },
  'bandit-brute': { walk: 0.79, run: 1.44 },
  'bandit-crossbow': { walk: 0.83, run: 1.61 },
  'stone-sentinel': { walk: 1.38, run: 1.54 },
  'gloom-cultist': { walk: 0.61, run: 1.27 },
  'bog-miller': { walk: 1.38, run: 1.51 },
  shadowhand: { walk: 0.73, run: 1.34 },
  'mountain-ram': { walk: 0.49, run: 0.49 },
  hammerfist: { walk: 0.78, run: 1.62 },
};

export const GAIT = {
  /** Seconds to get up to speed at the start of a walk and to slow down at its end. */
  ramp: 0.15,
  /** The walk clip is played at most this much faster than recorded; quicker paces run. */
  walkMaxScale: 1.6,
  /** Steps (clip cycles) per second a figure of `refHeight` can make at most; smaller ones step
   *  faster, as 1/√height (a rat scurries, a giant lumbers). */
  cadence: 3.6,
  refHeight: 1.3,
  /** Never play a stride slower than this (it reads as slow motion). */
  minScale: 0.6,
};

export interface Stride {
  walk: number;
  run: number;
}

/** Most clip cycles per second a figure of `height` makes. */
export function maxCadence(height: number): number {
  return GAIT.cadence * Math.sqrt(GAIT.refHeight / Math.max(0.2, height));
}

/** Fastest a figure can cover ground without its feet sliding, in world units per second. */
export function maxSpeed(stride: Stride, height: number): number {
  return stride.run * height * maxCadence(height);
}

/** Seconds a walk of `distance` takes: `base` (the board's pace), or longer when the figure's legs
 *  cannot keep up. The ramps at both ends are included. */
export function walkSeconds(distance: number, base: number, stride: Stride | undefined, height: number): number {
  if (!stride) return base;
  return Math.max(base, distance / maxSpeed(stride, height) + GAIT.ramp);
}

/** Ramp time of a walk lasting `seconds` (short walks get shorter ramps). */
export function rampOf(seconds: number): number {
  return Math.min(GAIT.ramp, seconds / 4);
}

/** Speed at full pace of a walk of `distance` over `seconds`, ramps included. */
export function cruiseSpeed(distance: number, seconds: number): number {
  return distance / Math.max(1e-3, seconds - rampOf(seconds));
}

export interface GaitChoice {
  clip: 'walk' | 'run';
  timeScale: number;
}

/** Clip and time scale that make the feet keep pace with `speed` (world units per second);
 *  `clipSeconds` are the lengths of the figure's walk and run clips. Past maxSpeed (a walk planned
 *  before the model loaded) the legs stop at the cadence limit rather than blur. */
export function chooseGait(speed: number, stride: Stride, height: number, clipSeconds: { walk: number; run?: number }): GaitChoice {
  const walkScale = speed / ((stride.walk * height) / clipSeconds.walk);
  if (walkScale <= GAIT.walkMaxScale || !clipSeconds.run) return { clip: 'walk', timeScale: Math.max(GAIT.minScale, walkScale) };
  const runScale = Math.min(speed / ((stride.run * height) / clipSeconds.run), maxCadence(height) * clipSeconds.run);
  return { clip: 'run', timeScale: Math.max(GAIT.minScale, runScale) };
}

/** Where along a walk the figure is at `k` (0..1 of its time) and how fast it goes then (0..1 of
 *  full pace): it speeds up evenly over the first ramp, slows down evenly over the last. */
export function trapezoid(k: number, seconds: number): { travel: number; pace: number } {
  const r = rampOf(seconds) / seconds;
  if (r <= 0) return { travel: k, pace: 1 };
  const total = 1 - r; // area under the pace curve
  if (k <= r) return { travel: (k * k) / (2 * r) / total, pace: k / r };
  if (k >= 1 - r) {
    const left = 1 - k;
    return { travel: 1 - (left * left) / (2 * r) / total, pace: left / r };
  }
  return { travel: (k - r / 2) / total, pace: 1 };
}
