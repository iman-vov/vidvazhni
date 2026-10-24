// Campaign flow: scenario result → camp, level-up, camp → scenario setup (docs/design/camp.md).
import { describe, expect, it } from 'vitest';
import { applyScenarioResult, type CampaignResult, type CampaignState, newCampaign } from '../../src/rules/campaign';
import { loadContent } from '../../src/rules/load';

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
