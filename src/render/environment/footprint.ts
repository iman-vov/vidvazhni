// Footprints of placed pieces, so nothing stands inside anything else: an oriented box on the floor
// per piece, measured from the piece's own geometry (a wine rack is a metre wide and a hand deep,
// not a circle of its "radius"), and the inner faces of the walls as planes nothing may cross.
// plan.ts places the dressing against this registry; tests audit every scenario with it; the
// small-things layer can ask it too. Prop models are fitted into their piece's box when shown.

import * as THREE from 'three';
import MODEL_BOUNDS from './modelBounds.json';
import { buildPiece, pieceMeta } from './pieces';
import type { Placement } from './plan';
import type { EnvironmentDef } from './types';

/** A box in a piece's own frame: [x0, x1, z0, z1] (+Z faces the board, the back is at z0). */
export type Box = [number, number, number, number];

/** An oriented box on the floor: centre of its frame, turn (three.js Y rotation) and extents. */
export interface Footprint {
  x: number;
  z: number;
  rot: number;
  box: Box;
}

/** A wall's inner face from a to b; n points out of the room (through the wall). Room dividers
 *  are two-sided: nothing may cross them either way. */
export interface WallSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  nx: number;
  nz: number;
  twoSided: boolean;
}

/** Pieces that belong against a wall: their back stands flush on the wall's inner face. */
export const WALL_BACKED: ReadonlySet<string> = new Set(['wine-rack', 'shelf', 'weapon-rack', 'keg-rack', 'banner', 'chain-hoist', 'bunk']);

/** Plants and soft growth: they may grow into each other (a fern in the moss), never into a crate. */
export const SOFT: ReadonlySet<string> = new Set(['fern', 'bush', 'reeds', 'lilies', 'mushrooms', 'glow-mushrooms', 'roots', 'thorn-bush', 'grass', 'flowers']);

const boxes = new Map<string, Box>();

/** Model id → [minX, maxX, minY, maxY, minZ, maxZ] (tools/model-bounds.mjs). */
const BOUNDS = MODEL_BOUNDS as Record<string, number[]>;

/**
 * The floor box of a piece at scale 1. Where the location shows the piece with a prop model, the
 * model's own box at its height (models stand centred on the origin, propModels.ts); else the
 * procedural parts' box (cached).
 */
export function pieceBox(id: string, def?: Pick<EnvironmentDef, 'propModels'> | null): Box {
  const entry = def?.propModels?.[id];
  const spec = typeof entry === 'string' ? { model: entry } : entry;
  const mb = spec ? BOUNDS[spec.model] : undefined;
  if (spec && mb) {
    const [x0, x1, y0, y1, z0, z1] = mb as [number, number, number, number, number, number];
    const k = (spec.height ?? pieceMeta(id)?.height ?? 1) / Math.max(1, spec.stack ?? 1) / Math.max(1e-6, y1 - y0);
    let w = ((x1 - x0) * k) / 2;
    let d = ((z1 - z0) * k) / 2;
    // A model turned a quarter (rotY 90 or 270) swaps its width and depth.
    if (Math.round((spec.rotY ?? 0) / 90) % 2) [w, d] = [d, w];
    return [-w, w, -d, d];
  }
  return proceduralBox(id);
}

function proceduralBox(id: string): Box {
  let b = boxes.get(id);
  if (b) return b;
  const meta = pieceMeta(id);
  const r = meta?.radius ?? 0.3;
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  for (const p of buildPiece(id, { height: meta?.height ?? 1 })) {
    const g = p.geometry;
    g.computeBoundingBox();
    part.copy(g.boundingBox!).applyMatrix4(p.matrix);
    // Flat shadow cards and decals on the floor take no room.
    if (!(p.material === 'shadow' && part.max.y - part.min.y < 0.02)) box.union(part);
    g.dispose();
  }
  b = box.isEmpty() ? [-r, r, -r, r] : [box.min.x, box.max.x, box.min.z, box.max.z];
  boxes.set(id, b);
  return b;
}

/** The footprint of a placement (its box scaled, stretched along X by `sx`, turned). */
export function placementFootprint(p: Pick<Placement, 'piece' | 'x' | 'z' | 'rot' | 'scale' | 'sx'>, def?: Pick<EnvironmentDef, 'propModels'> | null): Footprint {
  const [x0, x1, z0, z1] = pieceBox(p.piece, def);
  const s = p.scale;
  const sx = s * (p.sx ?? 1);
  return { x: p.x, z: p.z, rot: p.rot, box: [x0 * sx, x1 * sx, z0 * s, z1 * s] };
}

/** A round footprint (a small thing on the floor) as a box. */
export function circleFootprint(x: number, z: number, r: number): Footprint {
  return { x, z, rot: 0, box: [-r, r, -r, r] };
}

/** World corners of a footprint, each side shrunk by `shrink`. */
export function corners(f: Footprint, shrink = 0): { x: number; z: number }[] {
  const [x0, x1, z0, z1] = f.box;
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  return [
    [x0 + shrink, z0 + shrink],
    [x1 - shrink, z0 + shrink],
    [x1 - shrink, z1 - shrink],
    [x0 + shrink, z1 - shrink],
  ].map(([lx, lz]) => ({ x: f.x + lx! * c + lz! * s, z: f.z - lx! * s + lz! * c }));
}

/** Whether two footprints overlap by more than `tol` (separating axes on boxes shrunk by tol/2). */
export function overlaps(a: Footprint, b: Footprint, tol = 0): boolean {
  const ca = corners(a, tol / 2);
  const cb = corners(b, tol / 2);
  for (const f of [a, b]) {
    for (const ax of [
      { x: Math.cos(f.rot), z: -Math.sin(f.rot) },
      { x: Math.sin(f.rot), z: Math.cos(f.rot) },
    ]) {
      let amin = Infinity;
      let amax = -Infinity;
      let bmin = Infinity;
      let bmax = -Infinity;
      for (const v of ca) {
        const d = v.x * ax.x + v.z * ax.z;
        amin = Math.min(amin, d);
        amax = Math.max(amax, d);
      }
      for (const v of cb) {
        const d = v.x * ax.x + v.z * ax.z;
        bmin = Math.min(bmin, d);
        bmax = Math.max(bmax, d);
      }
      if (amax <= bmin || bmax <= amin) return false;
    }
  }
  return true;
}

/** Wall faces from the placed wall pieces (their inner face is their local z = 0, along X) and the
 *  room dividers (polylines). */
export function wallSegments(placements: readonly Placement[], partitions: readonly { x: number; z: number }[][] = []): WallSeg[] {
  const segs: WallSeg[] = [];
  for (const p of placements) {
    const kind = pieceMeta(p.piece)?.kind;
    if (kind !== 'wall' && kind !== 'doorway') continue;
    const half = 0.5 * (p.sx ?? 1.06) * p.scale;
    const dx = Math.cos(p.rot);
    const dz = -Math.sin(p.rot);
    segs.push({ ax: p.x - dx * half, az: p.z - dz * half, bx: p.x + dx * half, bz: p.z + dz * half, nx: -Math.sin(p.rot), nz: -Math.cos(p.rot), twoSided: false });
  }
  for (const line of partitions) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, nx: -(b.z - a.z) / len, nz: (b.x - a.x) / len, twoSided: true });
    }
  }
  return segs;
}

/**
 * Whether a footprint reaches through a wall face or comes closer to it than `margin`: a corner
 * past the face (or within the margin of it) beside the wall, while the piece stands on the room's
 * side. A divider counts from both sides.
 */
export function crossesWall(f: Footprint, segs: readonly WallSeg[], margin = 0): boolean {
  const cs = corners(f);
  for (const w of segs) {
    const lx = w.bx - w.ax;
    const lz = w.bz - w.az;
    const len = Math.hypot(lx, lz);
    if (len < 1e-6) continue;
    const ux = lx / len;
    const uz = lz / len;
    // Only a wall beside the piece: some corner projects onto its length.
    const along = cs.map((v) => (v.x - w.ax) * ux + (v.z - w.az) * uz);
    if (Math.max(...along) < 0.02 || Math.min(...along) > len - 0.02) continue;
    const side = cs.map((v) => (v.x - w.ax) * w.nx + (v.z - w.az) * w.nz);
    const centre = (f.x - w.ax) * w.nx + (f.z - w.az) * w.nz;
    if (w.twoSided) {
      const sign = centre >= 0 ? 1 : -1;
      if (side.some((d, i) => d * sign < margin && along[i]! > 0 && along[i]! < len)) return true;
      continue;
    }
    // Behind the wall altogether (a piece outside the map): not this wall's business.
    if (centre > 0.05) continue;
    if (side.some((d, i) => d > -margin && along[i]! > -0.02 && along[i]! < len + 0.02)) return true;
  }
  return false;
}

/** Everything that takes floor room, with the walls, for placing and for checking. */
export class FootprintRegistry {
  readonly items: { f: Footprint; piece: string }[] = [];
  constructor(readonly walls: WallSeg[] = []) {}

  add(f: Footprint, piece = ''): void {
    this.items.push({ f, piece });
  }

  /** Whether a footprint would overlap anything registered by more than `tol`; a plant (`piece`
   *  in SOFT) only counts the hard things. */
  hits(f: Footprint, tol = 0.02, piece = ''): boolean {
    const soft = SOFT.has(piece);
    return this.items.some((o) => !(soft && SOFT.has(o.piece)) && overlaps(o.f, f, tol));
  }

  /** Whether a footprint reaches through a wall or nearer to it than `margin`. */
  nearWall(f: Footprint, margin = 0.05): boolean {
    return crossesWall(f, this.walls, margin);
  }
}

/** Overlapping prop pairs and props through walls among placements (stacked pieces rest on the
 *  one below and are left out of the overlap count). */
export function auditPlacements(placements: readonly Placement[], partitions: readonly { x: number; z: number }[][] = [], tol = 0.04, def?: Pick<EnvironmentDef, 'propModels'> | null): { overlaps: string[]; walls: string[] } {
  const segs = wallSegments(placements, partitions);
  const props = placements.filter((p) => (p.band === 'ring' || p.band === 'feature' || p.band === 'corner') && pieceMeta(p.piece)?.kind !== 'wall');
  const out = { overlaps: [] as string[], walls: [] as string[] };
  const fps = props.map((p) => placementFootprint(p, def));
  props.forEach((p, i) => {
    if (p.band === 'ring' && crossesWall(fps[i]!, segs, -0.005)) out.walls.push(`${p.piece}@${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    if (p.y) return;
    for (let j = i + 1; j < props.length; j++) {
      const q = props[j]!;
      if (q.y || (p.band === 'corner' && q.band === 'corner') || (SOFT.has(p.piece) && SOFT.has(q.piece))) continue;
      if (overlaps(fps[i]!, fps[j]!, tol)) out.overlaps.push(`${p.piece}×${q.piece}@${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    }
  });
  return out;
}
