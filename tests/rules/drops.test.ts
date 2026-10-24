// Enemy drops and chest loot (docs/design/camp.md, «Звідки здобич»): coins on the enemy's hex, shop
// items straight to `foundItems`, rolled with the game's seeded RNG.
import { describe, expect, it } from 'vitest';
import { eventsOf } from '../helpers/engineFixtures';
import type { Content, DropDef } from '../../src/rules/content';
import { killFigure } from '../../src/rules/damage';
import type { Ctx } from '../../src/rules/effects/context';
import { lootHex } from '../../src/rules/effects/support';
import type { GameState, MonsterState } from '../../src/rules/state';
import { content, game, hero, monstersOf, tile } from './scenarios/helpers';

/** Content where every monster type (both ranks) drops `drop`. */
function withDrops(drop: DropDef): Content {
  const monsters = Object.fromEntries(Object.entries(content.monsters).map(([id, m]) => [id, { ...m, drops: { normal: drop, elite: drop } }]));
  return { ...content, monsters };
}

function kill(s: GameState, c: Content, m: MonsterState): Ctx {
  const ctx: Ctx = { s, c, ev: [], out: [] };
  killFigure(ctx, m);
  return ctx;
}

const firstMonster = (s: GameState) => monstersOf(s)[0] as MonsterState;

describe('enemy drops', () => {
  it('sure coins land on the hex of the killed enemy', () => {
    const s = game('s1');
    const m = firstMonster(s);
    const seed = s.lootRng!.seed;
    const ctx = kill(s, withDrops({ coins: 2 }), m);
    expect(tile(s, m.hex).coins).toBe(2);
    expect(eventsOf(ctx.ev, 'coinsDropped')).toEqual([{ type: 'coinsDropped', byId: m.id, hex: m.hex, coins: 2 }]);
    expect(s.lootRng!.seed).toBe(seed); // no chance → no roll
  });

  it('a coin chance rolls the seeded loot stream, apart from the fight RNG; the same seed gives the same result', () => {
    const never = game('s1');
    kill(never, withDrops({ coins: 1, coinChance: 0 }), firstMonster(never));
    expect(tile(never, firstMonster(game('s1')).hex).coins).toBeUndefined();

    const results = [1, 2].map(() => {
      const s = game('s1', {}, undefined, 1, 7);
      const m = firstMonster(s);
      const fight = s.rng.seed;
      kill(s, withDrops({ coins: 1, coinChance: 0.5 }), m);
      expect(s.rng.seed).toBe(fight);
      return [tile(s, m.hex).coins ?? 0, s.lootRng!.seed];
    });
    expect(results[0]).toEqual(results[1]);
  });

  it('an item from the table goes straight to foundItems with «Знайдено»', () => {
    const s = game('s1');
    const m = firstMonster(s);
    const ctx = kill(s, withDrops({ items: ['dagger', 'buckler'] }), m);
    expect(s.foundItems).toHaveLength(1);
    const [item] = s.foundItems!;
    expect(['dagger', 'buckler']).toContain(item);
    expect(eventsOf(ctx.ev, 'itemFound')).toEqual([{ type: 'itemFound', item, byId: m.id }]);
    expect(tile(s, m.hex).coins).toBeUndefined();
  });

  it('summoned enemies drop nothing', () => {
    const s = game('s1');
    const m = firstMonster(s);
    m.summonerId = 'monster:x:1';
    kill(s, withDrops({ coins: 1, items: ['dagger'] }), m);
    expect(tile(s, m.hex).coins).toBeUndefined();
    expect(s.foundItems).toBeUndefined();
  });

  it("a named enemy's own drops replace its type's", () => {
    const s = game('s1');
    const m = firstMonster(s);
    m.drops = { items: ['chainmail'] };
    kill(s, withDrops({ coins: 3 }), m);
    expect(s.foundItems).toEqual(['chainmail']);
    expect(tile(s, m.hex).coins).toBeUndefined();
  });

  it('a boss always gives an item from its table', () => {
    const s = game('s3');
    const ctx: Ctx = { s, c: content, ev: [], out: [] };
    const boss = { ...firstMonster(s), id: 'monster:bog-miller:1', typeId: 'bog-miller', rank: 'boss' as const };
    s.figures[boss.id] = boss;
    killFigure(ctx, boss);
    expect(content.bosses['bog-miller']!.drops!.items).toContain(s.foundItems?.[0]);
    expect(tile(s, boss.hex).coins).toBeGreaterThanOrEqual(2);
  });
});

describe('chest loot', () => {
  it('a chest gives its coins to the hero who opens it and its item to foundItems', () => {
    const s = game('s1');
    const scenario = structuredClone(content.scenarios.s1!);
    const chest = scenario.rooms.flatMap((r) => r.chests ?? [])[0]!;
    chest.loot = { coins: 3, item: 'dagger' };
    const c: Content = { ...content, scenarios: { ...content.scenarios, s1: scenario } };
    const h = hero(s, 'warden');
    tile(s, h.hex).chest = chest.id;
    const ctx: Ctx = { s, c, ev: [], out: [] };
    lootHex(ctx, h, h.hex);
    expect(h.coins).toBe(3);
    expect(h.chests).toEqual([chest.id]);
    expect(s.foundItems).toEqual(['dagger']);
    expect(eventsOf(ctx.ev, 'looted')).toEqual([{ type: 'looted', heroId: h.id, coins: 3, chest: chest.id }]);
    expect(eventsOf(ctx.ev, 'itemFound')).toEqual([{ type: 'itemFound', item: 'dagger', chest: chest.id }]);
  });
});
