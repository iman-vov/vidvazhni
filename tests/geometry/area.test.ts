import { describe, expect, it } from 'vitest';
import { areaHexes } from '../../src/rules/geometry';
import { areAdjacent, distance, hexKey, type Hex } from '../../src/rules/hex';

const sorted = (hexes: Hex[]) => hexes.map(hexKey).sort();
const P: Hex = [2, -1];

describe('areas', () => {
  it('arc: three consecutive neighbours of the performer, rotated by direction', () => {
    expect(areaHexes({ shape: 'arc', size: 3 }, [0, 0], [0, 0], 0)).toEqual([[1, 0], [1, -1], [0, -1]]);
    expect(areaHexes({ shape: 'arc', size: 3 }, [0, 0], [0, 0], 5)).toEqual([[0, 1], [1, 0], [1, -1]]);
    for (let d = 0; d < 6; d++) {
      const a = areaHexes({ shape: 'arc', size: 3 }, P, P, d);
      expect(a.every((h) => areAdjacent(h, P))).toBe(true);
      expect(areAdjacent(a[0]!, a[1]!) && areAdjacent(a[1]!, a[2]!)).toBe(true);
    }
  });

  it('line: N hexes straight out from the performer', () => {
    expect(areaHexes({ shape: 'line', length: 3, fromSelf: true }, [0, 0], [0, 0], 2)).toEqual([[0, -1], [0, -2], [0, -3]]);
    expect(areaHexes({ shape: 'line', length: 2, fromSelf: true }, P, P, 3)).toEqual([[1, -1], [0, -1]]);
  });

  it('triangle: the anchor and two neighbours, all mutually adjacent; six rotations', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 6; d++) {
      const t = areaHexes({ shape: 'triangle', size: 3 }, [0, 0], P, d);
      expect(t[0]).toEqual(P);
      expect(areAdjacent(t[0]!, t[1]!) && areAdjacent(t[1]!, t[2]!) && areAdjacent(t[0]!, t[2]!)).toBe(true);
      seen.add(sorted(t).join(' '));
    }
    expect(seen.size).toBe(6);
  });

  it('targetAndAdjacent: the anchor and its six neighbours', () => {
    const a = areaHexes({ shape: 'targetAndAdjacent' }, [0, 0], P, 4);
    expect(a).toHaveLength(7);
    expect(a.every((h) => distance(h, P) <= 1)).toBe(true);
  });

  it('allAdjacent: the six neighbours of the performer', () => {
    const a = areaHexes({ shape: 'allAdjacent' }, P, [9, 9], 3);
    expect(sorted(a)).toEqual(sorted([[3, -1], [3, -2], [2, -2], [1, -1], [1, 0], [2, 0]]));
  });

  it('direction wraps modulo 6', () => {
    expect(areaHexes({ shape: 'arc', size: 3 }, [0, 0], [0, 0], 7)).toEqual(areaHexes({ shape: 'arc', size: 3 }, [0, 0], [0, 0], 1));
    expect(areaHexes({ shape: 'arc', size: 3 }, [0, 0], [0, 0], -1)).toEqual(areaHexes({ shape: 'arc', size: 3 }, [0, 0], [0, 0], 5));
  });
});
