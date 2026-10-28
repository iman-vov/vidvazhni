// `protect {object, rounds}` (s20's heart): a fixture with a breakable heart in the middle of the room.

import { describe, expect, it } from 'vitest';
import { eventsOf, finishRound, makeContent, newGame, selectAll } from '../../helpers/engineFixtures';
import type { Content } from '../../../src/rules/content';
import { hitObstacle } from '../../../src/rules/obstacles';
import { objectiveStatus } from '../../../src/rules/objectives';
import type { GameState } from '../../../src/rules/state';
import { checkScenario } from '../../data/crossref';

function heart(rounds = 2): Content {
  return makeContent({
    secondRoom: false,
    room: { objects: [{ hex: [3, 2], id: 'heart', kind: 'crystal-heart', hp: 4 }] },
    goal: { type: 'protect', object: 'heart', rounds },
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

describe('protect', () => {
  it('the object still standing after the rounds wins', () => {
    const c = heart();
    let s = round(newGame(c), c);
    expect(s.phase).toBe('selectCards');
    s = round(s, c);
    expect(s.phase).toBe('won');
  });

  it('a hit shows on the goal line; broken, it loses at once', () => {
    const c = heart();
    const s = newGame(c);
    const ctx = { s, c, ev: [], out: [] };
    expect(objectiveStatus(c, s)).toMatchObject({ goal: 'protect', done: 1, of: 2, extra: { key: 'objective.objectHp', n: 4, of: 4 } });
    hitObstacle(ctx, 'monster:rat:1', [3, 2], 3);
    expect(objectiveStatus(c, s)?.extra).toEqual({ key: 'objective.objectHp', n: 1, of: 4 });
    expect(s.phase).not.toBe('lost');
    hitObstacle(ctx, 'monster:rat:1', [3, 2], 1);
    expect(s.phase).toBe('lost');
    expect(eventsOf(ctx.ev, 'objectChanged')).toMatchObject([{ objectId: 'heart', state: 'destroyed' }]);
    expect(eventsOf(ctx.ev, 'scenarioLost')).toHaveLength(1);
  });

  it('broken on the last round, it loses even though the rounds are up', () => {
    const c = heart(1);
    let s = newGame(c);
    s = selectAll(s, c, pair(s));
    hitObstacle({ s, c, ev: [], out: [] }, 'monster:rat:1', [3, 2], 4);
    s = finishRound(s, c);
    expect(s.phase).toBe('lost');
  });

  it('the data checks want the object on the map with hp', () => {
    const c = heart();
    const errors = checkScenario({ ...c.scenarios['test']!, goal: { type: 'protect', object: 'lamp', rounds: 3 } }, c);
    expect(errors).toContain('test: goal protects lamp, the map has no such object with hp');
  });
});
