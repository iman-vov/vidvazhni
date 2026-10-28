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
  playableScenarios,
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

  it('Act II: s5 opens the choice s6 or s7, one win closes the other, both lead to s8 … s10 and the hammer', () => {
    const win = (s: CampaignState, scenarioId: string) => ok(applyScenarioResult(c, s, { id: scenarioId, scenarioId, won: true, heroes }));
    const afterS5 = win({ ...fresh(), unlocked: ['s5'] }, 's5');
    expect(afterS5.unlocked).toEqual(['s6', 's7']);
    for (const [pick, other] of [['s6', 's7'], ['s7', 's6']] as const) {
      const s = win(afterS5, pick);
      expect(s.unlocked).toEqual(['s8']);
      expect(s.unlocked).not.toContain(other);
      const end = win(win(win(s, 's8'), 's9'), 's10');
      expect(end.completed).toEqual(['s5', pick, 's8', 's9', 's10']);
      expect(end.partyChest).toContain('hammerfist-hammer');
    }
  });

  it('Act III, Glass Town: s10 opens s11 and s16, s16 closes s11, a secondary goal opens s19, flags stay', () => {
    const win = (s: CampaignState, scenarioId: string, secondaryMet?: string[]) =>
      ok(applyScenarioResult(c, s, { id: scenarioId, scenarioId, won: true, heroes, secondaryMet }));
    const afterS10 = win({ ...fresh(), unlocked: ['s10'] }, 's10');
    expect(afterS10.unlocked).toEqual(['s11', 's16']);
    // The marsh has no data yet: s11 waits in the list but is not offered.
    expect(playableScenarios(afterS10, c.scenarios).includes('s11')).toBe(!!c.scenarios['s11']);
    expect(playableScenarios(afterS10, c.scenarios)).toContain('s16');
    const afterS16 = win(afterS10, 's16');
    expect(afterS16.unlocked).toEqual(['s17', 's18']);
    const afterS17 = win(afterS16, 's17', ['s17.mirror-key']);
    expect(afterS17.unlocked).toEqual(['s20', 's19']);
    expect(afterS17.flags).toEqual(['blueprint']);
    expect(win(afterS16, 's18').unlocked).toEqual(['s20']);
    const end = win(win(afterS17, 's19'), 's20');
    expect(end.flags).toEqual(['blueprint', 'mirrors.aligned', 'ally.guardian']);
    expect(end.unlocked).toEqual(['s21']);
    expect(playableScenarios(end, c.scenarios)).not.toContain('s21');
  });

  it('refuses unknown scenarios and heroes', () => {
    expect(err(applyScenarioResult(c, fresh(), { id: 'g', scenarioId: 'nope', won: true, heroes }))).toBe('unknown scenario nope');
    expect(err(applyScenarioResult(c, fresh(), { id: 'g', scenarioId: 's1', won: true, heroes: [{ classId: 'rogue', xp: 1, gold: 1 }] }))).toBe('no hero rogue');
  });
});

describe('level-up', () => {
  it('needs the XP of the next threshold', () => {
    const s = fresh();
    hero(s).xp = 14;
    expect(canLevelUp(c, hero(s))).toBe(false);
    hero(s).xp = 15;
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

  it('stops at the base-game cap, level 7', () => {
    const s = fresh();
    Object.assign(hero(s), { level: 6, xp: 195 });
    expect(canLevelUp(c, hero(s))).toBe(true);
    Object.assign(hero(s), { level: 7, xp: 500 });
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
