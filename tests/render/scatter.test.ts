import { describe, expect, it } from 'vitest';
import { hexKey, parseHexKey } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { environmentFor } from '../../src/render/environment/data';
import { buildLayout, distanceToOutline } from '../../src/render/environment/layout';
import { planEnvironment } from '../../src/render/environment/plan';
import { planScatter, RIM_MIN, SCATTER, scatterProfile } from '../../src/render/environment/scatter';
import { busyHexes, scenarioPartitions } from '../../src/render/environment';
import { ENVIRONMENTS } from '../../src/render/environment/data';
import { hexToWorld, worldToHex } from '../../src/render/hexLayout';

const content = loadContent();

describe('small-things scatter', () => {
  it('every location has a profile of its own', () => {
    for (const env of ENVIRONMENTS) expect(SCATTER[env.id], env.id).toBeDefined();
  });

  for (const id of Object.keys(content.scenarios)) {
    it(`${id}: keeps off hex middles, busy hexes, water and walls; low is sparser than high`, () => {
      const scenario = content.scenarios[id]!;
      const def = environmentFor(id);
      const layout = buildLayout(scenario);
      const busy = busyHexes(scenario);
      const partitions = scenarioPartitions(layout, scenario).map((p) => p.points);
      const input = (quality: 'low' | 'high') => ({ layout, profile: scatterProfile(def.id, def.edge), quality, busy, placements: planEnvironment(layout, def, quality, partitions), partitions });
      const high = planScatter(input('high'));
      const low = planScatter(input('low'));
      expect(high.length).toBeGreaterThan(layout.footprint.size);
      expect(low.length).toBeLessThan(high.length * 0.5);
      for (const s of high) {
        const [q, r] = worldToHex(s.x, s.z);
        const k = hexKey([q, r]);
        expect(busy.has(k), `${s.kind} on busy ${k}`).toBe(false);
        expect(distanceToOutline(layout, s.x, s.z)).toBeGreaterThan(0.14);
        if (layout.footprint.has(k)) {
          const c = hexToWorld(q, r);
          expect(Math.hypot(s.x - c.x, s.z - c.z)).toBeGreaterThanOrEqual(RIM_MIN);
          expect(layout.terrain.get(k)).not.toBe('water');
          expect(s.kind).not.toBe('reeds');
        }
      }
      // Seeded: the same map gives the same spots.
      expect(planScatter(input('high'))).toEqual(high);
      expect([...busy].every((k) => parseHexKey(k).length === 2)).toBe(true);
    });
  }
});
