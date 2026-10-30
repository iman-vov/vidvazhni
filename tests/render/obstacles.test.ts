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

/** A hex of shelves: they stand on the hex's line, a lone one in its middle. */
const isShelves = (p: { items: { piece: string }[] }) => p.items.some((it) => it.piece === 'shelf' || it.piece === 'bookshelf' || it.piece === 'bookcase-long' || it.piece === 'rack-long');

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
        // A hex of a set piece may hold little of it itself; with its neighbours it holds a pile or a row.
        const mate = Math.max(0, ...neighbors(o.hex).map((n) => plans.get(hexKey(n))?.items.length ?? 0));
        // One thing (a shelf square in its row) or a small pile.
        expect(p.items.length + mate, `${s.id} ${o.hex}`).toBeGreaterThanOrEqual(isShelves(p) ? 1 : 2);
        // Nothing stands alone in the middle: the first thing is off the centre or has company.
        for (const it of p.items) if (Math.hypot(it.x, it.z) < 0.05 && !isShelves(p)) expect(p.items.length).toBeGreaterThan(1);
      }
      const all = [...plans.values()].flatMap((p) => p.items);
      expect(all.length, s.id).toBeGreaterThanOrEqual(plans.size);
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
      // A group's litter lies with its first hex; shelves and tables have none.
      const kept = [...plans.values()].filter((p) => !isShelves(p) && !p.items.some((it) => it.piece === 'table' || it.piece === 'long-table')).length;
      expect([...plans.values()].reduce((n, p) => n + p.litter.length, 0), s.id).toBeGreaterThanOrEqual(kept);
    }
  });

  it('turns touching obstacle hexes of one kind into one set piece', () => {
    const s1 = scenarios.find((s) => s.id === 's1')!;
    const plans = plan(s1);
    const pair = ['6,-3', '6,-2'].map((k) => plans.get(k)!);
    expect(pair.every(Boolean)).toBe(true);
    expect(pair[0]!.items.length + pair[1]!.items.length).toBeGreaterThanOrEqual(4);
  });

  const NATURAL = new Set(['boulder', 'snow-rock', 'stalagmite', 'rock', 'rubble-heap', 'ore-pile', 'coal-pile', 'rubble', 'obstacle-tree', 'stump', 'fern', 'mushrooms', 'crystals', 'campfire', 'pillar', 'sack', 'sacks', 'log']);
  const quarter = (a: number) => Math.abs(a - Math.round(a / (Math.PI / 2)) * (Math.PI / 2));

  it('stands made things square: on a hex they are 0/90° of each other, a few degrees off, except in one wreck per room at most', () => {
    for (const s of scenarios) {
      const plans = plan(s);
      for (const room of s.rooms) {
        let askew = 0;
        for (const o of room.obstacles ?? []) {
          const made = (plans.get(hexKey(o.hex))?.items ?? []).filter((it) => !NATURAL.has(it.piece) && it.piece !== 'long-table' && it.piece !== 'cart' && it.piece !== 'chair');
          if (made.length < 2) continue;
          const off = made.some((it) => it.tip === 'lean' || made.some((m) => quarter(m.rot - it.rot) > 0.12));
          if (off) askew++;
        }
        // A wreck spans its group's hexes (up to 5).
        expect(askew, `${s.id} ${room.id}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('never sets a copy beside a copy: the same thing on the floor of a hex differs in size', () => {
    for (const s of scenarios) {
      for (const [k, p] of plan(s)) {
        const floor = p.items.filter((it) => it.y === 0);
        for (const a of floor) for (const b of floor) if (a !== b && a.piece === b.piece) expect(Math.abs(a.scale - b.scale), `${s.id} ${k} ${a.piece}`).toBeGreaterThan(0.05);
      }
    }
  });

  it('turns a run of touching goods into one pile across up to five hexes', () => {
    const s4 = scenarios.find((s) => s.id === 's4')!;
    const plans = plan(s4);
    // The upper tier's crate stacks and barrel [12,-6] [12,-5] [12,-4] are one pile of goods, square to one line.
    const items = ['12,-6', '12,-5', '12,-4'].flatMap((k) => plans.get(k)?.items ?? []);
    expect(items.length).toBeGreaterThanOrEqual(5);
  });
});
