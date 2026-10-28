import { describe, expect, it } from 'vitest';
import { hexKey } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { busyHexes, scenarioPartitions } from '../../src/render/environment';
import { environmentFor } from '../../src/render/environment/data';
import { buildLayout, onWoodFloor } from '../../src/render/environment/layout';
import { planEnvironment } from '../../src/render/environment/plan';
import { planScatter, scatterProfile } from '../../src/render/environment/scatter';
import { worldToHex } from '../../src/render/hexLayout';

const content = loadContent();

describe('wooden room floors', () => {
  it('s8: the plank rooms are wood, the square is not', () => {
    const layout = buildLayout(content.scenarios.s8!);
    const room = (id: string) => content.scenarios.s8!.rooms.find((r) => r.id === id)!;
    expect(room('s8.office').hexes.every((h) => onWoodFloor(layout, hexKey(h)))).toBe(true);
    expect(room('s8.square').hexes.some((h) => onWoodFloor(layout, hexKey(h)))).toBe(false);
  });

  it('s8: no pebbles on the planks', () => {
    const scenario = content.scenarios.s8!;
    const def = environmentFor('s8');
    const layout = buildLayout(scenario);
    const partitions = scenarioPartitions(layout, scenario).map((p) => p.points);
    const spots = planScatter({
      layout,
      profile: scatterProfile(def.id, def.edge, def.season),
      def,
      quality: 'high',
      detail: 'many',
      busy: busyHexes(scenario),
      placements: planEnvironment(layout, def, 'high', partitions),
      partitions,
    });
    const onWood = spots.filter((s) => onWoodFloor(layout, hexKey(worldToHex(s.x, s.z))));
    expect(onWood.length).toBeGreaterThan(0);
    expect(onWood.filter((s) => s.kind === 'pebbles')).toEqual([]);
  });
});
