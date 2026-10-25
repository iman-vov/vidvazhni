import { describe, expect, it } from 'vitest';
import { chooseGait, cruiseSpeed, GAIT, maxCadence, maxSpeed, MODEL_STRIDE, trapezoid, walkSeconds } from '../../src/render/gait';
import { MODEL_HEIGHT } from '../../src/render/figureLook';
import { TIMING } from '../../src/render/animPlan';

const HEX = Math.sqrt(3);

describe('gait', () => {
  it('has a stride for every walking model with a height', () => {
    for (const id of Object.keys(MODEL_STRIDE)) expect(MODEL_HEIGHT[id], id).toBeGreaterThan(0);
  });

  it('keeps the board pace for figures whose legs can follow it and slows the others', () => {
    expect(walkSeconds(3 * HEX, 3 * TIMING.walkPerHex, MODEL_STRIDE['warden'], 1.35)).toBeCloseTo(3 * TIMING.walkPerHex);
    expect(walkSeconds(HEX, TIMING.walkPerHex, undefined, 1)).toBe(TIMING.walkPerHex);
    const wolf = walkSeconds(HEX, TIMING.walkPerHex, MODEL_STRIDE['grey-wolf'], 0.85);
    expect(wolf).toBeGreaterThan(0.5);
    expect(wolf).toBeLessThan(1); // slower, not a crawl
  });

  it('plays the clip so the feet keep pace and never past the cadence limit', () => {
    for (const [id, stride] of Object.entries(MODEL_STRIDE)) {
      const h = MODEL_HEIGHT[id]!;
      for (const hexes of [1, 2, 4]) {
        const seconds = walkSeconds(hexes * HEX, hexes * TIMING.walkPerHex, stride, h);
        const speed = cruiseSpeed(hexes * HEX, seconds);
        expect(speed, id).toBeLessThanOrEqual(maxSpeed(stride, h) + 1e-6);
        const run = 0.65;
        const g = chooseGait(speed, stride, h, { walk: 1, run });
        const perCycle = (g.clip === 'walk' ? stride.walk : stride.run) * h;
        const cycle = g.clip === 'walk' ? 1 : run;
        expect((perCycle / cycle) * g.timeScale, id).toBeCloseTo(speed, 5);
      }
    }
  });

  it('walks slow paces and runs fast ones', () => {
    const s = MODEL_STRIDE['rogue']!;
    expect(chooseGait(1.0, s, 1.22, { walk: 1, run: 0.63 }).clip).toBe('walk');
    expect(chooseGait(5.0, s, 1.22, { walk: 1, run: 0.63 }).clip).toBe('run');
    expect(chooseGait(0.1, s, 1.22, { walk: 1 }).timeScale).toBe(GAIT.minScale);
    // A wolf asked for the heroes' pace (model not loaded when planned): legs at the cadence limit.
    const wolf = chooseGait(20, MODEL_STRIDE['grey-wolf']!, 0.85, { walk: 1, run: 0.67 });
    expect(wolf.timeScale).toBeCloseTo(maxCadence(0.85) * 0.67);
  });

  it('ramps up and down without a jump in place or pace', () => {
    const T = 0.9;
    expect(trapezoid(0, T)).toEqual({ travel: 0, pace: 0 });
    expect(trapezoid(1, T).travel).toBeCloseTo(1);
    expect(trapezoid(1, T).pace).toBeCloseTo(0);
    expect(trapezoid(0.5, T)).toEqual({ travel: 0.5, pace: 1 });
    let last = 0;
    for (let k = 0; k <= 1.0001; k += 0.01) {
      const { travel } = trapezoid(Math.min(1, k), T);
      expect(travel).toBeGreaterThanOrEqual(last - 1e-9);
      expect(travel - last).toBeLessThan(0.02);
      last = travel;
    }
  });
});
