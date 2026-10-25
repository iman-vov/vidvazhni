// Natural forest edges and groves outdoors. planEnvironment closes a forest room with one thicket
// clump per outline edge and stands single trees beyond it, which reads as a bead chain of equal
// bushes and a fence of lollipops. This pass replaces those with a thicket that grows: masses of
// kit thickets, brush, brambles and thorn bushes of mixed size, lean and tint, ferns and tall grass
// in front, fallen logs and stumps, saplings behind, thicker and thinner stretches and gaps, and
// trees of several kinds (oak, birch, fir, a dead one; snowy firs on the pass) in irregular groves.
// Pure: layout + location + placements → placements. Its own pieces (`wild-*`, `brush`, `bramble`,
// `tall-grass`; id `<kind>#<variant>`) are built here with painted vertex colours (dark undersides,
// lit tops, a dab of colour per facet) on the location's palette materials.

import * as THREE from 'three';
import type { GraphicsQuality } from '../quality';
import { distanceToFootprint, hidesBoard, seededRandom, type EnvLayout } from './layout';
import { SWAY } from './life';
import { pieceMeta, type BuildOptions, type MaterialKey, type Part } from './pieces';
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
const VARIANTS = 5;

interface NaturalMeta {
  height: number;
  radius: number;
  sway?: number;
}
const META: Record<string, NaturalMeta> = {
  'wild-oak': { height: 3.1, radius: 1.0, sway: 0.008 },
  'wild-oak-warm': { height: 3.1, radius: 1.0, sway: 0.008 },
  'wild-birch': { height: 3.3, radius: 0.7, sway: 0.01 },
  'wild-fir': { height: 3.4, radius: 0.8, sway: 0.006 },
  'wild-fir-snow': { height: 3.2, radius: 0.8 },
  'wild-dead': { height: 2.8, radius: 0.8 },
  brush: { height: 0.75, radius: 0.5, sway: 0.03 },
  bramble: { height: 0.7, radius: 0.55, sway: 0.02 },
  'tall-grass': { height: 0.6, radius: 0.35, sway: 0.08 },
};
for (const [kind, m] of Object.entries(META)) {
  if (!m.sway) continue;
  for (let v = 0; v < VARIANTS; v++) SWAY[`${kind}#${v}`] = { amp: m.sway };
}

const kindOf = (piece: string) => piece.split('#')[0]!;

/** Height and footprint of a piece (this module's or pieces.ts'). */
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

const variant = (piece: string, rnd: () => number) => (META[piece] ? `${piece}#${Math.floor(rnd() * VARIANTS)}` : piece);

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

// ─── Pieces ────────────────────────────────────────────────────────────────

type V3 = [number, number, number];

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise3(x: number, y: number, z: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(x - i);
  const v = s(y - j);
  const w = s(z - k);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(i, j, k), hash3(i + 1, j, k), u), l(hash3(i, j + 1, k), hash3(i + 1, j + 1, k), u), v),
    l(l(hash3(i, j, k + 1), hash3(i + 1, j, k + 1), u), l(hash3(i, j + 1, k + 1), hash3(i + 1, j + 1, k + 1), u), v),
    w,
  );
}

/** Collects parts with painted vertex colours (the board multiplies its tints into them). */
class Painter {
  readonly parts: Part[] = [];
  constructor(private readonly rnd: () => number) {}

  private push(g: THREE.BufferGeometry, material: MaterialKey, shade: (cy: number, ny: number, i: number) => V3, detail: boolean): void {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.computeVertexNormals();
    const pos = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    const colors = new Float32Array(pos.count * 3);
    for (let f = 0; f < pos.count; f += 3) {
      // One colour per facet: a painted dab, lit on top and dark beneath.
      const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
      const ny = (nrm.getY(f) + nrm.getY(f + 1) + nrm.getY(f + 2)) / 3;
      const c = shade(cy, ny, f / 3);
      for (let v = 0; v < 3; v++) colors.set(c, (f + v) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push({ geometry: geo, material, matrix: new THREE.Matrix4(), detail });
  }

  /** A lumpy leaf mass (noise-displaced, flattened beneath), coloured light on top. */
  lump(material: MaterialKey, r: number, at: V3, scale: V3, opts: { top?: number; low?: number; jitter?: number; warm?: number; detail?: boolean } = {}): void {
    const g = new THREE.IcosahedronGeometry(r, r >= 0.3 ? 2 : 1);
    const p = g.getAttribute('position');
    const off = this.rnd() * 50;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const d = 1 + (noise3(v.x * 2.2 + off, v.y * 2.2, v.z * 2.2) - 0.5) * 0.55 + (noise3(v.x * 6 + off, v.y * 6, v.z * 6) - 0.5) * 0.16;
      v.multiplyScalar(r * d);
      if (v.y < 0) v.y *= 0.55;
      p.setXYZ(i, v.x * scale[0] + at[0], v.y * scale[1] + at[1], v.z * scale[2] + at[2]);
    }
    const lo = at[1] - r * scale[1] * 0.55;
    const hi = at[1] + r * scale[1];
    const top = opts.top ?? 1.18;
    const low = opts.low ?? 0.5;
    const jitter = opts.jitter ?? 0.12;
    const warm = opts.warm ?? 0.06;
    this.push(
      g,
      material,
      (cy, ny) => {
        const t = Math.min(1, Math.max(0, (cy - lo) / (hi - lo)));
        const light = Math.max(0, ny);
        const b = (low + (top - low) * (0.55 * t + 0.45 * light)) * (1 + (this.rnd() - 0.5) * jitter * 2);
        // Dabs: now and then a facet a shade yellower or redder, like a brush stroke.
        const dab = this.rnd();
        const hue = dab < 0.12 ? [1.12, 1.08, 0.8] : dab < 0.2 ? [1.1, 0.92, 0.88] : dab < 0.3 ? [0.9, 0.98, 1.04] : [1, 1, 1];
        const w = warm * (t - 0.4);
        return [b * (1 + w) * hue[0]!, b * hue[1]!, b * (1 - w * 1.4) * hue[2]!];
      },
      opts.detail ?? false,
    );
  }

  /** A tapering limb swept along points (trunks, branches, canes). */
  limb(material: MaterialKey, pts: V3[], r0: number, r1: number, radial: number, opts: { rings?: number; bands?: boolean; detail?: boolean } = {}): void {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const n = opts.rings ?? Math.max(2, pts.length * 2);
    const frames = curve.computeFrenetFrames(n, false);
    const verts: number[] = [];
    const ring: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const c = curve.getPointAt(t);
      const r = r0 + (r1 - r0) * t;
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        const wob = 1 + (hash3(i, k, r0 * 100) - 0.5) * 0.25;
        const N = frames.normals[i]!;
        const B = frames.binormals[i]!;
        verts.push(c.x + (Math.cos(a) * N.x + Math.sin(a) * B.x) * r * wob, c.y + (Math.cos(a) * N.y + Math.sin(a) * B.y) * r * wob, c.z + (Math.cos(a) * N.z + Math.sin(a) * B.z) * r * wob);
        ring.push(i);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < radial; k++) {
        const a = i * radial + k;
        const b = i * radial + ((k + 1) % radial);
        const c = (i + 1) * radial + k;
        const d = (i + 1) * radial + ((k + 1) % radial);
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    const marks = opts.bands ?? false;
    this.push(
      g,
      material,
      (cy, ny, f) => {
        const base = 0.62 + Math.min(1, cy / 1.6) * 0.38;
        const dab = 1 + (this.rnd() - 0.5) * 0.18;
        // Birch: dark slashes across the pale bark.
        const mark = marks && hash3(Math.floor(cy * 9), f % 3, 1) > 0.72 ? 0.35 : 1;
        const b = base * dab * mark * (0.85 + Math.max(0, ny) * 0.2);
        return [b, b, b];
      },
      opts.detail ?? false,
    );
  }

  /** One fir tier: a cone with a ragged, drooping rim; with snow, a crust on its upper facets. */
  tier(material: MaterialKey, r: number, h: number, at: V3, snow: boolean): void {
    const seg = 9 + Math.floor(this.rnd() * 3);
    const g = new THREE.ConeGeometry(r, h, seg, 2, true);
    const p = g.getAttribute('position');
    const off = this.rnd() * 10;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      const rim = y < -h / 2 + 1e-4;
      const mid = Math.abs(y) < 1e-4;
      if (rim || mid) {
        const a = Math.atan2(z, x);
        const k = Math.round(((a + Math.PI) / (Math.PI * 2)) * seg);
        const tip = k % 2 === 0;
        const s = (rim ? (tip ? 1.12 : 0.8) : 1) + (hash3(k, off, rim ? 1 : 2) - 0.5) * 0.25;
        x *= s;
        z *= s;
        if (rim) y -= (tip ? 0.16 : 0) * h + hash3(k, off, 3) * 0.08 * h;
      }
      p.setXYZ(i, x + at[0], y + h / 2 + at[1], z + at[2]);
    }
    const lo = at[1];
    const hi = at[1] + h;
    const shade = (cy: number, ny: number): V3 => {
      const t = Math.min(1, Math.max(0, (cy - lo) / (hi - lo)));
      const b = (0.48 + 0.6 * t * 0.6 + Math.max(0, ny) * 0.32) * (1 + (this.rnd() - 0.5) * 0.2);
      return [b * 0.96, b, b * 1.02];
    };
    if (snow) {
      const crust = g.clone();
      const cp = crust.getAttribute('position');
      for (let i = 0; i < cp.count; i++) cp.setY(i, cp.getY(i) + 0.035);
      const flat = crust.toNonIndexed();
      crust.dispose();
      flat.computeVertexNormals();
      const fp = flat.getAttribute('position');
      const fn = flat.getAttribute('normal');
      const keep: number[] = [];
      for (let f = 0; f < fp.count; f += 3) {
        const ny = (fn.getY(f) + fn.getY(f + 1) + fn.getY(f + 2)) / 3;
        const cy = (fp.getY(f) + fp.getY(f + 1) + fp.getY(f + 2)) / 3;
        if (ny > 0.45 && (cy - lo) / (hi - lo) > 0.25 && this.rnd() < 0.85) for (let v = 0; v < 3; v++) keep.push(fp.getX(f + v), fp.getY(f + v), fp.getZ(f + v));
      }
      flat.dispose();
      if (keep.length) {
        const s = new THREE.BufferGeometry();
        s.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
        this.push(s, 'snow', (_cy, ny) => {
          const b = 0.86 + ny * 0.16;
          return [b * 0.98, b, b * 1.04];
        }, false);
      }
    }
    this.push(g, material, shade, false);
  }

  /** A thin blade of grass bending outward. */
  blade(material: MaterialKey, at: V3, h: number, ang: number, bend: number, dry: number): void {
    const w = 0.05 + this.rnd() * 0.03;
    const g = new THREE.ConeGeometry(w, h, 3, 3, true);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + h / 2;
      const t = y / h;
      const dx = Math.cos(ang) * bend * t * t;
      const dz = Math.sin(ang) * bend * t * t;
      p.setXYZ(i, p.getX(i) + at[0] + dx, y + at[1], p.getZ(i) + at[2] + dz);
    }
    this.push(g, material, (cy) => {
      const t = Math.min(1, Math.max(0, cy / h));
      const b = 0.5 + t * 0.75;
      return [b * (1 + dry * t * 0.5), b * (1 + dry * t * 0.25), b * (1 - dry * t * 0.5)];
    }, false);
  }
}

/** Builds one of this module's pieces (`<kind>#<variant>`); empty for any other id. */
export function buildNatural(id: string, _o: BuildOptions): Part[] {
  const [kind, v = '0'] = id.split('#');
  if (!kind || !META[kind]) return [];
  const rnd = seededRandom(`natural:${id}`);
  const b = new Painter(rnd);
  const r = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  void v;
  switch (kind) {
    case 'wild-oak':
    case 'wild-oak-warm': {
      const warm = kind === 'wild-oak-warm';
      const h = r(2.7, 3.4);
      const lean: V3 = [r(-0.25, 0.25), 0, r(-0.25, 0.25)];
      const top: V3 = [lean[0], h * 0.58, lean[2]];
      b.limb('bark', [[0, -0.05, 0], [lean[0] * 0.2, h * 0.25, lean[2] * 0.2], [lean[0] * 0.6, h * 0.45, lean[2] * 0.6], top], 0.2, 0.09, 7);
      // Root flare.
      for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + r(-0.4, 0.4);
        b.limb('bark', [[0, 0.32, 0], [Math.cos(a) * 0.22, 0.08, Math.sin(a) * 0.22], [Math.cos(a) * 0.42, -0.02, Math.sin(a) * 0.42]], 0.09, 0.025, 5, { rings: 4, detail: true });
      }
      // Boughs into the crown.
      const boughs = 2 + Math.floor(rnd() * 2);
      const crown: V3[] = [];
      for (let k = 0; k < boughs; k++) {
        const a = (k / boughs) * Math.PI * 2 + r(-0.5, 0.5);
        const d = r(0.45, 0.75);
        const end: V3 = [top[0] + Math.cos(a) * d, h * r(0.66, 0.8), top[2] + Math.sin(a) * d];
        b.limb('bark', [[top[0] * 0.8, h * 0.48, top[2] * 0.8], [top[0] + Math.cos(a) * d * 0.5, h * 0.62, top[2] + Math.sin(a) * d * 0.5], end], 0.07, 0.03, 5, { rings: 4 });
        crown.push(end);
      }
      crown.push([top[0], h * 0.86, top[2]]);
      // Crown: big masses over the boughs, smaller ones around, some hanging lower.
      const mats: MaterialKey[] = warm ? ['leafWarm', 'leafWarm', 'leaf', 'leafDark'] : ['leaf', 'leaf', 'leafDark', 'leaf'];
      const n = 10 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) {
        const c = crown[k % crown.length]!;
        const rr = k < crown.length ? r(0.42, 0.56) : r(0.24, 0.4);
        const spread = k < crown.length ? 0.1 : 0.6;
        const at: V3 = [c[0] + r(-spread, spread), c[1] + r(-0.25, 0.2) - (k >= crown.length && rnd() < 0.3 ? 0.35 : 0), c[2] + r(-spread, spread)];
        const m = k < crown.length ? (warm && rnd() < 0.35 ? 'leaf' : mats[0]!) : mats[Math.floor(rnd() * mats.length)]!;
        b.lump(m, rr, at, [r(0.95, 1.25), r(0.72, 0.9), r(0.95, 1.25)], { warm: warm ? 0.12 : 0.06 });
      }
      break;
    }
    case 'wild-birch': {
      const h = r(2.9, 3.6);
      const stems = rnd() < 0.4 ? 2 : 1;
      for (let s = 0; s < stems; s++) {
        const a = rnd() * Math.PI * 2;
        const lx = Math.cos(a) * r(0.15, 0.45);
        const lz = Math.sin(a) * r(0.15, 0.45);
        const hh = h * (s ? 0.82 : 1);
        b.limb('cloth', [[s * 0.12, 0, 0], [lx * 0.3 + s * 0.12, hh * 0.35, lz * 0.3], [lx * 0.8, hh * 0.7, lz * 0.8], [lx, hh * 0.92, lz]], 0.085, 0.03, 6, { rings: 10, bands: true });
        // Small hanging masses of leaves up the stem, airy.
        const n = 4 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const t = 0.5 + (k / n) * 0.48;
          const ang = rnd() * Math.PI * 2;
          const d = r(0.18, 0.42) * (1.2 - t * 0.6);
          b.lump(rnd() < 0.3 ? 'leafWarm' : 'leaf', r(0.22, 0.34), [lx * t + Math.cos(ang) * d, hh * t + 0.1, lz * t + Math.sin(ang) * d], [1, r(1.1, 1.5), 1], { top: 1.28, low: 0.62, warm: 0.1 });
        }
      }
      break;
    }
    case 'wild-fir':
    case 'wild-fir-snow': {
      const snow = kind === 'wild-fir-snow';
      const h = r(2.8, 3.8);
      const w = r(0.75, 1.0);
      b.limb('bark', [[0, -0.05, 0], [0, h * 0.5, 0], [r(-0.05, 0.05), h * 0.95, r(-0.05, 0.05)]], 0.13, 0.03, 6, { rings: 4 });
      const tiers = 6 + Math.floor(rnd() * 3);
      let y = h * r(0.12, 0.2);
      for (let k = 0; k < tiers; k++) {
        const t = k / (tiers - 1);
        const rr = w * (1 - t * 0.82) * r(0.88, 1.12);
        const th = (h - y) * (k === tiers - 1 ? 1 : r(0.34, 0.46));
        const sway = (1 - t) * 0.06;
        b.tier(k % 3 === 1 ? 'leaf' : 'leafDark', rr, th, [r(-sway, sway), y, r(-sway, sway)], snow);
        y += th * r(0.42, 0.58);
        if (y > h * 0.92) break;
      }
      break;
    }
    case 'wild-dead': {
      const h = r(2.3, 3.0);
      const lean: V3 = [r(-0.35, 0.35), 0, r(-0.35, 0.35)];
      b.limb('bark', [[0, -0.05, 0], [lean[0] * 0.3, h * 0.4, lean[2] * 0.3], [lean[0], h, lean[2]]], 0.17, 0.035, 6, { rings: 6 });
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const t = r(0.4, 0.85);
        const a = rnd() * Math.PI * 2;
        const s: V3 = [lean[0] * t, h * t, lean[2] * t];
        const d = r(0.4, 0.8) * (1.1 - t * 0.5);
        b.limb('bark', [s, [s[0] + Math.cos(a) * d * 0.6, s[1] + d * 0.35, s[2] + Math.sin(a) * d * 0.6], [s[0] + Math.cos(a + 0.4) * d, s[1] + d * 0.75, s[2] + Math.sin(a + 0.4) * d]], 0.05, 0.012, 4, { rings: 4 });
      }
      for (let k = 0; k < 3; k++) b.lump('moss', r(0.1, 0.16), [r(-0.12, 0.12), r(0.1, 0.4), r(-0.12, 0.12)], [1.4, 0.6, 1.4], { detail: true });
      break;
    }
    case 'brush': {
      // An understory bush: a few uneven masses, one leaning out, twigs at the foot.
      const n = 3 + Math.floor(rnd() * 3);
      const mats: MaterialKey[] = ['leafDark', 'leaf', 'leafDark', 'leaf', rnd() < 0.4 ? 'leafWarm' : 'leafDark'];
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2;
        const d = k ? r(0.12, 0.36) : 0;
        const rr = k ? r(0.16, 0.27) : r(0.26, 0.34);
        b.lump(mats[(k + Math.floor(rnd() * 2)) % mats.length]!, rr, [Math.cos(a) * d, rr * r(0.7, 1.4), Math.sin(a) * d], [r(0.9, 1.3), r(0.8, 1.15), r(0.9, 1.3)], { warm: 0.1 });
      }
      for (let k = 0; k < 4; k++) {
        const a = rnd() * Math.PI * 2;
        b.limb('woodDark', [[0, 0, 0], [Math.cos(a) * 0.2, 0.18, Math.sin(a) * 0.2], [Math.cos(a) * 0.38, r(0.25, 0.4), Math.sin(a) * 0.38]], 0.02, 0.006, 3, { rings: 3, detail: true });
      }
      break;
    }
    case 'bramble': {
      // Arching thorny canes with sparse leaves and berries over a low dark mass.
      b.lump('leafDark', r(0.24, 0.3), [0, 0.14, 0], [1.5, 0.7, 1.3]);
      const n = 6 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r(-0.3, 0.3);
        const reach = r(0.35, 0.65);
        const up = r(0.4, 0.75);
        const pts: V3[] = [
          [Math.cos(a) * 0.05, 0.05, Math.sin(a) * 0.05],
          [Math.cos(a) * reach * 0.4, up, Math.sin(a) * reach * 0.4],
          [Math.cos(a) * reach * 0.85, up * 0.75, Math.sin(a) * reach * 0.85],
          [Math.cos(a) * reach, up * 0.3, Math.sin(a) * reach],
        ];
        b.limb('woodDark', pts, 0.022, 0.008, 4, { rings: 7 });
        const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
        for (let t = 0.2; t < 0.95; t += 0.16) {
          const c = curve.getPointAt(t);
          const g = new THREE.ConeGeometry(0.012, 0.06, 3).translate(0, 0.03, 0);
          g.rotateZ(r(-1.4, 1.4)).rotateX(r(-1.4, 1.4)).translate(c.x, c.y, c.z);
          b.parts.push({ geometry: g.toNonIndexed(), material: 'woodDark', matrix: new THREE.Matrix4(), detail: true });
          g.dispose();
          if (rnd() < 0.45) b.lump(rnd() < 0.7 ? 'leafDark' : 'leaf', r(0.06, 0.09), [c.x, c.y + 0.03, c.z], [1.4, 0.6, 1.4], { detail: true });
        }
        if (rnd() < 0.5) {
          const c = curve.getPointAt(r(0.5, 0.8));
          for (let q = 0; q < 3; q++) b.lump('berry', 0.03, [c.x + r(-0.04, 0.04), c.y - 0.03, c.z + r(-0.04, 0.04)], [1, 1, 1], { detail: true, top: 1.3, low: 0.6 });
        }
      }
      break;
    }
    case 'tall-grass': {
      const n = 18 + Math.floor(rnd() * 12);
      const dry = rnd() < 0.5 ? r(0.3, 0.7) : 0;
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * 0.22;
        b.blade(rnd() < 0.2 ? 'leafDark' : rnd() < 0.5 ? 'reed' : 'leaf', [Math.cos(a) * d, 0, Math.sin(a) * d], r(0.36, 0.72), a, r(0.08, 0.24), dry * r(0.6, 1.2));
      }
      break;
    }
  }
  return b.parts;
}
