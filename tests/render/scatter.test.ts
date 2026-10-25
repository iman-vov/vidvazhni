import { describe, expect, it } from 'vitest';
import { hexKey, parseHexKey } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { environmentFor } from '../../src/render/environment/data';
import { buildLayout, distanceToOutline } from '../../src/render/environment/layout';
import { planEnvironment } from '../../src/render/environment/plan';
import { existsSync, readFileSync } from 'node:fs';
import { hexRim, kindReach, litterKinds, planScatter, RIM_MAX, RIM_MIN, SCATTER, SCATTER_KINDS, scatterProfile } from '../../src/render/environment/scatter';
import { busyHexes, scenarioPartitions } from '../../src/render/environment';
import { ENVIRONMENTS } from '../../src/render/environment/data';
import { hexToWorld, worldToHex } from '../../src/render/hexLayout';

const content = loadContent();

describe('small-things scatter', () => {
  it('every location has a profile of its own', () => {
    for (const env of ENVIRONMENTS) expect(SCATTER[env.id], env.id).toBeDefined();
  });

  it('outdoor floors follow the season, indoor ones do not', () => {
    const kinds = (season?: 'autumn' | 'summer' | 'winter') => scatterProfile('thorn-path', 'forest', season).kinds.map(([k]) => k);
    expect(kinds('autumn')).toContain('leaf-pile');
    expect(kinds('winter')).toContain('snow');
    expect(kinds('winter')).not.toContain('leaf-pile');
    expect(kinds('summer')).toContain('tuft');
    expect(scatterProfile('cellar', 'stone', 'winter')).toBe(SCATTER.cellar);
    expect(litterKinds('stone', 'winter').map(([k]) => k)).toEqual(expect.arrayContaining(['chips', 'plank', 'straw']));
    expect(litterKinds('forest', 'autumn').map(([k]) => k)).toContain('leaf-pile');
    expect(litterKinds('forest', 'winter').map(([k]) => k)).toContain('snow');
    expect(litterKinds('forest', 'summer').map(([k]) => k)).toContain('tuft');
  });

  it('the Blender kit has 4 variants of every kind, inside its reach, on the floor, low poly', () => {
    expect(existsSync('assets/models/scatter-kit/scatter-kit.glb')).toBe(true);
    const report = JSON.parse(readFileSync('art/blender/scatter-kit/scatter-kit.report.json', 'utf8')) as Record<string, { reach: number; low: number; tris: number }[]>;
    for (const kind of SCATTER_KINDS) {
      const variants = report[kind] ?? [];
      expect(variants.length, kind).toBeGreaterThanOrEqual(4);
      expect(variants.length, kind).toBeLessThanOrEqual(4);
      for (const v of variants) {
        expect(v.reach, kind).toBeLessThanOrEqual(kindReach(kind) + 1e-3);
        // Touching the floor (stones sink into it a little), never floating.
        expect(v.low, kind).toBeLessThanOrEqual(0.003);
        expect(v.tris, kind).toBeLessThanOrEqual(160);
      }
    }
  });

  it('hexRim is 0.866 on every side of a hex', () => {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      expect(hexRim(Math.cos(a) * 0.866, Math.sin(a) * 0.866)).toBeCloseTo(0.866, 3);
    }
  });

  for (const id of Object.keys(content.scenarios)) {
    it(`${id}: keeps off hex middles, busy hexes, water and walls; low is sparser than high`, () => {
      const scenario = content.scenarios[id]!;
      const def = environmentFor(id);
      const layout = buildLayout(scenario);
      const busy = busyHexes(scenario);
      const partitions = scenarioPartitions(layout, scenario).map((p) => p.points);
      const input = (quality: 'low' | 'high', detail: 'off' | 'few' | 'many' = quality === 'low' ? 'few' : 'many') => ({
        layout,
        profile: scatterProfile(def.id, def.edge, def.season),
        def,
        quality,
        detail,
        busy,
        placements: planEnvironment(layout, def, quality, partitions),
        partitions,
      });
      const high = planScatter(input('high'));
      const low = planScatter(input('low'));
      expect(high.length).toBeGreaterThan(layout.footprint.size);
      expect(low.length).toBeLessThan(high.length * 0.5);
      expect(planScatter(input('high', 'off'))).toEqual([]);
      // Litter reaches the open floor: a good share of the free hexes have something on them.
      const free = [...layout.footprint.keys()].filter((k) => !busy.has(k) && layout.terrain.get(k) !== 'water');
      const dressed = new Set(high.map((s) => hexKey(worldToHex(s.x, s.z))));
      expect(free.filter((k) => dressed.has(k)).length).toBeGreaterThan(free.length * 0.45);
      for (const s of high) {
        const [q, r] = worldToHex(s.x, s.z);
        const k = hexKey([q, r]);
        expect(busy.has(k), `${s.kind} on busy ${k}`).toBe(false);
        expect(distanceToOutline(layout, s.x, s.z)).toBeGreaterThan(0.14);
        if (layout.footprint.has(k)) {
          const c = hexToWorld(q, r);
          // Off the middle (figures, tokens, coins) and, with the whole shape, short of the outline.
          const d = hexRim(s.x - c.x, s.z - c.z);
          expect(d).toBeGreaterThanOrEqual(RIM_MIN);
          expect(d + kindReach(s.kind) * s.scale).toBeLessThanOrEqual(RIM_MAX + 1e-9);
          expect(layout.terrain.get(k)).not.toBe('water');
                  }
      }
      // Seeded: the same map gives the same spots.
      expect(planScatter(input('high'))).toEqual(high);
      expect([...busy].every((k) => parseHexKey(k).length === 2)).toBe(true);
    });
  }
});
