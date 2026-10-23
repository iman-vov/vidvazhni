import { describe, expect, it } from 'vitest';
import { distance, hexesInRadius, neighbors } from '../src/rules/hex';
import { nextInt, shuffle } from '../src/rules/rng';

describe('hex basics', () => {
  it('has six neighbours at distance 1', () => {
    for (const n of neighbors([2, -1])) expect(distance([2, -1], n)).toBe(1);
  });
  it('counts hexes in a radius', () => {
    expect(hexesInRadius([0, 0], 2)).toHaveLength(19);
  });
});

describe('seeded rng', () => {
  it('repeats with the same seed', () => {
    const a = { seed: 42 };
    const b = { seed: 42 };
    expect([1, 2, 3].map(() => nextInt(a, 100))).toEqual([1, 2, 3].map(() => nextInt(b, 100)));
    expect(shuffle({ seed: 7 }, [1, 2, 3, 4, 5])).toEqual(shuffle({ seed: 7 }, [1, 2, 3, 4, 5]));
  });
});
