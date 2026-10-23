// Golden AI positions: focus choice. Board: radius 4 around 0,0 unless stated. Monster at 0,0.
import { describe } from 'vitest';
import type { Hex } from '../../src/rules/hex';
import { attack, hero, mon, move, runGolden, shield } from './golden';

const RAT = mon('rat:1', [0, 0]);
const BUTTON = { id: 'summon:tinker.button', at: [0, 0] as Hex, owner: 'hero:tinker' };
const melee2 = [move(2), attack(2)];

describe('focus: least movement, then hex distance, initiative, number', () => {
  runGolden([
    {
      name: 'least movement to attack wins',
      me: RAT,
      others: [hero('a', [3, 0], 50), hero('b', [-4, 0], 10)],
      steps: melee2,
      at: [2, 0],
      focus: 'hero:a',
    },
    {
      name: 'movement beats hex distance: the nearer hero is walled in',
      board: { obstacles: [[3, -1], [2, -1], [1, 0], [1, 1], [2, 1]] },
      me: RAT,
      others: [hero('a', [2, 0], 10), hero('b', [-3, 0], 90)],
      steps: melee2,
      at: [-2, 0],
      focus: 'hero:b',
    },
    {
      name: 'equal movement: nearest in hexes wins',
      // b's direct hex [-1,0] is difficult, so both heroes need 2 movement; b is 2 hexes away, a is 3.
      board: { difficult: [[-1, 0]] },
      me: RAT,
      others: [hero('a', [3, 0], 10), hero('b', [-2, 0], 90)],
      steps: melee2,
      at: [-2, 1],
      focus: 'hero:b',
    },
    {
      name: 'equal movement and distance: lower initiative (west)',
      me: RAT,
      others: [hero('a', [3, 0], 40), hero('b', [-3, 0], 20)],
      steps: melee2,
      at: [-2, 0],
      focus: 'hero:b',
    },
    {
      name: 'equal movement and distance: lower initiative (east)',
      me: RAT,
      others: [hero('a', [3, 0], 20), hero('b', [-3, 0], 40)],
      steps: melee2,
      at: [2, 0],
      focus: 'hero:a',
    },
    {
      name: 'everything equal and no initiative: id order',
      me: RAT,
      others: [hero('b', [3, 0]), hero('a', [-3, 0])],
      steps: melee2,
      at: [-2, 0],
      focus: 'hero:a',
    },
    {
      name: 'a hero summon counts as acting just before its owner',
      me: RAT,
      others: [hero('tinker', [3, 0], 30), { id: 'summon:tinker.button', at: [-3, 0], owner: 'hero:tinker' }],
      steps: melee2,
      at: [-2, 0],
      focus: 'summon:tinker.button',
    },
    {
      name: 'already adjacent: no movement, attacks at once',
      me: RAT,
      others: [hero('a', [1, 0], 90), hero('b', [-2, 0], 1)],
      steps: melee2,
      at: [0, 0],
      focus: 'hero:a',
    },
  ]);
});

describe('focus: summons (Ґудзик) focus monsters', () => {
  runGolden([
    {
      name: 'equal group initiative: lowest standee number, not id order',
      me: BUTTON,
      others: [hero('tinker', [-4, 2], 30), mon('rat:9', [3, 0], { initiative: 40 }), mon('rat:10', [-3, 0])],
      steps: melee2,
      at: [2, 0],
      focus: 'monster:rat:9',
    },
    {
      name: 'different groups: the group acting first',
      me: BUTTON,
      others: [hero('tinker', [-4, 2], 30), mon('rat:1', [3, 0], { initiative: 50 }), mon('wolf:1', [-3, 0], { initiative: 10 })],
      steps: melee2,
      at: [-2, 0],
      focus: 'monster:wolf:1',
    },
    {
      name: 'passes through heroes in a corridor',
      board: { hexes: Array.from({ length: 5 }, (_, q) => [q, 0] as Hex) },
      me: BUTTON,
      others: [hero('tinker', [1, 0], 30), mon('rat:1', [3, 0])],
      steps: melee2,
      at: [2, 0],
      focus: 'monster:rat:1',
    },
    {
      name: 'ignores invisible monsters',
      me: BUTTON,
      others: [hero('tinker', [-4, 2], 30), mon('rat:1', [2, 0], { conditions: ['invisible'] }), mon('rat:2', [-3, 0])],
      steps: melee2,
      at: [-2, 0],
      focus: 'monster:rat:2',
    },
  ]);
});

describe('focus: invisible, downed, nobody', () => {
  runGolden([
    {
      name: 'an invisible hero cannot be focused',
      me: RAT,
      others: [hero('a', [2, 0], 10, { conditions: ['invisible'] }), hero('b', [-3, 0], 90)],
      steps: melee2,
      at: [-2, 0],
      focus: 'hero:b',
    },
    {
      name: 'all heroes invisible: stays, no attack, other steps still run',
      me: RAT,
      others: [hero('a', [2, 0], 10, { conditions: ['invisible'] }), hero('b', [-3, 0], 90, { conditions: ['invisible'] })],
      steps: [move(2), attack(2), shield(1)],
      at: [0, 0],
      focus: null,
      targets: [[]],
    },
    {
      name: 'an invisible hero still blocks the corridor: no focus',
      board: { hexes: Array.from({ length: 5 }, (_, q) => [q, 0] as Hex) },
      me: RAT,
      others: [hero('a', [1, 0], 10, { conditions: ['invisible'] }), hero('b', [3, 0], 90)],
      steps: melee2,
      at: [0, 0],
      focus: null,
      targets: [[]],
    },
    {
      name: 'a downed hero (fork) is not focused',
      me: RAT,
      others: [hero('a', [1, 0], 10, { downed: true, hp: 0 }), hero('b', [-3, 0], 90)],
      steps: melee2,
      at: [-2, 0],
      focus: 'hero:b',
    },
    {
      name: 'exhausted heroes are gone',
      me: RAT,
      others: [hero('a', [1, 0], 10, { exhausted: true, hp: 0 }), hero('b', [-3, 0], 90)],
      steps: melee2,
      at: [-2, 0],
      focus: 'hero:b',
    },
  ]);
});

describe('focus: «Виклик» Вартового', () => {
  runGolden([
    {
      name: 'within the radius and attackable this turn: focuses the warden',
      me: RAT,
      others: [hero('warden', [3, 0], 50, { provokeRadius: 3 }), hero('b', [-2, 0], 10)],
      steps: melee2,
      at: [2, 0],
      focus: 'hero:warden',
    },
    {
      name: 'outside the radius: normal focus',
      me: RAT,
      others: [hero('warden', [3, 0], 50, { provokeRadius: 2 }), hero('b', [-2, 0], 10)],
      steps: melee2,
      at: [-1, 0],
      focus: 'hero:b',
    },
    {
      name: 'within the radius but out of reach this turn: normal focus',
      me: RAT,
      others: [hero('warden', [3, 0], 50, { provokeRadius: 3 }), hero('b', [-2, 0], 10)],
      steps: [move(1), attack(2)],
      at: [-1, 0],
      focus: 'hero:b',
    },
    {
      name: 'an invisible warden provokes nobody',
      me: RAT,
      others: [hero('warden', [3, 0], 50, { provokeRadius: 3, conditions: ['invisible'] }), hero('b', [-2, 0], 10)],
      steps: melee2,
      at: [-1, 0],
      focus: 'hero:b',
    },
    {
      name: 'summons ignore provoke (the warden is their ally)',
      me: BUTTON,
      others: [hero('warden', [1, 0], 50, { provokeRadius: 3 }), hero('tinker', [-4, 2], 30), mon('rat:1', [-3, 0])],
      steps: melee2,
      at: [-2, 0],
      focus: 'monster:rat:1',
    },
  ]);
});
