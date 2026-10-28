// Secret-mission flags in a scenario (flags.ts): `mirrors.aligned` takes the Guardian's shield,
// `bells.rung` breaks a loom before the start.

import { describe, expect, it } from 'vitest';
import type { BossType, Content } from '../../src/rules/content';
import { monsterStats } from '../../src/rules/effects/context';
import { createGame } from '../../src/rules/engine';
import type { GameState, MonsterState } from '../../src/rules/state';
import { checkScenario } from '../data/crossref';
import { makeContent } from '../helpers/engineFixtures';

const GUARDIAN: BossType = { id: 'guardian', hpPerHero: 8, hpPerHeroPerLevel: 0, move: 0, attack: 3, shield: 2, deck: 'tboss', immune: [] };

function fixture(): Content {
  const base = makeContent({
    secondRoom: false,
    room: { objects: [{ hex: [5, 4], id: 'loom-1', kind: 'loom', hp: 4, blocks: true }, { hex: [5, 0], id: 'loom-2', kind: 'loom', hp: 4, blocks: true }] },
    scenario: {
      flagEffects: [
        { flag: 'mirrors.aligned', bossShield: { boss: 'guardian', shield: 0 } },
        { flag: 'bells.rung', brokenObjects: ['loom-1'] },
      ],
    },
  });
  base.scenarios.test!.rooms[0]!.spawns = [{ monster: 'guardian', hex: [3, 2], by: { '2': 'normal' } }];
  return { ...base, bosses: { guardian: GUARDIAN }, decks: { ...base.decks, tboss: { id: 'tboss', cards: [{ id: 'b.99', initiative: 99, steps: [] }] } } };
}

function start(c: Content, flags?: string[]): GameState {
  const heroes = ['alpha', 'beta'].map((classId, i) => ({ classId, playerId: `p${i + 1}`, level: 1 }));
  return createGame({ scenarioId: 'test', seed: 1, heroes, difficulty: 'normal', variants: {} as never, ...(flags ? { flags } : {}) }, c);
}

const shield = (s: GameState) => (s.figures['monster:guardian:1'] as MonsterState).shields.reduce((n, x) => n + x.value, 0);

describe('flag effects', () => {
  it('mirrors.aligned: the boss starts without its shield', () => {
    const c = fixture();
    expect(shield(start(c))).toBe(2);
    const s = start(c, ['mirrors.aligned']);
    expect(shield(s)).toBe(0);
    expect(monsterStats({ s, c }, s.figures['monster:guardian:1'] as MonsterState).shield).toBe(0);
  });

  it('bells.rung: the loom is broken before the start, the other stands', () => {
    const c = fixture();
    expect(start(c).board.tiles['5,4']?.object?.id).toBe('loom-1');
    const s = start(c, ['bells.rung']);
    expect(s.board.tiles['5,4']?.object).toBeUndefined();
    expect(s.board.tiles['5,4']?.obstacle).toBeUndefined();
    expect(s.destroyedObjects).toEqual(['loom-1']);
    expect(s.board.tiles['5,0']?.object?.id).toBe('loom-2');
  });

  it('crossref: unknown boss or object', () => {
    const c = fixture();
    const bad = { ...c.scenarios.test!, flagEffects: [{ flag: 'x', bossShield: { boss: 'nope', shield: 0 }, brokenObjects: ['gone'] }] };
    const own = checkScenario(bad, c).filter((e) => e.includes('flag'));
    expect(own).toEqual(['test: flag x shields unknown boss nope', 'test: flag x breaks missing object gone']);
  });
});
