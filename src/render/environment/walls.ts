// Straight walls: the outline of footprint + ring runs along hex edges, so it zigzags. Walls follow
// it as long straight runs instead: each closed loop of the outline is simplified (Douglas–Peucker,
// doorway edges kept as they are), every run is pushed outward to its outermost outline vertex (so
// it never cuts into the ring where props stand) and the runs meet where their lines cross.

import type { EnvLayout } from './layout';

export interface WallRun {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Outward unit normal. */
  nx: number;
  nz: number;
  /** Indices into layout.edges that this run replaces, in order. */
  edges: number[];
  door: 'entrance' | 'exit' | null;
}

/** How far the zigzag may stray from a straight run (flat-top hex rows zigzag by ~0.87). */
const TOLERANCE = 0.9;

const key = (x: number, z: number) => `${Math.round(x * 100)},${Math.round(z * 100)}`;

/** The outline's closed loops as edge index lists, each edge's end being the next one's start. */
export function outlineLoops(layout: Pick<EnvLayout, 'edges'>): number[][] {
  const byStart = new Map<string, number[]>();
  layout.edges.forEach((e, i) => {
    const k = key(e.ax, e.az);
    const list = byStart.get(k);
    if (list) list.push(i);
    else byStart.set(k, [i]);
  });
  const used = new Set<number>();
  const loops: number[][] = [];
  for (let s = 0; s < layout.edges.length; s++) {
    if (used.has(s)) continue;
    const loop: number[] = [];
    let i: number | undefined = s;
    while (i !== undefined && !used.has(i)) {
      used.add(i);
      loop.push(i);
      const e: EnvLayout['edges'][number] = layout.edges[i]!;
      i = byStart.get(key(e.bx, e.bz))?.find((j) => !used.has(j));
    }
    loops.push(loop);
  }
  return loops;
}

function simplify(px: number[], pz: number[], from: number, to: number, keep: Set<number>): void {
  const ax = px[from]!;
  const az = pz[from]!;
  const dx = px[to]! - ax;
  const dz = pz[to]! - az;
  const len = Math.hypot(dx, dz) || 1;
  let worst = -1;
  let worstD = TOLERANCE;
  for (let i = from + 1; i < to; i++) {
    const d = Math.abs((px[i]! - ax) * dz - (pz[i]! - az) * dx) / len;
    if (d > worstD) {
      worstD = d;
      worst = i;
    }
  }
  if (worst < 0) return;
  keep.add(worst);
  simplify(px, pz, from, worst, keep);
  simplify(px, pz, worst, to, keep);
}

export function straightRuns(layout: Pick<EnvLayout, 'edges'>): WallRun[] {
  const runs: WallRun[] = [];
  for (const loop of outlineLoops(layout)) {
    const n = loop.length;
    if (n < 3) continue;
    const edges = loop.map((i) => layout.edges[i]!);
    // Vertex j is the start of edge j; the loop closes back to vertex 0 (index n).
    const px = [...edges.map((e) => e.ax), edges[0]!.ax];
    const pz = [...edges.map((e) => e.az), edges[0]!.az];
    const keep = new Set<number>();
    edges.forEach((e, j) => {
      if (e.door) {
        keep.add(j);
        keep.add(j + 1);
      }
    });
    if (!keep.size) {
      // Anchor an open loop at its first vertex and the vertex farthest from it.
      let far = 0;
      let farD = -1;
      for (let j = 0; j < n; j++) {
        const d = Math.hypot(px[j]! - px[0]!, pz[j]! - pz[0]!);
        if (d > farD) {
          farD = d;
          far = j;
        }
      }
      keep.add(0);
      keep.add(far);
    }
    // Rotate so the loop starts at a kept vertex, then simplify between kept vertices.
    const start = Math.min(...keep);
    const rx = [...px.slice(start, n), ...px.slice(0, start + 1)];
    const rz = [...pz.slice(start, n), ...pz.slice(0, start + 1)];
    const ri = [...loop.slice(start), ...loop.slice(0, start)];
    const fixed = [...keep].map((j) => (j - start + n) % n).sort((a, b) => a - b);
    fixed.push(n);
    const kept = new Set(fixed);
    for (let f = 0; f + 1 < fixed.length; f++) simplify(rx, rz, fixed[f]!, fixed[f + 1]!, kept);
    const ks = [...kept].sort((a, b) => a - b);

    // Each span between kept vertices becomes a line pushed out to its outermost vertex.
    const lines = ks.slice(0, -1).map((from, t) => {
      const to = ks[t + 1]!;
      const spanEdges = ri.slice(from, to);
      let mx = 0;
      let mz = 0;
      for (const i of spanEdges) {
        mx += layout.edges[i]!.nx;
        mz += layout.edges[i]!.nz;
      }
      let dx = rx[to]! - rx[from]!;
      let dz = rz[to]! - rz[from]!;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      let nx = -dz;
      let nz = dx;
      if (nx * mx + nz * mz < 0) {
        nx = -nx;
        nz = -nz;
      }
      let offset = 0;
      for (let j = from; j <= to; j++) offset = Math.max(offset, (rx[j]! - rx[from]!) * nx + (rz[j]! - rz[from]!) * nz);
      const door = spanEdges.length === 1 ? layout.edges[spanEdges[0]!]!.door : null;
      return { px: rx[from]! + nx * offset, pz: rz[from]! + nz * offset, dx, dz, nx, nz, edges: spanEdges, door };
    });
    const m = lines.length;
    const corner = (t: number) => {
      const a = lines[(t - 1 + m) % m]!;
      const b = lines[t]!;
      const cross = a.dx * b.dz - a.dz * b.dx;
      // Nearly in line: the next run starts where its own line begins.
      if (Math.abs(cross) < 0.2) return { x: b.px, z: b.pz };
      // a.p + a.d * s = b.p + b.d * u
      const s = ((b.px - a.px) * b.dz - (b.pz - a.pz) * b.dx) / cross;
      return { x: a.px + a.dx * s, z: a.pz + a.dz * s };
    };
    const points = lines.map((_, t) => corner(t));
    lines.forEach((l, t) => {
      const a = points[t]!;
      const b = points[(t + 1) % m]!;
      runs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, nx: l.nx, nz: l.nz, edges: l.edges, door: l.door });
    });
  }
  return runs;
}

export interface Partition {
  /** Polyline in world XZ, end to end: from the outer wall (or a doorway) to the outer wall. */
  points: { x: number; z: number }[];
  /** Rooms on either side (the partition shows once one of them is revealed). */
  rooms: string[];
  /** How many points at each end are the stretch across the ring to the outer wall (0 or 1). */
  extended: [boolean, boolean];
}

const HEX_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 3);

function hexCorners(c: { x: number; z: number }, size: number): { x: number; z: number }[] {
  return HEX_ANGLES.map((a) => ({ x: c.x + Math.cos(a) * size, z: c.z + Math.sin(a) * size }));
}

/**
 * The thin walls between rooms as continuous polylines: the shared hex edges chained end to end
 * (they follow the hex rows exactly, so no hex is cut), collinear edges merged into one straight
 * stretch, and each end that reaches the edge of the map carried straight on across the ring to
 * the outer wall, so a partition closes the room off completely except at its doors.
 */
export function partitions(
  layout: Pick<EnvLayout, 'edges' | 'footprint'>,
  walls: { a: [number, number]; b: [number, number]; rooms: string[] }[],
  centre: (q: number, r: number) => { x: number; z: number },
  hexAt: (x: number, z: number) => string,
  hexSize: number,
): Partition[] {
  type Seg = { p: { x: number; z: number }; q: { x: number; z: number }; rooms: string[] };
  const segs: Seg[] = [];
  for (const w of walls) {
    const ca = centre(w.a[0], w.a[1]);
    const cb = centre(w.b[0], w.b[1]);
    // The shared edge: the two corners of hex a nearest to hex b's centre.
    const corners = hexCorners(ca, hexSize).sort((u, v) => Math.hypot(u.x - cb.x, u.z - cb.z) - Math.hypot(v.x - cb.x, v.z - cb.z));
    segs.push({ p: corners[0]!, q: corners[1]!, rooms: w.rooms });
  }
  // Chain segments that share an end.
  const used = new Set<number>();
  const near = (u: { x: number; z: number }, v: { x: number; z: number }) => Math.hypot(u.x - v.x, u.z - v.z) < 0.02;
  const out: Partition[] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    const pts = [segs[s]!.p, segs[s]!.q];
    const rooms = new Set(segs[s]!.rooms);
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        if (used.has(i)) continue;
        const g = segs[i]!;
        const head = pts[0]!;
        const tail = pts[pts.length - 1]!;
        let added = true;
        if (near(g.p, tail)) pts.push(g.q);
        else if (near(g.q, tail)) pts.push(g.p);
        else if (near(g.p, head)) pts.unshift(g.q);
        else if (near(g.q, head)) pts.unshift(g.p);
        else added = false;
        if (added) {
          used.add(i);
          g.rooms.forEach((r) => rooms.add(r));
          grew = true;
        }
      }
    }
    out.push({ points: mergeCollinear(pts), rooms: [...rooms], extended: [false, false] });
  }
  // Carry ends that touch the map's edge (a corner shared with a hex off the footprint) on to the
  // outer wall, straight along the last stretch.
  const runs = straightRuns(layout).filter((r) => !r.door);
  // A corner on the map's edge: one of the three hexes meeting there is not playable.
  const offMap = (v: { x: number; z: number }) =>
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].some((i) => {
      const a = (i * Math.PI) / 6;
      return !layout.footprint.has(hexAt(v.x + Math.cos(a) * 0.3 * hexSize, v.z + Math.sin(a) * 0.3 * hexSize));
    });
  for (const part of out) {
    for (const end of [0, 1] as const) {
      const pts = part.points;
      const tip = end === 0 ? pts[0]! : pts[pts.length - 1]!;
      const prev = end === 0 ? pts[1]! : pts[pts.length - 2]!;
      if (!offMap(tip)) continue;
      let dx = tip.x - prev.x;
      let dz = tip.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      let best = Infinity;
      for (const r of runs) {
        const ex = r.bx - r.ax;
        const ez = r.bz - r.az;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((r.ax - tip.x) * ez - (r.az - tip.z) * ex) / den;
        const u = ((r.ax - tip.x) * dz - (r.az - tip.z) * dx) / den;
        if (t > 0.05 && t < 4 && u >= -0.05 && u <= 1.05) best = Math.min(best, t);
      }
      if (!Number.isFinite(best)) continue;
      const p = { x: tip.x + dx * best, z: tip.z + dz * best };
      if (end === 0) pts.unshift(p);
      else pts.push(p);
      part.extended[end] = true;
      part.points = mergeCollinear(pts);
    }
  }
  return out;
}

function mergeCollinear(pts: { x: number; z: number }[]): { x: number; z: number }[] {
  const out = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) > 1e-3) out.push(b);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}
