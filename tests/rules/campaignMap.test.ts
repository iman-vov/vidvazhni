import { describe, expect, it } from 'vitest';
import mapData from '../../data/campaign-map.json';
import { markerStates, routeStates, type CampaignMapDef } from '../../src/rules/campaignMap';
import type { CampaignState } from '../../src/rules/campaign';
import { loadContent } from '../../src/rules/load';

const map = mapData as CampaignMapDef;
const state = (completed: string[], unlocked: string[]): CampaignState => ({
  version: 1,
  players: [],
  heroes: [],
  partyChest: [],
  completed,
  unlocked,
  difficulty: 'normal',
});

describe('campaign map', () => {
  it('has a marker for every scenario and links between known markers', () => {
    const ids = new Set(map.markers.map((m) => m.id));
    expect(ids.size).toBe(map.markers.length);
    for (const id of Object.keys(loadContent().scenarios)) expect(ids.has(id)).toBe(true);
    for (const [a, b] of map.links) expect(ids.has(a) && ids.has(b)).toBe(true);
  });

  it('a new campaign shows only s1, available', () => {
    const s = markerStates(map, state([], ['s1']));
    expect(s.s1).toBe('available');
    expect(Object.entries(s).filter(([, v]) => v !== 'hidden')).toEqual([['s1', 'available']]);
  });

  it('won missions, the open route and a «?» after them', () => {
    const s = markerStates(map, state(['s1', 's2'], ['s3']));
    expect([s.s1, s.s2, s.s3, s.s4]).toEqual(['completed', 'completed', 'available', 'hidden']);
    const r = routeStates(map, s);
    const of = (a: string, b: string) => r[map.links.findIndex(([x, y]) => x === a && y === b)];
    expect([of('s1', 's2'), of('s2', 's3'), of('s3', 's4')]).toEqual(['done', 'open', 'hidden']);
    expect(markerStates(map, state(['s1', 's2', 's3', 's4', 's5'], [])).s6).toBe('unknown');
  });

  it('a choice closes the other option, with a grey route', () => {
    const s = markerStates(map, state(['s1', 's2', 's3', 's4', 's5'], ['s6']));
    expect([s.s6, s.s7]).toEqual(['available', 'locked']);
    const r = routeStates(map, s);
    expect(r[map.links.findIndex(([a, b]) => a === 's5' && b === 's7')]).toBe('closed');
    // Region choice: the marshes taken → every Glass City slot is closed.
    const done = ['s1', 's2', 's3', 's4', 's5', 's6', 's8', 's9', 's10'];
    const g = markerStates(map, state(done, ['s11']));
    expect([g.s11, g.s16, g.s20]).toEqual(['available', 'locked', 'locked']);
  });
});
