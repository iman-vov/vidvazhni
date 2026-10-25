import { describe, expect, it } from 'vitest';
import { hexKey, type HexKey } from '../../src/rules/hex';
import type { Terrain } from '../../src/rules/content';
import { hexToWorld } from '../../src/render/hexLayout';
import { bakeWaterMask, SHORE_RANGE } from '../../src/render/environment/life';

// A pond of three water hexes in the middle of a patch of dry tiles.
const WATER: [number, number][] = [[0, 0], [1, 0], [0, 1]];
function board(): Record<HexKey, { terrain: Terrain }> {
  const tiles: Record<HexKey, { terrain: Terrain }> = {};
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) tiles[hexKey([q, r])] = { terrain: 'normal' };
  for (const h of WATER) tiles[hexKey(h)] = { terrain: 'water' };
  return tiles;
}

/** Signed shore distance (inside positive) at a world point, read back from the mask. */
function shoreAt(m: NonNullable<ReturnType<typeof bakeWaterMask>>, x: number, z: number): { sd: number; a: number } {
  const i = Math.floor((x - m.rect.x) * m.rect.z * m.w);
  const j = Math.floor((z - m.rect.y) * m.rect.w * m.h);
  const o = (j * m.w + i) * 4;
  return { sd: (m.data[o + 1]! / 255 - 0.5) * 2 * SHORE_RANGE, a: m.data[o + 3]! / 255 };
}

describe('board ponds (water mask)', () => {
  const mask = bakeWaterMask(board())!;

  it('is the same on every bake of a map', () => {
    expect(bakeWaterMask(board())!.data).toEqual(mask.data);
  });

  it('has no shore between water hexes that touch: one pond', () => {
    const a = hexToWorld(0, 0);
    const b = hexToWorld(1, 0);
    for (let t = 0; t <= 1; t += 0.05) expect(shoreAt(mask, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t).sd).toBeGreaterThan(0.2);
  });

  it('wanders off the hex edges: onto the dry hexes in places, short of them in others', () => {
    // Sample along every shore edge (halfway between a water hex and a dry neighbour).
    let out = 0;
    let short = 0;
    let n = 0;
    for (const [q, r] of WATER) {
      const c = hexToWorld(q, r);
      for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const) {
        if (WATER.some(([wq, wr]) => wq === q + dq && wr === r + dr)) continue;
        const nc = hexToWorld(q + dq, r + dr);
        const { sd } = shoreAt(mask, (c.x + nc.x) / 2, (c.z + nc.z) / 2);
        n++;
        if (process.env.SHORE_DEBUG) console.log(q, r, dq, dr, sd.toFixed(2));
        if (sd > 0.08) out++;
        if (sd < -0.08) short++;
      }
    }
    expect(n).toBe(12);
    expect(out).toBeGreaterThan(0);
    expect(short).toBeGreaterThan(0);
  });

  it('keeps the middle of a dry neighbour dry', () => {
    const far = hexToWorld(-1, 0);
    expect(shoreAt(mask, far.x, far.z).sd).toBeLessThan(-0.3);
  });
});
