import { describe, expect, it } from 'vitest';
import type { MonsterCard } from '../../../src/rules/content';
import { loadContent } from '../../../src/rules/load';
import type { Ctx } from '../../../src/rules/effects/context';
import type { GameState, MonsterState } from '../../../src/rules/state';
import { figureSteps } from '../../../src/rules/turn';
import type { Variants } from '../../../src/rules/variants';
import { eventsOf, finishRound, heroOf, makeContent, selectAll, stackBehaviour, stackModifiers, takeAllDamage } from '../../helpers/engineFixtures';
import { forkGame } from './fixtures';

/** Rat (attack 2): «Атака X» = attack delta x −2 + X; fixed average +0. */
const SWING: MonsterCard = { id: 'tmelee.swing', initiative: 50, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0, x: -2 }] };
const PLAIN: MonsterCard = { id: 'tmelee.60', initiative: 60, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] };
const RAT = 'monster:rat:1';

function contentFor() {
  return makeContent({ decks: [{ id: 'tmelee', cards: [SWING, PLAIN] }], spawns: [{ monster: 'rat', hex: [1, 2] }] });
}

function reveal(variants: Partial<Variants>, seed = 1): { s: GameState; c: ReturnType<typeof contentFor> } {
  const c = contentFor();
  const s0 = forkGame(c, variants, ['alpha'], seed);
  stackBehaviour(s0, 'rat', ['tmelee.swing']);
  stackModifiers(s0, 'monsters', Array<string>(10).fill('+0'));
  return { s: selectAll(s0, c, { alpha: ['alpha.c9', 'alpha.c10'] }), c };
}

function ratAttack(s: GameState, c: ReturnType<typeof contentFor>): number {
  const ctx: Ctx = { s, c, ev: [], out: [] };
  const st = figureSteps(ctx, s.figures[RAT] as MonsterState).find((x) => x.type === 'attack');
  return st && 'value' in st ? st.value : -1;
}

describe('«Монстри з X» (monsterDieAbilities)', () => {
  it('off: the card keeps its fixed average, nothing is rolled', () => {
    const { s, c } = reveal({});
    expect(eventsOf(s.log, 'monsterDieRolled')).toEqual([]);
    expect(s.behaviourDecks.rat!.xRolls).toBeUndefined();
    expect(ratAttack(s, c)).toBe(2);
  });

  it('on: X is rolled when the card is revealed and the attack is base + x + X', () => {
    const { s, c } = reveal({ monsterDieAbilities: true });
    const [ev] = eventsOf(s.log, 'monsterDieRolled');
    expect(ev).toMatchObject({ typeId: 'rat', cardId: 'tmelee.swing' });
    expect(ev!.roll).toBeGreaterThanOrEqual(1);
    expect(ev!.roll).toBeLessThanOrEqual(4);
    expect(s.behaviourDecks.rat!.xRolls).toEqual({ 'tmelee.swing': ev!.roll });
    expect(ratAttack(s, c)).toBe(ev!.roll);
  });

  it('the monster hits for the rolled value (+0 modifier)', () => {
    const { s: s0, c } = reveal({ monsterDieAbilities: true }, 4);
    const roll = eventsOf(s0.log, 'monsterDieRolled')[0]!.roll;
    const hp = heroOf(s0, 'alpha').hp;
    const s = takeAllDamage(s0, c);
    expect(heroOf(s, 'alpha').hp).toBe(hp - roll);
  });

  it('with three intents the X is rolled when the intents are shown, before the cards are chosen', () => {
    const c = contentFor();
    const s0 = forkGame(c, { monsterDieAbilities: true, threeIntents: true }, ['alpha'], 2);
    const rolled = eventsOf(s0.log, 'monsterDieRolled');
    expect(s0.pending?.kind).toBe('selectCards');
    expect(rolled.map((e) => e.cardId)).toEqual(s0.behaviourDecks.rat!.intents.filter((id) => id === 'tmelee.swing'));
    const s = selectAll(s0, c, { alpha: ['alpha.c9', 'alpha.c10'] });
    const current = s.behaviourDecks.rat!.current!;
    expect(Object.keys(s.behaviourDecks.rat!.xRolls ?? {})).toEqual(current === 'tmelee.swing' ? ['tmelee.swing'] : []);
    expect(eventsOf(s.log, 'monsterDieRolled')).toHaveLength(rolled.length);
  });

  it('rolls are cleared at the end of the round', () => {
    const { s: s0, c } = reveal({ monsterDieAbilities: true });
    const s = finishRound(takeAllDamage(s0, c), c);
    expect(s.behaviourDecks.rat!.xRolls).toBeUndefined();
  });

  it('data: Бандит-громила «Розмах» is Атака 1+X for a normal brute; the Гремлін strikes X', () => {
    const m = loadContent().monsters;
    const swing = m['bandit-brute']!.forkCards!.find((cd) => cd.id === 'bandit-brute.wide-swing')!;
    expect(swing.steps[0]).toMatchObject({ type: 'attack', x: -2, value: 0, targetAll: 'adjacentEnemies' });
    expect(m['bandit-brute']!.normal.attack + (swing.steps[0] as { x: number }).x).toBe(1);
    const bomb = m.gremlin!.forkCards!.find((cd) => cd.id === 'gremlin.stink-bomb')!;
    expect(bomb.otherwise?.[1]).toMatchObject({ type: 'attack', x: -1, value: 1 });
    expect(m.gremlin!.normal.attack + (bomb.otherwise![1] as { x: number }).x).toBe(0);
    for (const b of Object.values(loadContent().decks)) for (const cd of b.cards) expect([...cd.steps, ...(cd.otherwise ?? [])].some((st) => st.x !== undefined), cd.id).toBe(false);
  });
});
