import { describe, expect, it } from 'vitest';
import { finishRound, makeContent, monsterAt, newGame, selectAll } from '../../helpers/engineFixtures';
import { hitObstacle } from '../../../src/rules/obstacles';
import { goalReached, objectiveStatus } from '../../../src/rules/objectives';
import type { GameState, HeroState } from '../../../src/rules/state';
import { checkScenario } from '../../data/crossref';

// Two totems in r1 with 3 hp; each standing totem calls a rat at the start of every round.
const content = makeContent({
  secondRoom: false,
  room: {
    objects: [
      { hex: [4, 0], id: 'totem-1', kind: 'totem', hp: 3, spawn: { monster: 'rat', by: { '2': 'normal', '3': 'normal', '4': 'elite' } } },
      { hex: [4, 4], id: 'totem-2', kind: 'totem', hp: 3 },
    ],
  },
  goal: { type: 'destroy', kind: 'totem' },
});

const ctx = (s: GameState) => ({ s, c: content, ev: [], out: [] });

function round(s: GameState): GameState {
  const two = (id: string): [string, string] => {
    const hand = (s.figures[`hero:${id}`] as HeroState).hand;
    return [hand[0]!, hand[1]!];
  };
  return finishRound(selectAll(s, content, { alpha: two('alpha'), beta: two('beta') }), content);
}

describe('destroy', () => {
  it('a totem blocks like a breakable obstacle; at 0 hp it is gone and counted', () => {
    const s = newGame(content);
    expect(s.board.tiles['4,0']).toMatchObject({ obstacle: true, breakable: { hp: 3, maxHp: 3 }, object: { id: 'totem-1' } });
    expect(objectiveStatus(content, s)).toMatchObject({ goal: 'destroy', done: 0, of: 2 });
    hitObstacle(ctx(s), 'hero:alpha', [4, 0], 5);
    expect(s.board.tiles['4,0']?.object).toBeUndefined();
    expect(s.board.tiles['4,0']?.obstacle).toBeUndefined();
    expect(objectiveStatus(content, s)).toMatchObject({ done: 1, of: 2 });
    expect(goalReached(ctx(s))).toBe(false);
    hitObstacle(ctx(s), 'hero:alpha', [4, 4], 3);
    expect(goalReached(ctx(s))).toBe(true);
  });

  it('a standing totem calls a monster next to it at the start of every round; a broken one does not', () => {
    let s = round(newGame(content));
    const near = Object.values(s.figures).filter((f) => f.kind === 'monster');
    expect(near).toHaveLength(1);
    expect(monsterAt(s, near[0]!.hex)?.typeId).toBe('rat');
    hitObstacle(ctx(s), 'hero:alpha', [4, 0], 3);
    for (const m of near) delete s.figures[m.id];
    s = round(s);
    expect(Object.values(s.figures).filter((f) => f.kind === 'monster')).toHaveLength(0);
  });

  it('the data checks want objects of the kind with hp and known monsters to call', () => {
    const bad = structuredClone(content.scenarios['test']!);
    bad.goal = { type: 'destroy', kind: 'nest' };
    bad.rooms[0]!.objects![0]!.spawn!.monster = 'ghost';
    const errors = checkScenario(bad, content);
    expect(errors).toContain('test: goal destroys nest, the map has none with hp');
    expect(errors).toContain('test: object totem-1 calls missing monster ghost');
  });
});
