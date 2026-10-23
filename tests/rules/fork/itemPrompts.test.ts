import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterCard } from '../../../src/rules/content';
import { createGame } from '../../../src/rules/engine';
import { loadContent } from '../../../src/rules/load';
import { attackPrompts, legalActions, usableItems } from '../../../src/rules/queries';
import type { Variants } from '../../../src/rules/variants';
import {
  act,
  card,
  endTurn,
  eventsOf,
  fillerCards,
  finishRound,
  heroOf,
  makeContent,
  playHalf,
  rejects,
  selectAll,
  stackModifiers,
  takeAllDamage,
} from '../../helpers/engineFixtures';
import { forkSetup } from './fixtures';

const CARDS: HeroCard[] = [
  card('alpha.shot', 15, [{ type: 'attack', value: 2, range: 2 }], [{ type: 'move', value: 2 }]),
  ...fillerCards('alpha', 9),
];
const IDLE: MonsterCard[] = [{ id: 'idle.99', initiative: 99, steps: [] }];
const ATTACK_50: MonsterCard[] = [{ id: 'tmelee.50', initiative: 50, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }];
const RAT = 'monster:rat:1';
const ALL_ITEMS = ['dagger', 'healing-potion', 'swift-boots', 'leather-helmet', 'strength-potion', 'light-amulet', 'grappling-rope'];

function game(opts: { items?: string[]; variants?: Partial<Variants>; deck?: MonsterCard[]; ratHex?: [number, number] } = {}) {
  const c = makeContent({
    heroes: { alpha: CARDS },
    decks: [{ id: 'tmelee', cards: opts.deck ?? IDLE }],
    spawns: [{ monster: 'rat', hex: opts.ratHex ?? [1, 2], rank: 'elite' }],
  });
  c.items = loadContent().items;
  const setup = forkSetup(c, opts.variants ?? {}, ['alpha']);
  setup.heroes[0]!.items = opts.items ?? ALL_ITEMS;
  const s = createGame(setup, c);
  stackModifiers(s, 'alpha', Array<string>(10).fill('+0'));
  stackModifiers(s, 'monsters', Array<string>(10).fill('+0'));
  return { c, s };
}

describe('items (base rules support)', () => {
  it('carried items start ready; an unknown item is refused; a passive persistent shield is on from the start', () => {
    const { s } = game({ items: ['dagger', 'heavy-armor'] });
    expect(heroOf(s, 'alpha').items).toEqual([
      { id: 'dagger', state: 'ready' },
      { id: 'heavy-armor', state: 'ready' },
    ]);
    expect(heroOf(s, 'alpha').shields).toEqual([{ value: 1, source: 'item:heavy-armor', until: 'scenario' }]);
    expect(() => game({ items: ['no-such-item'] })).toThrow('unknown item no-such-item');
  });

  it('a potion is used on the own turn and lost; it cannot be used again', () => {
    const { c, s: s0 } = game();
    expect(rejects(s0, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'healing-potion' })).toBe('items are used on your own turn');
    let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'] });
    heroOf(s, 'alpha').hp = 4;
    expect(legalActions(s, c)).toContainEqual({ type: 'useItem', heroId: 'hero:alpha', itemId: 'healing-potion' });
    s = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'healing-potion' });
    expect(heroOf(s, 'alpha').hp).toBe(7);
    expect(heroOf(s, 'alpha').items?.find((i) => i.id === 'healing-potion')?.state).toBe('lost');
    expect(eventsOf(s.log, 'itemUsed')).toEqual([{ type: 'itemUsed', heroId: 'hero:alpha', itemId: 'healing-potion', to: 'lost' }]);
    expect(rejects(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'healing-potion' })).toBe('item is lost');
  });

  it('Кинджал: +1 to a pending melee attack only', () => {
    const { c, s: s0 } = game();
    let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.shot'] });
    expect(rejects(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'dagger' })).toBe('use during a melee attack');
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.shot', half: 'top' });
    rejects(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'dagger' });
    s = act(s, c, { type: 'skipStep' });
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'bottom', basic: true });
    s = act(s, c, { type: 'skipStep' });
    s = endTurn(s, c, 'alpha');
    s = finishRound(s, c);
    s = selectAll(s, c, { alpha: ['alpha.c3', 'alpha.c4'] });
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c3', half: 'top' });
    s = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'dagger' });
    expect(s.pending).toMatchObject({ kind: 'stepChoice', step: { type: 'attack', value: 3 } });
    s = act(s, c, { type: 'resolveStep', choice: { targets: [RAT] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 3 });
    expect(heroOf(s, 'alpha').items?.find((i) => i.id === 'dagger')?.state).toBe('spent');
  });

  it('Чоботи: +2 to a pending move; Мотузка: the move becomes a jump', () => {
    const { c, s: s0 } = game({ ratHex: [5, 0] });
    let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'] });
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'bottom' });
    s = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'swift-boots' });
    s = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'grappling-rope' });
    expect(s.pending).toMatchObject({ step: { type: 'move', value: 4, jump: true } });
    s = act(s, c, { type: 'resolveStep', choice: { path: [[1, 2], [2, 2], [3, 2], [4, 2]] } });
    expect(eventsOf(s.log, 'moved')[0]).toMatchObject({ jump: true });
    expect(heroOf(s, 'alpha').hex).toEqual([4, 2]);
  });

  it('a long rest refreshes spent items, not lost ones', () => {
    const { c, s: s0 } = game();
    let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'] });
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'top' });
    s = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'dagger' });
    s = act(s, c, { type: 'resolveStep', choice: { targets: [RAT] } });
    s = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'healing-potion' });
    s = finishRound(endTurn(s, c, 'alpha'), c);
    s = selectAll(s, c, { alpha: 'rest' });
    s = act(s, c, { type: 'longRestLoss', heroId: 'hero:alpha', cardId: 'alpha.c1' });
    expect(heroOf(s, 'alpha').items?.filter((i) => i.state !== 'ready')).toEqual([{ id: 'healing-potion', state: 'lost' }]);
    expect(eventsOf(s.log, 'itemsRefreshed')).toEqual([{ type: 'itemsRefreshed', heroId: 'hero:alpha', itemIds: ['dagger'] }]);
  });

  it('passive items: Тисовий лук +1 range; Важкі обладунки −1 move', () => {
    const bow = game({ items: ['yew-bow'], ratHex: [3, 2] });
    let s = selectAll(bow.s, bow.c, { alpha: ['alpha.shot', 'alpha.c2'] });
    rejects(s, bow.c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'yew-bow' });
    s = playHalf(s, bow.c, 'alpha', 'alpha.shot', 'top', [{ targets: [RAT] }]);
    expect(eventsOf(s.log, 'attacked')).toHaveLength(1);
    const plain = game({ items: [], ratHex: [3, 2] });
    const t = act(selectAll(plain.s, plain.c, { alpha: ['alpha.shot', 'alpha.c2'] }), plain.c, {
      type: 'startHalf',
      heroId: 'hero:alpha',
      cardId: 'alpha.shot',
      half: 'top',
    });
    rejects(t, plain.c, { type: 'resolveStep', choice: { targets: [RAT] } });

    const armor = game({ items: ['heavy-armor'], ratHex: [5, 0] });
    const u = act(selectAll(armor.s, armor.c, { alpha: ['alpha.c1', 'alpha.c2'] }), armor.c, {
      type: 'startHalf',
      heroId: 'hero:alpha',
      cardId: 'alpha.c1',
      half: 'bottom',
    });
    rejects(u, armor.c, { type: 'resolveStep', choice: { path: [[1, 2], [2, 2]] } });
    act(u, armor.c, { type: 'resolveStep', choice: { path: [[1, 2]] } });
  });

  it('Шкіряний шолом: the next attack against the hero this round has disadvantage', () => {
    const { c, s: s0 } = game({ deck: ATTACK_50 });
    let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'] });
    s = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'leather-helmet' });
    expect(heroOf(s, 'alpha').attackedDisadvantage).toBe(true);
    s = takeAllDamage(endTurn(s, c, 'alpha'), c);
    expect(eventsOf(s.log, 'attacked')[0]?.modifiers).toHaveLength(2);
    expect(heroOf(s, 'alpha').attackedDisadvantage).toBeUndefined();
  });

  it('Амулет світла: Light in the base rules, an Earth orb with the orbs fork', () => {
    const base = game({ items: ['light-amulet'] });
    const b = act(selectAll(base.s, base.c, { alpha: ['alpha.c1', 'alpha.c2'] }), base.c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'light-amulet' });
    expect(b.pendingInfusions).toEqual(['light']);
    const fork = game({ items: ['light-amulet'], variants: { orbs: true } });
    const f = act(selectAll(fork.s, fork.c, { alpha: ['alpha.c1', 'alpha.c2'] }), fork.c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'light-amulet' });
    expect(f.orbs).toEqual({ earth: { ownerId: 'hero:alpha', age: 0 } });
  });
});

describe('fork «Предмети-кнопки» (itemPrompts)', () => {
  it('usableItems: the buttons that light up now; empty with the variant off', () => {
    const off = game();
    const s0 = selectAll(off.s, off.c, { alpha: ['alpha.c1', 'alpha.c2'] });
    expect(usableItems(s0, off.c, 'hero:alpha')).toEqual([]);

    const { c, s: s1 } = game({ variants: { itemPrompts: true } });
    expect(usableItems(s1, c, 'hero:alpha')).toEqual([]);
    let s = selectAll(s1, c, { alpha: ['alpha.c1', 'alpha.c2'] });
    expect(usableItems(s, c, 'hero:alpha').map((i) => i.itemId)).toEqual(['healing-potion', 'leather-helmet', 'strength-potion', 'light-amulet']);
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'top' });
    expect(usableItems(s, c, 'hero:alpha', 'attack').map((i) => i.itemId)).toEqual(['dagger', 'strength-potion']);
    expect(usableItems(s, c, 'hero:alpha', 'move')).toEqual([]);
    expect(usableItems(s, c, 'hero:alpha', 'attack')[0]).toMatchObject({ nameKey: 'item.dagger', slot: 'hand', use: 'spent' });
  });

  it('attackPrompts: «Кинджал: +1 Атака?» with the attack value without and with the item', () => {
    const { c, s: s0 } = game({ variants: { itemPrompts: true } });
    let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'] });
    expect(attackPrompts(s, c, 'hero:alpha', RAT)).toEqual([]);
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'top' });
    const prompts = attackPrompts(s, c, 'hero:alpha', RAT);
    expect(prompts.map((p) => [p.itemId, p.value, p.boosted, p.advantage])).toEqual([
      ['dagger', 2, 3, false],
      ['strength-potion', 2, 2, true],
    ]);
  });
});
