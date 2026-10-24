import { describe, expect, it } from 'vitest';
import { LANGS, loadContent, loadTranslations } from '../../src/rules/load';
import { checkScenario } from './crossref';

const content = loadContent();

describe('loadContent', () => {
  it('returns every kind of content, keyed by id', () => {
    expect(Object.keys(content.heroes)).toHaveLength(6);
    expect(Object.keys(content.monsters).sort()).toEqual([
      'bandit-brute', 'bandit-crossbow', 'bog-slime', 'cellar-rat', 'gloom-cultist',
      'gremlin', 'grey-wolf', 'shadow-wraith', 'stone-sentinel', 'thornling',
    ]);
    expect(Object.keys(content.bosses).sort()).toEqual(['bog-miller', 'shadowhand']);
    expect(Object.keys(content.decks).sort()).toEqual(
      ['archer', 'boss.miller', 'boss.shadowhand', 'caster', 'ghost', 'guard', 'melee'],
    );
    expect(Object.keys(content.scenarios)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(Object.keys(content.items)).toHaveLength(12);
    expect(Object.keys(content.battleGoals)).toHaveLength(8);
    expect(Object.keys(content.perks)).toHaveLength(6);
  });

  it('template decks have 8 cards, as do the boss decks', () => {
    for (const deck of Object.values(content.decks)) expect(deck.cards, deck.id).toHaveLength(8);
  });

  it('is loaded once', () => {
    expect(loadContent()).toBe(content);
  });

  it('loads all three languages', () => {
    expect(Object.keys(loadTranslations()).sort()).toEqual([...LANGS].sort());
  });
});

describe('monsters', () => {
  const m = content.monsters;

  it('match the design table at level 1', () => {
    expect(m['grey-wolf']).toMatchObject({
      deck: 'melee', initiativeOffset: -8,
      normal: { hp: 4, move: 4, attack: 2 },
      elite: { hp: 6, move: 4, attack: 3, onAttack: ['wound'] },
    });
    expect(m['stone-sentinel']).toMatchObject({
      initiativeOffset: 15, normal: { hp: 9, shield: 2 }, elite: { hp: 13, shield: 3 },
    });
    expect(m['shadow-wraith']?.normal.flying).toBe(true);
    expect(m['gremlin']?.elite.onAttack).toEqual(['muddle']);
    expect(m['bog-slime']?.normal.onAttack).toEqual(['poison']);
    expect(m['thornling']).toMatchObject({ normal: { retaliate: 1 }, elite: { retaliate: 2 } });
    expect(m['gloom-cultist']?.traits).toEqual([{ trait: 'maxSummonsPerFigure', value: 1 }]);
    expect(m['bandit-crossbow']).toMatchObject({ normal: { range: 4 }, elite: { range: 5 } });
  });

  it('grey wolf has the Зграя and Виття fork cards from fork.md', () => {
    const cards = m['grey-wolf']?.forkCards ?? [];
    expect(cards.map((c) => [c.id, c.initiative])).toEqual([['grey-wolf.pack', 30], ['grey-wolf.howl', 52]]);
    expect(cards[1]?.if).toBe('selfHpAtMostHalf');
  });

  it('every other type has one or two conditional fork cards', () => {
    for (const mon of Object.values(m)) {
      if (mon.id === 'grey-wolf') continue;
      expect(mon.forkCards?.length, mon.id).toBeGreaterThanOrEqual(1);
      expect(mon.forkCards?.length, mon.id).toBeLessThanOrEqual(2);
      for (const card of mon.forkCards ?? []) {
        expect(card.if, card.id).toBeTruthy();
        expect(card.otherwise, card.id).toBeTruthy();
      }
    }
  });

  it('bosses match the design doc', () => {
    expect(content.bosses['bog-miller']).toMatchObject({ hpPerHero: 8, hpPerHeroPerLevel: 2, move: 2, attack: 3, shield: 1 });
    expect(content.bosses['shadowhand']).toMatchObject({ hpPerHero: 10, hpPerHeroPerLevel: 2, move: 3, attack: 3, range: 3 });
    for (const boss of Object.values(content.bosses)) expect(boss.immune).toEqual(['stun', 'immobilize', 'muddle']);
  });
});

describe('scenario 1', () => {
  const s1 = content.scenarios['s1'];

  it('is a consistent map of 25–40 hexes', () => {
    expect(s1).toBeDefined();
    if (!s1) return;
    expect(checkScenario(s1, content)).toEqual([]);
    const total = s1.rooms.reduce((n, r) => n + r.hexes.length, 0);
    expect(total).toBeGreaterThanOrEqual(25);
    expect(total).toBeLessThanOrEqual(40);
    expect(s1.goal).toEqual({ type: 'killAll' });
    expect(s1.reward.goldEach).toBe(10);
  });

  it('spawns per hero count match the table «звичайні + елітні» exactly', () => {
    const rooms = s1?.rooms ?? [];
    const count = (roomId: string, monster: string, heroes: '2' | '3' | '4') => {
      const spawns = rooms.find((r) => r.id === roomId)?.spawns ?? [];
      const ranks = spawns.filter((sp) => sp.monster === monster).map((sp) => sp.by[heroes]);
      return [ranks.filter((r) => r === 'normal').length, ranks.filter((r) => r === 'elite').length];
    };
    expect(['2', '3', '4'].map((h) => count('s1.pantry', 'cellar-rat', h as '2'))).toEqual([[3, 0], [4, 0], [4, 1]]);
    expect(['2', '3', '4'].map((h) => count('s1.wine-cellar', 'gremlin', h as '2'))).toEqual([[2, 0], [2, 1], [3, 1]]);
    expect(['2', '3', '4'].map((h) => count('s1.wine-cellar', 'cellar-rat', h as '2'))).toEqual([[1, 0], [2, 0], [2, 0]]);
  });

  it('has barrels as obstacles, the lantern shard chest, and a door between the rooms', () => {
    const [a, b] = s1?.rooms ?? [];
    expect(a?.obstacles?.every((o) => o.model === 'barrel')).toBe(true);
    expect(a?.doors?.[0]?.to).toBe(b?.id);
    expect(b?.chests?.[0]?.loot?.questItem).toBe('lantern-shard-1');
    expect(s1?.startHexes).toHaveLength(4);
  });
});
