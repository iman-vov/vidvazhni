import { describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/rules/effects/context';
import { loadContent } from '../../src/rules/load';
import type { GameState, MonsterState } from '../../src/rules/state';
import { figureSteps } from '../../src/rules/turn';
import { makeContent, monsterType, newGame } from '../helpers/engineFixtures';

/** Act III monster traits (docs/design/act3.md «Нові монстри»): jumps, windUp, tonguePull. */
function stepsOf(extra: Parameters<typeof monsterType>[2], round = 1, rank: 'normal' | 'elite' = 'normal') {
  const c = makeContent({ monsters: [monsterType('frog', 'tmelee', extra)], spawns: [{ monster: 'frog', hex: [3, 2], rank }] });
  const s: GameState = newGame(c);
  s.round = round;
  s.behaviourDecks['frog']!.current = 'tmelee.50';
  const frog = Object.values(s.figures).find((f) => f.kind === 'monster') as MonsterState;
  const ctx: Ctx = { s, c, ev: [], out: [] };
  return figureSteps(ctx, frog);
}

describe('Act III monster traits', () => {
  it('jumps: the move step jumps', () => {
    const steps = stepsOf({ normal: { hp: 4, move: 3, attack: 2, jumps: true } });
    expect(steps.find((s) => s.type === 'move')).toMatchObject({ value: 3, jump: true });
  });

  it('tonguePull: a melee attack reaches 2 hexes and pulls 1; a ranged one is left alone', () => {
    const steps = stepsOf({ elite: { hp: 6, move: 3, attack: 3, tonguePull: true } }, 1, 'elite');
    expect(steps.find((s) => s.type === 'attack')).toMatchObject({ value: 3, range: 2, pull: 1 });
    const ranged = stepsOf({ normal: { hp: 4, move: 3, attack: 2, range: 3, tonguePull: true } });
    expect(ranged.find((s) => s.type === 'attack')).not.toHaveProperty('pull');
  });

  it('windUp: every third round the card is replaced by Shield 2', () => {
    const stats = { normal: { hp: 7, move: 2, attack: 3, shield: 1, windUp: true } };
    expect(stepsOf(stats, 2).map((s) => s.type)).toEqual(['move', 'attack']);
    expect(stepsOf(stats, 3)).toEqual([{ type: 'shield', value: 2, target: 'self', duration: 'round' }]);
    expect(stepsOf(stats, 6)).toHaveLength(1);
  });

  it('the new monsters, bosses and decks load', () => {
    const c = loadContent();
    expect(c.monsters['marsh-hopper']?.elite.tonguePull).toBe(true);
    expect(c.monsters['brass-automaton']?.normal.windUp).toBe(true);
    expect(c.bosses['mist-queen']?.flying).toBe(true);
    expect(c.decks[c.bosses['glass-guardian']!.deck]?.cards).toHaveLength(8);
    expect(c.decks[c.bosses['mist-queen']!.deck]?.cards).toHaveLength(8);
  });
});
