// Walls between rooms, as in Jaws of the Lion: one straight line from outer wall to outer wall,
// through the doorway, never into a playable hex; the rules see the same rooms (they touch only at
// their doors, so the line is the only way through). Every scenario map, Act II and the tutorial too.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ScenarioDef } from '../../src/rules/content';
import { distance, hexKey, neighbors, parseHexKey, type Hex } from '../../src/rules/hex';
import { DIVIDER_PIECES, dividerFor, ENVIRONMENTS, scenarioPartitions } from '../../src/render/environment';
import { pieceIds } from '../../src/render/environment/pieces';
import { buildLayout } from '../../src/render/environment/layout';
import { straightRuns } from '../../src/render/environment/walls';
import { HEX_SIZE, hexToWorld } from '../../src/render/hexLayout';

const MAPS: [string, ScenarioDef][] = [
  ['s0', JSON.parse(readFileSync('data/tutorial/s0-tutorial.json', 'utf8')) as ScenarioDef],
  ...readdirSync('data/scenarios')
    .filter((f) => /^s\d+\.json$/.test(f))
    .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)))
    .map((f): [string, ScenarioDef] => [f.slice(0, -5), JSON.parse(readFileSync(`data/scenarios/${f}`, 'utf8')) as ScenarioDef]),
];

type Pt = { x: number; z: number };

/** How deep the segment a–b goes into the hex (0 when it only touches an edge or misses). */
function depthInHex(a: Pt, b: Pt, h: Hex): number {
  const c = hexToWorld(h[0], h[1]);
  const inradius = (Math.sqrt(3) / 2) * HEX_SIZE;
  const normals = [1, 3, 5].map((i) => ({ x: Math.cos((i * Math.PI) / 6), z: Math.sin((i * Math.PI) / 6) }));
  let deepest = 0;
  for (let i = 0; i <= 400; i++) {
    const x = a.x + ((b.x - a.x) * i) / 400 - c.x;
    const z = a.z + ((b.z - a.z) * i) / 400 - c.z;
    deepest = Math.max(deepest, inradius - Math.max(...normals.map((n) => Math.abs(x * n.x + z * n.z))));
  }
  return deepest;
}

const distToSeg = (p: Pt, a: Pt, b: Pt) => {
  if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-9) return Math.hypot(p.x - a.x, p.z - a.z);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.z - (a.z + (b.z - a.z) * t));
};

describe('dividers', () => {
  it('every location builds its walls between rooms from a kit piece that fits it', () => {
    const known = new Set(pieceIds());
    for (const env of ENVIRONMENTS) {
      const style = dividerFor(env, []);
      expect(known.has(DIVIDER_PIECES[style]), `${env.id}: ${style}`).toBe(true);
      // Masonry stays indoors; outdoors a fence, hedge, reeds or rock.
      if (['forest', 'shore', 'cliff'].includes(env.edge)) expect(['stone', 'brick'], env.id).not.toContain(style);
    }
    // An indoor room in an outdoor location (the mill hall) is walled off as indoors.
    expect(dividerFor({ id: 'flooded-mill', edge: 'shore', rooms: { 's3.mill-hall': { edge: 'timber' } } }, ['s3.sluice', 's3.mill-hall'])).toBe('planks');
    expect(dividerFor({ id: 'flooded-mill', edge: 'shore', rooms: { 's3.mill-hall': { edge: 'timber' } } }, ['s3.yard', 's3.sluice'])).toBe('reed-fence');
  });
});

describe('walls between rooms', () => {
  for (const [id, scenario] of MAPS) {
    describe(id, () => {
      const layout = buildLayout(scenario);
      const parts = scenarioPartitions(layout, scenario);
      const doors = scenario.rooms.flatMap((r) => (r.doors ?? []).map((d) => ({ key: hexKey(d.hex), hex: d.hex, rooms: [r.id, d.to] })));

      it('has no thin walls: rooms touch only at the doorway hexes that join them', () => {
        for (const room of scenario.rooms) expect(room.walls ?? [], room.id).toEqual([]);
        for (const [k, room] of layout.footprint)
          for (const n of neighbors(parseHexKey(k))) {
            const other = layout.footprint.get(hexKey(n));
            if (!other || other === room) continue;
            const joined = doors.some((d) => (d.key === k || d.key === hexKey(n)) && d.rooms.includes(room) && d.rooms.includes(other));
            expect(joined, `${k} (${room}) next to ${hexKey(n)} (${other})`).toBe(true);
          }
      });

      it('every wall is one straight segment and goes into no playable hex', () => {
        for (const p of parts) {
          expect(p.points, p.rooms.join('/')).toHaveLength(2);
          const [a, b] = p.points as [Pt, Pt];
          for (const k of layout.footprint.keys()) expect(depthInHex(a, b, parseHexKey(k)), `${p.rooms.join('/')} into ${k}`).toBeLessThan(0.03);
        }
        // Stretches of the same wall lie on one line.
        const byRooms = new Map<string, typeof parts>();
        for (const p of parts) byRooms.set(p.rooms.join('|'), [...(byRooms.get(p.rooms.join('|')) ?? []), p]);
        for (const list of byRooms.values()) {
          const [a, b] = list[0]!.points as [Pt, Pt];
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          for (const p of list) for (const q of p.points) expect(Math.abs(((q.x - a.x) * (b.z - a.z) - (q.z - a.z) * (b.x - a.x)) / len)).toBeLessThan(0.01);
        }
      });

      it('rooms that share open floor have a wall between them, through their doorway', () => {
        const rooms = scenario.rooms.map((r) => r.id);
        for (let i = 0; i < rooms.length; i++)
          for (let j = i + 1; j < rooms.length; j++) {
            const ha = scenario.rooms[i]!.hexes;
            const hb = scenario.rooms[j]!.hexes;
            if (Math.min(...ha.flatMap((a) => hb.map((b) => distance(a, b)))) > 3) continue;
            const wall = parts.filter((p) => p.rooms.includes(rooms[i]!) && p.rooms.includes(rooms[j]!));
            expect(wall.length, `${rooms[i]} / ${rooms[j]}`).toBeGreaterThan(0);
          }
        for (const d of doors) {
          const at = parts.filter((p) => p.door === d.key);
          expect(at.length, `doorway ${d.key}`).toBeGreaterThan(0);
          const c = hexToWorld(d.hex[0], d.hex[1]);
          for (const p of at) {
            const [a, b] = p.points as [Pt, Pt];
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            expect(Math.abs(((c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)) / len), `doorway ${d.key} on the line`).toBeLessThan(0.01);
          }
        }
      });

      it('each end meets the outer wall, another wall or a doorway: no gaps', () => {
        const runs = straightRuns(layout).map((r): [Pt, Pt] => [{ x: r.ax, z: r.az }, { x: r.bx, z: r.bz }]);
        for (const p of parts)
          for (const end of [0, 1] as const) {
            const e = p.points[end === 0 ? 0 : p.points.length - 1]!;
            if (!p.extended[end]) {
              // Stops at a doorway hex's edge.
              const near = doors.some((d) => Math.hypot(hexToWorld(d.hex[0], d.hex[1]).x - e.x, hexToWorld(d.hex[0], d.hex[1]).z - e.z) < HEX_SIZE + 0.01);
              expect(near, `${p.rooms.join('/')} end ${end}`).toBe(true);
              continue;
            }
            const others = parts.filter((q) => q !== p).map((q): [Pt, Pt] => [q.points[0]!, q.points[q.points.length - 1]!]);
            const gap = Math.min(...[...runs, ...others].map(([a, b]) => distToSeg(e, a, b)));
            expect(gap, `${p.rooms.join('/')} end ${end}`).toBeLessThan(0.02);
          }
      });
    });
  }
});
