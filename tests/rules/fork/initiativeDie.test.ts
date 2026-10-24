import { describe, expect, it } from 'vitest';
import type { GameState } from '../../../src/rules/state';
import { INITIATIVE_DIE_MAX } from '../../../src/rules/variants';
import { eventsOf, finishRound, heroOf, makeContent, monsterType, selectAll, stackBehaviour } from '../../helpers/engineFixtures';
import { forkGame } from './fixtures';

const content = () =>
  makeContent({
    monsters: [monsterType('rat', 'tmelee')],
    spawns: [{ monster: 'rat', hex: [4, 2] }],
  });

function reveal(on: boolean, seed = 1, picks: Parameters<typeof selectAll>[2] = { alpha: ['alpha.c3', 'alpha.c1'], beta: ['beta.c4', 'beta.c1'] }): GameState {
  const c = content();
  const s = forkGame(c, { initiativeDie: on }, ['alpha', 'beta'], seed);
  stackBehaviour(s, 'rat', ['tmelee.50']);
  heroOf(s, 'beta').discard = ['beta.c9', 'beta.c10'];
  return selectAll(s, c, picks);
}

describe('«Кубик ініціативи» (initiativeDie)', () => {
  it('off: initiative is the card only, no roll event and no roll fields', () => {
    const s = reveal(false);
    expect(eventsOf(s.log, 'initiativeRolled')).toEqual([]);
    expect(s.turnOrder).toEqual([
      { kind: 'hero', figureId: 'hero:alpha', initiative: 30 },
      { kind: 'hero', figureId: 'hero:beta', initiative: 40 },
      { kind: 'monsterGroup', typeId: 'rat', initiative: 50 },
    ]);
  });

  it('on: every hero and monster type adds a d12 at the reveal, before cardsRevealed', () => {
    const s = reveal(true);
    const [ev] = eventsOf(s.log, 'initiativeRolled');
    expect(ev!.rolls.map((r) => [r.kind, r.id, r.card])).toEqual([
      ['hero', 'hero:alpha', 30],
      ['hero', 'hero:beta', 40],
      ['monsterGroup', 'rat', 50],
    ]);
    for (const r of ev!.rolls) {
      expect(r.roll).toBeGreaterThanOrEqual(1);
      expect(r.roll).toBeLessThanOrEqual(12);
      expect(r.initiative).toBe(r.card + r.roll);
      const entry = s.turnOrder.find((e) => (e.kind === 'monsterGroup' ? e.typeId : e.figureId) === r.id);
      expect(entry).toMatchObject({ initiative: r.initiative, roll: r.roll });
    }
    expect(heroOf(s, 'alpha').initiative).toBe(ev!.rolls[0]!.initiative);
    const types = s.log.map((e) => e.type);
    expect(types.indexOf('initiativeRolled')).toBe(types.indexOf('cardsRevealed') - 1);
    const sorted = [...s.turnOrder].sort((a, b) => a.initiative - b.initiative);
    expect(s.turnOrder.map((e) => e.initiative)).toEqual(sorted.map((e) => e.initiative));
  });

  it('the same seed rolls the same; other seeds roll differently', () => {
    const rolls = (seed: number) => eventsOf(reveal(true, seed).log, 'initiativeRolled')[0]!.rolls.map((r) => r.roll);
    expect(rolls(7)).toEqual(rolls(7));
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => rolls(seed).join(',')));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('a long rest does not roll and stays last at 99', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = reveal(true, seed, { alpha: ['alpha.c9', 'alpha.c1'], beta: 'rest' });
      const [ev] = eventsOf(s.log, 'initiativeRolled');
      expect(ev!.rolls.map((r) => r.id)).toEqual(['hero:alpha', 'rat']);
      expect(s.turnOrder.at(-1)).toEqual({ kind: 'hero', figureId: 'hero:beta', initiative: 99 });
      expect(ev!.rolls[0]!.initiative).toBeLessThanOrEqual(INITIATIVE_DIE_MAX);
    }
  });

  it('rolls are cleared at the end of the round', () => {
    const s0 = reveal(true);
    expect(s0.behaviourDecks.rat!.roll).toBeDefined();
    expect(heroOf(s0, 'alpha').initiativeRoll).toBeDefined();
    const s = finishRound(s0, content());
    expect(s.round).toBe(2);
    expect(s.behaviourDecks.rat!.roll).toBeUndefined();
    expect(heroOf(s, 'alpha').initiativeRoll).toBeUndefined();
    expect(heroOf(s, 'alpha').initiative).toBeNull();
  });
});
