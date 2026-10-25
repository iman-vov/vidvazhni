import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ScenarioDef } from '../../src/rules/content';
import { hexKey, neighbors, parseHexKey } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { hexToWorld, worldToHex } from '../../src/render/hexLayout';
import { environmentFor } from '../../src/render/environment/data';
import { assignObstacleLooks } from '../../src/render/environment';
import { edgeDistance, planObstacles } from '../../src/render/environment/obstacles';

const content = loadContent();
const scenarios: ScenarioDef[] = [
  ...Object.values(content.scenarios),
  ...['s6', 's7', 's8', 's9', 's10'].map((id) => JSON.parse(readFileSync(`data/scenarios/${id}.json`, 'utf8')) as ScenarioDef),
  JSON.parse(readFileSync('data/tutorial/s0-tutorial.json', 'utf8')) as ScenarioDef,
].filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i);

function plan(s: ScenarioDef) {
  const def = environmentFor(s.id);
  const looks = assignObstacleLooks(s, def);
  return planObstacles(s, def, (model, k) => looks.get(k) ?? ({ tree: 'obstacle-tree', rock: 'boulder', bed: 'bunk' } as Record<string, string>)[model] ?? model);
}

describe('obstacle clusters', () => {
  it('is the same every time for a scenario', () => {
    for (const s of scenarios) expect(JSON.stringify([...plan(s)])).toBe(JSON.stringify([...plan(s)]));
  });

  it('dresses every obstacle hex with a few things, none of them in the middle alone', () => {
    for (const s of scenarios) {
      const plans = plan(s);
      const obstacles = s.rooms.flatMap((r) => r.obstacles ?? []);
      expect(obstacles.length).toBeGreaterThan(0);
      for (const o of obstacles) {
        const p = plans.get(hexKey(o.hex));
        if (!p) continue;
        // A hex of a set piece may hold little of it itself; the pair together holds several things.
        const mate = neighbors(o.hex).map((n) => plans.get(hexKey(n))).find(Boolean);
        expect(p.items.length + (mate?.items.length ?? 0), `${s.id} ${o.hex}`).toBeGreaterThanOrEqual(3);
        // Nothing stands alone in the middle: the first thing is off the centre or has company.
        for (const it of p.items) if (Math.hypot(it.x, it.z) < 0.05) expect(p.items.length).toBeGreaterThan(1);
      }
      const all = [...plans.values()].flatMap((p) => p.items);
      expect(all.length, s.id).toBeGreaterThanOrEqual(plans.size * 2);
    }
  });

  it('keeps things on their obstacle hexes and litter off hex outlines and off-map hexes', () => {
    for (const s of scenarios) {
      const playable = new Set(s.rooms.flatMap((r) => r.hexes.map((h) => hexKey(h))));
      const plans = plan(s);
      for (const [k, p] of plans) {
        const c = hexToWorld(...parseHexKey(k));
        for (const it of p.items) expect(plans.has(hexKey(worldToHex(c.x + it.x, c.z + it.z))), `${s.id} ${k} ${it.piece}`).toBe(true);
        for (const l of p.litter) {
          expect(playable.has(hexKey(worldToHex(c.x + l.x, c.z + l.z)))).toBe(true);
          expect(edgeDistance(c.x + l.x, c.z + l.z)).toBeGreaterThan(0.05);
        }
      }
    }
  });

  it('lays litter beside obstacles', () => {
    for (const s of scenarios) {
      const plans = plan(s);
      expect([...plans.values()].reduce((n, p) => n + p.litter.length, 0), s.id).toBeGreaterThanOrEqual(plans.size * 2);
    }
  });

  it('turns touching obstacle hexes of one kind into one set piece', () => {
    const s1 = scenarios.find((s) => s.id === 's1')!;
    const plans = plan(s1);
    const pair = ['6,-3', '6,-2'].map((k) => plans.get(k)!);
    expect(pair.every(Boolean)).toBe(true);
    expect(pair[0]!.items.length + pair[1]!.items.length).toBeGreaterThanOrEqual(4);
  });
});
