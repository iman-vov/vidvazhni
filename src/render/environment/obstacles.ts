// Obstacle clusters: what stands on the scenario's obstacle hexes. Never one object in the middle
// of its hex: a few things of mixed sizes set down at random (a big barrel, a small crate, a stool
// knocked over), and where obstacle hexes touch, one set piece across them (a long table with
// stools, a pile of barrels, a cart, a fallen log between trees). Flat litter (chips, straw,
// pebbles, leaves) lies around on the floor and never covers a hex outline.
// It is a pure render mapping from the blocked hexes, seeded by the scenario id and the hex, so the
// same scenario always looks the same; nothing leaves its obstacle hexes but the litter.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ScenarioDef } from '../../rules/content';
import { hexKey, neighbors, parseHexKey, type HexKey } from '../../rules/hex';
import { hexToWorld, worldToHex } from '../hexLayout';
import { HEX_INNER, seededRandom } from './layout';
import { buildPiece, pieceMeta, type MaterialKey } from './pieces';
import type { EdgeStyle, EnvironmentDef, PropModelSpec } from './types';

export interface ClusterItem {
  piece: string;
  /** Position relative to the centre of the hex it belongs to; `y` is what it stands on. */
  x: number;
  y: number;
  z: number;
  rot: number;
  /** Size against the piece's nominal height (HEIGHT), and the height that gives. */
  scale: number;
  h: number;
  /** Lying on its side, leaning on an edge, or standing. */
  tip: 'none' | 'side' | 'lean';
  /** Lean angle and the direction it leans to (radians). */
  lean: number;
  leanDir: number;
}

export interface ClusterPlan {
  items: ClusterItem[];
  litter: ClusterItem[];
}

/** Nominal height of each piece in a cluster (1 = a hex's size; a figure is ≈ 1.3). */
export const HEIGHT: Record<string, number> = {
  barrel: 0.72,
  crate: 0.46,
  'crate-stack': 0.95,
  'crate-broken': 0.42,
  table: 0.58,
  'long-table': 0.6,
  stool: 0.38,
  sack: 0.42,
  sacks: 0.5,
  'keg-rack': 0.8,
  wagon: 0.72,
  'obstacle-tree': 1.7,
  boulder: 0.66,
  'snow-rock': 0.58,
  stalagmite: 1.1,
  pillar: 1.6,
  bunk: 0.62,
  'mine-support': 1.45,
  'mine-cart': 0.72,
  'rubble-heap': 0.5,
  'ore-pile': 0.42,
  'coal-pile': 0.35,
  rubble: 0.28,
  hut: 0.95,
  campfire: 0.5,
  anvil: 0.55,
  'quench-trough': 0.45,
  crystals: 0.5,
  stump: 0.36,
  fern: 0.4,
  mushrooms: 0.22,
  log: 0.3,
  'timber-stack': 0.42,
};

/** Footprint box [x0, x1, z0, z1] in the piece's own frame at its meta height, where it is not a
 *  circle of the meta radius. */
const FOOT: Record<string, [number, number, number, number]> = {
  'long-table': [-0.8, 0.8, -0.34, 0.34],
  wagon: [-1.2, 0.6, -0.7, 0.42],
  table: [-0.46, 0.46, -0.32, 0.32],
  log: [-0.68, 0.68, -0.19, 0.19],
  'timber-stack': [-0.5, 0.52, -0.24, 0.24],
  bunk: [-0.32, 0.32, -0.52, 0.5],
  'mine-support': [-0.5, 0.5, -0.12, 0.12],
  'keg-rack': [-0.48, 0.48, -0.62, 0.3],
  'mine-cart': [-0.46, 0.46, -0.34, 0.34],
  'crate-stack': [-0.3, 0.7, -0.3, 0.32],
  crate: [-0.3, 0.3, -0.3, 0.3],
  barrel: [-0.33, 0.33, -0.33, 0.33],
  stool: [-0.2, 0.2, -0.2, 0.2],
  sack: [-0.27, 0.27, -0.27, 0.27],
  pillar: [-0.31, 0.31, -0.31, 0.31],
  // Piles and plants by what really lies on the floor (their meta radius is generous).
  rubble: [-0.3, 0.3, -0.24, 0.24],
  'rubble-heap': [-0.45, 0.45, -0.4, 0.4],
  'ore-pile': [-0.36, 0.36, -0.3, 0.3],
  'coal-pile': [-0.4, 0.4, -0.32, 0.32],
  stalagmite: [-0.3, 0.3, -0.3, 0.3],
  crystals: [-0.28, 0.28, -0.28, 0.28],
  fern: [-0.25, 0.25, -0.25, 0.25],
  mushrooms: [-0.18, 0.18, -0.18, 0.18],
  stump: [-0.3, 0.3, -0.3, 0.3],
  // Trees by the trunk and roots (the crown hangs over), rocks by their body.
  'obstacle-tree': [-0.26, 0.26, -0.26, 0.26],
  boulder: [-0.42, 0.42, -0.38, 0.38],
  'snow-rock': [-0.4, 0.4, -0.36, 0.36],
};

interface Spec {
  p: string;
  /** Scale range (default ±15 % around 1). */
  s?: [number, number];
  /** Put it next to item i, or on top of item i. */
  near?: number;
  on?: number;
  tip?: 'side' | 'lean';
  /** Chance it is there at all. */
  chance?: number;
  /** Stays near its hex centre (a pillar, a pit prop): structure, not things set down. */
  centre?: boolean;
  /** Lies along the line between the hexes of a set piece. */
  along?: boolean;
}

const S = (p: string, o: Omit<Spec, 'p'> = {}): Spec => ({ p, ...o });
const SMALL: [number, number] = [0.6, 0.74];

/** Cluster recipes for one hex, by the piece the location stands on it; one is picked per hex. */
const SINGLE: Record<string, Spec[][]> = {
  barrel: [
    [S('barrel', { s: [1, 1.12] }), S('barrel', { s: [0.72, 0.84], near: 0 }), S('crate', { s: SMALL, near: 0 })],
    [S('barrel'), S('barrel', { near: 0, tip: 'side', s: [0.8, 0.9] }), S('sack', { near: 0 })],
    [S('barrel', { s: [1.02, 1.14] }), S('barrel', { s: [0.8, 0.9], near: 0, tip: 'lean' }), S('crate', { s: SMALL, near: 1 })],
  ],
  crate: [
    [S('crate', { s: [1.02, 1.16] }), S('crate', { s: SMALL, on: 0 }), S('barrel', { s: [0.74, 0.88], near: 0 })],
    [S('crate'), S('crate', { s: [0.68, 0.8], near: 0, tip: 'lean' }), S('sack', { near: 0 })],
  ],
  table: [[S('table'), S('stool', { near: 0 }), S('stool', { near: 0, tip: 'side' }), S('barrel', { s: [0.6, 0.7], near: 0, chance: 0.5 })]],
  'crate-stack': [[S('crate-stack'), S('barrel', { s: [0.78, 0.9], near: 0 }), S('sack', { near: 0 })]],
  sacks: [[S('sacks'), S('crate', { s: SMALL, near: 0 }), S('sack', { near: 0, tip: 'side' })]],
  sack: [[S('sacks'), S('sack', { near: 0 }), S('crate', { s: SMALL, near: 0 })]],
  'keg-rack': [[S('keg-rack'), S('barrel', { s: [0.78, 0.9], near: 0 }), S('stool', { near: 0 })]],
  'crate-broken': [[S('crate-broken'), S('crate', { s: [0.74, 0.88], near: 0 }), S('barrel', { s: [0.8, 0.9], near: 0, tip: 'side' })]],
  'quench-trough': [[S('quench-trough'), S('barrel', { s: [0.74, 0.86], near: 0 }), S('coal-pile', { s: SMALL, near: 0 })]],
  anvil: [[S('anvil'), S('crate', { s: SMALL, near: 0 }), S('ore-pile', { s: SMALL, near: 0 })]],
  'obstacle-tree': [
    [S('obstacle-tree'), S('stump', { near: 0 }), S('fern', { near: 0 }), S('mushrooms', { near: 0 }), S('fern', { s: SMALL, near: 1, chance: 0.6 })],
    [S('obstacle-tree'), S('boulder', { s: [0.42, 0.56], near: 0 }), S('fern', { near: 0 }), S('log', { s: [0.45, 0.55], near: 0 }), S('fern', { s: SMALL, near: 1, chance: 0.6 })],
  ],
  boulder: [[S('boulder', { s: [1.02, 1.16] }), S('boulder', { s: [0.55, 0.7], near: 0 }), S('boulder', { s: [0.3, 0.4], near: 0 })]],
  'snow-rock': [[S('snow-rock', { s: [1.02, 1.16] }), S('snow-rock', { s: [0.5, 0.66], near: 0 }), S('boulder', { s: [0.3, 0.4], near: 0 })]],
  stalagmite: [[S('stalagmite'), S('stalagmite', { s: [0.45, 0.6], near: 0 }), S('boulder', { s: [0.35, 0.45], near: 0 })]],
  pillar: [[S('pillar', { centre: true }), S('rubble', { s: [1.15, 1.4], near: 0 }), S('rubble', { s: [0.75, 0.9], near: 0 }), S('boulder', { s: [0.26, 0.34], near: 0, chance: 0.7 })]],
  // In a cave a standing stone grows out of rock: a stalagmite and broken rock at its foot.
  'pillar@cave': [[S('pillar', { centre: true }), S('rubble-heap', { s: [0.55, 0.68], near: 0 }), S('stalagmite', { s: [0.55, 0.7], near: 0 }), S('crystals', { s: [0.7, 0.9], near: 0 })]],
  'mine-support': [[S('mine-support', { centre: true }), S('timber-stack', { s: [0.68, 0.8], near: 0 }), S('ore-pile', { s: [0.8, 0.95], near: 0 }), S('rubble', { s: [1.1, 1.3], near: 0, chance: 0.7 })]],
  'mine-cart': [[S('mine-cart', { s: [1.08, 1.18] }), S('ore-pile', { s: [0.9, 1.02], near: 0 }), S('rubble-heap', { s: [0.5, 0.6], near: 0 }), S('crate', { s: SMALL, near: 0, tip: 'lean', chance: 0.7 })]],
  'rubble-heap': [[S('rubble-heap', { s: [1.02, 1.15] }), S('boulder', { s: [0.36, 0.46], near: 0 }), S('timber-stack', { s: [0.5, 0.6], near: 0, chance: 0.7 }), S('rubble', { s: [1, 1.25], near: 0 })]],
  'ore-pile': [[S('ore-pile', { s: [1.05, 1.15] }), S('ore-pile', { s: SMALL, near: 0 }), S('rubble', { near: 0 })]],
  'coal-pile': [[S('coal-pile', { s: [1.05, 1.15] }), S('coal-pile', { s: SMALL, near: 0 }), S('barrel', { s: [0.7, 0.8], near: 0 })]],
  bunk: [[S('bunk'), S('stool', { near: 0 }), S('sack', { near: 0, tip: 'side' })]],
  hut: [[S('hut', { centre: true }), S('timber-stack', { s: [0.55, 0.65], near: 0 }), S('barrel', { s: [0.7, 0.8], near: 0 })]],
  campfire: [[S('campfire', { centre: true }), S('log', { s: [0.5, 0.6], near: 0 }), S('stump', { s: [0.8, 0.9], near: 0 })]],
};

/** Set pieces across two touching obstacle hexes. */
const COMPOSITE: Record<string, Spec[]> = {
  'barrel-pile': [
    S('barrel', { s: [1, 1.1] }),
    S('barrel', { near: 0 }),
    S('barrel', { s: [0.86, 0.96], near: 1 }),
    S('barrel', { s: [0.82, 0.9], on: 0 }),
    S('barrel', { s: [0.85, 0.95], near: 2, tip: 'side' }),
    S('crate', { s: SMALL, near: 1, chance: 0.7 }),
  ],
  'long-table': [S('long-table', { along: true }), S('stool', { near: 0 }), S('stool', { near: 0 }), S('stool', { near: 0, tip: 'side' }), S('barrel', { s: [0.62, 0.72], near: 0, chance: 0.6 })],
  'crate-pile': [
    S('crate', { s: [1.08, 1.18] }),
    S('crate', { s: [0.62, 0.72], on: 0 }),
    S('crate', { near: 0 }),
    S('crate-broken', { near: 2 }),
    S('sacks', { near: 0 }),
    S('crate', { s: SMALL, near: 2, tip: 'lean' }),
  ],
  wagon: [S('wagon', { along: true }), S('sacks', { near: 0 }), S('barrel', { s: [0.8, 0.9], near: 0 }), S('crate', { s: SMALL, near: 0, chance: 0.7 })],
  'trees-log': [S('obstacle-tree'), S('obstacle-tree', { s: [0.8, 0.92], near: 0 }), S('log', { near: 0, s: [1, 1.1] }), S('fern', { near: 1 }), S('mushrooms', { near: 2 })],
  outcrop: [S('boulder', { s: [1.2, 1.3] }), S('boulder', { s: [0.85, 0.95], near: 0 }), S('boulder', { s: [0.55, 0.65], near: 1 }), S('boulder', { s: [0.32, 0.4], near: 0 }), S('boulder', { s: [0.28, 0.36], near: 2 })],
  yard: [S('hut', { centre: true }), S('wagon', { along: true }), S('timber-stack', { s: [0.55, 0.65], near: 0 }), S('barrel', { s: [0.72, 0.82], near: 1 }), S('sacks', { s: [0.7, 0.8], near: 1 })],
};

/** Which pieces may join a set piece with a neighbour, by family. */
const FAMILY: Record<string, string> = {
  barrel: 'goods',
  crate: 'goods',
  'crate-stack': 'goods',
  'crate-broken': 'goods',
  table: 'goods',
  sacks: 'goods',
  sack: 'goods',
  'keg-rack': 'goods',
  'obstacle-tree': 'tree',
  boulder: 'rock',
  'snow-rock': 'rock',
  stalagmite: 'rock',
  hut: 'hut',
};

/** Set pieces for goods by the location's look, and for the other families. */
const GOODS_SETS: Record<EdgeStyle, string[]> = {
  stone: ['barrel-pile', 'long-table', 'crate-pile'],
  tower: ['long-table', 'crate-pile', 'barrel-pile'],
  timber: ['wagon', 'barrel-pile', 'crate-pile'],
  shore: ['wagon', 'crate-pile'],
  forest: ['wagon', 'crate-pile'],
  cliff: ['wagon', 'crate-pile'],
  cave: ['crate-pile', 'barrel-pile'],
  mine: ['crate-pile', 'barrel-pile'],
  forge: ['crate-pile', 'barrel-pile'],
};
const FAMILY_SETS: Record<string, string[]> = { tree: ['trees-log'], rock: ['outcrop'], hut: ['yard'] };

/** Litter on the floor by location look, and what certain things add. */
const LITTER: Record<EdgeStyle, string[]> = {
  stone: ['chips', 'straw', 'splinters', 'broken-boards'],
  tower: ['chips', 'splinters', 'straw', 'pebbles'],
  timber: ['straw', 'grain', 'chips', 'splinters'],
  shore: ['straw', 'twigs', 'grain'],
  forest: ['leaves', 'twigs', 'pebbles'],
  cliff: ['pebbles', 'twigs', 'pebbles'],
  cave: ['pebbles', 'pebbles', 'ore-bits'],
  mine: ['pebbles', 'ore-bits', 'chips'],
  forge: ['coal-bits', 'pebbles', 'splinters'],
};
const LITTER_BY_PIECE: Record<string, string> = {
  sacks: 'grain',
  sack: 'grain',
  'crate-broken': 'broken-boards',
  'obstacle-tree': 'leaves',
  'ore-pile': 'ore-bits',
  'coal-pile': 'coal-bits',
  'rubble-heap': 'pebbles',
  rubble: 'pebbles',
  'timber-stack': 'chips',
  campfire: 'twigs',
};

/** Outward unit normals of a hex's six edges (the directions to its neighbours). */
const NORMALS = neighbors([0, 0]).map(([q, r]) => {
  const w = hexToWorld(q, r);
  const l = Math.hypot(w.x, w.z);
  return { x: w.x / l, z: w.z / l };
});

/** Distance from a world point to the outline of the hex it is in. */
export function edgeDistance(x: number, z: number): number {
  const [q, r] = worldToHex(x, z);
  const c = hexToWorld(q, r);
  let m = -Infinity;
  for (const n of NORMALS) m = Math.max(m, (x - c.x) * n.x + (z - c.z) * n.z);
  return HEX_INNER - m;
}

/** A placed item in world space while planning. */
interface Placed {
  spec: Spec;
  piece: string;
  x: number;
  z: number;
  y: number;
  rot: number;
  scale: number;
  tip: ClusterItem['tip'];
  lean: number;
  leanDir: number;
  /** Footprint box in its own frame (scaled, after a tip onto its side). */
  box: [number, number, number, number];
}

function footprint(piece: string, scale: number, tip: ClusterItem['tip']): [number, number, number, number] {
  const meta = pieceMeta(piece);
  const k = (HEIGHT[piece] ?? meta?.height ?? 1) / (meta?.height ?? 1);
  const r = meta?.radius ?? 0.4;
  const [x0, x1, z0, z1] = FOOT[piece] ?? [-r, r, -r, r];
  const s = k * scale;
  if (tip === 'side') {
    // Tipped over onto its side (about local X): its height now lies along Z, centred.
    const h = (HEIGHT[piece] ?? meta?.height ?? 1) * scale;
    const w = ((z1 - z0) * s) / 2;
    return [x0 * s, x1 * s, -Math.max(h / 2, w), Math.max(h / 2, w)];
  }
  return [x0 * s, x1 * s, z0 * s, z1 * s];
}

/** Corners and edge midpoints of a footprint, a little grown, in world space. */
function outline(p: Pick<Placed, 'x' | 'z' | 'rot' | 'box'>, grow: number): { x: number; z: number }[] {
  const [x0, x1, z0, z1] = p.box;
  const xs = [x0 - grow, (x0 + x1) / 2, x1 + grow];
  const zs = [z0 - grow, (z0 + z1) / 2, z1 + grow];
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const out: { x: number; z: number }[] = [];
  // three.js turns +X toward −Z for a positive Y rotation.
  for (const lx of xs) for (const lz of zs) out.push({ x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c });
  return out;
}

/** Whether two footprints overlap (separating axes on their boxes, shrunk by `slack`). */
function overlaps(a: Placed, b: Placed, slack: number): boolean {
  const corners = (p: Placed) => {
    const [x0, x1, z0, z1] = p.box;
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    return [
      [x0 + slack, z0 + slack],
      [x1 - slack, z0 + slack],
      [x1 - slack, z1 - slack],
      [x0 + slack, z1 - slack],
    ].map(([lx, lz]) => ({ x: p.x + lx! * c + lz! * s, z: p.z - lx! * s + lz! * c }));
  };
  const ca = corners(a);
  const cb = corners(b);
  for (const p of [a, b]) {
    for (const ax of [
      { x: Math.cos(p.rot), z: -Math.sin(p.rot) },
      { x: Math.sin(p.rot), z: Math.cos(p.rot) },
    ]) {
      const pa = ca.map((v) => v.x * ax.x + v.z * ax.z);
      const pb = cb.map((v) => v.x * ax.x + v.z * ax.z);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

/** Whether a world point lies inside an item's footprint. */
function inside(p: Placed, x: number, z: number, grow = 0): boolean {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const dx = x - p.x;
  const dz = z - p.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const [x0, x1, z0, z1] = p.box;
  return lx > x0 - grow && lx < x1 + grow && lz > z0 - grow && lz < z1 + grow;
}

/** Plans clusters for every obstacle hex the location can dress. `pieceAt` says which piece the
 *  location stands on an obstacle hex (its look). Keys are rules hex keys. */
export function planObstacles(scenario: ScenarioDef, def: Pick<EnvironmentDef, 'edge' | 'rooms'>, pieceAt: (model: string, k: HexKey) => string): Map<HexKey, ClusterPlan> {
  const plans = new Map<HexKey, ClusterPlan>();
  const playable = new Set<HexKey>();
  const blocked = new Set<HexKey>();
  const roomOf = new Map<HexKey, string>();
  const pieces = new Map<HexKey, string>();
  for (const room of scenario.rooms) {
    for (const h of room.hexes) playable.add(hexKey(h));
    for (const d of room.doors ?? []) blocked.add(hexKey(d.hex));
    for (const o of room.objects ?? []) blocked.add(hexKey(o.hex));
  }
  for (const room of scenario.rooms) {
    for (const o of room.obstacles ?? []) {
      const k = hexKey(o.hex);
      blocked.add(k);
      const piece = pieceAt(o.model ?? 'barrel', k);
      if (!SINGLE[piece]) continue;
      if ((room.objects ?? []).some((x) => hexKey(x.hex) === k) || (room.doors ?? []).some((d) => hexKey(d.hex) === k)) continue;
      pieces.set(k, piece);
      roomOf.set(k, room.id);
    }
  }
  // Pairs of touching obstacle hexes of one family in one room share a set piece.
  const keys = [...pieces.keys()].sort();
  const taken = new Set<HexKey>();
  const groups: HexKey[][] = [];
  for (const k of keys) {
    if (taken.has(k)) continue;
    taken.add(k);
    const fam = FAMILY[pieces.get(k)!];
    const mate = fam
      ? neighbors(parseHexKey(k))
          .map((n) => hexKey(n))
          .sort()
          .find((n) => !taken.has(n) && pieces.has(n) && roomOf.get(n) === roomOf.get(k) && FAMILY[pieces.get(n)!] === fam)
      : undefined;
    if (mate) taken.add(mate);
    groups.push(mate ? [k, mate] : [k]);
  }

  const usedSets: { set: string; x: number; z: number }[] = [];
  for (const group of groups) {
    const edge = def.rooms?.[roomOf.get(group[0]!)!]?.edge ?? def.edge;
    const rnd = seededRandom(`${scenario.id}:obstacles:${group.join('|')}`);
    const region = new Set(group);
    const centres = group.map((k) => {
      const [q, r] = parseHexKey(k);
      return hexToWorld(q, r);
    });
    let recipe: Spec[];
    if (group.length > 1) {
      const fam = FAMILY[pieces.get(group[0]!)!]!;
      const options = fam === 'goods' ? GOODS_SETS[edge] : FAMILY_SETS[fam]!;
      const mid = { x: (centres[0]!.x + centres[1]!.x) / 2, z: (centres[0]!.z + centres[1]!.z) / 2 };
      // Not the same set piece as one close by, when the location has another.
      const near = new Set(usedSets.filter((u) => Math.hypot(u.x - mid.x, u.z - mid.z) < 6).map((u) => u.set));
      const order = options.map((o) => ({ o, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.o);
      const set = order.find((o) => !near.has(o)) ?? order[0]!;
      usedSets.push({ set, ...mid });
      recipe = COMPOSITE[set]!;
    } else {
      const piece = pieces.get(group[0]!)!;
      const list = SINGLE[`${piece}@${edge}`] ?? SINGLE[piece]!;
      recipe = list[Math.floor(rnd() * list.length)]!;
    }
    const placed = placeRecipe(recipe, region, centres, rnd);
    const litter = placeLitter(placed, edge, playable, blocked, rnd);
    for (const k of group) plans.set(k, { items: [], litter: [] });
    const toHex = (p: Placed, list: 'items' | 'litter', home?: HexKey) => {
      const k = home ?? hexKey(worldToHex(p.x, p.z));
      const plan = plans.get(k) ?? plans.get(group[0]!)!;
      const key = plans.has(k) ? k : group[0]!;
      const [q, r] = parseHexKey(key);
      const c = hexToWorld(q, r);
      plan[list].push({ piece: p.piece, x: p.x - c.x, y: p.y, z: p.z - c.z, rot: p.rot, scale: p.scale, h: (HEIGHT[p.piece] ?? pieceMeta(p.piece)?.height ?? 1) * p.scale, tip: p.tip, lean: p.lean, leanDir: p.leanDir });
    };
    // A stacked item goes with the hex of the one it stands on.
    for (const p of placed) toHex(p, 'items', p.spec.on !== undefined ? hexKey(worldToHex(placed[p.spec.on]!.x, placed[p.spec.on]!.z)) : undefined);
    // Litter belongs to the nearest obstacle hex of the group (it may lie in a free hex beside it).
    for (const p of litter) {
      let best = group[0]!;
      let bd = Infinity;
      group.forEach((k, i) => {
        const d = Math.hypot(p.x - centres[i]!.x, p.z - centres[i]!.z);
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      toHex(p, 'litter', best);
    }
  }
  return plans;
}

function between(rnd: () => number, [a, b]: [number, number]): number {
  return a + (b - a) * rnd();
}

/** Places a recipe's items inside the region (a set of hex keys), never overlapping each other. */
function placeRecipe(recipe: Spec[], region: Set<HexKey>, centres: { x: number; z: number }[], rnd: () => number): Placed[] {
  const placed: Placed[] = [];
  const regionHas = (x: number, z: number) => region.has(hexKey(worldToHex(x, z)));
  const axis = centres.length > 1 ? Math.atan2(-(centres[1]!.z - centres[0]!.z), centres[1]!.x - centres[0]!.x) : rnd() * Math.PI * 2;
  const mid = centres.reduce((a, c) => ({ x: a.x + c.x / centres.length, z: a.z + c.z / centres.length }), { x: 0, z: 0 });
  for (const spec of recipe) {
    if (spec.chance !== undefined && rnd() > spec.chance) continue;
    const scale = between(rnd, spec.s ?? [0.87, 1.15]);
    const tip: ClusterItem['tip'] = spec.tip ?? 'none';
    const lean = tip === 'lean' ? between(rnd, [0.14, 0.26]) : 0;
    const leanDir = rnd() * Math.PI * 2;
    const box = footprint(spec.p, scale, tip);
    const h = (HEIGHT[spec.p] ?? pieceMeta(spec.p)?.height ?? 1) * scale;
    if (spec.on !== undefined) {
      const base = placed[placedIndex(placed, recipe, spec.on)];
      if (!base) continue;
      const top = base.tip === 'side' ? (base.box[1] - base.box[0]) * 0.95 : (HEIGHT[base.piece] ?? 0.5) * base.scale * 0.97;
      const a = rnd() * Math.PI * 2;
      const d = between(rnd, [0.03, 0.09]);
      placed.push({ spec, piece: spec.p, x: base.x + Math.cos(a) * d, z: base.z + Math.sin(a) * d, y: base.y + top, rot: base.rot + between(rnd, [-0.7, 0.7]), scale, tip, lean, leanDir, box });
      continue;
    }
    const target = spec.near !== undefined ? placed[placedIndex(placed, recipe, spec.near)] : undefined;
    let done: Placed | null = null;
    for (let attempt = 0; attempt < 140 && !done; attempt++) {
      const strict = attempt < 70;
      let x: number;
      let z: number;
      let rot = rnd() * Math.PI * 2;
      if (spec.along) {
        // Along the pair's line, a little off straight, anywhere along it.
        rot = axis + between(rnd, [-0.22, 0.22]) + (rnd() < 0.5 ? Math.PI : 0);
        const t = between(rnd, [-0.35, 0.35]);
        x = mid.x + (centres[1] ? (centres[1].x - centres[0]!.x) * t : 0) + between(rnd, [-0.12, 0.12]);
        z = mid.z + (centres[1] ? (centres[1].z - centres[0]!.z) * t : 0) + between(rnd, [-0.12, 0.12]);
      } else if (spec.centre) {
        const c = centres[Math.floor(rnd() * centres.length)]!;
        const a = rnd() * Math.PI * 2;
        const d = between(rnd, [0.1, 0.22]);
        x = c.x + Math.cos(a) * d;
        z = c.z + Math.sin(a) * d;
      } else if (target && (strict || attempt < 120)) {
        // Next to its target; after many misses, closer in or a little further out.
        const a = rnd() * Math.PI * 2;
        const rt = (target.box[1] - target.box[0] + target.box[3] - target.box[2]) / 4;
        const ri = (box[1] - box[0] + box[3] - box[2]) / 4;
        const d = (rt + ri) * between(rnd, strict ? [0.85, 1.12] : [0.65, 1.4]);
        x = target.x + Math.cos(a) * d;
        z = target.z + Math.sin(a) * d;
      } else {
        // Anywhere in the region; the first thing of a single hex sits off its centre.
        const c = centres[Math.floor(rnd() * centres.length)]!;
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * 0.55;
        x = c.x + Math.cos(a) * d;
        z = c.z + Math.sin(a) * d;
        if (!placed.length && centres.length === 1 && d < 0.12) continue;
      }
      const cand: Placed = { spec, piece: spec.p, x, z, y: 0, rot, scale, tip, lean, leanDir, box };
      if (!outline(cand, strict ? 0.04 : 0.02).every((v) => regionHas(v.x, v.z))) continue;
      if (placed.some((p) => p.y === 0 && overlaps(p, cand, strict ? 0.02 : 0.08))) continue;
      // Tall things toward the camera side of the cluster (+Z), so they hide no free hex behind.
      if (strict && h > 0.9 && !regionHas(x, z - 0.4)) continue;
      done = cand;
    }
    if (done) placed.push(done);
  }
  return placed;
}

/** Index in `placed` of the recipe's item i (items that were skipped are not in `placed`). */
function placedIndex(placed: Placed[], recipe: Spec[], i: number): number {
  return placed.findIndex((p) => p.spec === recipe[i]);
}

/** Flat litter around the placed items: on playable floor, clear of hex outlines and items. */
function placeLitter(placed: Placed[], edge: EdgeStyle, playable: Set<HexKey>, blocked: Set<HexKey>, rnd: () => number): Placed[] {
  const out: Placed[] = [];
  if (!placed.length) return out;
  const kinds = [...LITTER[edge]];
  for (const p of placed) {
    const extra = LITTER_BY_PIECE[p.piece];
    if (extra) kinds.push(extra, extra);
  }
  const count = 6 + Math.floor(rnd() * 3) + (placed.length > 4 ? 2 : 0);
  for (let i = 0, tries = 0; i < count && tries < 120; tries++) {
    const piece = kinds[Math.floor(rnd() * kinds.length)]!;
    const meta = pieceMeta(piece);
    const scale = between(rnd, piece === 'broken-boards' || piece === 'grain' ? [0.85, 1.1] : [1.1, 1.5]);
    const r = (meta?.radius ?? 0.2) * scale;
    const from = placed[Math.floor(rnd() * placed.length)]!;
    const a = rnd() * Math.PI * 2;
    const reach = (from.box[1] - from.box[0] + from.box[3] - from.box[2]) / 4;
    const d = reach + between(rnd, [0.02, 0.4]);
    const x = from.x + Math.cos(a) * d;
    const z = from.z + Math.sin(a) * d;
    const k = hexKey(worldToHex(x, z));
    if (!playable.has(k)) continue;
    // Free hexes get litter only near their rim, never under the middle where figures stand.
    if (!blocked.has(k)) {
      const [q, rr] = worldToHex(x, z);
      const c = hexToWorld(q, rr);
      if (Math.hypot(x - c.x, z - c.z) < 0.5) continue;
    }
    if (edgeDistance(x, z) < r + 0.03) continue;
    if (placed.some((p) => p.y === 0 && inside(p, x, z, -0.05))) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 0.3)) continue;
    out.push({ spec: { p: piece }, piece, x, z, y: 0, rot: rnd() * Math.PI * 2, scale, tip: 'none', lean: 0, leanDir: 0, box: [-r, r, -r, r] });
    i++;
  }
  return out;
}

// ─── Building ─────────────────────────────────────────────────────────────────

export interface ClusterContext {
  /** A piece in the location's colours on its own origin (one mesh per part). */
  makePiece(piece: string): THREE.Group | null;
  /** The prop model that shows a piece at a height, if the location has one. */
  propSpec(piece: string, height: number): Required<PropModelSpec> | null;
  /** Loads a prop model (normalised to its spec) or null. */
  loadProp(spec: Required<PropModelSpec>): Promise<THREE.Object3D | null>;
  /** A palette material for litter. */
  material(key: MaterialKey): THREE.Material;
  /** Contact shadow under an item of a footprint radius. */
  shadow(radius: number): THREE.Object3D | null;
  /** Geometry to dispose with the location. */
  track(g: THREE.BufferGeometry): void;
  /** Still the same build (a model that loads late is dropped otherwise). */
  alive(): boolean;
  litter: number;
  onChange(): void;
}

/**
 * The obstacle cluster of one hex, on the hex centre. Its root ignores the turn, scale and nudge
 * the tile layer gives single obstacles (`matrixAutoUpdate` off): everything is placed here.
 */
export function buildCluster(plan: ClusterPlan, ctx: ClusterContext): THREE.Group {
  const root = new THREE.Group();
  root.name = 'obstacle-cluster';
  root.matrixAutoUpdate = false;
  for (const it of plan.items) {
    const holder = new THREE.Group();
    holder.name = `cluster-item:${it.piece}:${it.tip}`;
    holder.position.set(it.x, it.y, it.z);
    holder.rotation.y = it.rot;
    const tilt = new THREE.Group();
    if (it.tip === 'side') tilt.rotation.x = Math.PI / 2;
    else if (it.tip === 'lean') tilt.rotation.set(Math.cos(it.leanDir) * it.lean, 0, Math.sin(it.leanDir) * it.lean);
    const body = new THREE.Group();
    tilt.add(body);
    holder.add(tilt);
    const placeholder = ctx.makePiece(it.piece);
    const meta = pieceMeta(it.piece);
    if (placeholder && meta) {
      placeholder.scale.setScalar(it.h / meta.height);
      body.add(placeholder);
    }
    settle(tilt, it.tip === 'side');
    if (it.y === 0) {
      const box = footprint(it.piece, it.scale, it.tip);
      const blob = ctx.shadow(Math.max(box[1] - box[0], box[3] - box[2]) / 2);
      if (blob) {
        blob.position.set(it.x, 0.004, it.z);
        root.add(blob);
      }
    }
    root.add(holder);
    const nominal = HEIGHT[it.piece] ?? meta?.height ?? 1;
    const spec = ctx.propSpec(it.piece, nominal);
    if (spec) {
      void ctx.loadProp({ ...spec, height: nominal }).then((model) => {
        if (!model || !ctx.alive() || !body.parent) return;
        const cast = firstMesh(body)?.castShadow ?? false;
        // A model wider than the piece's footprint (a long Meshy table) is shrunk to it, so it never
        // spills into a free hex.
        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        const [x0, x1, z0, z1] = footprint(it.piece, 1, 'none');
        const fx = x1 - x0;
        const fz = z1 - z0;
        const fit = Math.min(1, Math.max(fx, fz) / Math.max(size.x, size.z, 1e-3), Math.min(fx, fz) / Math.max(Math.min(size.x, size.z), 1e-3));
        model.scale.multiplyScalar(it.scale * fit);
        model.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            c.castShadow = cast;
            c.receiveShadow = true;
          }
        });
        body.clear();
        body.add(model);
        settle(tilt, it.tip === 'side');
        ctx.onChange();
      });
    }
  }
  const litter = buildLitter(plan.litter.slice(0, Math.round(plan.litter.length * ctx.litter)), ctx);
  if (litter) root.add(litter);
  root.updateMatrix();
  return root;
}

function firstMesh(o: THREE.Object3D): THREE.Mesh | undefined {
  let found: THREE.Mesh | undefined;
  o.traverse((c) => {
    if (!found && (c as THREE.Mesh).isMesh) found = c as THREE.Mesh;
  });
  return found;
}

/** Sets the tilted body down: its lowest point on what the holder stands on, and a body on its
 *  side centred over the holder. */
function settle(tilt: THREE.Object3D, centre: boolean): void {
  tilt.position.set(0, 0, 0);
  tilt.updateMatrix();
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  tilt.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(tilt.parent!.matrixWorld).invert();
  tilt.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    m.multiplyMatrices(inv, mesh.matrixWorld);
    box.union(g.boundingBox!.clone().applyMatrix4(m));
  });
  if (box.isEmpty()) return;
  tilt.position.y = -box.min.y;
  if (centre) {
    tilt.position.x = -(box.min.x + box.max.x) / 2;
    tilt.position.z = -(box.min.z + box.max.z) / 2;
  }
}

/** Litter of one hex merged into one mesh per material. */
function buildLitter(items: ClusterItem[], ctx: ClusterContext): THREE.Group | null {
  if (!items.length) return null;
  const byMat = new Map<MaterialKey, THREE.BufferGeometry[]>();
  const m = new THREE.Matrix4();
  for (const it of items) {
    const meta = pieceMeta(it.piece);
    if (!meta) continue;
    const place = new THREE.Matrix4().compose(new THREE.Vector3(it.x, 0, it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot), new THREE.Vector3(it.scale, 1, it.scale));
    for (const part of buildPiece(it.piece, { height: meta.height })) {
      if (typeof part.material !== 'string') continue;
      const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
      g.applyMatrix4(m.multiplyMatrices(place, part.matrix));
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      const list = byMat.get(part.material) ?? [];
      list.push(g);
      byMat.set(part.material, list);
    }
  }
  const group = new THREE.Group();
  group.name = 'obstacle-litter';
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list);
    for (const g of list) g.dispose();
    if (!merged) continue;
    merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(merged.getAttribute('position').count * 3).fill(1), 3));
    ctx.track(merged);
    const mesh = new THREE.Mesh(merged, ctx.material(mat));
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
