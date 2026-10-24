import { describe, expect, it } from 'vitest';
import { act, actEvents, eventsOf, makeContent, newGame, selectAll } from '../../helpers/engineFixtures';
import { exhaust } from '../../../src/rules/damage';
import { goalReached, objectiveStatus } from '../../../src/rules/objectives';
import type { GameState, HeroState } from '../../../src/rules/state';
import { checkScenario } from '../../data/crossref';

// Two crystal clusters in r1; the camp is the bottom-left corner.
const content = makeContent({
  secondRoom: false,
  room: {
    objects: [
      { hex: [3, 0], id: 'crystal-1', kind: 'crystal', blocks: true },
      { hex: [5, 0], id: 'crystal-2', kind: 'crystal', blocks: true },
    ],
  },
  scenario: { zones: [{ id: 'camp', hexes: [[0, 4], [1, 4]] }] },
  goal: { type: 'collect', kind: 'crystal', count: 2, zone: 'camp' },
});

function alphaTurn(hex: [number, number]): GameState {
  const s = newGame(content);
  s.figures['hero:alpha']!.hex = hex;
  return selectAll(s, content, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c3', 'beta.c4'] });
}

const alpha = (s: GameState) => s.figures['hero:alpha'] as HeroState;

describe('collect', () => {
  it('an adjacent hero picks a crystal up with a bottom action: it leaves the board and is carried', () => {
    const s = act(alphaTurn([3, 1]), content, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'bottom', objectId: 'crystal-1' });
    expect(alpha(s).questItems).toEqual(['crystal']);
    expect(s.board.tiles['3,0']?.object).toBeUndefined();
    expect(s.board.tiles['3,0']?.obstacle).toBeUndefined();
    expect(objectiveStatus(content, s)).toMatchObject({ goal: 'collect', done: 0, of: 2 });
  });

  it('a carrier ending its turn in the zone hands the crystals over; enough of them wins', () => {
    const s = alphaTurn([1, 4]);
    alpha(s).questItems = ['crystal'];
    const { state, events } = actEvents(s, content, { type: 'endTurn', heroId: 'hero:alpha' });
    expect(eventsOf(events, 'itemsDelivered')).toMatchObject([{ heroId: 'hero:alpha', item: 'crystal', count: 1, total: 1 }]);
    expect(alpha(state).questItems).toEqual([]);
    expect(objectiveStatus(content, state)).toMatchObject({ done: 1, of: 2 });
    expect(goalReached({ s: state, c: content, ev: [], out: [] })).toBe(false);
    state.delivered = 2;
    expect(goalReached({ s: state, c: content, ev: [], out: [] })).toBe(true);
  });

  it('an exhausted carrier drops its crystals on its hex', () => {
    const s = alphaTurn([2, 2]);
    alpha(s).questItems = ['crystal', 'crystal'];
    exhaust({ s, c: content, ev: [], out: [] }, alpha(s), 'damage');
    expect(s.board.tiles['2,2']?.questItems).toEqual(['crystal', 'crystal']);
    expect(alpha(s).questItems).toEqual([]);
  });

  it('the data checks want enough objects on the map', () => {
    const bad = { ...content.scenarios['test']!, goal: { type: 'collect' as const, kind: 'crystal', count: 3, zone: 'camp' } };
    expect(checkScenario(bad, content)).toContain('test: goal collects 3 crystal, the map has 2');
  });
});
