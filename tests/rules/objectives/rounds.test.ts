import { describe, expect, it } from 'vitest';
import { finishRound } from '../../helpers/engineFixtures';
import type { Content } from '../../../src/rules/content';
import { goalReached, lostByRules, objectiveStatus } from '../../../src/rules/objectives';
import type { GameState } from '../../../src/rules/state';
import { clearMonsters, game, monstersOf, place, reveal } from '../scenarios/helpers';
import { select, withS2 } from './helpers';

function ctx(s: GameState, c: Content) {
  return { s, c, ev: [], out: [] };
}

/** s2 without monsters, both heroes at the start. */
function quiet(): GameState {
  return clearMonsters(game('s2'));
}

describe('round goals and limits', () => {
  it('survive: won at the end of round N, not before', () => {
    const c = withS2({ goal: { type: 'survive', rounds: 2 } });
    let s = finishRound(select(quiet(), c), c);
    expect(s.phase).toBe('selectCards');
    expect(objectiveStatus(c, s)).toMatchObject({ goal: 'survive', done: 2, of: 2 });
    s = finishRound(select(s, c), c);
    expect(s.phase).toBe('won');
    expect(s.round).toBe(2);
  });

  it('defend: a monster in the zone at the end of a round loses; an empty zone after N rounds wins', () => {
    const c = withS2({ zones: [{ id: 'camp', hexes: [[1, 0], [1, 1]] }], goal: { type: 'defend', zone: 'camp', rounds: 1 } });
    const s = game('s2');
    const m = monstersOf(s)[0];
    if (!m) throw new Error('s2 starts without monsters');
    clearMonsters(s);
    expect(goalReached(ctx(s, c))).toBe(true);
    expect(lostByRules(ctx(s, c))).toBe(false);
    s.figures[m.id] = { ...m, hex: [1, 0] };
    expect(goalReached(ctx(s, c))).toBe(false);
    expect(lostByRules(ctx(s, c))).toBe(true);
    place(s, m.id, [5, 0]);
    expect(lostByRules(ctx(s, c))).toBe(false);
  });

  it('roundLimit: the goal not reached by the end of round N loses; reaching it in time still wins', () => {
    const c = withS2({ lose: [{ type: 'roundLimit', rounds: 1 }] });
    expect(objectiveStatus(c, quiet())?.roundsLeft).toBe(1);
    const late = finishRound(select(quiet(), c), c);
    expect(late.phase).toBe('lost');
    expect(late.log.at(-1)).toEqual({ type: 'scenarioLost' });

    const early = clearMonsters(reveal(game('s2'), 's2.ravine', 's2.lodge'));
    place(early, 'hero:warden', [13, -5]);
    place(early, 'hero:herbalist', [13, -4]);
    expect(finishRound(select(early, c), c).phase).toBe('won');
  });

  it('without lose rules nothing changes: s2 goes on past any round', () => {
    const c = withS2({});
    const s = quiet();
    s.round = 40;
    expect(lostByRules(ctx(s, c))).toBe(false);
    expect(objectiveStatus(c, s)?.roundsLeft).toBeUndefined();
  });
});
