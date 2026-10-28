// `defend {zone, rounds, counter}` (s13's fireflies): a fixture with rats standing still in a pond.

import { describe, expect, it } from 'vitest';
import { eventsOf, finishRound, makeContent, newGame, selectAll } from '../../helpers/engineFixtures';
import type { Content } from '../../../src/rules/content';
import type { Hex } from '../../../src/rules/hex';
import { objectiveStatus } from '../../../src/rules/objectives';
import type { GameState } from '../../../src/rules/state';

const POND: Hex[] = [
  [3, 1],
  [3, 2],
  [4, 1],
  [4, 2],
];

/** Rats that only stand there (a deck without steps) on `rats`, far from the heroes. */
function pond(rats: Hex[], counter: number | undefined, rounds = 2): Content {
  return makeContent({
    secondRoom: false,
    decks: [{ id: 'tmelee', cards: [{ id: 'tmelee.50', initiative: 50, steps: [] }] }],
    spawns: rats.map((hex) => ({ monster: 'rat', hex })),
    scenario: { zones: [{ id: 'pond', hexes: POND }] },
    goal: { type: 'defend', zone: 'pond', rounds, ...(counter ? { counter, counterName: 'objective.counter' } : {}) },
  });
}

function round(s: GameState, c: Content): GameState {
  return finishRound(selectAll(s, c, pair(s)), c);
}

/** Two fresh cards per round (the fixture's hand holds ten). */
function pair(s: GameState): Record<string, [string, string]> {
  const n = 2 * s.round;
  return { alpha: [`alpha.c${n - 1}`, `alpha.c${n}`], beta: [`beta.c${n - 1}`, `beta.c${n}`] };
}

describe('defend with a counter', () => {
  it('each monster in the zone takes 1 at the end of a round; surviving the rounds with lights left wins', () => {
    const c = pond([[3, 1]], 3);
    let s = round(newGame(c), c);
    expect(s.phase).toBe('selectCards');
    expect(s.goalCounter).toBe(2);
    expect(eventsOf(s.log, 'goalCounterChanged')).toEqual([{ type: 'goalCounterChanged', lost: 1, left: 2 }]);
    s = round(s, c);
    expect(s.goalCounter).toBe(1);
    expect(s.phase).toBe('won');
  });

  it('a monster outside the zone takes nothing', () => {
    const c = pond([[5, 4]], 3);
    const s = round(newGame(c), c);
    expect(s.goalCounter).toBeUndefined();
    expect(objectiveStatus(c, s)?.extra).toEqual({ key: 'objective.counter', n: 3, of: 3 });
  });

  it('the counter hitting 0 on the last round loses (it is checked before the victory)', () => {
    const c = pond([[3, 1], [4, 2]], 4);
    let s = round(newGame(c), c);
    expect(s.goalCounter).toBe(2);
    s = round(s, c);
    expect(s.goalCounter).toBe(0);
    expect(s.phase).toBe('lost');
  });

  it('more monsters than lights: 0 at once, never below', () => {
    const c = pond([[3, 1], [3, 2], [4, 1]], 2, 5);
    const s = round(newGame(c), c);
    expect(s.goalCounter).toBe(0);
    expect(eventsOf(s.log, 'goalCounterChanged')).toEqual([{ type: 'goalCounterChanged', lost: 2, left: 0 }]);
    expect(s.phase).toBe('lost');
  });

  it('without a counter a monster in the zone still loses at once (Acts I–II)', () => {
    const c = pond([[3, 1]], undefined, 3);
    expect(round(newGame(c), c).phase).toBe('lost');
  });

  it('the goal line shows the rounds and the lights left', () => {
    const c = pond([[3, 1]], 8, 7);
    const s = round(newGame(c), c);
    expect(objectiveStatus(c, s)).toMatchObject({ goal: 'defend', done: 2, of: 7, extra: { key: 'objective.counter', n: 7, of: 8 } });
  });
});
