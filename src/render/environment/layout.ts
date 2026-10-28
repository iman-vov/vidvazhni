// Geometry of a scenario location, derived from the map alone (pure, no three.js): the playable
// footprint (every room's hexes, revealed or not), the non-playable ring of hexes around it where
// props stand, and the outline of footprint + ring as hex edges, which is where walls, thickets or
// rock close the map. Walls between the camera and the board are marked `front` (cut away low).

import type { ScenarioDef, SurfaceId, Terrain } from '../../rules/content';
import { hexKey, neighbors, parseHexKey, type Hex, type HexKey } from '../../rules/hex';
import { goalZone } from '../../rules/objectives';
import { HEX_SIZE, hexToWorld, worldToHex } from '../hexLayout';

/** Camera pitch of the board (boardCamera.ts): how far behind something its silhouette reaches. */
const CAMERA_PITCH = (55 * Math.PI) / 180;
/** Distance from a hex centre to the middle of its edge. */
export const HEX_INNER = (Math.sqrt(3) / 2) * HEX_SIZE;

export interface OutlineEdge {
  /** Ring hex inside the outline, outside hex beyond it. */
  inner: Hex;
  outer: Hex;
  /** Middle of the edge and its ends (world XZ); the outward unit normal. */
  x: number;
  z: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  nx: number;
  nz: number;
  /** Room of the playable hex nearest to this edge. */
  room: string;
  /** A tall piece here would stand between the camera and the board: build it low. */
  front: boolean;
  door: 'entrance' | 'exit' | null;
}

export interface OutlineCorner {
  x: number;
  z: number;
  /** Mean outward normal of the edges meeting here. */
  nx: number;
  nz: number;
  edges: number[];
}

export interface EnvLayout {
  scenarioId: string;
  /** Playable hex → its room. */
  footprint: Map<HexKey, string>;
  terrain: Map<HexKey, Terrain>;
  /** Non-playable hexes next to the footprint → room of a playable neighbour. */
  ring: Map<HexKey, string>;
  edges: OutlineEdge[];
  corners: OutlineCorner[];
  /** Footprint hex centres (world), for distance queries. */
  centres: { x: number; z: number; room: string }[];
  min: { x: number; z: number };
  max: { x: number; z: number };
  centre: { x: number; z: number };
  /** Ring hexes next to a doorway: kept clear of props. */
  clear: Set<HexKey>;
  /** Room → its own floor, for rooms floored unlike the location (planks in a storeroom). */
  floors: Map<string, SurfaceId>;
}

/** Floors of wood: no stone litter or stone decals on them. */
const WOOD_FLOORS: ReadonlySet<SurfaceId> = new Set(['planks', 'walkway']);

/** Whether a playable or ring hex lies on a room's wooden floor. */
export function onWoodFloor(layout: Pick<EnvLayout, 'footprint' | 'ring' | 'floors'>, k: HexKey): boolean {
  const room = layout.footprint.get(k) ?? layout.ring.get(k);
  const floor = room ? layout.floors.get(room) : undefined;
  return !!floor && WOOD_FLOORS.has(floor);
}

/** Angle (XZ, from +X toward +Z) of the direction to each neighbour, in neighbors() order. */
function neighbourAngles(): number[] {
  return neighbors([0, 0]).map(([q, r]) => {
    const w = hexToWorld(q, r);
    return Math.atan2(w.z, w.x);
  });
}
const ANGLES = neighbourAngles();

export function buildLayout(scenario: ScenarioDef): EnvLayout {
  const footprint = new Map<HexKey, string>();
  const terrain = new Map<HexKey, Terrain>();
  for (const room of scenario.rooms) {
    for (const h of room.hexes) footprint.set(hexKey(h), room.id);
    for (const t of room.terrain ?? []) terrain.set(hexKey(t.hex), t.terrain);
  }
  const ring = new Map<HexKey, string>();
  for (const [k, room] of footprint) {
    for (const n of neighbors(parseHexKey(k))) {
      const nk = hexKey(n);
      if (!footprint.has(nk) && !ring.has(nk)) ring.set(nk, room);
    }
  }
  const inside = (k: HexKey) => footprint.has(k) || ring.has(k);
  const centres = [...footprint].map(([k, room]) => {
    const [q, r] = parseHexKey(k);
    return { ...hexToWorld(q, r), room };
  });
  const min = { x: Infinity, z: Infinity };
  const max = { x: -Infinity, z: -Infinity };
  for (const c of centres) {
    min.x = Math.min(min.x, c.x);
    min.z = Math.min(min.z, c.z);
    max.x = Math.max(max.x, c.x);
    max.z = Math.max(max.z, c.z);
  }
  const layout: EnvLayout = {
    scenarioId: scenario.id,
    footprint,
    terrain,
    ring,
    edges: [],
    corners: [],
    centres,
    min,
    max,
    centre: { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2 },
    clear: new Set(),
    floors: new Map(scenario.rooms.flatMap((r) => (r.surface ? [[r.id, r.surface] as const] : []))),
  };

  // Outline: every edge between a ring hex and a hex outside both.
  const cornerIndex = new Map<string, number>();
  const cornerAt = (x: number, z: number, edge: number, nx: number, nz: number) => {
    const key = `${Math.round(x * 100)},${Math.round(z * 100)}`;
    let i = cornerIndex.get(key);
    if (i === undefined) {
      i = layout.corners.length;
      cornerIndex.set(key, i);
      layout.corners.push({ x, z, nx: 0, nz: 0, edges: [] });
    }
    const c = layout.corners[i]!;
    c.edges.push(edge);
    c.nx += nx;
    c.nz += nz;
  };
  const sortedRing = [...ring.keys()].sort();
  for (const k of sortedRing) {
    const hex = parseHexKey(k);
    const c = hexToWorld(hex[0], hex[1]);
    neighbors(hex).forEach((n, i) => {
      if (inside(hexKey(n))) return;
      const angle = ANGLES[i]!;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      const a = angle - Math.PI / 6;
      const b = angle + Math.PI / 6;
      const edge: OutlineEdge = {
        inner: hex,
        outer: n,
        x: c.x + nx * HEX_INNER,
        z: c.z + nz * HEX_INNER,
        ax: c.x + Math.cos(a) * HEX_SIZE,
        az: c.z + Math.sin(a) * HEX_SIZE,
        bx: c.x + Math.cos(b) * HEX_SIZE,
        bz: c.z + Math.sin(b) * HEX_SIZE,
        nx,
        nz,
        room: ring.get(k)!,
        front: false,
        door: null,
      };
      edge.front = nz > -0.9 && rayHitsFootprint(layout, edge.x, edge.z, 4.5, 0.3);
      const index = layout.edges.length;
      layout.edges.push(edge);
      cornerAt(edge.ax, edge.az, index, nx, nz);
      cornerAt(edge.bx, edge.bz, index, nx, nz);
    });
  }
  for (const c of layout.corners) {
    const len = Math.hypot(c.nx, c.nz) || 1;
    c.nx /= len;
    c.nz /= len;
  }

  // Doorways: the entrance by the start hexes, an exit by a reach-exit goal's hexes.
  const entrance = pickDoorEdge(layout, scenario.startHexes);
  if (entrance !== null) layout.edges[entrance]!.door = 'entrance';
  if (scenario.goal.type === 'reachExit') {
    const exit = pickDoorEdge(layout, goalZone(scenario), entrance);
    if (exit !== null) layout.edges[exit]!.door = 'exit';
  }
  for (const e of layout.edges) if (e.door) layout.clear.add(hexKey(e.inner));
  return layout;
}

/** Whether walking from (x, z) away from the camera (−Z) for `length` crosses a playable hex. */
export function rayHitsFootprint(layout: Pick<EnvLayout, 'footprint'>, x: number, z: number, length: number, halfWidth: number): boolean {
  for (let t = 0; t <= length; t += 0.25) {
    for (const dx of halfWidth > 0 ? [-halfWidth, 0, halfWidth] : [0]) {
      if (layout.footprint.has(hexKey(worldToHex(x + dx, z - t)))) return true;
    }
  }
  return false;
}

/** Whether a piece `height` tall at (x, z) would hide part of the playable board from the camera. */
export function hidesBoard(layout: Pick<EnvLayout, 'footprint'>, x: number, z: number, height: number, radius = 0.35): boolean {
  return rayHitsFootprint(layout, x, z, height / Math.tan(CAMERA_PITCH) + 0.5, radius);
}

/** The outline edge of a ring hex next to `hexes` that best suits a doorway: not cut away, facing
 *  away from the camera, nearest the middle of the group. */
function pickDoorEdge(layout: EnvLayout, hexes: Hex[], avoid: number | null = null): number | null {
  if (!hexes.length) return null;
  const keys = new Set(hexes.map((h) => hexKey(h)));
  const mid = hexes.map(([q, r]) => hexToWorld(q, r)).reduce((a, b) => ({ x: a.x + b.x / hexes.length, z: a.z + b.z / hexes.length }), { x: 0, z: 0 });
  let best: number | null = null;
  let bestScore = Infinity;
  layout.edges.forEach((e, i) => {
    if (i === avoid) return;
    if (!neighbors(e.inner).some((n) => keys.has(hexKey(n)))) return;
    const score = (e.front ? 10 : 0) + e.nz * 0.8 + Math.hypot(e.x - mid.x, e.z - mid.z) * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Distance from a point to the playable area (0 on a hex's rim, negative inside). */
export function distanceToFootprint(layout: Pick<EnvLayout, 'centres'>, x: number, z: number): number {
  let best = Infinity;
  for (const c of layout.centres) best = Math.min(best, (x - c.x) ** 2 + (z - c.z) ** 2);
  return Math.sqrt(best) - HEX_INNER;
}

/** Index into `centres` of the nearest playable hex and the distance to its centre. */
export function nearestCentre(layout: Pick<EnvLayout, 'centres'>, x: number, z: number): { index: number; d: number } {
  let index = 0;
  let best = Infinity;
  layout.centres.forEach((c, i) => {
    const d = (x - c.x) ** 2 + (z - c.z) ** 2;
    if (d < best) {
      best = d;
      index = i;
    }
  });
  return { index, d: Math.sqrt(best) };
}

/** Distance from a point to the nearest outline edge segment. */
export function distanceToOutline(layout: Pick<EnvLayout, 'edges'>, x: number, z: number): number {
  let best = Infinity;
  for (const e of layout.edges) {
    const dx = e.bx - e.ax;
    const dz = e.bz - e.az;
    const t = Math.max(0, Math.min(1, ((x - e.ax) * dx + (z - e.az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, (x - e.ax - dx * t) ** 2 + (z - e.az - dz * t) ** 2);
  }
  return Math.sqrt(best);
}

/** Small deterministic random generator (mulberry32), seeded from a string. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise in 0..1 (for water patches and colour variation). */
export function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * u;
  const b = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * u;
  return a + (b - a) * v;
}
