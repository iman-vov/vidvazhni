import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS } from '../../src/render/environment';
import { footRing, hexBand } from '../../src/render/figureView';
import { activeFigure } from '../../src/render/highlightPlan';
import { anchoredModel, fitToHeight, hexVariation, propModelFor, ROUGH_SETS, ROUGH_VARIANTS, roughModelFor, TRAP_SETS, trapModelFor } from '../../src/render/propModels';
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
    expect(propModelFor(def, ['barrel'], new Set(['barrel']), 0.9)).toEqual({ model: 'barrel', height: 0.92, rotY: 0, stack: 1 });
    expect(propModelFor(def, ['rune'], new Set(['rune-stone']), 0.7)).toEqual({ model: 'rune-stone', height: 0.7, rotY: 0, stack: 1 });
  });

  it('tries the keys in order, then a model named like a key', () => {
    expect(propModelFor(def, ['lever:down', 'lever-down', 'lever'], new Set(['floor-lever']), 1)).toEqual({ model: 'floor-lever', height: 1, rotY: 180, stack: 1 });
    expect(propModelFor(null, ['crate'], new Set(['crate']), 0.8)).toEqual({ model: 'crate', height: 0.8, rotY: 0, stack: 1 });
    expect(propModelFor(null, ['crate'], new Set(['barrel']), 0.8)).toBeNull();
  });

  it('a Glass Town prop found by its id keeps its own height', () => {
    const glass = new Set(['mirror', 'bookshelf']);
    expect(propModelFor(null, ['mirror:dark', 'mirror'], glass, 0.9)).toEqual({ model: 'mirror', height: 1.15, rotY: 0, stack: 1 });
    expect(propModelFor(null, ['bookshelf'], glass, 0.9)?.height).toBe(1.35);
  });

  it('a flat lily pad keeps its own thin height, not the default', () => {
    expect(propModelFor(null, ['lily-pad-3'], new Set(['lily-pad-3']), 0.9)?.height).toBeLessThan(0.1);
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

  it('difficult terrain gets the clump of its region, a planned model, all variants in use', () => {
    expect(roughModelFor('no-such-place', 0, 0)).toBeNull();
    expect(roughModelFor(null, 0, 0)).toBeNull();
    for (const id of Object.keys(ROUGH_SETS)) expect(ENVIRONMENTS.some((e) => e.id === id)).toBe(true);
    const seen = new Set<string>();
    for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) seen.add(roughModelFor('thorn-path', q, r)!);
    expect(seen.size).toBe(ROUGH_VARIANTS);
    for (const set of new Set(Object.values(ROUGH_SETS))) {
      for (let v = 1; v <= ROUGH_VARIANTS; v++) {
        expect(PLANNED.has(`rough-${set}-${v}`)).toBe(true);
        expect(anchoredModel(`rough-${set}-${v}`)).toBe(true);
      }
    }
    expect(roughModelFor('thorn-path', 3, -2)).toBe(roughModelFor('thorn-path', 3, -2));
    expect(anchoredModel('barrel')).toBe(false);
  });

  it('a trap gets the set of its region, a planned anchored model; elsewhere the location snare', () => {
    expect(trapModelFor('no-such-place')).toBeNull();
    expect(trapModelFor(undefined)).toBeNull();
    for (const id of Object.keys(TRAP_SETS)) expect(ENVIRONMENTS.some((e) => e.id === id)).toBe(true);
    for (const set of new Set(Object.values(TRAP_SETS))) {
      expect(PLANNED.has(`trap-${set}`)).toBe(true);
      expect(anchoredModel(`trap-${set}`)).toBe(true);
    }
    expect(trapModelFor('glass-town')).toBe('trap-glass');
    expect(anchoredModel('bear-trap')).toBe(false);
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

  it('the foot ring faces up, glows on its line and fades to nothing at the rims', () => {
    const g = footRing(3, 34);
    g.computeVertexNormals();
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.99);
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    let peak = 0;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      expect(r).toBeLessThanOrEqual(1.14);
      if (r < 0.83 || r > 1.12) expect(col.getW(i)).toBe(0);
      peak = Math.max(peak, col.getW(i));
    }
    expect(peak).toBe(1);
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
