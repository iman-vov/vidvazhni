import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS } from '../../src/render/environment';
import { hexBand } from '../../src/render/figureView';
import { activeFigure } from '../../src/render/highlightPlan';
import { fitToHeight, hexVariation, propModelFor } from '../../src/render/propModels';
import type { GameState } from '../../src/rules/state';

/** Prop model ids the art manifest plans (art/prompts/manifest.json, kind "prop") plus flour-sack. */
const PLANNED = new Set([
  ...(JSON.parse(readFileSync('art/prompts/manifest.json', 'utf8')) as { models: { id: string; kind: string }[] }).models.filter((m) => m.kind === 'prop').map((m) => m.id),
  'flour-sack',
]);

describe('prop models', () => {
  const def = { propModels: { barrel: { model: 'barrel', height: 0.92 }, 'lever-down': { model: 'floor-lever', rotY: 180 }, rune: 'rune-stone' } };

  it('uses the table entry only when its model exists', () => {
    expect(propModelFor(def, ['barrel'], new Set(), 0.9)).toBeNull();
    expect(propModelFor(def, ['barrel'], new Set(['barrel']), 0.9)).toEqual({ model: 'barrel', height: 0.92, rotY: 0 });
    expect(propModelFor(def, ['rune'], new Set(['rune-stone']), 0.7)).toEqual({ model: 'rune-stone', height: 0.7, rotY: 0 });
  });

  it('tries the keys in order, then a model named like a key', () => {
    expect(propModelFor(def, ['lever:down', 'lever-down', 'lever'], new Set(['floor-lever']), 1)).toEqual({ model: 'floor-lever', height: 1, rotY: 180 });
    expect(propModelFor(null, ['crate'], new Set(['crate']), 0.8)).toEqual({ model: 'crate', height: 0.8, rotY: 0 });
    expect(propModelFor(null, ['crate'], new Set(['barrel']), 0.8)).toBeNull();
  });

  it('every location maps only to planned prop models', () => {
    for (const env of ENVIRONMENTS) {
      for (const [key, entry] of Object.entries(env.propModels ?? {})) {
        const model = typeof entry === 'string' ? entry : entry.model;
        expect(PLANNED.has(model), `${env.id}: ${key} → ${model}`).toBe(true);
      }
    }
    expect(ENVIRONMENTS.find((e) => e.id === 'cellar')?.propModels?.['barrel']).toBeTruthy();
  });

  it('fits a model box to its height, feet on the ground, centred', () => {
    const box = new THREE.Box3(new THREE.Vector3(1, -0.5, 2), new THREE.Vector3(3, 1.5, 4));
    const fit = fitToHeight(box, 1);
    expect(fit.scale).toBeCloseTo(0.5);
    const min = box.min.clone().multiplyScalar(fit.scale).add(fit.offset);
    const max = box.max.clone().multiplyScalar(fit.scale).add(fit.offset);
    expect(min.y).toBeCloseTo(0);
    expect(max.y).toBeCloseTo(1);
    expect((min.x + max.x) / 2).toBeCloseTo(0);
    expect((min.z + max.z) / 2).toBeCloseTo(0);
    expect(fit.radius).toBeCloseTo(0.5);
  });

  it('varies turn and size per hex, the same every time', () => {
    const a = hexVariation(0, 0);
    const b = hexVariation(2, 0);
    expect(a).toEqual(hexVariation(0, 0));
    expect(a.rot).not.toBeCloseTo(b.rot);
    for (let q = -5; q <= 5; q++) {
      for (let r = -5; r <= 5; r++) {
        const v = hexVariation(q, r);
        expect(v.scale).toBeGreaterThanOrEqual(0.93);
        expect(v.scale).toBeLessThanOrEqual(1.06);
        expect(v.rot).toBeGreaterThanOrEqual(0);
        expect(v.rot).toBeLessThan(Math.PI * 2);
      }
    }
  });
});

describe('figure ground marks', () => {
  it('the hex band faces up and stays inside the plate', () => {
    const g = hexBand([0.66, 0.86, 0.97], [0, 1, 0]);
    g.computeVertexNormals();
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.99);
    g.computeBoundingSphere();
    expect(g.boundingSphere!.radius).toBeLessThan(0.98);
    expect(g.getAttribute('color').itemSize).toBe(4);
  });

  it('the active figure is the hero the engine waits for, else the turn-order entry', () => {
    const base = {
      phase: 'turns',
      pending: null,
      turnOrder: [
        { kind: 'monsterGroup', typeId: 'cellar-rat', initiative: 10 },
        { kind: 'hero', figureId: 'hero:warden', initiative: 20 },
      ],
      turnIndex: 1,
      figures: { 'hero:warden': {}, 'hero:rogue': {} },
    } as unknown as GameState;
    expect(activeFigure(base)).toBe('hero:warden');
    expect(activeFigure({ ...base, turnIndex: 0 })).toBeNull();
    expect(activeFigure({ ...base, pending: { kind: 'stepChoice', heroId: 'hero:rogue' } } as unknown as GameState)).toBe('hero:rogue');
    expect(activeFigure({ ...base, phase: 'selectCards', pending: { kind: 'selectCards', heroIds: [] } } as unknown as GameState)).toBeNull();
  });
});
