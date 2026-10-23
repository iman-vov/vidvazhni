// Line of sight between hexes.
//
// Rule: hex A sees hex B when at least one straight segment from a corner of A to a corner of B
// touches no wall. Walls are the edges between a revealed hex and a hex that does not exist
// (map and room edges, unrevealed rooms) plus the thin walls in `board.walls`. Obstacles and
// figures never block sight.
//
// Corner convention (exact, integer arithmetic, no epsilons):
// - Touching a wall anywhere blocks: crossing it, running along it, or passing through one of its
//   end points (so a line that only grazes the tip of a thin wall or an inner room corner is blocked).
// - The one exception is the segment's own end points. A segment may start at a corner of A that
//   lies on a wall, provided it leaves that corner into A itself, or into a neighbouring hex that
//   meets A at that corner across an edge that is not a wall. The same holds at B's end.
//   This keeps hexes on a room edge visible, while a thin wall between two adjacent hexes still
//   blocks sight between them.
// - Degenerate segments (a corner shared by A and B) are ignored.
//
// Coordinates: the world plane of flat-top hexes, scaled by 2 on x and by 2/√3 on z. That is an
// affine map with positive factors, so intersections and orientation are preserved, and every hex
// corner lands on an integer point.

import { DIRECTIONS, add, hexEquals, hexKey, parseHexKey, type Hex, type HexKey } from './hex';
import type { BoardState, GameState } from './state';

type Pt = readonly [number, number];

const CORNER_OFFSETS: readonly Pt[] = [
  [2, 0],
  [1, 1],
  [-1, 1],
  [-2, 0],
  [-1, -1],
  [1, -1],
];

function center([q, r]: Hex): Pt {
  return [3 * q, 2 * r + q];
}

/** Corner `i` (0–5, counter-clockwise from the right-hand corner) in lattice coordinates. */
export function hexCorner(h: Hex, i: number): Pt {
  const c = center(h);
  const o = CORNER_OFFSETS[((i % 6) + 6) % 6]!;
  return [c[0] + o[0], c[1] + o[1]];
}

/** The neighbour sharing edge (corner i, corner i+1). */
function neighbourAcrossEdge(h: Hex, i: number): Hex {
  return add(h, DIRECTIONS[(6 - (i % 6)) % 6]!);
}

interface Segment {
  a: Pt;
  b: Pt;
}

export interface WallIndex {
  /** All wall edges, as lattice segments. */
  edges: Segment[];
  exists(h: Hex): boolean;
  /** True when the edge between two adjacent hexes is a wall. Two missing hexes have no wall. */
  isWall(a: Hex, b: Hex): boolean;
  /** Thin wall only (both hexes exist). */
  isThinWall(a: Hex, b: Hex): boolean;
}

function pairKey(a: HexKey, b: HexKey): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function sharedEdge(a: Hex, b: Hex): Segment | null {
  for (let i = 0; i < 6; i++) {
    if (hexEquals(neighbourAcrossEdge(a, i), b)) return { a: hexCorner(a, i), b: hexCorner(a, i + 1) };
  }
  return null;
}

const cache = new WeakMap<BoardState, { signature: string; index: WallIndex }>();

/** Wall index for a board; cached per board object while its tiles and thin walls are unchanged. */
export function wallIndex(board: BoardState): WallIndex {
  const signature = `${Object.keys(board.tiles).length}#${board.walls.join(';')}`;
  const hit = cache.get(board);
  if (hit && hit.signature === signature) return hit.index;
  const index = buildWallIndex(board);
  cache.set(board, { signature, index });
  return index;
}

function buildWallIndex(board: BoardState): WallIndex {
  const tiles = board.tiles;
  const exists = (h: Hex): boolean => tiles[hexKey(h)] !== undefined;
  const thin = new Set<string>();
  const edges: Segment[] = [];
  for (const w of board.walls) {
    const [ka, kb] = w.split('|');
    if (ka === undefined || kb === undefined) continue;
    const a = parseHexKey(ka);
    const b = parseHexKey(kb);
    const edge = sharedEdge(a, b);
    if (!edge) continue;
    thin.add(pairKey(hexKey(a), hexKey(b)));
    edges.push(edge);
  }
  for (const key of Object.keys(tiles)) {
    const h = parseHexKey(key);
    for (let i = 0; i < 6; i++) {
      if (!exists(neighbourAcrossEdge(h, i))) edges.push({ a: hexCorner(h, i), b: hexCorner(h, i + 1) });
    }
  }
  const isThinWall = (a: Hex, b: Hex): boolean => thin.has(pairKey(hexKey(a), hexKey(b)));
  return {
    edges,
    exists,
    isThinWall,
    isWall(a, b) {
      const ea = exists(a);
      const eb = exists(b);
      if (ea !== eb) return true;
      return ea && isThinWall(a, b);
    },
  };
}

// ─── Lattice geometry ─────────────────────────────────────────────────────

function sub(p: Pt, q: Pt): Pt {
  return [p[0] - q[0], p[1] - q[1]];
}

function cross(u: Pt, v: Pt): number {
  return u[0] * v[1] - u[1] * v[0];
}

function dot(u: Pt, v: Pt): number {
  return u[0] * v[0] + u[1] * v[1];
}

function orient(p: Pt, q: Pt, r: Pt): number {
  return Math.sign(cross(sub(q, p), sub(r, p)));
}

function within(p: Pt, q: Pt, r: Pt): boolean {
  return (
    Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1])
  );
}

/** True when segment ab shares with wall w a point other than a and b. */
function touchesWall(a: Pt, b: Pt, w: Segment): boolean {
  const o1 = orient(a, b, w.a);
  const o2 = orient(a, b, w.b);
  if (o1 === 0 && o2 === 0) {
    // Collinear: blocked only when the overlap has positive length.
    const d = sub(b, a);
    const len = dot(d, d);
    const t1 = dot(sub(w.a, a), d);
    const t2 = dot(sub(w.b, a), d);
    return Math.min(len, Math.max(t1, t2)) > Math.max(0, Math.min(t1, t2));
  }
  const o3 = orient(w.a, w.b, a);
  const o4 = orient(w.a, w.b, b);
  const intersects =
    (o1 !== o2 && o3 !== o4) ||
    (o1 === 0 && within(a, b, w.a)) ||
    (o2 === 0 && within(a, b, w.b)) ||
    (o3 === 0 && within(w.a, w.b, a)) ||
    (o4 === 0 && within(w.a, w.b, b));
  // Not collinear, so the common point is unique; it is an end point exactly when a or b lies on w.
  return intersects && o3 !== 0 && o4 !== 0;
}

function along(ray: Pt, u: Pt): boolean {
  return cross(ray, u) === 0 && dot(ray, u) > 0;
}

/** Strictly inside the convex wedge between rays r1 and r2. */
function inside(r1: Pt, r2: Pt, u: Pt): boolean {
  const s = Math.sign(cross(r1, r2));
  return Math.sign(cross(r1, u)) === s && Math.sign(cross(u, r2)) === s;
}

/** Whether a segment from corner i of hex h towards `toward` leaves the corner without crossing a wall. */
function leavesCorner(walls: WallIndex, h: Hex, i: number, toward: Pt): boolean {
  const p = hexCorner(h, i);
  const u = sub(toward, p);
  const rayX = sub(hexCorner(h, i + 1), p); // edge h|x
  const rayY = sub(hexCorner(h, i + 5), p); // edge h|y
  const rayOut = sub(p, center(h)); // edge x|y
  const x = neighbourAcrossEdge(h, i);
  const y = neighbourAcrossEdge(h, i + 5);
  const wallX = walls.isWall(h, x);
  const wallY = walls.isWall(h, y);
  if (along(rayX, u)) return !wallX;
  if (along(rayY, u)) return !wallY;
  if (along(rayOut, u)) return !walls.isWall(x, y) && !(wallX && wallY);
  if (inside(rayX, rayY, u)) return true;
  if (inside(rayX, rayOut, u)) return !wallX;
  return !wallY;
}

/** Whether the segment from corner i of hex a to corner j of hex b is clear of walls. */
export function cornerSegmentClear(walls: WallIndex, a: Hex, i: number, b: Hex, j: number): boolean {
  const pa = hexCorner(a, i);
  const pb = hexCorner(b, j);
  if (pa[0] === pb[0] && pa[1] === pb[1]) return false;
  if (!leavesCorner(walls, a, i, pb) || !leavesCorner(walls, b, j, pa)) return false;
  const minX = Math.min(pa[0], pb[0]);
  const maxX = Math.max(pa[0], pb[0]);
  const minY = Math.min(pa[1], pb[1]);
  const maxY = Math.max(pa[1], pb[1]);
  for (const w of walls.edges) {
    if (Math.max(w.a[0], w.b[0]) < minX || Math.min(w.a[0], w.b[0]) > maxX) continue;
    if (Math.max(w.a[1], w.b[1]) < minY || Math.min(w.a[1], w.b[1]) > maxY) continue;
    if (touchesWall(pa, pb, w)) return false;
  }
  return true;
}

/** Line of sight with a prebuilt wall index (used by the AI to avoid rebuilding it). */
export function lineOfSight(walls: WallIndex, a: Hex, b: Hex): boolean {
  if (!walls.exists(a) || !walls.exists(b)) return false;
  if (hexEquals(a, b)) return true;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      if (cornerSegmentClear(walls, a, i, b, j)) return true;
    }
  }
  return false;
}

export function hasLineOfSight(state: GameState, a: Hex, b: Hex): boolean {
  return lineOfSight(wallIndex(state.board), a, b);
}
