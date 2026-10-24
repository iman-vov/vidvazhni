import { describe, expect, it } from 'vitest';
import { finishRound, makeContent, newGame, selectAll } from '../../helpers/engineFixtures';
import type { Content, NpcDef } from '../../../src/rules/content';
import { killFigure } from '../../../src/rules/damage';
import { distance } from '../../../src/rules/hex';
import { objectiveStatus } from '../../../src/rules/objectives';
import type { GameState, SummonState } from '../../../src/rules/state';
import { checkScenario } from '../../data/crossref';

function escort(npc: Partial<NpcDef> = {}): Content {
  return makeContent({
    secondRoom: false,
    scenario: { zones: [{ id: 'pen', hexes: [[6, 2], [6, 3]] }], npcs: [{ id: 'shepherd', hex: [1, 2], hp: 4, move: 2, ...npc }] },
    goal: { type: 'escort', npc: 'shepherd', zone: 'pen' },
  });
}

function round(s: GameState, c: Content): GameState {
  return finishRound(selectAll(s, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c1', 'beta.c2'] }), c);
}

const npc = (s: GameState) => s.figures['npc:shepherd'] as SummonState;

describe('escort', () => {
  it('the NPC appears with its room and shows its health on the goal line', () => {
    const c = escort();
    const s = newGame(c);
    expect(npc(s)).toMatchObject({ kind: 'summon', hex: [1, 2], hp: 4, npc: { initiative: 50 } });
    expect(objectiveStatus(c, s)).toMatchObject({ goal: 'escort', done: 4, of: 4 });
  });

  it('on its turn it walks towards the zone while a hero is near, and never attacks', () => {
    const c = escort();
    const s = round(newGame(c), c);
    expect(distance(npc(s).hex, [6, 2])).toBe(3);
    expect(s.phase).toBe('selectCards');
  });

  it('with no hero within 3 hexes it waits', () => {
    const c = escort({ hex: [5, 0] });
    const s = round(newGame(c), c);
    expect(npc(s).hex).toEqual([5, 0]);
  });

  it('the NPC in the zone at the end of a round wins; its death loses at once', () => {
    const c = escort({ hex: [6, 3] });
    expect(round(newGame(c), c).phase).toBe('won');
    const s = newGame(c);
    killFigure({ s, c, ev: [], out: [] }, npc(s));
    expect(s.phase).toBe('lost');
  });

  it('the data checks want the NPC and its hex on the map', () => {
    const c = escort({ hex: [20, 20] });
    const errors = checkScenario({ ...c.scenarios['test']!, goal: { type: 'escort', npc: 'goat', zone: 'pen' } }, c);
    expect(errors).toContain('test: npc shepherd hex 20,20 is outside every room');
    expect(errors).toContain('test: goal npc goat missing');
  });
});
