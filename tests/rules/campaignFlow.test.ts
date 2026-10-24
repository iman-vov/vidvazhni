// Campaign flow: scenario result → camp, level-up, camp → scenario setup (docs/design/camp.md).
import { describe, expect, it } from 'vitest';
import {
  applyScenarioResult,
  availablePerks,
  buy,
  type CampaignResult,
  type CampaignState,
  canLevelUp,
  cardPool,
  equip,
  levelUp,
  levelUpCards,
  newCampaign,
  pickHand,
  setupFromCampaign,
  upgrade,
} from '../../src/rules/campaign';
import { apply, createGame } from '../../src/rules/engine';
import { loadContent } from '../../src/rules/load';
import { BASE_MODIFIER_CARDS } from '../../src/rules/modifiers';
import type { HeroState } from '../../src/rules/state';
import { BASE_RULES } from '../../src/rules/variants';

const c = loadContent();

function fresh(): CampaignState {
  return newCampaign(c, {
    players: ['p1', 'p2'],
    heroes: [
      { classId: 'warden', playerId: 'p1' },
      { classId: 'wind-archer', playerId: 'p2' },
    ],
  });
}

function ok(r: CampaignResult): CampaignState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function err(r: CampaignResult): string {
  if (r.ok) throw new Error('expected an error');
  return r.error;
}

const hero = (s: CampaignState, classId = 'warden') => s.heroes.find((h) => h.classId === classId)!;

describe('applyScenarioResult', () => {
  const heroes = [
    { classId: 'warden', xp: 9, gold: 16 },
    { classId: 'wind-archer', xp: 7, gold: 12 },
  ];

  it('a win adds XP and gold, reward and found items, completes and unlocks', () => {
    const s = ok(applyScenarioResult(c, fresh(), { id: 'g1', scenarioId: 's2', won: true, heroes, foundItems: ['dagger'] }));
    expect(hero(s).xp).toBe(9);
    expect(hero(s).gold).toBe(15 + 16);
    expect(hero(s, 'wind-archer').gold).toBe(15 + 12);
    expect(s.partyChest).toEqual(['dagger', 'healing-potion']);
    expect(s.completed).toEqual(['s2']);
    expect(s.unlocked).toEqual(['s1', 's3']);
  });

  it('a loss keeps XP, gold and found items but completes nothing', () => {
    const s = ok(applyScenarioResult(c, fresh(), { id: 'g1', scenarioId: 's1', won: false, heroes, foundItems: ['dagger'] }));
    expect(hero(s).xp).toBe(9);
    expect(s.partyChest).toEqual(['dagger']);
    expect(s.completed).toEqual([]);
    expect(s.unlocked).toEqual(['s1']);
  });

  it('the same game is counted only once', () => {
    const s = ok(applyScenarioResult(c, fresh(), { id: 'g1', scenarioId: 's1', won: true, heroes }));
    expect(s.unlocked).toEqual(['s2']);
    expect(err(applyScenarioResult(c, s, { id: 'g1', scenarioId: 's1', won: true, heroes }))).toBe('result already applied');
    expect(hero(ok(applyScenarioResult(c, s, { id: 'g2', scenarioId: 's1', won: true, heroes }))).xp).toBe(18);
  });

  it('refuses unknown scenarios and heroes', () => {
    expect(err(applyScenarioResult(c, fresh(), { id: 'g', scenarioId: 'nope', won: true, heroes }))).toBe('unknown scenario nope');
    expect(err(applyScenarioResult(c, fresh(), { id: 'g', scenarioId: 's1', won: true, heroes: [{ classId: 'rogue', xp: 1, gold: 1 }] }))).toBe('no hero rogue');
  });
});

describe('level-up', () => {
  it('needs the XP of the next threshold', () => {
    const s = fresh();
    expect(canLevelUp(c, hero(s))).toBe(false);
    hero(s).xp = 20;
    expect(canLevelUp(c, hero(s))).toBe(true);
    expect(err(levelUp(c, fresh(), 'warden', { card: 'warden.stone-bulwark', perk: 'add-two-plus1' }))).toBe('not enough XP');
  });

  it('takes 1 of the 2 new cards and a perk', () => {
    const s = fresh();
    hero(s).xp = 20;
    expect(levelUpCards(c, hero(s))).toEqual(['warden.stone-bulwark', 'warden.counter-blow']);
    expect(err(levelUp(c, s, 'warden', { perk: 'add-two-plus1' }))).toBe('choose one of the new cards');
    expect(err(levelUp(c, s, 'warden', { card: 'warden.tremor', perk: 'add-two-plus1' }))).toBe('choose one of the new cards');
    expect(err(levelUp(c, s, 'warden', { card: 'warden.counter-blow' }))).toBe('choose an available perk');
    const t = ok(levelUp(c, s, 'warden', { card: 'warden.counter-blow', perk: 'add-two-plus1' }));
    expect(hero(t).level).toBe(2);
    expect(hero(t).cardPool).toEqual(['warden.counter-blow']);
    expect(hero(t).perks).toEqual(['add-two-plus1']);
    expect(canLevelUp(c, hero(t))).toBe(false);
    expect(levelUpCards(c, hero(t))).toEqual(['warden.tremor', 'warden.living-shield']);
  });

  it('a perk taken `max` times is no longer offered', () => {
    const s = fresh();
    hero(s).xp = 45;
    const t = ok(levelUp(c, s, 'warden', { card: 'warden.stone-bulwark', perk: 'remove-minus2' }));
    expect(availablePerks(c, hero(t))).not.toContain('remove-minus2');
    expect(err(levelUp(c, t, 'warden', { card: 'warden.tremor', perk: 'remove-minus2' }))).toBe('choose an available perk');
  });

  it('stops at the last threshold', () => {
    const s = fresh();
    Object.assign(hero(s), { level: 5, xp: 500 });
    expect(canLevelUp(c, hero(s))).toBe(false);
  });
});

describe('hand and scenario setup', () => {
  const variants = BASE_RULES;

  /** Warden at level 2 with Контрудар: a pool of 14 for a hand of 10. */
  function leveled(): CampaignState {
    const s = fresh();
    hero(s).xp = 20;
    return ok(levelUp(c, s, 'warden', { card: 'warden.counter-blow', perk: 'remove-minus2' }));
  }

  it('the pool is the level-1 cards plus the chosen level cards', () => {
    const pool = cardPool(c, hero(leveled()));
    expect(pool).toHaveLength(14);
    expect(pool).toContain('warden.counter-blow');
    expect(pool).not.toContain('warden.stone-bulwark');
  });

  it('pickHand takes handSize cards from the pool', () => {
    const s = leveled();
    const pool = cardPool(c, hero(s));
    expect(err(pickHand(c, s, 'warden', pool))).toBe('choose 10 cards');
    expect(err(pickHand(c, s, 'warden', [...pool.slice(0, 9), 'warden.stone-bulwark']))).toBe('card not in the pool');
    expect(hero(ok(pickHand(c, s, 'warden', pool.slice(4)))).handPick).toEqual(pool.slice(4));
  });

  it('setupFromCampaign carries level, perks, ★ items, the card pool and the hand into the game', () => {
    let s = leveled();
    hero(s).gold = 100;
    s = ok(equip(c, ok(upgrade(c, ok(buyDagger(s)), 'warden', 'dagger')), 'warden', 'dagger'));
    const hand = cardPool(c, hero(s)).slice(4);
    s = ok(pickHand(c, s, 'warden', hand));
    const r = setupFromCampaign(s, 's1', { seed: 3, variants });
    if (!r.ok) throw new Error(r.error);
    expect(r.setup.heroes[0]).toEqual({
      classId: 'warden',
      playerId: 'p1',
      level: 2,
      perks: ['remove-minus2'],
      items: ['dagger+'],
      cards: ['warden.counter-blow'],
      hand,
    });
    const g = createGame(r.setup, c);
    const w = g.figures['hero:warden'] as HeroState;
    expect(w.hand).toEqual(hand);
    expect(w.maxHp).toBe(c.heroes.warden!.hpByLevel[1]);
    expect(w.modifierDeck.draw).toHaveLength(BASE_MODIFIER_CARDS.length - 1);
    expect(w.modifierDeck.draw).not.toContain('-2');
    // Лучниця (hand 9 of 13 cards) has no camp hand and still picks before the scenario.
    expect(g.pending).toEqual({ kind: 'chooseHandBeforeScenario', heroIds: ['hero:wind-archer'] });
  });

  it('without a camp hand the hero picks before the scenario, only from the pool', () => {
    const r = setupFromCampaign(leveled(), 's1', { seed: 3, variants });
    if (!r.ok) throw new Error(r.error);
    const g = createGame(r.setup, c);
    expect(g.pending).toEqual({ kind: 'chooseHandBeforeScenario', heroIds: ['hero:warden', 'hero:wind-archer'] });
    expect((g.figures['hero:warden'] as HeroState).cardPool).toHaveLength(14);
    const pool = cardPool(c, hero(leveled()));
    const outside = apply(g, { type: 'chooseHand', heroId: 'hero:warden', cards: [...pool.slice(0, 9), 'warden.stone-bulwark'] }, c);
    expect(outside).toEqual({ ok: false, error: 'card not available' });
    expect(apply(g, { type: 'chooseHand', heroId: 'hero:warden', cards: pool.slice(4) }, c).ok).toBe(true);
  });

  it('only unlocked or won scenarios can be set up', () => {
    expect(setupFromCampaign(fresh(), 's3', { seed: 1, variants })).toEqual({ ok: false, error: 's3 is not unlocked' });
    const won = ok(applyScenarioResult(c, fresh(), { id: 'g', scenarioId: 's1', won: true, heroes: [] }));
    expect(setupFromCampaign(won, 's1', { seed: 1, variants }).ok).toBe(true);
    expect(setupFromCampaign(won, 's2', { seed: 1, variants }).ok).toBe(true);
  });
});

function buyDagger(s: CampaignState): CampaignResult {
  return buy(c, s, 'warden', 'dagger');
}
