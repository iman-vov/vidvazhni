import { describe, expect, it } from 'vitest';
import { findPath, reachableHexes, validatePath } from '../../src/rules/geometry';
import { hexKey, type Hex } from '../../src/rules/hex';
import { buildMoveModel, searchWithin } from '../../src/rules/path';
import { makeState, row } from '../helpers/geometryFixtures';

const RAT = 'monster:rat:1';
const HERO = 'hero:warden';

describe('walking', () => {
  it('costs 1 per hex on normal terrain', () => {
    const s = makeState({ hexes: row(5) }, [{ id: HERO, at: [0, 0] }]);
    expect(findPath(s, [4, 0], { figureId: HERO })).toEqual({
      path: [[1, 0], [2, 0], [3, 0], [4, 0]],
      cost: 4,
    });
  });

  it('cannot pass obstacles', () => {
    const s = makeState({ hexes: row(5), obstacles: [[2, 0]] }, [{ id: HERO, at: [0, 0] }]);
    expect(findPath(s, [4, 0], { figureId: HERO })).toBeNull();
    expect(findPath(s, [2, 0], { figureId: HERO })).toBeNull();
  });

  it('walks around an obstacle when there is room', () => {
    const s = makeState({ radius: 3, obstacles: [[1, 0]] }, [{ id: HERO, at: [0, 0] }]);
    expect(findPath(s, [2, 0], { figureId: HERO })?.cost).toBe(3);
  });

  it('is blocked by enemies', () => {
    const s = makeState({ hexes: row(5) }, [
      { id: RAT, at: [0, 0] },
      { id: HERO, at: [2, 0] },
    ]);
    expect(findPath(s, [4, 0], { figureId: RAT })).toBeNull();
  });

  it('passes through allies but cannot end on them', () => {
    const s = makeState({ hexes: row(5) }, [
      { id: RAT, at: [0, 0] },
      { id: 'monster:rat:2', at: [2, 0] },
      { id: HERO, at: [4, 0] },
    ]);
    expect(findPath(s, [3, 0], { figureId: RAT })?.cost).toBe(3);
    expect(findPath(s, [2, 0], { figureId: RAT })).toBeNull();
  });

  it('heroes and summons are allies of each other', () => {
    const s = makeState({ hexes: row(4) }, [
      { id: HERO, at: [0, 0] },
      { id: 'summon:tinker.button', at: [1, 0], owner: HERO },
    ]);
    expect(findPath(s, [3, 0], { figureId: HERO })?.cost).toBe(3);
  });

  it('pays 2 for difficult terrain and for water', () => {
    const s = makeState({ hexes: row(4), difficult: [[1, 0]], water: [[2, 0]] }, [{ id: HERO, at: [0, 0] }]);
    expect(findPath(s, [3, 0], { figureId: HERO })?.cost).toBe(5);
  });

  it('prefers a detour over difficult terrain when it is cheaper', () => {
    const s = makeState({ radius: 2, difficult: [[1, 0]] }, [{ id: HERO, at: [0, 0] }]);
    // To [2,-1]: through [1,0] costs 3, through [1,-1] costs 2.
    const p = findPath(s, [2, -1], { figureId: HERO });
    expect(p).toEqual({ path: [[1, -1], [2, -1]], cost: 2 });
    const r = reachableHexes(s, 1, { figureId: HERO });
    expect(r.has('1,0')).toBe(false);
    expect(r.has('0,1')).toBe(true);
  });

  it('may enter traps and hazardous terrain', () => {
    const s = makeState({ hexes: row(4), traps: [[1, 0]], hazardous: [[2, 0]] }, [{ id: HERO, at: [0, 0] }]);
    expect(findPath(s, [3, 0], { figureId: HERO })?.cost).toBe(3);
    expect(findPath(s, [1, 0], { figureId: HERO })?.cost).toBe(1);
  });

  it('with avoidNegativeHexes takes a longer path around a trap', () => {
    const s = makeState({ radius: 2, traps: [[1, 0]] }, [{ id: RAT, at: [0, 0] }]);
    expect(findPath(s, [2, 0], { figureId: RAT })).toEqual({ path: [[1, 0], [2, 0]], cost: 2 });
    const around = findPath(s, [2, 0], { figureId: RAT, avoidNegativeHexes: true });
    expect(around?.cost).toBe(3);
    expect(around?.path.map(hexKey)).not.toContain('1,0');
  });

  it('with avoidNegativeHexes goes around hazardous terrain too', () => {
    const s = makeState({ radius: 2, hazardous: [[1, 0]] }, [{ id: RAT, at: [0, 0] }]);
    expect(findPath(s, [2, 0], { figureId: RAT, avoidNegativeHexes: true })?.cost).toBe(3);
  });

  it('with avoidNegativeHexes still crosses a trap when there is no other way', () => {
    const s = makeState({ hexes: row(3), traps: [[1, 0]] }, [{ id: RAT, at: [0, 0] }]);
    expect(findPath(s, [2, 0], { figureId: RAT, avoidNegativeHexes: true })?.cost).toBe(2);
  });

  it('within a budget, avoidance picks the safest path that still fits', () => {
    const s = makeState({ radius: 2, traps: [[1, 0]] }, [{ id: RAT, at: [0, 0] }]);
    const opts = { figureId: RAT, avoidNegativeHexes: true };
    const two = searchWithin(buildMoveModel(s, opts), 2).get('2,0');
    expect(two).toMatchObject({ cost: 2, negative: 1 });
    const three = searchWithin(buildMoveModel(s, opts), 3).get('2,0');
    expect(three).toMatchObject({ cost: 3, negative: 0 });
    expect(reachableHexes(s, 3, opts).get('2,0')?.path.map(hexKey)).not.toContain('1,0');
  });

  it('closed doors block; heroes may end a move on one; open doors are normal hexes', () => {
    const board = { hexes: row(4), doors: [{ hex: [2, 0] as Hex }] };
    const s = makeState(board, [
      { id: HERO, at: [0, 0] },
      { id: RAT, at: [1, 0] },
    ]);
    const hs = makeState(board, [{ id: HERO, at: [0, 0] }]);
    expect(findPath(hs, [2, 0], { figureId: HERO })?.cost).toBe(2);
    expect(findPath(hs, [3, 0], { figureId: HERO })).toBeNull();
    expect(findPath(s, [2, 0], { figureId: RAT })).toBeNull();
    const open = makeState({ hexes: row(4), doors: [{ hex: [2, 0], open: true }] }, [{ id: RAT, at: [0, 0] }]);
    expect(findPath(open, [3, 0], { figureId: RAT })?.cost).toBe(3);
  });

  it('hexes that do not exist (unrevealed rooms) cannot be entered', () => {
    const s = makeState({ hexes: row(5), holes: [[2, 0]] }, [{ id: HERO, at: [0, 0] }]);
    expect(findPath(s, [4, 0], { figureId: HERO })).toBeNull();
    expect(findPath(s, [9, 9], { figureId: HERO })).toBeNull();
  });

  it('thin walls block every kind of movement', () => {
    const s = makeState({ hexes: row(3), walls: [[[0, 0], [1, 0]]] }, [{ id: HERO, at: [0, 0] }]);
    expect(findPath(s, [2, 0], { figureId: HERO })).toBeNull();
    expect(findPath(s, [2, 0], { figureId: HERO, jump: true })).toBeNull();
    expect(findPath(s, [2, 0], { figureId: HERO, fly: true })).toBeNull();
  });

  it('exhausted heroes are off the board and do not block', () => {
    const s = makeState({ hexes: row(4) }, [
      { id: RAT, at: [0, 0] },
      { id: HERO, at: [1, 0], exhausted: true },
    ]);
    expect(findPath(s, [1, 0], { figureId: RAT })?.cost).toBe(1);
  });
});

describe('jumping', () => {
  const board = { hexes: row(6), obstacles: [[1, 0]] as Hex[], difficult: [[3, 0]] as Hex[], traps: [[4, 0]] as Hex[] };
  const figures = [
    { id: HERO, at: [0, 0] as Hex },
    { id: RAT, at: [2, 0] as Hex },
  ];

  it('ignores obstacles, enemies and terrain cost on the way: 1 per hex', () => {
    const s = makeState(board, figures);
    expect(findPath(s, [5, 0], { figureId: HERO, jump: true })?.cost).toBe(5);
  });

  it('must land on a legal hex', () => {
    const s = makeState(board, figures);
    expect(findPath(s, [1, 0], { figureId: HERO, jump: true })).toBeNull();
    expect(findPath(s, [2, 0], { figureId: HERO, jump: true })).toBeNull();
    expect(findPath(s, [3, 0], { figureId: HERO, jump: true })?.cost).toBe(3);
  });

  it('counts a trap only when landing on it', () => {
    const s = makeState(board, figures);
    const model = buildMoveModel(s, { figureId: HERO, jump: true, avoidNegativeHexes: true });
    const r = searchWithin(model, 5);
    expect(r.get('5,0')).toMatchObject({ cost: 5, negative: 0 });
    expect(r.get('4,0')).toMatchObject({ cost: 4, negative: 1 });
  });
});

describe('flying', () => {
  it('ignores terrain, obstacles and figures; cannot end on an obstacle or a figure', () => {
    const s = makeState({ hexes: row(6), obstacles: [[1, 0]], difficult: [[2, 0]], traps: [[3, 0]] }, [
      { id: 'monster:ghost:1', at: [0, 0] },
      { id: HERO, at: [4, 0] },
    ]);
    const opts = { figureId: 'monster:ghost:1', fly: true, avoidNegativeHexes: true };
    expect(findPath(s, [5, 0], opts)?.cost).toBe(5);
    expect(findPath(s, [1, 0], opts)).toBeNull();
    expect(findPath(s, [4, 0], opts)).toBeNull();
    expect(searchWithin(buildMoveModel(s, opts), 5).get('5,0')).toMatchObject({ negative: 0 });
  });
});

describe('reachableHexes', () => {
  it('lists every legal end hex within the budget, without the start hex', () => {
    const s = makeState({ hexes: row(5), difficult: [[2, 0]] }, [{ id: HERO, at: [0, 0] }]);
    const r = reachableHexes(s, 3, { figureId: HERO });
    expect([...r.keys()].sort()).toEqual(['1,0', '2,0']);
    expect(r.get('2,0')).toEqual({ path: [[1, 0], [2, 0]], cost: 3 });
  });

  it('returns nothing for 0 movement', () => {
    const s = makeState({ hexes: row(3) }, [{ id: HERO, at: [0, 0] }]);
    expect(reachableHexes(s, 0, { figureId: HERO }).size).toBe(0);
  });
});

describe('validatePath', () => {
  const s = makeState({ hexes: row(6), difficult: [[2, 0]], obstacles: [[4, 0]] }, [
    { id: HERO, at: [0, 0] },
    { id: 'summon:tinker.button', at: [1, 0], owner: HERO },
  ]);

  it('accepts a legal path and reports its cost', () => {
    expect(validatePath(s, [[1, 0], [2, 0], [3, 0]], 4, { figureId: HERO })).toEqual({
      path: [[1, 0], [2, 0], [3, 0]],
      cost: 4,
    });
  });

  it('rejects paths that skip hexes, cost too much, end on a figure or cross an obstacle', () => {
    expect(validatePath(s, [[2, 0]], 5, { figureId: HERO })).toBeNull();
    expect(validatePath(s, [[1, 0], [2, 0], [3, 0]], 3, { figureId: HERO })).toBeNull();
    expect(validatePath(s, [[1, 0]], 3, { figureId: HERO })).toBeNull();
    expect(validatePath(s, [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], 9, { figureId: HERO })).toBeNull();
  });

  it('lets a jump cross an obstacle at 1 per hex', () => {
    expect(validatePath(s, [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], 5, { figureId: HERO, jump: true })?.cost).toBe(5);
  });

  it('accepts an empty path as staying in place', () => {
    expect(validatePath(s, [], 0, { figureId: HERO })).toEqual({ path: [], cost: 0 });
  });
});
