import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/rules/load';
import { ATMOSPHERE, pick } from '../../src/render/environment/atmosphere';
import { ENVIRONMENTS, environmentFor } from '../../src/render/environment/data';
import { buildAtmosphere, FLOOR_CELLS, WALL_CELLS } from '../../src/render/environment/decals';
import { createUniforms } from '../../src/render/environment/field';
import { buildLayout } from '../../src/render/environment/layout';
import { planEnvironment } from '../../src/render/environment/plan';

describe('atmosphere', () => {
  it('has an entry for every location', () => {
    for (const env of ENVIRONMENTS) expect(ATMOSPHERE[env.id], env.id).toBeDefined();
  });

  it('gives every decal kind its own atlas cell', () => {
    for (const cells of [FLOOR_CELLS, WALL_CELLS]) {
      const used = Object.values(cells).map((c) => c.cell);
      expect(new Set(used).size).toBe(used.length);
      for (const c of used) expect(c).toBeLessThan(16);
    }
  });

  it('picks by weight', () => {
    const list: [string, number][] = [['a', 1], ['b', 3]];
    expect(pick(list, 0)).toBe('a');
    expect(pick(list, 0.3)).toBe('b');
    expect(pick(list, 0.9999)).toBe('b');
  });

  it('dresses every scenario the same way on every load', () => {
    const content = loadContent();
    for (const id of ['s1', 's2', 's3', 's4', 's5']) {
      const scenario = content.scenarios[id]!;
      const def = environmentFor(id);
      const layout = buildLayout(scenario);
      const placements = planEnvironment(layout, def, 'medium');
      const build = () =>
        buildAtmosphere({ layout, def, quality: 'medium', placements, partitions: [], uniforms: createUniforms(), material: () => new THREE.MeshBasicMaterial() });
      const a = build();
      const b = build();
      const summary = (r: THREE.Group) => r.children.map((c) => `${c.name}:${((c as THREE.Mesh).geometry.getAttribute('position')?.count ?? 0)}`);
      expect(summary(a.root)).toEqual(summary(b.root));
      expect(a.root.children.some((c) => c.name === 'env:decals:floor'), id).toBe(true);
      a.dispose();
      b.dispose();
    }
  });
});
