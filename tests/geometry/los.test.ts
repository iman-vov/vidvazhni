import { describe, expect, it } from 'vitest';
import { hasLineOfSight } from '../../src/rules/geometry';
import { hexesInRadius, type Hex } from '../../src/rules/hex';
import { cornerSegmentClear, wallIndex } from '../../src/rules/los';
import { makeBoard, makeState, row } from '../helpers/geometryFixtures';

const los = (board: Parameters<typeof makeState>[0], a: Hex, b: Hex) => hasLineOfSight(makeState(board, []), a, b);

describe('line of sight', () => {
  it('is clear between any two hexes of an open room', () => {
    const s = makeState({ radius: 3 }, []);
    for (const a of hexesInRadius([0, 0], 3)) {
      for (const b of hexesInRadius([0, 0], 3)) expect(hasLineOfSight(s, a, b), `${a} → ${b}`).toBe(true);
    }
  });

  it('runs along a one-hex corridor: room edges do not block hexes standing on them', () => {
    expect(los({ hexes: row(6) }, [0, 0], [5, 0])).toBe(true);
  });

  it('is blocked by a thin wall between adjacent hexes', () => {
    expect(los({ hexes: row(2) }, [0, 0], [1, 0])).toBe(true);
    expect(los({ hexes: row(2), walls: [[[0, 0], [1, 0]]] }, [0, 0], [1, 0])).toBe(false);
  });

  it('is blocked by a line of thin walls splitting the room', () => {
    const walls: [Hex, Hex][] = [];
    for (let r = -3; r <= 3; r++) {
      walls.push([[0, r], [1, r]]);
      walls.push([[0, r], [1, r - 1]]);
    }
    const board = { radius: 3, walls: walls.filter(([, b]) => Math.abs(b[0]) + Math.abs(b[1]) + Math.abs(b[0] + b[1]) <= 6) };
    expect(los(board, [-1, 0], [2, 0])).toBe(false);
    expect(los(board, [0, -2], [1, 1])).toBe(false);
    expect(los(board, [-1, 0], [0, 2])).toBe(true);
  });

  it('is blocked by missing hexes (a gap in the board is a wall all around)', () => {
    const holes = hexesInRadius([0, 0], 3).filter(([q]) => q === 0);
    expect(los({ radius: 3, holes }, [-1, 0], [1, 0])).toBe(false);
    expect(los({ radius: 3, holes }, [-2, 0], [-1, 2])).toBe(true);
  });

  it('is not blocked by obstacles or figures', () => {
    const s = makeState({ hexes: row(4), obstacles: [[1, 0]] }, [{ id: 'monster:rat:1', at: [2, 0] }]);
    expect(hasLineOfSight(s, [0, 0], [3, 0])).toBe(true);
  });

  it('a hex sees itself; a missing hex is never seen', () => {
    expect(los({ hexes: row(2) }, [0, 0], [0, 0])).toBe(true);
    expect(los({ hexes: row(2) }, [0, 0], [5, 0])).toBe(false);
  });

  it('is symmetric', () => {
    const board = { radius: 3, holes: [[0, 0], [0, 1]] as Hex[], walls: [[[1, -1], [2, -1]]] as [Hex, Hex][] };
    const s = makeState(board, []);
    for (const a of hexesInRadius([0, 0], 3)) {
      for (const b of hexesInRadius([0, 0], 3)) expect(hasLineOfSight(s, a, b)).toBe(hasLineOfSight(s, b, a));
    }
  });
});

describe('corner convention', () => {
  it('a segment that passes exactly through the tip of a wall is blocked', () => {
    // [-1,0] corner 3 → [2,0] corner 1 passes through corner (1,1) of [0,0], the end of the wall [0,0]|[1,0].
    const open = wallIndex(makeBoard({ radius: 4 }));
    const walled = wallIndex(makeBoard({ radius: 4, walls: [[[0, 0], [1, 0]]] }));
    expect(cornerSegmentClear(open, [-1, 0], 3, [2, 0], 1)).toBe(true);
    expect(cornerSegmentClear(walled, [-1, 0], 3, [2, 0], 1)).toBe(false);
  });

  it('a segment may start at its own corner on a room edge when it heads into its own hex', () => {
    const w = wallIndex(makeBoard({ hexes: row(6) }));
    expect(cornerSegmentClear(w, [0, 0], 3, [5, 0], 0)).toBe(true);
  });

  it('a segment from a shared corner across a thin wall is blocked', () => {
    const open = wallIndex(makeBoard({ hexes: row(2) }));
    const walled = wallIndex(makeBoard({ hexes: row(2), walls: [[[0, 0], [1, 0]]] }));
    expect(cornerSegmentClear(open, [0, 0], 1, [1, 0], 0)).toBe(true);
    expect(cornerSegmentClear(walled, [0, 0], 1, [1, 0], 0)).toBe(false);
  });

  it('a segment running along a wall is blocked', () => {
    // [1,-1] corner 5 → [-1,2] corner 0 runs straight along the edge between [0,0] and [1,0].
    const open = wallIndex(makeBoard({ radius: 3 }));
    const walled = wallIndex(makeBoard({ radius: 3, walls: [[[0, 0], [1, 0]]] }));
    expect(cornerSegmentClear(open, [1, -1], 5, [-1, 2], 0)).toBe(true);
    expect(cornerSegmentClear(walled, [1, -1], 5, [-1, 2], 0)).toBe(false);
  });
});
