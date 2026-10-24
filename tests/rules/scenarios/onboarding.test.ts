import { describe, expect, it } from 'vitest';
import { spawnMonster } from '../../../src/rules/setup';
import { ruleIntroduced } from '../../../src/rules/scenarioRules';
import { figureSteps } from '../../../src/rules/turn';
import type { GameState, MonsterState } from '../../../src/rules/state';
import { content, ctxOf, game, monstersOf, reveal } from './helpers';

/** A monster of `typeId` put next to the start room with `cardId` as its behaviour card. */
function withCard(s: GameState, typeId: string, rank: 'normal' | 'elite', cardId: string): MonsterState {
  const ctx = ctxOf(s);
  const m = spawnMonster(ctx, typeId, rank, [3, 3]);
  s.behaviourDecks[typeId]!.current = cardId;
  return m;
}

describe('gradual onboarding: monsters use only the rules introduced so far', () => {
  it('rule groups unlock with the scenario that introduces them', () => {
    const at = (id: string, group: string) => ruleIntroduced(content, id, group);
    expect([at('s1', 'conditions'), at('s2', 'conditions'), at('s5', 'conditions')]).toEqual([false, true, true]);
    expect([at('s1', 'elements'), at('s2', 'elements')]).toEqual([false, true]);
    expect([at('s3', 'curse'), at('s4', 'curse')]).toEqual([false, true]);
    expect([at('s3', 'monsterSummons'), at('s4', 'monsterSummons')]).toEqual([false, true]);
    // A group no scenario introduces is always in play.
    expect(at('s1', 'push')).toBe(true);
  });

  it('s1: no conditions from monsters (card or elite trait); from s2 on they apply', () => {
    const s1 = game('s1');
    const gremlin = withCard(s1, 'gremlin', 'elite', 'archer.68');
    expect(figureSteps(ctxOf(s1), gremlin)).toEqual([{ type: 'attack', value: 3, range: 3 }]);
    const wolfGame = game('s1');
    const wolf1 = withCard(wolfGame, 'grey-wolf', 'elite', 'melee.25');
    expect(figureSteps(ctxOf(wolfGame), wolf1).find((st) => st.type === 'attack')).toEqual({ type: 'attack', value: 3 });

    const s2 = game('s2');
    const wolf2 = withCard(s2, 'grey-wolf', 'elite', 'melee.25');
    expect(figureSteps(ctxOf(s2), wolf2).find((st) => st.type === 'attack')).toEqual({ type: 'attack', value: 3, conditions: ['wound'] });
  });

  it('s1: monsters do not infuse or consume elements; s2 on they do', () => {
    const s1 = game('s1');
    const guard = withCard(s1, 'thornling', 'normal', 'guard.80');
    expect(figureSteps(ctxOf(s1), guard).some((st) => st.type === 'infuse')).toBe(false);
    const s2 = game('s2');
    const guard2 = withCard(s2, 'thornling', 'normal', 'guard.80');
    expect(figureSteps(ctxOf(s2), guard2).some((st) => st.type === 'infuse')).toBe(true);
  });

  it('before s4 cultists neither summon nor curse; a boss deck comes whole (the Miller summons in s3)', () => {
    const s3 = game('s3');
    expect(figureSteps(ctxOf(s3), withCard(s3, 'gloom-cultist', 'normal', 'caster.23'))).toEqual([]);
    const curse3 = game('s3');
    curse3.elements.dark = 'strong';
    const c3 = withCard(curse3, 'gloom-cultist', 'normal', 'caster.48');
    expect(figureSteps(ctxOf(curse3), c3)).toEqual([{ type: 'attack', value: 3, range: 3 }]);

    const s4 = game('s4');
    expect(figureSteps(ctxOf(s4), withCard(s4, 'gloom-cultist', 'normal', 'caster.23'))).toEqual([
      { type: 'summon', summon: 'shadow-wraith', rank: 'normal' },
    ]);

    const hall = reveal(game('s3'), 's3.mill-hall');
    const miller = monstersOf(hall, 'bog-miller')[0]!;
    hall.behaviourDecks['bog-miller']!.current = 'boss.miller.22';
    expect(figureSteps(ctxOf(hall), miller).map((st) => st.type)).toEqual(['summon', 'heal']);
  });

  it('Тінерук’s line of 4 hexes is drawn from himself, so it is not a ranged attack', () => {
    const s = reveal(game('s5'), 's5.heart');
    const boss = monstersOf(s, 'shadowhand')[0]!;
    s.behaviourDecks['shadowhand']!.current = 'boss.shadowhand.63';
    expect(figureSteps(ctxOf(s), boss)).toEqual([{ type: 'attack', value: 5, area: { shape: 'line', length: 4, fromSelf: true } }]);
  });
});
