// livingBooks (s18, books.ts): a hero ending its turn next to a sleeping shelf, unless invisible,
// wakes it and raises the alarm; the `alarm` trigger and the `wake` action.

import { describe, expect, it } from 'vitest';
import type { Content, ScenarioEventDef } from '../../src/rules/content';
import type { Hex } from '../../src/rules/hex';
import { secondaryMet } from '../../src/rules/objectives';
import type { GameState, MonsterState } from '../../src/rules/state';
import { checkScenario } from '../data/crossref';
import { act, eventsOf, makeContent, monsterType, newGame, selectAll } from '../helpers/engineFixtures';

const SHELF: Hex = [3, 2];

const ALARM: ScenarioEventDef = {
  id: 'alarm',
  trigger: { type: 'alarm', object: 'shelf' },
  actions: [
    { type: 'spawn', monster: 'ghost', by: { '2': 'normal' }, hexes: [[4, 2]] },
    { type: 'wake', room: 'r1' },
  ],
};

function fixture(specials = ['livingBooks']): Content {
  return makeContent({
    monsters: [monsterType('ghost', 'tghost', { normal: { hp: 4, move: 2, attack: 2 } })],
    decks: [{ id: 'tghost', cards: [{ id: 'g.90', initiative: 90, steps: [{ type: 'move', value: 0 }] }] }],
    spawns: [{ monster: 'ghost', hex: [5, 0] }],
    room: {
      objects: [
        { hex: SHELF, id: 'shelf', kind: 'bookshelf', state: 'asleep', blocks: true },
        { hex: [3, 4], id: 'plain', kind: 'bookshelf', state: 'still', blocks: true },
      ],
    },
    scenario: { specials, events: [ALARM], secondary: [{ id: 'quiet', check: 'noAlarm', params: { rounds: 4 }, reward: { gold: 3 } }] },
  });
}

/** Alpha moves to `to` with the bottom half of c1 and ends its turn. */
function endTurnAt(c: Content, s0: GameState, to: Hex, invisible = false): { s: GameState; ev: GameState['log'] } {
  (s0.figures['monster:ghost:1'] as MonsterState).asleep = true;
  s0.figures['hero:alpha']!.hex = to;
  if (invisible) s0.figures['hero:alpha']!.conditions.invisible = { since: 0 } as never;
  let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c9', 'beta.c10'] });
  const before = s.log.length;
  s = act(s, c, { type: 'endTurn', heroId: 'hero:alpha' });
  return { s, ev: s.log.slice(before) };
}

const shelfState = (s: GameState, hex: Hex) => s.board.tiles[`${hex[0]},${hex[1]}`]?.object?.state;

describe('livingBooks', () => {
  it('ending a turn next to a sleeping shelf wakes it: the alarm spawns a ghost and wakes the room', () => {
    const c = fixture();
    const { s, ev } = endTurnAt(c, newGame(c), [2, 2]);
    expect(shelfState(s, SHELF)).toBe('awake');
    expect(eventsOf(ev, 'alarm')).toEqual([{ type: 'alarm', objectId: 'shelf' }]);
    expect(s.alarmRound).toBe(1);
    expect(s.figures['monster:ghost:2']?.hex).toEqual([4, 2]);
    expect((s.figures['monster:ghost:1'] as MonsterState).asleep).toBeUndefined();
    expect(secondaryMet(s, c.scenarios.test!.secondary![0]!)).toBe(false);
  });

  it('an invisible hero, a plain shelf, or no special: nothing wakes', () => {
    const c = fixture();
    expect(shelfState(endTurnAt(c, newGame(c), [2, 2], true).s, SHELF)).toBe('asleep');
    const plain = endTurnAt(c, newGame(c), [2, 4]).s;
    expect(shelfState(plain, [3, 4])).toBe('still');
    expect(plain.alarmRound).toBeUndefined();
    expect(secondaryMet(plain, c.scenarios.test!.secondary![0]!)).toBe(true);
    const off = fixture([]);
    expect(shelfState(endTurnAt(off, newGame(off), [2, 2]).s, SHELF)).toBe('asleep');
  });

  it('crossref: an alarm needs the special and a sleeping shelf', () => {
    const c = fixture([]);
    const own = (e: string[]) => e.filter((x) => /alarm|wakes/.test(x));
    expect(own(checkScenario(c.scenarios.test!, c))).toEqual(['test: event alarm waits for an alarm without the livingBooks special']);
    const ok = fixture();
    const bad = { ...ok.scenarios.test!, events: [{ ...ALARM, trigger: { type: 'alarm' as const, object: 'plain' } }] };
    expect(own(checkScenario(bad, ok))).toEqual(['test: event alarm waits for plain, which is no sleeping bookshelf']);
  });
});
