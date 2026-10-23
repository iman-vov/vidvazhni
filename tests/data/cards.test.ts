import { describe, expect, it } from 'vitest';
import type { CardHalf, ElementId, HeroCard, HeroClass, Step } from '../../src/rules/content';
import { loadContent } from '../../src/rules/load';
import { allSteps, walkSteps } from './crossref';

const content = loadContent();
const heroes = Object.values(content.heroes);

const effectiveHalves = (card: HeroCard): CardHalf[] => [card.fork?.top ?? card.top, card.fork?.bottom ?? card.bottom];
const stepsOf = (halves: CardHalf[]): Step[] => {
  const out: Step[] = [];
  for (const half of halves) walkSteps(half.steps, (s) => out.push(s));
  return out;
};
const elementsUsed = (steps: Step[]): ElementId[] =>
  steps.flatMap((s) => [
    ...(s.type === 'infuse' && s.element !== 'any' ? [s.element] : []),
    ...(s.consume && s.consume.element !== 'any' ? [s.consume.element] : []),
  ]);

describe('hero classes', () => {
  it('has the six classes', () => {
    expect(Object.keys(content.heroes).sort()).toEqual(
      ['elementalist', 'herbalist', 'rogue', 'tinker', 'warden', 'wind-archer'],
    );
  });

  it.each(heroes.map((h) => [h.id, h] as const))('%s: ten level-1 cards, hand size within bounds', (_id, hero) => {
    expect(hero.cards).toHaveLength(10);
    for (const card of hero.cards) {
      expect(card.level).toBe(1);
      expect(card.initiative).toBeGreaterThanOrEqual(1);
      expect(card.initiative).toBeLessThanOrEqual(99);
    }
    expect(hero.handSize).toBeLessThanOrEqual(hero.cards.length);
  });

  it('health per level follows the «+1,5» rule (Вартовий +2, Стихійник +1)', () => {
    const hp = (id: string) => content.heroes[id]?.hpByLevel;
    expect(hp('warden')).toEqual([10, 12, 14, 16, 18]);
    expect(hp('elementalist')).toEqual([6, 7, 8, 9, 10]);
    for (const id of ['wind-archer', 'herbalist', 'rogue', 'tinker']) expect(hp(id)).toEqual([8, 9, 11, 12, 14]);
  });

  it('hand sizes, classes and the Ґудзик summon match the design doc', () => {
    const hand = Object.fromEntries(heroes.map((h) => [h.id, h.handSize]));
    expect(hand).toEqual({ warden: 10, 'wind-archer': 9, herbalist: 10, rogue: 9, elementalist: 8, tinker: 10 });
    expect(content.heroes['tinker']?.summon).toEqual({ id: 'tinker.button', hp: 5, move: 3, attack: 2 });
    const gather = content.heroes['tinker']?.cards.find((c) => c.id === 'tinker.gather-button');
    expect(gather?.top.steps[0]).toMatchObject({ type: 'summon', summon: 'tinker.button' });
  });

  it('starting cards use the doc initiatives', () => {
    const ini = (id: string) => content.heroes[id.split('.')[0] as string]?.cards.find((c) => c.id === id)?.initiative;
    expect(ini('warden.shield-bash')).toBe(15);
    expect(ini('warden.earth-strike')).toBe(55);
    expect(ini('wind-archer.gale')).toBe(70);
    expect(ini('herbalist.forest-gift')).toBe(65);
    expect(ini('rogue.deadly-strike')).toBe(75);
    expect(ini('elementalist.storm')).toBe(80);
    expect(ini('tinker.clever-device')).toBe(65);
    expect(ini('rogue.shadow')).toBe(8);
  });
});

describe('fork data on hero cards', () => {
  it.each(heroes.map((h) => [h.id, h] as const))('%s: about half of the cards carry the momentum mark', (_id, hero) => {
    const marked = hero.cards.filter((c) => c.fork?.momentum).length;
    expect(marked).toBeGreaterThanOrEqual(4);
    expect(marked).toBeLessThanOrEqual(6);
  });

  it('fork versions never infuse or consume Ice, Light or Dark', () => {
    for (const hero of heroes)
      for (const card of hero.cards) {
        const bad = elementsUsed(stepsOf(effectiveHalves(card))).filter((e) => e === 'ice' || e === 'light' || e === 'dark');
        expect(bad, card.id).toEqual([]);
      }
  });

  it('every card that uses Ice, Light or Dark in the base rules has a fork version', () => {
    for (const hero of heroes)
      for (const card of hero.cards) {
        const base = elementsUsed(stepsOf([card.top, card.bottom])).some((e) => e === 'ice' || e === 'light' || e === 'dark');
        if (base) expect(card.fork?.top || card.fork?.bottom, card.id).toBeTruthy();
      }
  });

  it('classes other than the Стихійник have 2–3 cards consuming another class orb', () => {
    for (const hero of heroes) {
      if (hero.classOrb === 'any') continue;
      const foreign = hero.cards.filter((card) =>
        stepsOf(effectiveHalves(card)).some(
          (s) => s.consume && s.consume.element !== 'any' && s.consume.element !== hero.classOrb,
        ),
      );
      expect(foreign.length, hero.id).toBeGreaterThanOrEqual(2);
      expect(foreign.length, hero.id).toBeLessThanOrEqual(3);
    }
  });

  it('the ten fork cards from fork.md are marked and written as given', () => {
    const card = (id: string) => content.heroes[id.split('.')[0] as string]?.cards.find((c) => c.id === id) as HeroCard;
    for (const id of [
      'warden.shield-bash', 'warden.earth-strike', 'warden.stay-behind', 'warden.challenge', 'warden.ram',
      'elementalist.fire-arrow', 'elementalist.ice-breath', 'elementalist.elemental-sphere', 'elementalist.fireball', 'elementalist.gusts',
    ])
      expect(card(id).fork?.momentum, id).toBe(true);
    // Таран: Рух 2 по прямій, потім Атака 3; поглинути Вогонь: +2 Атака
    expect(card('warden.ram').fork?.top?.steps).toEqual([
      { type: 'move', value: 2, straightLine: true },
      { type: 'attack', value: 3, consume: { element: 'fire', add: { value: 2 } } },
    ]);
    // Удар щитом: Штовхання 1; поглинути Вітер: Штовхання 3
    expect(card('warden.shield-bash').fork?.top?.steps[0]).toMatchObject({
      push: 1,
      consume: { element: 'air', add: { push: 2 } },
    });
    // Кам'яний град: Атака 2 по лінії з 3 гексів; наситити Землю
    expect(card('elementalist.ice-breath').fork?.top?.steps).toEqual([
      { type: 'attack', value: 2, area: { shape: 'line', length: 3, fromSelf: true } },
      { type: 'infuse', element: 'earth' },
    ]);
    // Вихор: Штовхання 2 усім сусіднім; наситити Вітер | Рух 3; Стрибок
    expect(card('elementalist.gusts').fork?.bottom?.steps).toEqual([{ type: 'move', value: 3, jump: true }]);
  });

  it('every class has a surge', () => {
    for (const hero of heroes) expect(hero.surge.length, hero.id).toBeGreaterThan(0);
  });

  it('Air stays air: no fork version converts it', () => {
    expect(allSteps(content).filter((s) => s.type === 'infuse' && (s.element as string) === 'wind')).toEqual([]);
  });
});
