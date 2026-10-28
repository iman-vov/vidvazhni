import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterCard } from '../../../src/rules/content';
import { loadContent } from '../../../src/rules/load';
import type { GameState } from '../../../src/rules/state';
import { X_DIE_FACES } from '../../../src/rules/variants';
import { act, card, eventsOf, fillerCards, heroOf, makeContent, selectAll, stackModifiers } from '../../helpers/engineFixtures';
import { forkGame } from './fixtures';

const CARDS: HeroCard[] = [
  card('alpha.gamble', 15, [{ type: 'attack', value: 3, x: 1, range: 3 }], [{ type: 'move', value: 4, x: 2 }]),
  card('alpha.gust', 16, [{ type: 'attack', value: 3, x: 1, range: 3, consume: { element: 'air', add: { value: 1 }, xBest: true } }], [{ type: 'move', value: 2 }]),
  card('alpha.bang', 17, [{ type: 'attack', value: 4, x: 2, range: 3, xOnOne: { selfDamage: 1 } }], [{ type: 'move', value: 2 }]),
  ...fillerCards('alpha', 7),
];
const IDLE: MonsterCard[] = [{ id: 'idle.99', initiative: 99, steps: [] }];
const RAT = 'monster:rat:1';

const content = () => makeContent({ heroes: { alpha: CARDS }, decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex: [3, 2], rank: 'elite' }] });

/** The hero plays the top of `cardId` (the X step is now pending). */
function play(on: boolean, cardId: string, seed = 1): { s: GameState; c: ReturnType<typeof content> } {
  const c = content();
  let s = forkGame(c, { dieCards: on }, ['alpha'], seed);
  stackModifiers(s, 'alpha', Array<string>(10).fill('+0'));
  s.elements.air = 'strong';
  s = selectAll(s, c, { alpha: [cardId, 'alpha.c1'] });
  s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId, half: 'top' });
  return { s, c };
}

function pendingStep(s: GameState) {
  if (s.pending?.kind !== 'stepChoice') throw new Error('no step pending');
  return s.pending.step;
}

describe('«Карти з X» (dieCards)', () => {
  it('off: the step keeps its fixed average, nothing is rolled', () => {
    const { s } = play(false, 'alpha.gamble');
    expect(pendingStep(s)).toMatchObject({ type: 'attack', value: 3 });
    expect(pendingStep(s).xRoll).toBeUndefined();
    expect(eventsOf(s.log, 'dieRolled')).toEqual([]);
  });

  it('on: X is rolled as the step comes into play (value = x + X) and undo stops there', () => {
    const { s } = play(true, 'alpha.gamble');
    const step = pendingStep(s);
    expect(step.xRoll).toBeGreaterThanOrEqual(1);
    expect(step.xRoll).toBeLessThanOrEqual(4);
    expect(step).toMatchObject({ value: 1 + step.xRoll! });
    expect(eventsOf(s.log, 'dieRolled')).toEqual([{ type: 'dieRolled', figureId: 'hero:alpha', roll: step.xRoll, value: 1 + step.xRoll! }]);
    expect(s.undoPoint).toBeNull();
  });

  it('the rolled value hits the target (+0 modifier)', () => {
    const { s: s0, c } = play(true, 'alpha.gamble');
    const value = (pendingStep(s0) as { value: number }).value;
    const s = act(s0, c, { type: 'resolveStep', choice: { targets: [RAT] } });
    expect(s.figures[RAT]!.hp).toBe(8 - value);
  });

  it('the X die has faces 1 1 2 2 3 4 and the same seed rolls the same', () => {
    const rolls = Array.from({ length: 300 }, (_, i) => pendingStep(play(true, 'alpha.gamble', i + 1).s).xRoll!);
    expect(new Set(rolls)).toEqual(new Set([1, 2, 3, 4]));
    const share = (n: number) => rolls.filter((r) => r === n).length / rolls.length;
    expect(share(1)).toBeGreaterThan(share(4));
    expect(share(2)).toBeGreaterThan(share(3));
    expect(pendingStep(play(true, 'alpha.gamble', 42).s).xRoll).toBe(pendingStep(play(true, 'alpha.gamble', 42).s).xRoll);
    expect(X_DIE_FACES).toEqual([1, 1, 2, 2, 3, 4]);
  });

  it('a move step with x rolls too (Рух 2+X)', () => {
    const c = content();
    let s = forkGame(c, { dieCards: true }, ['alpha'], 3);
    s = selectAll(s, c, { alpha: ['alpha.gamble', 'alpha.c1'] });
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.gamble', half: 'bottom' });
    const step = pendingStep(s);
    expect(step).toMatchObject({ type: 'move', value: 2 + step.xRoll! });
  });

  it('consuming Вітер rolls X again and keeps the better (instead of +1)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s: s0, c } = play(true, 'alpha.gust', seed);
      const first = pendingStep(s0).xRoll!;
      const s = act(s0, c, { type: 'resolveStep', choice: { targets: [RAT], consume: true } });
      const [, again] = eventsOf(s.log, 'dieRolled');
      expect(again!.previous).toBe(first);
      expect(again!.roll).toBeGreaterThanOrEqual(first);
      expect(s.figures[RAT]!.hp).toBe(8 - (1 + again!.roll));
      expect(s.elements.air).not.toBe('strong');
    }
  });

  it('without dieCards the same consume gives its +1', () => {
    const { s: s0, c } = play(false, 'alpha.gust');
    const s = act(s0, c, { type: 'resolveStep', choice: { targets: [RAT], consume: true } });
    expect(s.figures[RAT]!.hp).toBe(8 - 4);
  });

  it('Саморобний заряд: X = 1 hurts the hero by 1, a higher X does not', () => {
    let hurt = 0;
    let fine = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { s: s0, c } = play(true, 'alpha.bang', seed);
      const roll = pendingStep(s0).xRoll!;
      const hp = heroOf(s0, 'alpha').hp;
      const s = act(s0, c, { type: 'resolveStep', choice: { targets: [RAT] } });
      expect(heroOf(s, 'alpha').hp).toBe(roll === 1 ? hp - 1 : hp);
      if (roll === 1) hurt++;
      else fine++;
    }
    expect(hurt).toBeGreaterThan(0);
    expect(fine).toBeGreaterThan(0);
  });

  it('the X cards (six of levels 2–5, three extra level-1 ones) carry x, with the fixed average in value', () => {
    const heroes = loadContent().heroes;
    const xCards = Object.values(heroes).flatMap((h) => h.cards.filter((cd) => [...cd.top.steps, ...cd.bottom.steps].some((st) => st.x !== undefined)));
    expect(xCards.map((cd) => cd.id).sort()).toEqual(
      [
        'elementalist.unstable-orb', 'elementalist.wild-surge', 'rogue.dodge', 'rogue.fate-strike', 'rogue.risky-strike', 'tinker.homemade-charge',
        'rogue.lucky-throw', 'elementalist.wild-spark', 'tinker.crossbow',
        'rogue.shadow-behind', 'rogue.full-pockets', 'rogue.moonless-night',
        'elementalist.elemental-shield', 'elementalist.star-rain', 'elementalist.elements-heart',
      ].sort(),
    );
    for (const cd of xCards) {
      for (const st of [...cd.top.steps, ...cd.bottom.steps]) {
        if (st.x === undefined || !('value' in st)) continue;
        expect(Math.abs(st.value - (st.x + 2.2))).toBeLessThanOrEqual(0.5);
      }
    }
  });
});
