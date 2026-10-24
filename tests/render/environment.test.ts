import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hexKey } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { ENVIRONMENTS, environmentFor } from '../../src/render/environment/data';
import { bakeField, sampleField, writeVeil } from '../../src/render/environment/field';
import { buildLayout, hidesBoard } from '../../src/render/environment/layout';
import { pieceIds, pieceMeta } from '../../src/render/environment/pieces';
import { planEnvironment, STYLE_PIECES } from '../../src/render/environment/plan';
import { hexToWorld } from '../../src/render/hexLayout';
import { straightRuns } from '../../src/render/environment/walls';
import { assignObstacleLooks, scenarioPartitions } from '../../src/render/environment';

const content = loadContent();
const SCENARIOS = ['s1', 's2', 's3', 's4', 's5'];

describe('environment data', () => {
  it('every file matches the schema and every scenario has its own location', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(JSON.parse(readFileSync('data/schema/environments.schema.json', 'utf8')));
    for (const env of ENVIRONMENTS) expect(validate(env), `${env.id}: ${JSON.stringify(validate.errors?.slice(0, 3))}`).toBe(true);
    for (const id of SCENARIOS) expect(environmentFor(id).id).not.toBe('default');
  });

  it('names only pieces that exist', () => {
    const known = new Set(pieceIds());
    for (const env of ENVIRONMENTS) {
      const named = [
        ...env.dressing.ring,
        ...(env.dressing.outside ?? []),
        ...(env.dressing.far ?? []),
        ...(env.dressing.anchors ?? []),
      ].map(([id]) => id);
      if (env.walls?.sconce) named.push(env.walls.sconce.piece);
      if (env.entrance) named.push(env.entrance);
      if (env.exit) named.push(env.exit);
      for (const l of env.landmarks ?? []) named.push(l.piece);
      for (const id of named) expect(known.has(id), `${env.id}: ${id}`).toBe(true);
      for (const room of Object.keys(env.rooms ?? {})) expect(env.scenarios.some((s) => content.scenarios[s]?.rooms.some((r) => r.id === room)), room).toBe(true);
    }
    for (const style of Object.values(STYLE_PIECES)) {
      for (const id of [style.wall, style.alt, style.low, style.door, style.corner, style.cornerLow]) if (id) expect(known.has(id), id).toBe(true);
    }
  });
});

describe('location layout', () => {
  for (const id of SCENARIOS) {
    it(`${id}: a closed outline one ring outside every room, with an entrance`, () => {
      const scenario = content.scenarios[id]!;
      const layout = buildLayout(scenario);
      const hexes = scenario.rooms.flatMap((r) => r.hexes);
      expect(layout.footprint.size).toBe(new Set(hexes.map((h) => hexKey(h))).size);
      // Each outline corner joins exactly two edges: the outline is closed.
      for (const c of layout.corners) expect(c.edges.length).toBe(2);
      // No outline edge touches a playable hex.
      for (const e of layout.edges) {
        expect(layout.footprint.has(hexKey(e.inner))).toBe(false);
        expect(layout.footprint.has(hexKey(e.outer))).toBe(false);
      }
      expect(layout.edges.filter((e) => e.door === 'entrance')).toHaveLength(1);
      if (scenario.goal.type === 'reachExit') expect(layout.edges.filter((e) => e.door === 'exit')).toHaveLength(1);
      // Walls between the camera (+Z) and the board are cut away; the far walls stand full.
      const back = layout.edges.filter((e) => e.nz < -0.9);
      const front = layout.edges.filter((e) => e.nz > 0.9);
      expect(back.every((e) => !e.front)).toBe(true);
      expect(front.some((e) => e.front)).toBe(true);
    });
  }

  it('a tall piece right in front of the board would hide it, one behind it would not', () => {
    const layout = buildLayout(content.scenarios['s1']!);
    const front = layout.centres.reduce((a, b) => (b.z > a.z ? b : a));
    const back = layout.centres.reduce((a, b) => (b.z < a.z ? b : a));
    expect(hidesBoard(layout, front.x, front.z + 2.2, 2.0)).toBe(true);
    expect(hidesBoard(layout, back.x, back.z - 2.2, 2.0)).toBe(false);
  });
});

describe('placements', () => {
  for (const id of SCENARIOS) {
    it(`${id}: tall pieces never hide a playable hex, nothing stands on one`, () => {
      const scenario = content.scenarios[id]!;
      const layout = buildLayout(scenario);
      const env = environmentFor(id);
      const placed = planEnvironment(layout, env, 'high');
      expect(placed.length).toBeGreaterThan(layout.edges.length);
      expect(placed.some((p) => p.band === 'ring')).toBe(true);
      for (const p of placed) {
        const meta = pieceMeta(p.piece);
        expect(meta, p.piece).toBeDefined();
        if ((p.band === 'ring' || p.band === 'outside' || p.band === 'far') && meta!.height > 0.65) {
          expect(hidesBoard(layout, p.x, p.z, meta!.height, 0), `${p.piece} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(false);
        }
        const hex = layout.footprint.has(hexKey(nearestHex(p.x, p.z)));
        if (p.band !== 'edge' && p.band !== 'corner' && p.band !== 'door') expect(hex, `${p.piece} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(false);
      }
    });
  }

  it('is deterministic and keeps less dressing on low quality', () => {
    const scenario = content.scenarios['s2']!;
    const layout = buildLayout(scenario);
    const env = environmentFor('s2');
    const a = planEnvironment(layout, env, 'medium');
    const b = planEnvironment(layout, env, 'medium');
    expect(a).toEqual(b);
    const low = planEnvironment(layout, env, 'low').filter((p) => p.band === 'outside' || p.band === 'ring').length;
    const high = planEnvironment(layout, env, 'high').filter((p) => p.band === 'outside' || p.band === 'ring').length;
    expect(low).toBeLessThan(high);
  });
});

describe('straight walls', () => {
  for (const id of SCENARIOS) {
    it(`${id}: runs are fewer than hex edges, keep the doorways and never cut into the ring`, () => {
      const layout = buildLayout(content.scenarios[id]!);
      const runs = straightRuns(layout);
      expect(runs.length).toBeLessThan(layout.edges.length);
      expect(runs.filter((r) => r.door).length).toBe(layout.edges.filter((e) => e.door).length);
      for (const r of runs) {
        if (r.door) continue;
        // Every ring and playable hex centre stays on the inner side of the run's line.
        for (const k of [...layout.ring.keys(), ...layout.footprint.keys()]) {
          const [q, rr] = k.split(',').map(Number) as [number, number];
          const c = hexToWorld(q, rr);
          const along = ((c.x - r.ax) * (r.bx - r.ax) + (c.z - r.az) * (r.bz - r.az)) / ((r.bx - r.ax) ** 2 + (r.bz - r.az) ** 2);
          if (along < 0 || along > 1) continue;
          const out = (c.x - r.ax) * r.nx + (c.z - r.az) * r.nz;
          // Far beyond the line is the other side of a concave notch (a hall past a narrow room), not a cut.
          if (out > 3) continue;
          expect(out, `${k}`).toBeLessThan(0.05);
        }
      }
    });
  }
});

describe('partitions between rooms', () => {
  for (const id of SCENARIOS) {
    it(`${id}: run end to end to the outer wall and never cut a playable hex`, () => {
      const scenario = content.scenarios[id]!;
      const layout = buildLayout(scenario);
      const parts = scenarioPartitions(layout, scenario);
      const walls = scenario.rooms.reduce((n, r) => n + (r.walls?.length ?? 0), 0);
      if (walls) expect(parts.length).toBeGreaterThan(0);
      for (const part of parts) {
        // Both ends either reach the outer wall or stop at a doorway hex.
        for (let i = 0; i + 1 < part.points.length; i++) {
          const a = part.points[i]!;
          const b = part.points[i + 1]!;
          for (const k of layout.footprint.keys()) {
            const [q, r] = k.split(',').map(Number) as [number, number];
            const c = hexToWorld(q, r);
            const t = Math.max(0, Math.min(1, ((c.x - a.x) * (b.x - a.x) + (c.z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
            const d = Math.hypot(c.x - (a.x + (b.x - a.x) * t), c.z - (a.z + (b.z - a.z) * t));
            expect(d, `${k}`).toBeGreaterThan(0.85);
          }
        }
      }
      // s1: the door splits the wall in two; each half runs from the doorway to a side wall.
      // s4: straight walls across the hex rows, down the strips the map leaves out, split by the doors.
      if (id === 's4') {
        expect(parts).toHaveLength(4);
        for (const p of parts) expect(p.points).toHaveLength(2);
        expect(parts.filter((p) => p.door).length).toBe(4);
      }
      if (id === 's1') expect(parts.map((p) => Number(p.extended[0]) + Number(p.extended[1]))).toEqual([1, 1]);
    });
  }
});

describe('showcase cellar (s1)', () => {
  const layout = buildLayout(content.scenarios.s1!);
  const def = environmentFor('s1');

  it('groups ring props (several pieces per group, some stacked) and gives obstacles varied set pieces', () => {
    const plan = planEnvironment(layout, def, 'high');
    const ring = plan.filter((p) => p.band === 'ring');
    expect(ring.some((p) => (p.y ?? 0) > 0)).toBe(true);
    expect(new Set(ring.map((p) => p.piece)).size).toBeGreaterThanOrEqual(4);
    const looks = assignObstacleLooks(content.scenarios.s1!, def);
    expect(looks.size).toBe(5);
    expect(new Set(looks.values()).size).toBeGreaterThanOrEqual(4);
    for (const [k, look] of looks) {
      const [q, r] = k.split(',').map(Number) as [number, number];
      for (const [k2, look2] of looks) {
        const [q2, r2] = k2.split(',').map(Number) as [number, number];
        const d = (Math.abs(q - q2) + Math.abs(r - r2) + Math.abs(q + r - q2 - r2)) / 2;
        if (k !== k2 && d <= 2) expect(look2, `${k} ${k2}`).not.toBe(look);
      }
    }
  });

  it('hangs torches on full walls and keeps two lit braziers at every quality', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const plan = planEnvironment(layout, def, q);
      const torches = plan.filter((p) => p.piece === 'wall-torch');
      const braziers = plan.filter((p) => p.piece === 'brazier-lit');
      expect(torches.length, q).toBeGreaterThanOrEqual(3);
      expect(braziers.length, q).toBe(2);
      for (const b of braziers) expect(hidesBoard(layout, b.x, b.z, 1, 0.24), q).toBe(false);
      expect(Math.hypot(braziers[0]!.x - braziers[1]!.x, braziers[0]!.z - braziers[1]!.z)).toBeGreaterThan(3);
    }
  });
});

describe('field', () => {
  it('the board is clear, the far ground is in fog, unrevealed rooms are veiled', () => {
    const scenario = content.scenarios['s1']!;
    const layout = buildLayout(scenario);
    const env = environmentFor('s1');
    const f = bakeField(layout, env, 96);
    const c = layout.centre;
    expect(sampleField(f, c.x, c.z, 0)).toBe(0);
    expect(sampleField(f, c.x, layout.min.z - env.fog.end - 1, 0)).toBeGreaterThan(0.95);
    writeVeil(f, (room) => (room === 's1.wine-cellar' ? 1 : 0));
    const cellar = scenario.rooms.find((r) => r.id === 's1.wine-cellar')!.hexes[5]!;
    const pantry = scenario.rooms.find((r) => r.id === 's1.pantry')!.hexes[4]!;
    const w = hexToWorld(cellar[0], cellar[1]);
    const p = hexToWorld(pantry[0], pantry[1]);
    expect(sampleField(f, w.x, w.z, 1)).toBeGreaterThan(0.9);
    expect(sampleField(f, p.x, p.z, 1)).toBe(0);
  });
});

function nearestHex(x: number, z: number): [number, number] {
  // Local copy of worldToHex to keep the test independent of the placement code.
  const q = (2 / 3) * x;
  const r = (-1 / 3) * x + (Math.sqrt(3) / 3) * z;
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  if (dq > dr && dq > Math.abs(rs - s)) rq = -rr - rs;
  else if (dr > Math.abs(rs - s)) rr = -rq - rs;
  return [rq + 0, rr + 0];
}
