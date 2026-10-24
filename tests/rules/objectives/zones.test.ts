import { describe, expect, it } from 'vitest';
import { finishRound } from '../../helpers/engineFixtures';
import { goalZone, objectiveStatus, zoneHexes } from '../../../src/rules/objectives';
import { checkScenario } from '../../data/crossref';
import { clearMonsters, content, game, place, reveal } from '../scenarios/helpers';
import { select, withS2 } from './helpers';

const EXIT: [number, number][] = [[13, -6], [13, -5], [13, -4], [13, -3]];

describe('zones', () => {
  it('the s1–s5 goals keep their inline hexes and resolve through goalZone', () => {
    expect(goalZone(content.scenarios['s2']!)).toEqual(EXIT);
    expect(goalZone(content.scenarios['s4']!)).toHaveLength(4);
    expect(goalZone(content.scenarios['s1']!)).toEqual([]);
  });

  it('reachExit can name a zone instead of listing hexes', () => {
    const c = withS2({ zones: [{ id: 'gate', hexes: [[13, -5], [12, -4]] }], goal: { type: 'reachExit', zone: 'gate' } });
    expect(zoneHexes(c.scenarios['s2']!, 'gate')).toHaveLength(2);
    const start = clearMonsters(reveal(game('s2'), 's2.ravine', 's2.lodge'));
    place(start, 'hero:warden', [13, -5]);
    place(start, 'hero:herbalist', [12, -4]);
    expect(objectiveStatus(c, start)).toMatchObject({ goal: 'reachExit', done: 2, of: 2 });
    expect(finishRound(select(structuredClone(start), c), c).phase).toBe('won');
    // The old inline exit hex is not part of the zone.
    place(start, 'hero:herbalist', [13, -4]);
    expect(finishRound(select(start, c), c).phase).toBe('selectCards');
  });

  it('the data checks catch a missing zone and zone hexes outside the map', () => {
    const missing = withS2({ goal: { type: 'reachExit', zone: 'nowhere' } }).scenarios['s2']!;
    expect(checkScenario(missing, content)).toContain('s2: goal zone nowhere missing');
    const outside = withS2({ zones: [{ id: 'far', hexes: [[40, 40]] }] }).scenarios['s2']!;
    expect(checkScenario(outside, content).some((e) => e.includes('zone far hex 40,40 is outside every room'))).toBe(true);
  });
});
