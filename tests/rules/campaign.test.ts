import { describe, expect, it } from 'vitest';
import {
  buy,
  type CampaignResult,
  type CampaignState,
  equip,
  equippedIds,
  furthestScenario,
  giftGold,
  newCampaign,
  sell,
  sellFromChest,
  sellPrice,
  setScenarioFeedback,
  shopStock,
  takeFromChest,
  unequip,
  upgrade,
} from '../../src/rules/campaign';
import { loadContent } from '../../src/rules/load';

const c = loadContent();

function fresh(gold = 200): CampaignState {
  const s = newCampaign(c, {
    players: ['p1', 'p2'],
    heroes: [
      { classId: 'warden', playerId: 'p1' },
      { classId: 'wind-archer', playerId: 'p2' },
    ],
  });
  for (const h of s.heroes) h.gold = gold;
  return s;
}

function ok(r: CampaignResult): CampaignState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function err(r: CampaignResult): string {
  return r.ok ? '' : r.error;
}

const hero = (s: CampaignState, id = 'warden') => s.heroes.find((h) => h.classId === id)!;

/** Owns `ids` (bought with plenty of gold, after scenario 3 so everything is on sale). */
function owning(ids: string[]): CampaignState {
  let s = fresh(500);
  s.completed = ['s1', 's2', 's3'];
  for (const id of ids) s = ok(buy(c, s, 'warden', id));
  return s;
}

describe('newCampaign', () => {
  it('starts every hero at level 1 with the start gold and no items; s1 is open', () => {
    const s = newCampaign(c, { players: ['p1'], heroes: [{ classId: 'warden', playerId: 'p1' }] });
    expect(s).toEqual({
      version: 1,
      players: ['p1'],
      heroes: [{ classId: 'warden', playerId: 'p1', level: 1, xp: 0, gold: 15, perks: [], owned: [], equipped: [] }],
      partyChest: [],
      completed: [],
      unlocked: ['s1'],
      difficulty: 'normal',
    });
  });
});

describe('shopStock', () => {
  it('sells the start items first, the scenario-3 items once s3 is won', () => {
    const s = fresh();
    expect(furthestScenario(c, s)).toBe(0);
    const start = shopStock(c, s).map((i) => i.id);
    expect(start).toContain('dagger');
    expect(start).not.toContain('yew-bow');
    s.completed = ['s1', 's2', 's3'];
    expect(furthestScenario(c, s)).toBe(3);
    expect(shopStock(c, s)).toHaveLength(18);
  });
});

describe('buy', () => {
  it('pays the price and adds the item to the hero chest; the input is not changed', () => {
    const s = fresh(20);
    const t = ok(buy(c, s, 'warden', 'dagger'));
    expect(hero(t).gold).toBe(5);
    expect(hero(t).owned).toEqual([{ id: 'dagger', plus: false }]);
    expect(hero(s).owned).toEqual([]);
  });

  it('refuses a second copy, a locked item, too little gold, unknown ids', () => {
    const s = ok(buy(c, fresh(), 'warden', 'dagger'));
    expect(err(buy(c, s, 'warden', 'dagger'))).toBe('already owned');
    expect(ok(buy(c, s, 'wind-archer', 'dagger'))).toBeTruthy();
    expect(err(buy(c, s, 'warden', 'yew-bow'))).toBe('not in the shop yet');
    expect(err(buy(c, fresh(5), 'warden', 'dagger'))).toBe('not enough gold');
    expect(err(buy(c, s, 'warden', 'nothing'))).toBe('unknown item nothing');
    expect(err(buy(c, s, 'rogue', 'buckler'))).toBe('no hero rogue');
  });
});

describe('sell', () => {
  it('gives half the price back, rounded down, and unequips the item', () => {
    let s = owning(['dagger']);
    s = ok(equip(c, s, 'warden', 'dagger'));
    const before = hero(s).gold;
    s = ok(sell(c, s, 'warden', 'dagger'));
    expect(hero(s).gold).toBe(before + 7);
    expect(hero(s).owned).toEqual([]);
    expect(hero(s).equipped).toEqual([]);
  });

  it('a ★ item sells for half of price + upgrade', () => {
    let s = ok(upgrade(c, owning(['chainmail']), 'warden', 'chainmail'));
    const before = hero(s).gold;
    s = ok(sell(c, s, 'warden', 'chainmail'));
    expect(hero(s).gold).toBe(before + 25);
    expect(sellPrice(c, c.items.chainmail!, true)).toBe(25);
  });

  it('refuses an item the hero does not own', () => {
    expect(err(sell(c, fresh(), 'warden', 'dagger'))).toBe('not owned');
  });
});

describe('upgrade', () => {
  it('pays the ★ price once', () => {
    let s = owning(['dagger']);
    const before = hero(s).gold;
    s = ok(upgrade(c, s, 'warden', 'dagger'));
    expect(hero(s).gold).toBe(before - 15);
    expect(hero(s).owned).toEqual([{ id: 'dagger', plus: true }]);
    expect(err(upgrade(c, s, 'warden', 'dagger'))).toBe('already upgraded');
  });

  it('refuses without the item or the gold', () => {
    expect(err(upgrade(c, fresh(), 'warden', 'dagger'))).toBe('not owned');
    const s = owning(['heavy-armor']);
    hero(s).gold = 10;
    expect(err(upgrade(c, s, 'warden', 'heavy-armor'))).toBe('not enough gold');
  });
});

describe('equip / unequip', () => {
  it('fills the slots; the setup gets `<id>+` for ★ items', () => {
    let s = owning(['leather-helmet', 'chainmail', 'swift-boots', 'dagger', 'buckler', 'healing-potion', 'strength-potion']);
    for (const id of ['leather-helmet', 'chainmail', 'swift-boots', 'dagger', 'buckler', 'healing-potion', 'strength-potion'])
      s = ok(equip(c, s, 'warden', id));
    expect(hero(s).equipped).toHaveLength(7);
    s = ok(upgrade(c, s, 'warden', 'dagger'));
    expect(equippedIds(hero(s))).toContain('dagger+');
    expect(equippedIds(hero(s))).toContain('buckler');
  });

  it('a full one-item slot swaps: the old item goes back to the chest', () => {
    let s = owning(['chainmail', 'shadow-cloak']);
    s = ok(equip(c, s, 'warden', 'chainmail'));
    s = ok(equip(c, s, 'warden', 'shadow-cloak'));
    expect(hero(s).equipped).toEqual(['shadow-cloak']);
  });

  it('a two-handed item frees both hands; a one-handed item then replaces it', () => {
    let s = owning(['dagger', 'buckler', 'yew-bow']);
    s = ok(equip(c, s, 'warden', 'dagger'));
    s = ok(equip(c, s, 'warden', 'buckler'));
    s = ok(equip(c, s, 'warden', 'yew-bow'));
    expect(hero(s).equipped).toEqual(['yew-bow']);
    s = ok(equip(c, s, 'warden', 'dagger'));
    expect(hero(s).equipped).toEqual(['dagger']);
  });

  it('at most 2 small items: the third pushes out the earliest', () => {
    let s = owning(['healing-potion', 'strength-potion', 'grappling-rope']);
    for (const id of ['healing-potion', 'strength-potion', 'grappling-rope']) s = ok(equip(c, s, 'warden', id));
    expect(hero(s).equipped).toEqual(['strength-potion', 'grappling-rope']);
  });

  it('other slots are left alone', () => {
    let s = owning(['chainmail', 'dagger', 'buckler', 'yew-bow']);
    for (const id of ['chainmail', 'dagger', 'buckler', 'yew-bow']) s = ok(equip(c, s, 'warden', id));
    expect(hero(s).equipped).toEqual(['chainmail', 'yew-bow']);
  });

  it('refuses unowned or already equipped items; unequip returns an item', () => {
    let s = owning(['dagger']);
    expect(err(equip(c, s, 'warden', 'buckler'))).toBe('not owned');
    s = ok(equip(c, s, 'warden', 'dagger'));
    expect(err(equip(c, s, 'warden', 'dagger'))).toBe('already equipped');
    s = ok(unequip(s, 'warden', 'dagger'));
    expect(hero(s).equipped).toEqual([]);
    expect(err(unequip(s, 'warden', 'dagger'))).toBe('not equipped');
  });
});

describe('party chest', () => {
  it('a hero takes a found item for free, one copy at a time', () => {
    const s = fresh(0);
    s.partyChest = ['healing-potion', 'healing-potion'];
    const t = ok(takeFromChest(s, 'warden', 'healing-potion'));
    expect(t.partyChest).toEqual(['healing-potion']);
    expect(hero(t).owned).toEqual([{ id: 'healing-potion', plus: false }]);
    expect(hero(t).gold).toBe(0);
    expect(err(takeFromChest(t, 'warden', 'healing-potion'))).toBe('already owned');
    expect(err(takeFromChest(t, 'warden', 'dagger'))).toBe('not in the party chest');
  });

  it('an item every hero already owns can be sold from the chest', () => {
    let s = fresh(0);
    s.partyChest = ['healing-potion', 'healing-potion', 'healing-potion'];
    s = ok(takeFromChest(s, 'warden', 'healing-potion'));
    expect(err(sellFromChest(c, s, 'warden', 'healing-potion'))).toBe('a hero can still take it');
    s = ok(takeFromChest(s, 'wind-archer', 'healing-potion'));
    s = ok(sellFromChest(c, s, 'wind-archer', 'healing-potion'));
    expect(hero(s, 'wind-archer').gold).toBe(5);
    expect(s.partyChest).toEqual([]);
  });
});

describe('giftGold', () => {
  it('moves the gift step (5) from one hero to another', () => {
    const s = ok(giftGold(c, fresh(12), 'warden', 'wind-archer'));
    expect(hero(s).gold).toBe(7);
    expect(hero(s, 'wind-archer').gold).toBe(17);
  });

  it('refuses too little gold, self-gifts, unknown heroes and bad amounts', () => {
    expect(err(giftGold(c, fresh(3), 'warden', 'wind-archer'))).toBe('not enough gold');
    expect(err(giftGold(c, fresh(), 'warden', 'warden'))).toBe('cannot gift to yourself');
    expect(err(giftGold(c, fresh(), 'warden', 'rogue'))).toBe('no hero rogue');
    expect(err(giftGold(c, fresh(), 'warden', 'wind-archer', 0))).toBe('bad amount');
  });
});

describe('scenario feedback', () => {
  it('keeps the latest «Як було?» per scenario without touching the input', () => {
    const s = fresh();
    const a = setScenarioFeedback(s, 's1', 'hard');
    const b = setScenarioFeedback(setScenarioFeedback(a, 's2', 'easy'), 's1', 'right');
    expect(s.feedback).toBeUndefined();
    expect(a.feedback).toEqual({ s1: 'hard' });
    expect(b.feedback).toEqual({ s1: 'right', s2: 'easy' });
  });
});
