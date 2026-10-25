// Straight walls: the outline of footprint + ring runs along hex edges, so it zigzags. Walls follow
// it as long straight runs instead: each closed loop of the outline is simplified (Douglas–Peucker,
// doorway edges kept as they are), every run is pushed outward to its outermost outline vertex (so
// it never cuts into the ring where props stand) and the runs meet where their lines cross.

import { distance, hexKey, parseHexKey } from '../../rules/hex';
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
  /** A straight stretch in world XZ, end to end: from the outer wall (another wall, or a doorway)
   *  to the outer wall (another wall, or a doorway). */
  points: { x: number; z: number }[];
  /** Rooms on either side (the partition shows once one of them is revealed). */
  rooms: string[];
  /** Whether each end reaches the outer wall or another partition (not a doorway). */
  extended: [boolean, boolean];
  /** The doorway hex at one of this stretch's ends, standing in the wall's line. */
  door?: string;
}

type Pt = { x: number; z: number };

const HEX_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 3);

function hexCorners(c: Pt, size: number): Pt[] {
  return HEX_ANGLES.map((a) => ({ x: c.x + Math.cos(a) * size, z: c.z + Math.sin(a) * size }));
}

/** How close (in hex sizes) a wall may come to a hex: touching its edge is fine, entering is not. */
const EPS = 0.02;
/** Rooms this close (in hexes) share open floor, so a wall has to stand between them. */
const CONTACT = 3;

/** A wall's line: through `p`, along unit `d`, `n` its normal; `o` = n·p. */
interface Line {
  d: Pt;
  n: Pt;
  o: number;
  p: Pt;
  rooms: Set<string>;
  doors: Set<string>;
  /** End points as distances along `d` from `p`. */
  t0: number;
  t1: number;
  margin: number;
}

/**
 * The walls between rooms, as in Jaws of the Lion: each one straight line across the hex rows from
 * outer wall to outer wall (or to another such wall), through the doorway hex that joins the rooms.
 * The map leaves the hexes the line would cut out of the rooms (scenario data), so no playable hex
 * is cut; a wall that cannot be laid without cutting one is not built (tests catch that).
 * Every pair of rooms that share open floor (hexes within CONTACT) gets one, so no room opens onto
 * another but at its doors. Walls that fall on the same line are one wall with several doorways.
 */
export function roomWalls(
  layout: Pick<EnvLayout, 'edges' | 'footprint'>,
  doors: { hex: [number, number]; room: string; to: string }[],
  centre: (q: number, r: number) => Pt,
  hexSize: number,
): Partition[] {
  const byRoom = new Map<string, [number, number][]>();
  for (const [k, room] of layout.footprint) {
    const list = byRoom.get(room) ?? [];
    list.push(parseHexKey(k));
    byRoom.set(room, list);
  }
  const corners = new Map<string, Pt[]>();
  for (const k of layout.footprint.keys()) {
    const [q, r] = parseHexKey(k);
    corners.set(k, hexCorners(centre(q, r), hexSize));
  }
  const doorKeys = new Set(doors.map((d) => hexKey(d.hex)));
  const rooms = [...byRoom.keys()].sort();
  const pairs: { a: string; b: string; door: { hex: [number, number] } | null; near: [Pt, Pt] }[] = [];
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]!;
      const b = rooms[j]!;
      let best = Infinity;
      let near: [Pt, Pt] | null = null;
      for (const ha of byRoom.get(a)!)
        for (const hb of byRoom.get(b)!) {
          const dd = distance(ha, hb);
          if (dd < best) {
            best = dd;
            near = [centre(ha[0], ha[1]), centre(hb[0], hb[1])];
          }
        }
      if (best > CONTACT || !near) continue;
      const door = doors.find((d) => (d.room === a && d.to === b) || (d.room === b && d.to === a)) ?? null;
      pairs.push({ a, b, door, near });
    }

  const runs = straightRuns(layout);
  const placed: Line[] = [];
  const proj = (p: Pt, v: Pt) => p.x * v.x + p.z * v.z;
  const onLine = (k: string, n: Pt, o: number) => {
    const [q, r] = parseHexKey(k);
    return Math.abs(proj(centre(q, r), n) - o) < EPS;
  };
  /** Distance along the ray from p (direction d) to the nearest outer wall run or placed wall. */
  const reach = (p: Pt, d: Pt): number => {
    let best = Infinity;
    const segs: [Pt, Pt][] = [
      ...runs.map((r): [Pt, Pt] => [{ x: r.ax, z: r.az }, { x: r.bx, z: r.bz }]),
      ...placed.map((l): [Pt, Pt] => [{ x: l.p.x + l.d.x * l.t0, z: l.p.z + l.d.z * l.t0 }, { x: l.p.x + l.d.x * l.t1, z: l.p.z + l.d.z * l.t1 }]),
    ];
    for (const [a, b] of segs) {
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const den = d.x * ez - d.z * ex;
      if (Math.abs(den) < 1e-6) continue;
      const t = ((a.x - p.x) * ez - (a.z - p.z) * ex) / den;
      const u = ((a.x - p.x) * d.z - (a.z - p.z) * d.x) / den;
      if (t > 1e-3 && u >= -0.01 && u <= 1.01) best = Math.min(best, t);
    }
    return best;
  };
  /** Whether the stretch [t0, t1] of the line goes into a playable hex (doorways on it aside). */
  const cuts = (l: Pick<Line, 'd' | 'n' | 'o' | 'p' | 't0' | 't1'>): boolean => {
    for (const [k, cs] of corners) {
      if (doorKeys.has(k) && onLine(k, l.n, l.o)) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of cs) {
        const s = proj(c, l.n) - l.o;
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
      if (lo > -EPS || hi < EPS) continue;
      let alo = Infinity;
      let ahi = -Infinity;
      for (const c of cs) {
        const t = (c.x - l.p.x) * l.d.x + (c.z - l.p.z) * l.d.z;
        alo = Math.min(alo, t);
        ahi = Math.max(ahi, t);
      }
      if (Math.min(ahi, l.t1) - Math.max(alo, l.t0) > EPS) return true;
    }
    return false;
  };
  /** How far each room's hexes keep from the line, if a lies wholly on one side and b on the other. */
  const sides = (a: string, b: string, n: Pt, o: number): number | null => {
    const span = (room: string) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const h of byRoom.get(room)!) {
        const k = hexKey(h);
        if (doorKeys.has(k) && onLine(k, n, o)) continue;
        for (const c of corners.get(k)!) {
          const s = proj(c, n) - o;
          lo = Math.min(lo, s);
          hi = Math.max(hi, s);
        }
      }
      return { lo, hi };
    };
    const sa = span(a);
    const sb = span(b);
    if (sa.hi <= EPS && sb.lo >= -EPS) return Math.min(-sa.hi, sb.lo);
    if (sb.hi <= EPS && sa.lo >= -EPS) return Math.min(-sb.hi, sa.lo);
    return null;
  };

  const pending = [...pairs].sort((u, v) => Number(!!v.door) - Number(!!u.door));
  for (let progress = true; progress && pending.length; ) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const pair = pending[i]!;
      let best: Line | null = null;
      for (let k = 0; k < 6; k++) {
        const ang = (k * Math.PI) / 6;
        const d = { x: Math.cos(ang), z: Math.sin(ang) };
        const n = { x: -d.z, z: d.x };
        let o: number;
        let p: Pt;
        if (pair.door) {
          p = centre(pair.door.hex[0], pair.door.hex[1]);
          o = proj(p, n);
        } else {
          // Midway between the two rooms' hexes, at the point where they come nearest.
          let ha = -Infinity;
          let la = Infinity;
          let hb = -Infinity;
          let lb = Infinity;
          for (const [room, set] of [[pair.a, 'a'], [pair.b, 'b']] as const)
            for (const h of byRoom.get(room)!)
              for (const c of corners.get(hexKey(h))!) {
                const s = proj(c, n);
                if (set === 'a') (ha = Math.max(ha, s)), (la = Math.min(la, s));
                else (hb = Math.max(hb, s)), (lb = Math.min(lb, s));
              }
          if (ha < lb) o = (ha + lb) / 2;
          else if (hb < la) o = (hb + la) / 2;
          else continue;
          const m = { x: (pair.near[0].x + pair.near[1].x) / 2, z: (pair.near[0].z + pair.near[1].z) / 2 };
          const off = proj(m, n) - o;
          p = { x: m.x - n.x * off, z: m.z - n.z * off };
        }
        const margin = sides(pair.a, pair.b, n, o);
        if (margin === null) continue;
        const along = (l: Line) => (p.x - l.p.x) * l.d.x + (p.z - l.p.z) * l.d.z;
        const same = placed.find((l) => Math.abs(Math.abs(proj(l.d, d)) - 1) < 1e-6 && Math.abs(proj(l.p, n) - o) < EPS && along(l) > l.t0 && along(l) < l.t1);
        if (same) {
          // A wall already standing on this line is taken over (one wall, several doorways).
          if (!best || margin + 100 > best.margin) best = { ...same, margin: margin + 100 };
          continue;
        }
        const fwd = reach(p, d);
        const back = reach(p, { x: -d.x, z: -d.z });
        if (!Number.isFinite(fwd) || !Number.isFinite(back)) continue;
        const line: Line = { d, n, o, p, rooms: new Set(), doors: new Set(), t0: -back, t1: fwd, margin };
        if (cuts(line)) continue;
        if (!best || margin > best.margin + 1e-6) best = line;
      }
      if (!best) continue;
      let line = placed.find((l) => l.p === best!.p && l.d === best!.d);
      if (!line) placed.push((line = best));
      line.rooms.add(pair.a).add(pair.b);
      if (pair.door) line.doors.add(hexKey(pair.door.hex));
      pending.splice(i--, 1);
      progress = true;
    }
  }

  // A doorway hex standing on a wall is an opening in it, whichever rooms it joins.
  for (const l of placed) for (const k of doorKeys) if (onLine(k, l.n, l.o)) l.doors.add(k);

  // Each wall in stretches between its doorways: a doorway hex is the opening, edge to edge.
  const inradius = (Math.sqrt(3) / 2) * hexSize;
  const out: Partition[] = [];
  for (const l of placed) {
    const ang = Math.atan2(l.d.z, l.d.x);
    // Out along d to the hex's edge: the edge normals lie 30° off the corners.
    const phi = (((ang % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3)) - Math.PI / 6;
    const half = inradius / Math.cos(phi);
    const at = (t: number) => ({ x: l.p.x + l.d.x * t, z: l.p.z + l.d.z * t });
    const cuts: { t: number; door: string }[] = [...l.doors]
      .map((k) => {
        const [q, r] = parseHexKey(k);
        const c = centre(q, r);
        return { t: (c.x - l.p.x) * l.d.x + (c.z - l.p.z) * l.d.z, door: k };
      })
      .filter((c) => c.t > l.t0 && c.t < l.t1)
      .sort((u, v) => u.t - v.t);
    const rooms = [...l.rooms];
    let from = l.t0;
    let fromDoor: string | undefined;
    for (const c of cuts) {
      if (c.t - half - from > 0.05) out.push({ points: [at(from), at(c.t - half)], rooms, extended: [fromDoor === undefined, false], door: c.door });
      from = c.t + half;
      fromDoor = c.door;
    }
    if (l.t1 - from > 0.05) out.push({ points: [at(from), at(l.t1)], rooms, extended: [fromDoor === undefined, true], ...(fromDoor ? { door: fromDoor } : {}) });
  }
  return out;
}
