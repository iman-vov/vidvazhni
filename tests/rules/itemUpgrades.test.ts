import { describe, expect, it } from 'vitest';
import type { MonsterCard } from '../../src/rules/content';
import { createGame } from '../../src/rules/engine';
import { itemDef, itemNameKey } from '../../src/rules/items';
import { loadContent } from '../../src/rules/load';
import { act, fillerCards, heroOf, makeContent, selectAll, setupFor, stackModifiers } from '../helpers/engineFixtures';

const content = loadContent();
const H = 'hero:alpha';
const ATTACK: MonsterCard[] = [{ id: 'tmelee.30', initiative: 30, steps: [{ type: 'attack', value: 0 }] }];

function game(items: string[]) {
  const c = makeContent({
    heroes: { alpha: fillerCards('alpha') },
    decks: [{ id: 'tmelee', cards: ATTACK }],
    spawns: [{ monster: 'rat', hex: [1, 2], rank: 'elite' }],
  });
  c.items = content.items;
  const setup = setupFor(c, ['alpha']);
  setup.heroes[0]!.items = items;
  const s = createGame(setup, c);
  stackModifiers(s, 'alpha', Array<string>(10).fill('+0'));
  stackModifiers(s, 'monsters', Array<string>(10).fill('+0'));
  return { c, s: selectAll(s, c, { alpha: ['alpha.c1', 'alpha.c2'] }) };
}

describe('item upgrades (★)', () => {
  it('every item has a ★ version that costs as much as the item', () => {
    for (const item of Object.values(content.items)) expect(item.upgrade?.price, item.id).toBe(item.price);
  });

  it('`<id>+` resolves to the base item with the upgraded effect', () => {
    const dagger = itemDef({ c: content }, 'dagger+');
    expect(dagger).toMatchObject({ id: 'dagger+', slot: 'hand', use: 'spent', price: 15 });
    expect(dagger?.effect).toEqual([{ type: 'special', name: 'meleeAttackBonus', params: { value: 2 } }]);
    expect(dagger).not.toHaveProperty('upgrade');
    expect(itemDef({ c: content }, 'healing-potion+')?.effect).toEqual([{ type: 'heal', value: 4, target: 'self' }]);
  });

  it('the ★ fork effect replaces the base fork effect, or falls back to the ★ effect', () => {
    expect(itemDef({ c: content }, 'light-amulet+')?.forkEffect?.[0]).toEqual({ type: 'infuse', element: 'earth' });
    const armor = itemDef({ c: content }, 'heavy-armor+');
    expect(armor?.forkEffect).toBeUndefined();
    expect(armor?.effect).toEqual([{ type: 'shield', value: 1, target: 'self', duration: 'persistent' }]);
  });

  it('unknown ids and items without an upgrade resolve to nothing', () => {
    expect(itemDef({ c: content }, 'nothing+')).toBeUndefined();
    const plain = { id: 'x', slot: 'small', price: 5, unlockedAfter: 0, use: 'lost', effect: [] } as const;
    expect(itemDef({ c: { ...content, items: { x: { ...plain, effect: [] } } } }, 'x+')).toBeUndefined();
  });

  it('names: `item.<id>` and `item.<id>.plus`', () => {
    expect(itemNameKey('dagger')).toBe('item.dagger');
    expect(itemNameKey('dagger+')).toBe('item.dagger.plus');
  });

  it('the engine plays a ★ item unchanged: Кольчуга ★ gives Щит 2 in the damage window', () => {
    const { c, s: s0 } = game(['chainmail+']);
    let s = act(s0, c, { type: 'endTurn', heroId: H });
    expect(s.pending).toMatchObject({ kind: 'avoidDamage', heroId: H, amount: 3 });
    s = act(s, c, { type: 'useItem', heroId: H, itemId: 'chainmail+' });
    expect(s.pending).toMatchObject({ kind: 'avoidDamage', amount: 1 });
    expect(heroOf(s, 'alpha').items).toEqual([{ id: 'chainmail+', state: 'spent' }]);
  });
});
