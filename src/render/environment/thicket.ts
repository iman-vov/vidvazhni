// Natural forest edges and groves outdoors. planEnvironment closes a forest room with one thicket
// clump per outline edge and stands single trees beyond it, which reads as a bead chain of equal
// bushes and a fence of lollipops. This pass replaces those with a thicket that grows: masses of
// kit thickets, brush, brambles and thorn bushes of mixed size, lean and tint, ferns and tall grass
// in front, fallen logs and stumps, saplings behind, thicker and thinner stretches and gaps, and
// trees of several kinds (oak, birch, fir, a dead one; snowy firs on the pass) in irregular groves.
// Pure: layout + location + placements → placements. Placement is code; every plant it adds is a
// node of the Blender flora kit `env-flora` (oaks, birches, firs, a dead tree, bushes, brambles,
// tall grass), varied per placement by turn, size, lean and tint.

import type { GraphicsQuality } from '../quality';
import { distanceToFootprint, hidesBoard, seededRandom, type EnvLayout } from './layout';
import { SWAY } from './life';
import { pieceMeta } from './pieces';
import { styleOf, type Placement } from './plan';
import type { EnvironmentDef } from './types';

/** A placement with a colour of its own (multiplies the piece's colours). */
export interface TintedPlacement extends Placement {
  tint?: [number, number, number];
}

type W = [string, number][];

interface Flora {
  /** Trees beyond the edge and in groves. */
  trees: W;
  /** Big growth closing a forest edge. */
  mass: W;
  /** Low growth in front of the masses. */
  under: W;
  /** Edges between the camera and the board: nothing that hides a hex. */
  low: W;
  /** Under a grove's trees. */
  grove: W;
}

const FOREST: Flora = {
  trees: [['wild-oak-warm', 3], ['wild-oak', 2], ['wild-fir', 3], ['wild-birch', 2], ['wild-dead', 0.4]],
  mass: [['thicket', 2], ['thicket-thorn', 1.5], ['brush', 3.5], ['bramble', 3], ['thorn-bush', 1.5]],
  under: [['fern', 3], ['tall-grass', 3.5], ['grass', 1], ['mushrooms', 0.8], ['rock', 0.6], ['roots', 0.6], ['stump', 0.4]],
  low: [['tall-grass', 4], ['fern', 3], ['bramble', 2], ['brush', 0.5], ['log', 0.9], ['rock', 0.9], ['thicket-low', 0.5], ['stump', 0.4], ['grass', 1.2]],
  grove: [['brush', 2], ['fern', 2], ['tall-grass', 2], ['bramble', 1], ['stump', 0.4], ['log', 0.4]],
};

/** Trees per location (by id, else by edge style); locations not listed keep their trees. */
const TREES: Record<string, W> = {
  'thorn-path': FOREST.trees,
  'flooded-mill': [['wild-oak', 3], ['wild-birch', 2.5], ['wild-fir', 1], ['wild-dead', 0.3]],
  'mountain-pass': [['wild-fir-snow', 5], ['wild-fir', 1]],
};
const GROVE_FLOOR: Record<string, W> = {
  'thorn-path': FOREST.grove,
  'flooded-mill': [['tall-grass', 2], ['brush', 1]],
};

/** Pieces planEnvironment stands beyond the edge that this pass turns into groves. */
const TREE_PIECES = new Set(['tree', 'tree-green', 'pine', 'tree-far', 'snow-pine']);
/** Forest edge pieces this pass replaces. */
const EDGE_PIECES = new Set(['thicket', 'thicket-thorn', 'thicket-low']);
/** Kinds of growth this pass adds, drawn by nodes of the Blender flora kit `env-flora`
 *  (art/blender/env-kit/flora.py): each placement takes one of the kind's nodes. */
const FLORA: Record<string, string[]> = {
  'wild-oak-warm': ['oak-a', 'oak-b'],
  'wild-oak': ['oak-green-a', 'oak-green-b'],
  'wild-birch': ['birch-a', 'birch-b'],
  'wild-fir': ['fir-a', 'fir-b'],
  'wild-fir-snow': ['fir-snow-a', 'fir-snow-b'],
  'wild-dead': ['dead-a'],
  brush: ['brush-a', 'brush-b', 'brush-c', 'brush-d'],
  bramble: ['bramble-a', 'bramble-b', 'bramble-c'],
  'tall-grass': ['tall-grass-a', 'tall-grass-b', 'tall-grass-c', 'tall-grass-d'],
};

interface NaturalMeta {
  height: number;
  radius: number;
  sway?: number;
}
const META: Record<string, NaturalMeta> = {
  'wild-oak': { height: 3.1, radius: 1.0, sway: 0.008 },
  'wild-oak-warm': { height: 3.1, radius: 1.0, sway: 0.008 },
  'wild-birch': { height: 3.3, radius: 0.7, sway: 0.01 },
  'wild-fir': { height: 3.3, radius: 0.8, sway: 0.006 },
  'wild-fir-snow': { height: 3.2, radius: 0.8 },
  'wild-dead': { height: 2.7, radius: 0.8 },
  brush: { height: 0.75, radius: 0.5, sway: 0.03 },
  bramble: { height: 0.7, radius: 0.55, sway: 0.02 },
  'tall-grass': { height: 0.45, radius: 0.35, sway: 0.08 },
};
/** Kit node → its kind. */
const KIND = new Map<string, string>();
for (const [kind, nodes] of Object.entries(FLORA)) {
  for (const node of nodes) {
    KIND.set(node, kind);
    const sway = META[kind]?.sway;
    if (sway) SWAY[node] = { amp: sway };
  }
}

const kindOf = (piece: string) => KIND.get(piece) ?? piece;

/** Height and footprint of a piece (a flora node's kind, or pieces.ts'). */
function metaOf(piece: string): { height: number; radius: number } | undefined {
  return META[kindOf(piece)] ?? pieceMeta(piece);
}

function pick(list: W, rnd: () => number, maxHeight = Infinity): string | null {
  const ok = list.filter(([p]) => (metaOf(p)?.height ?? Infinity) <= maxHeight);
  const total = ok.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let r = rnd() * total;
  for (const [p, w] of ok) if ((r -= w) <= 0) return p;
  return ok[ok.length - 1]![0];
}

/** A kind's kit node for this placement (other pieces stay as they are). */
const variant = (piece: string, rnd: () => number) => {
  const nodes = FLORA[piece];
  return nodes ? nodes[Math.floor(rnd() * nodes.length)]! : piece;
};

/** Painted variation per placement: fresh, dry, shaded or plain. */
function tintFor(rnd: () => number, strength = 1): [number, number, number] {
  const looks: [number, number, number][] = [
    [0.96, 1.04, 0.92],
    [1.1, 1.02, 0.82],
    [0.8, 0.86, 0.9],
    [1, 1, 1],
    [1.04, 0.96, 0.9],
  ];
  const l = looks[Math.floor(rnd() * looks.length)]!;
  const k = 0.88 + rnd() * 0.22;
  return [1 + (l[0] * k - 1) * strength, 1 + (l[1] * k - 1) * strength, 1 + (l[2] * k - 1) * strength];
}

/** Smooth 2D value noise in 0..1 (thick and thin stretches along the edge). */
function noise2(x: number, z: number, seed: number): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}

/**
 * The location's placements with forest edges grown into a natural thicket and beyond-the-edge
 * trees gathered into groves of several kinds. Locations with neither keep their placements.
 */
export function naturalEdge(layout: EnvLayout, def: EnvironmentDef, quality: GraphicsQuality, placements: Placement[], partitions: { x: number; z: number }[][] = []): TintedPlacement[] {
  const forest = layout.edges.some((e) => styleOf(def, e.room) === 'forest');
  const trees = TREES[def.id] ?? (forest ? FOREST.trees : null);
  if (!forest && !trees) return placements;
  const rnd = seededRandom(`thicket:${def.id}:${layout.scenarioId}`);
  const seed = rnd() * 100;
  const share = quality === 'low' ? 0.6 : quality === 'medium' ? 0.85 : 1;

  const out: TintedPlacement[] = [];
  const solid: { x: number; z: number; r: number }[] = [];
  for (const p of placements) {
    if (forest && p.band === 'edge' && EDGE_PIECES.has(p.piece)) continue;
    out.push(p);
    if (p.band !== 'outside' && p.band !== 'far') solid.push({ x: p.x, z: p.z, r: (metaOf(p.piece)?.radius ?? 0.3) * p.scale });
  }
  // The dividers between rooms stay in view: nothing big stands on their ends.
  const keep: { x: number; z: number }[] = [];
  for (const line of partitions) for (const pt of line) if (distanceToFootprint(layout, pt.x, pt.z) > -0.4) keep.push(pt);
  const doors = layout.edges.filter((e) => e.door);
  const nearDoor = (x: number, z: number) => doors.some((d) => Math.hypot(d.x - x, d.z - z) < 1.15);
  const nearDivider = (x: number, z: number, r: number) => keep.some((k) => Math.hypot(k.x - x, k.z - z) < r + 0.35);
  const clear = (x: number, z: number, r: number, k = 0.7) => solid.every((s) => Math.hypot(s.x - x, s.z - z) >= (s.r + r) * k);

  if (forest) {
    const put = (p: TintedPlacement) => out.push(p);
    layout.edges.forEach((e) => {
      if (e.door || styleOf(def, e.room) !== 'forest') return;
      const len = Math.hypot(e.bx - e.ax, e.bz - e.az) || 1;
      const tx = (e.bx - e.ax) / len;
      const tz = (e.bz - e.az) / len;
      const dens = noise2(e.x * 0.42, e.z * 0.42, seed);
      const at = (along: number, outward: number) => ({ x: e.x + tx * along + e.nx * outward, z: e.z + tz * along + e.nz * outward });
      const inward = Math.atan2(-e.nx, -e.nz);
      const door = nearDoor(e.x, e.z);

      const grow = (list: W, along: number, outward: number, maxH: number, scaleLo: number, scaleHi: number, opts: { k?: number; align?: boolean } = {}) => {
        const { x, z } = at(along, outward);
        let piece = pick(list, rnd, maxH);
        if (!piece) return;
        let scale = scaleLo + rnd() * (scaleHi - scaleLo);
        let meta = metaOf(piece)!;
        if (hidesBoard(layout, x, z, meta.height * scale, meta.radius * scale * 0.5)) {
          piece = pick(FOREST.low, rnd, 0.62);
          if (!piece) return;
          meta = metaOf(piece)!;
          scale = 0.75 + rnd() * 0.4;
        }
        if (nearDivider(x, z, meta.radius * scale * (meta.height > 0.6 ? 0.8 : 0.3))) return;
        if (!clear(x, z, meta.radius * scale, opts.k ?? 0.7)) return;
        const kind = piece;
        const thicket = kind.startsWith('thicket');
        const log = kind === 'log';
        put({
          piece: variant(kind, rnd),
          x,
          z,
          rot: log ? Math.atan2(tx, tz) + Math.PI / 2 + (rnd() - 0.5) * 0.5 : thicket ? inward + (rnd() - 0.5) * 1.1 : rnd() * Math.PI * 2,
          scale,
          sx: thicket ? 0.7 + rnd() * 0.6 : undefined,
          tilt: log ? undefined : [(rnd() - 0.5) * 0.22, (rnd() - 0.5) * 0.22],
          height: meta.height,
          room: e.room,
          band: 'edge',
          tint: tintFor(rnd),
        });
      };

      if (e.front || door) {
        // Low growth with gaps: the board stays in view.
        if (rnd() < 0.22 * (1 - dens) + (door ? 0.25 : 0)) return;
        const clumps = 1 + (rnd() < 0.3 + dens * 0.4 ? 1 : 0);
        for (let c = 0; c < clumps; c++) {
          const along = (rnd() - 0.5) * 1.1;
          const outward = -0.1 + rnd() * rnd() * 1.4;
          const n = 2 + Math.floor(rnd() * (1.5 + dens * 2) * share);
          for (let k = 0; k < n; k++) grow(FOREST.low, along + (rnd() - 0.5) * 0.6, outward + (rnd() - 0.5) * 0.4, door ? 0.45 : 0.8, 0.55, 1.0, { k: 0.35 });
        }
        return;
      }
      // Masses: one to three, of mixed size, straying in and out; more where the stretch is thick.
      const masses = 1 + (rnd() < dens ? 1 : 0) + (rnd() < 0.2 + dens * 0.25 ? 1 : 0);
      for (let k = 0; k < masses; k++) {
        const big = rnd() < 0.35 + dens * 0.3;
        grow(FOREST.mass, (rnd() - 0.5) * 1.3, 0.15 + rnd() * (big ? 0.9 : 0.5), Infinity, big ? 1.05 : 0.65, big ? 1.5 : 1.05, { k: 0.45 });
      }
      // Low growth in front of them.
      const under = Math.floor(rnd() * 3.2 * share);
      for (let k = 0; k < under; k++) grow(FOREST.under, (rnd() - 0.5) * 1.3, -0.3 + rnd() * 0.45, 0.62, 0.65, 1.3, { k: 0.4 });
      // Saplings and young trees behind.
      if (rnd() < (0.18 + 0.35 * dens) * share) {
        const { x, z } = at((rnd() - 0.5) * 0.9, 1.0 + rnd() * 0.9);
        const tree = pick(trees ?? FOREST.trees, rnd)!;
        const scale = 0.42 + rnd() * 0.35;
        const m = META[tree]!;
        if (!hidesBoard(layout, x, z, m.height * scale, m.radius * scale * 0.5) && !nearDivider(x, z, 0.4) && clear(x, z, m.radius * scale, 0.6)) {
          put({ piece: variant(tree, rnd), x, z, rot: rnd() * Math.PI * 2, scale, tilt: [(rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12], height: m.height, room: e.room, band: 'edge', tint: tintFor(rnd, 0.7) });
        }
      }
    });
  }

  if (!trees) return out;
  // Groves: the lone trees beyond the edge become groups of mixed kinds and sizes, with clearings.
  const floor = GROVE_FLOOR[def.id] ?? null;
  const standing: { x: number; z: number; r: number }[] = [];
  const result: TintedPlacement[] = [];
  const free = (x: number, z: number, r: number) => standing.every((s) => Math.hypot(s.x - x, s.z - z) >= (s.r + r) * 0.62);
  const plantTree = (x: number, z: number, scale: number, band: Placement['band'], kind: string) => {
    const m = META[kind]!;
    if (!free(x, z, m.radius * scale)) return false;
    if (band !== 'far' && hidesBoard(layout, x, z, m.height * scale, m.radius * scale * 0.5)) return false;
    standing.push({ x, z, r: m.radius * scale });
    const lean = kind === 'wild-dead' || kind === 'wild-birch' ? 0.16 : 0.07;
    result.push({ piece: variant(kind, rnd), x, z, rot: rnd() * Math.PI * 2, scale, tilt: [(rnd() - 0.5) * lean, (rnd() - 0.5) * lean], height: m.height, room: null, band, tint: tintFor(rnd, 0.8) });
    return true;
  };
  for (const p of out) {
    const beyond = p.band === 'outside' || p.band === 'far';
    if (beyond && floor && !TREE_PIECES.has(p.piece) && p.piece !== 'bush' && !META[kindOf(p.piece)]) {
      // Low growth beyond the edge stood on a grid: fewer spots, each a little clump.
      if (rnd() < 0.45) continue;
      result.push({ ...p, tint: tintFor(rnd) });
      const n = Math.floor(rnd() * 3 * share);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2;
        const d = 0.3 + rnd() * 0.45;
        const x = p.x + Math.cos(a) * d;
        const z = p.z + Math.sin(a) * d;
        const piece = pick(floor, rnd, 0.8)!;
        const meta = metaOf(piece)!;
        if (hidesBoard(layout, x, z, meta.height, meta.radius * 0.5) || distanceToFootprint(layout, x, z) < 1.6) continue;
        result.push({ piece: variant(piece, rnd), x, z, rot: rnd() * Math.PI * 2, scale: 0.6 + rnd() * 0.5, height: meta.height, room: null, band: 'outside', tint: tintFor(rnd) });
      }
      continue;
    }
    if (!beyond || !(TREE_PIECES.has(p.piece) || p.piece === 'bush')) {
      result.push(p);
      continue;
    }
    if (p.piece === 'bush') {
      if (floor) result.push({ ...p, piece: variant('brush', rnd), scale: 0.8 + rnd() * 0.6, tint: tintFor(rnd) });
      continue;
    }
    const far = p.band === 'far';
    if (rnd() < (far ? 0.15 : 0.28)) continue; // a clearing
    const kind = pick(trees, rnd)!;
    const scale = far ? 1.1 + rnd() * 0.5 : 0.7 + rnd() * 0.6;
    if (!plantTree(p.x, p.z, scale, p.band, kind)) continue;
    // Companions: younger trees of the same or another kind close by.
    const n = rnd() < 0.62 ? 1 + Math.floor(rnd() * 3) : 0;
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const d = (0.9 + rnd() * 0.9) * scale;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      if (distanceToFootprint(layout, x, z) < 1.7) continue;
      plantTree(x, z, scale * (0.55 + rnd() * 0.45), p.band, rnd() < 0.55 ? kind : pick(trees, rnd)!);
    }
    // Growth under the trees.
    if (!floor || far) continue;
    const m = Math.floor(rnd() * 3 * share);
    for (let k = 0; k < m; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.4 + rnd() * 0.9;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      const piece = pick(floor, rnd)!;
      const meta = metaOf(piece)!;
      if (hidesBoard(layout, x, z, meta.height, meta.radius * 0.5)) continue;
      result.push({ piece: variant(piece, rnd), x, z, rot: rnd() * Math.PI * 2, scale: 0.7 + rnd() * 0.5, height: meta.height, room: null, band: 'outside', tint: tintFor(rnd) });
    }
  }
  return result;
}
