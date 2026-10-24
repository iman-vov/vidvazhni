import { describe, expect, it } from 'vitest';
import { finishRound } from '../../helpers/engineFixtures';
import { objectiveStatus, secondaryGold } from '../../../src/rules/objectives';
import type { GameState } from '../../../src/rules/state';
import { clearMonsters, content, game, hero, place, reveal } from '../scenarios/helpers';
import { select, withS2 } from './helpers';

/** s2 with both heroes on the exit and no monsters: won at the end of round 1. */
function atExit(): GameState {
  const s = clearMonsters(reveal(game('s2'), 's2.ravine', 's2.lodge'));
  place(s, 'hero:warden', [17, -6]);
  place(s, 'hero:herbalist', [17, -5]);
  return s;
}

const c = withS2({
  secondary: [
    { id: 'quick', check: 'withinRounds', params: { rounds: 1 }, reward: { xp: 2, gold: 3 } },
    { id: 'map', check: 'chestOpened', params: { chest: 's2.map' }, reward: { xp: 5 } },
  ],
});

describe('secondary goals', () => {
  it('pays xp for each goal met when the scenario is won, gold through secondaryGold', () => {
    const start = atExit();
    const xp = hero(start, 'warden').xp;
    const s = finishRound(select(start, c), c);
    expect(s.phase).toBe('won');
    expect(s.log.filter((e) => e.type === 'secondaryGoalMet')).toEqual([{ type: 'secondaryGoalMet', goalId: 'quick' }]);
    expect(hero(s, 'warden').xp - xp).toBe(4 + 2 * s.level + 2);
    expect(secondaryGold(c, s)).toBe(3);
  });

  it('a looted chest meets chestOpened; noneExhausted fails once a hero is exhausted', () => {
    const s = atExit();
    hero(s, 'warden').chests = ['s2.map'];
    const c2 = withS2({ secondary: [...(c.scenarios['s2']?.secondary ?? []), { id: 'safe', check: 'noneExhausted', reward: { xp: 1 } }] });
    expect(objectiveStatus(c2, s)?.secondary.map((g) => g.met)).toEqual([true, true, true]);
    hero(s, 'herbalist').exhausted = true;
    s.round = 2;
    expect(objectiveStatus(c2, s)?.secondary.map((g) => g.met)).toEqual([false, true, false]);
  });

  it('the status counts heroes at the exit; scenarios without secondary goals pay nothing extra', () => {
    const s = atExit();
    place(s, 'hero:herbalist', [15, -4]);
    expect(objectiveStatus(content, s)).toEqual({ goal: 'reachExit', done: 1, of: 2, secondary: [] });
    expect(secondaryGold(content, s)).toBe(0);
  });
});
