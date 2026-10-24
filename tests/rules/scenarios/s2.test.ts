import { describe, expect, it } from 'vitest';
import { act, finishRound, playHalf, selectAll } from '../../helpers/engineFixtures';
import { scenarioReward } from '../../../src/rules/queries';
import type { GameState } from '../../../src/rules/state';
import { clearMonsters, content, game, hero, place, reveal, selected, tile, twoCards, untilTurn } from './helpers';

function select(s: GameState): GameState {
  return selectAll(s, content, { warden: twoCards(s, 'warden'), herbalist: twoCards(s, 'herbalist') });
}

describe('s2 Тернова стежка', () => {
  it('is loaded with its goal and introduces conditions, elements, terrain and traps', () => {
    const sc = content.scenarios['s2'];
    expect(sc?.goal.type).toBe('reachExit');
    expect(sc?.introduces).toEqual(['conditions', 'elements', 'difficultTerrain', 'hazardousTerrain', 'traps']);
  });

  it('thorns are hazardous: 1 damage for every thorn hex entered (level 1)', () => {
    let s = clearMonsters(game('s2'));
    place(s, 'hero:warden', [1, 0]);
    expect(tile(s, [2, 0]).terrain).toBe('hazardous');
    expect(tile(s, [2, 1]).terrain).toBe('hazardous');
    s = untilTurn(select(s), 'warden');
    const hp = hero(s, 'warden').hp;
    const [, bottom] = selected(s, 'warden');
    s = playHalf(s, content, 'warden', bottom, 'bottom', [{ path: [[2, 0], [2, 1]] }], true);
    const hazards = s.log.filter((e) => e.type === 'damaged' && e.source === 'hazard');
    expect(hazards.map((e) => e.type === 'damaged' && e.amount)).toEqual([1, 1]);
    expect(hero(s, 'warden').hp).toBe(hp - 2);
    expect(hero(s, 'warden').hex).toEqual([2, 1]);
  });

  it('the two ravine traps deal 2 + level and are gone afterwards', () => {
    let s = clearMonsters(reveal(game('s2'), 's2.ravine'));
    expect(tile(s, [7, 1]).trap).toEqual({ damage: 3, conditions: [] });
    expect(tile(s, [10, -1]).trap).toEqual({ damage: 3, conditions: [] });
    place(s, 'hero:warden', [6, 1]);
    s = untilTurn(select(s), 'warden');
    const hp = hero(s, 'warden').hp;
    const [, bottom] = selected(s, 'warden');
    s = playHalf(s, content, 'warden', bottom, 'bottom', [{ path: [[7, 1]] }], true);
    expect(s.log.some((e) => e.type === 'trapTriggered' && e.damage === 3)).toBe(true);
    expect(hero(s, 'warden').hp).toBe(hp - 3);
    expect(tile(s, [7, 1]).trap).toBeUndefined();
  });

  it('is won at the end of the round when every living hero stands on an exit hex', () => {
    const start = clearMonsters(reveal(game('s2'), 's2.ravine', 's2.lodge'));
    place(start, 'hero:warden', [17, -6]);
    place(start, 'hero:herbalist', [17, -5]);
    expect(finishRound(select(structuredClone(start)), content).phase).toBe('won');

    const short = structuredClone(start);
    place(short, 'hero:herbalist', [15, -4]);
    const t = finishRound(select(short), content);
    expect(t.phase).toBe('selectCards');
    expect(t.round).toBe(2);
  });

  it('an exhausted hero does not have to reach the exit', () => {
    const s = clearMonsters(reveal(game('s2'), 's2.ravine', 's2.lodge'));
    place(s, 'hero:warden', [17, -4]);
    hero(s, 'herbalist').exhausted = true;
    hero(s, 'herbalist').hp = 0;
    s.pending = { kind: 'selectCards', heroIds: ['hero:warden'] };
    const t = act(s, content, { type: 'selectCards', heroId: 'hero:warden', cards: twoCards(s, 'warden'), leading: twoCards(s, 'warden')[0] });
    expect(finishRound(t, content).phase).toBe('won');
  });

  it('the reward is 10 gold each and one healing potion for the whole party', () => {
    expect(scenarioReward(content, 's2')).toEqual({ goldEach: 10, partyItems: ['healing-potion'], unlock: ['s3'] });
  });
});
