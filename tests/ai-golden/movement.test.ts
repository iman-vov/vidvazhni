// Golden AI positions: movement, positioning and targets. Board: radius 4 around 0,0 unless stated.
import { describe } from 'vitest';
import type { Hex } from '../../src/rules/hex';
import { hexesInRadius } from '../../src/rules/hex';
import { attack, hero, mon, move, runGolden } from './golden';

const RAT = mon('rat:1', [0, 0]);
const ARCHER = mon('archer:1', [0, 0]);
const GHOST = mon('ghost:1', [0, 0]);
const row = (n: number): Hex[] => Array.from({ length: n }, (_, q) => [q, 0] as Hex);
/** Obstacles filling the whole column q = 1 of the radius-4 board. */
const WALL_Q1: Hex[] = hexesInRadius([0, 0], 4).filter(([q]) => q === 1);

describe('movement: traps and hazards', () => {
  runGolden([
    {
      name: 'walks around a trap when the detour still reaches the target',
      board: { traps: [[1, 0]] },
      me: RAT,
      others: [hero('a', [3, 0], 10)],
      steps: [move(3), attack(2)],
      at: [2, 0],
      focus: 'hero:a',
      avoids: [[1, 0]],
    },
    {
      name: 'avoids a trap even if that means not attacking this turn',
      board: { traps: [[1, 0]] },
      me: RAT,
      others: [hero('a', [3, 0], 10)],
      steps: [move(2), attack(2)],
      at: [1, 1],
      focus: 'hero:a',
      targets: [[]],
      avoids: [[1, 0]],
    },
    {
      name: 'walks around hazardous terrain the same way',
      board: { hazardous: [[1, 0]] },
      me: RAT,
      others: [hero('a', [3, 0], 10)],
      steps: [move(3), attack(2)],
      at: [2, 0],
      focus: 'hero:a',
      avoids: [[1, 0]],
    },
    {
      name: 'does not end its move on a trap next to the target',
      board: { traps: [[1, 0]] },
      me: RAT,
      others: [hero('a', [2, 0], 10)],
      steps: [move(2), attack(2)],
      at: [1, 1],
      focus: 'hero:a',
      avoids: [[1, 0]],
    },
    {
      name: 'crosses the trap when it is the only way',
      board: { hexes: row(5), traps: [[1, 0]] },
      me: RAT,
      others: [hero('a', [3, 0], 10)],
      steps: [move(2), attack(2)],
      at: [2, 0],
      focus: 'hero:a',
    },
  ]);
});

describe('movement: difficult terrain, unreachable focus, allies', () => {
  runGolden([
    {
      name: 'difficult terrain costs 2 but is still the cheapest attack hex',
      board: { difficult: [[1, 0]] },
      me: RAT,
      others: [hero('a', [2, 0], 10)],
      steps: [move(2), attack(2)],
      at: [1, 0],
      focus: 'hero:a',
    },
    {
      name: 'difficult terrain out of budget: steps toward the cheapest attack hex',
      board: { difficult: [[1, 0]] },
      me: RAT,
      others: [hero('a', [2, 0], 10)],
      steps: [move(1), attack(2)],
      at: [0, 1],
      focus: 'hero:a',
      targets: [[]],
    },
    {
      name: 'focus out of reach: moves along the shortest path toward the attack hex',
      me: RAT,
      others: [hero('a', [4, 0], 10)],
      steps: [move(2), attack(2)],
      at: [2, 0],
      focus: 'hero:a',
      targets: [[]],
    },
    {
      name: 'focus out of reach behind obstacles: follows the way around',
      board: { obstacles: WALL_Q1.filter(([, r]) => r !== 3) },
      me: RAT,
      others: [hero('a', [3, 0], 10)],
      steps: [move(2), attack(2)],
      at: [0, 2],
      focus: 'hero:a',
      targets: [[]],
    },
    {
      name: 'passes through an ally to reach the target',
      board: { hexes: row(5) },
      me: RAT,
      others: [mon('rat:2', [1, 0]), hero('a', [3, 0], 10)],
      steps: [move(2), attack(2)],
      at: [2, 0],
      focus: 'hero:a',
    },
    {
      name: 'an ally on the only attack hex: no focus, stays',
      board: { hexes: row(4) },
      me: RAT,
      others: [mon('rat:2', [2, 0]), hero('a', [3, 0], 10)],
      steps: [move(2), attack(2)],
      at: [0, 0],
      focus: null,
      targets: [[]],
    },
    {
      name: 'an ally on the best attack hex: takes the next one',
      me: RAT,
      others: [mon('rat:2', [2, 0]), hero('a', [3, 0], 10)],
      steps: [move(3), attack(2)],
      at: [2, 1],
      focus: 'hero:a',
    },
    {
      name: 'immobilized (no move step): attacks from where it stands or not at all',
      me: RAT,
      others: [hero('a', [2, 0], 10)],
      steps: [attack(2)],
      at: [0, 0],
      focus: 'hero:a',
      targets: [[]],
    },
    {
      name: 'card without attack (or disarmed): moves as if for a melee attack',
      me: RAT,
      others: [hero('a', [3, 0], 10)],
      steps: [move(2)],
      at: [2, 0],
      focus: 'hero:a',
      targets: [],
    },
    {
      name: 'attack before move: attacks from the start hex',
      me: RAT,
      others: [hero('a', [1, 0], 10)],
      steps: [attack(2), move(2)],
      at: [0, 0],
      focus: 'hero:a',
    },
  ]);
});

describe('movement: ranged monsters', () => {
  runGolden([
    {
      name: 'adjacent to its target: steps away to avoid disadvantage',
      me: ARCHER,
      others: [hero('a', [1, 0], 10)],
      steps: [move(2), attack(2, { range: 3 })],
      at: [-1, 0],
      focus: 'hero:a',
    },
    {
      name: 'already in range and not adjacent: stays',
      me: ARCHER,
      others: [hero('a', [3, 0], 10)],
      steps: [move(2), attack(2, { range: 3 })],
      at: [0, 0],
      focus: 'hero:a',
    },
    {
      name: 'out of range: moves the minimum to get in range',
      me: mon('archer:1', [-2, 0]),
      others: [hero('a', [3, 0], 10)],
      steps: [move(2), attack(2, { range: 3 })],
      at: [0, 0],
      focus: 'hero:a',
    },
    {
      name: 'immobilized next to its target: attacks anyway (with disadvantage)',
      me: ARCHER,
      others: [hero('a', [1, 0], 10)],
      steps: [attack(2, { range: 3 })],
      at: [0, 0],
      focus: 'hero:a',
    },
    {
      name: 'in range but without line of sight: moves to the nearest hex that sees the target',
      // Column q=1 is missing except the opening at [1,0]; from [0,-2] the target is 2 hexes away but
      // hidden, from [0,-1] it is seen through the opening (3 hexes, not adjacent).
      board: { holes: WALL_Q1.filter(([, r]) => r !== 0) },
      me: mon('archer:1', [0, -2]),
      others: [hero('a', [2, 0], 10)],
      steps: [move(2), attack(2, { range: 3 })],
      at: [0, -1],
      focus: 'hero:a',
    },
  ]);
});

describe('movement: multiple targets and areas', () => {
  runGolden([
    {
      name: 'ranged, 2 targets: moves to hit both without losing the focus',
      me: ARCHER,
      others: [hero('a', [2, 0], 10), hero('b', [1, -3], 50)],
      steps: [move(2), attack(2, { range: 2, targets: 2 })],
      at: [1, -1],
      focus: 'hero:a',
      targets: [['hero:a', 'hero:b']],
    },
    {
      name: 'ranged, 2 targets: keeps the focus when no hex reaches both',
      me: ARCHER,
      others: [hero('a', [2, 0], 10), hero('b', [-3, 0], 50)],
      steps: [move(2), attack(2, { range: 2, targets: 2 })],
      at: [0, 0],
      focus: 'hero:a',
      targets: [['hero:a']],
    },
    {
      name: 'melee, 2 targets: steps between both heroes',
      me: RAT,
      others: [hero('a', [2, 0], 10), hero('b', [2, -2], 20)],
      steps: [move(2), attack(2, { targets: 2 })],
      at: [2, -1],
      focus: 'hero:a',
      targets: [['hero:a', 'hero:b']],
    },
    {
      name: 'boss attack on every adjacent enemy: positions next to both',
      me: mon('miller:1', [0, 0]),
      others: [hero('a', [2, 0], 10), hero('b', [2, -2], 20), hero('c', [-4, 0], 30)],
      steps: [move(2), attack(3, { targetAll: 'adjacentEnemies' })],
      at: [2, -1],
      focus: 'hero:a',
      targets: [['hero:a', 'hero:b']],
    },
    {
      name: 'line area: hits the focus and the hero behind it without moving',
      me: RAT,
      others: [hero('a', [1, 0], 10), hero('b', [2, 0], 20)],
      steps: [move(2), attack(2, { area: { shape: 'line', length: 2, fromSelf: true } })],
      at: [0, 0],
      focus: 'hero:a',
      targets: [['hero:a', 'hero:b']],
    },
    {
      name: 'two attack steps: each aimed from where the monster stands',
      me: RAT,
      others: [hero('a', [3, 0], 10)],
      steps: [attack(1, { range: 3 }), move(2), attack(2)],
      at: [2, 0],
      focus: 'hero:a',
      targets: [['hero:a'], ['hero:a']],
    },
  ]);
});

describe('movement: flying', () => {
  runGolden([
    {
      name: 'a flying ghost crosses a wall of obstacles',
      board: { obstacles: WALL_Q1 },
      me: GHOST,
      others: [hero('a', [3, 0], 10)],
      steps: [move(3, { fly: true }), attack(2)],
      at: [2, 0],
      focus: 'hero:a',
    },
    {
      name: 'the same wall stops a walking monster: no focus',
      board: { obstacles: WALL_Q1 },
      me: RAT,
      others: [hero('a', [3, 0], 10)],
      steps: [move(3), attack(2)],
      at: [0, 0],
      focus: null,
      targets: [[]],
    },
    {
      name: 'a flying ghost ignores traps on the way',
      board: { traps: [[1, 0]] },
      me: GHOST,
      others: [hero('a', [3, 0], 10)],
      steps: [move(2, { fly: true }), attack(2)],
      at: [2, 0],
      focus: 'hero:a',
    },
    {
      name: 'a flying ghost ignores difficult terrain and flies over heroes',
      board: { hexes: row(6), difficult: [[2, 0]] },
      me: GHOST,
      others: [hero('a', [1, 0], 90, { conditions: ['invisible'] }), hero('b', [4, 0], 10)],
      steps: [move(3, { fly: true }), attack(2)],
      at: [3, 0],
      focus: 'hero:b',
    },
  ]);
});
