// Where every environment piece goes (pure: layout + data + quality → placements). Walls, thickets,
// reeds or rock follow the outline of footprint + ring; walls between the camera and the board are
// the low cut-away pieces; doorways stand at the entrance and exit edges; props fill the ring
// strip against the walls and, outdoors, the ground beyond the edge; big silhouettes stand far out
// in the fog. Nothing tall is put where it would hide a playable hex from the camera.

import { hexKey, parseHexKey } from '../../rules/hex';
import { hexToWorld, worldToHex } from '../hexLayout';
import type { GraphicsQuality } from '../quality';
import { distanceToFootprint, hidesBoard, seededRandom, type EnvLayout, type OutlineEdge } from './layout';
import { pieceMeta } from './pieces';
import { straightRuns } from './walls';
import type { EdgeStyle, EnvironmentDef, Weighted } from './types';

export type Band = 'edge' | 'corner' | 'door' | 'feature' | 'ring' | 'outside' | 'far';

export interface Placement {
  piece: string;
  x: number;
  z: number;
  /** Yaw: the piece's +Z turns to (sin rot, cos rot). */
  rot: number;
  scale: number;
  /** Extra stretch along the piece's X (a wall segment fitted to a straight run). Default 1. */
  sx?: number;
  /** Height of the piece's foot (a crate stacked on a crate). Default 0. */
  y?: number;
  /** Small lean (radians) about the piece's own X and Z after its turn (a sack leaning). */
  tilt?: [number, number];
  /** Build height for walls, corners and doorways. */
  height: number;
  /** Room whose fog veil covers this piece until it is revealed (null: always clear). */
  room: string | null;
  band: Band;
}

export interface StylePieces {
  wall: string;
  alt: string;
  low: string;
  corner: string | null;
  cornerLow: string | null;
  door: string;
  /** Straight wall segments on the outline (else loose clumps that may stray outward). */
  walled: boolean;
}

export const STYLE_PIECES: Record<EdgeStyle, StylePieces> = {
  stone: { wall: 'stone-wall', alt: 'stone-arch', low: 'stone-wall-low', corner: 'stone-pillar', cornerLow: 'stone-pillar-low', door: 'stone-doorway', walled: true },
  tower: { wall: 'tower-wall', alt: 'tower-slit', low: 'tower-wall-low', corner: 'tower-pillar', cornerLow: 'tower-pillar-low', door: 'tower-doorway', walled: true },
  timber: { wall: 'timber-wall', alt: 'timber-window', low: 'timber-wall-low', corner: 'timber-post', cornerLow: 'timber-post-low', door: 'timber-doorway', walled: true },
  forest: { wall: 'thicket', alt: 'thicket-thorn', low: 'thicket-low', corner: null, cornerLow: null, door: 'forest-gap', walled: false },
  shore: { wall: 'reeds-bank', alt: 'reeds-bank', low: 'reeds-low', corner: null, cornerLow: null, door: 'forest-gap', walled: false },
  cave: { wall: 'rock-wall', alt: 'rock-wall-crystal', low: 'rock-low', corner: 'rock-pillar', cornerLow: 'rock-pillar-low', door: 'cave-mouth', walled: false },
};

/** Share of the dressing kept per quality level (the outline is always complete). */
export const DRESSING_SHARE: Record<GraphicsQuality, number> = { low: 0.4, medium: 0.75, high: 1 };

/** Pieces up to this height may stand anywhere, even in front of the board. */
const LOW_PIECE = 0.65;
/** Tallest piece beyond the edge on the camera's side of the board. */
const NEAR_SIDE_HEIGHT = 0.8;

function pick(list: Weighted[], rnd: () => number, maxHeight = Infinity): string | null {
  const ok = list.filter(([id]) => (pieceMeta(id)?.height ?? 0) <= maxHeight);
  const total = ok.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let t = rnd() * total;
  for (const [id, w] of ok) {
    t -= w;
    if (t <= 0) return id;
  }
  return ok[ok.length - 1]![0];
}

const inward = (nx: number, nz: number) => Math.atan2(-nx, -nz);

export function styleOf(def: EnvironmentDef, room: string): EdgeStyle {
  return def.rooms?.[room]?.edge ?? def.edge;
}

export function planEnvironment(layout: EnvLayout, def: EnvironmentDef, quality: GraphicsQuality): Placement[] {
  const rnd = seededRandom(`${def.id}:${layout.scenarioId}`);
  const out: Placement[] = [];
  const taken: { x: number; z: number; r: number }[] = [];
  const share = DRESSING_SHARE[quality];
  const density = def.dressing.density ?? 0.6;
  const wallH = def.walls?.height ?? 1.6;
  const lowH = def.walls?.low ?? 0.3;
  const altEvery = def.walls?.alt ?? 4;

  const free = (x: number, z: number, r: number) => taken.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 >= ((t.r + r) * 0.85) ** 2);
  const put = (p: Placement, r: number) => {
    out.push(p);
    taken.push({ x: p.x, z: p.z, r });
  };

  // ── Outline: walls or their outdoor stand-ins, doorways, corners.
  const altCount = new Map<EdgeStyle, number>();
  const sconce = def.walls?.sconce;
  let plain = 0;
  const wallPiece = (style: EdgeStyle, front: boolean): string => {
    const s = STYLE_PIECES[style];
    if (front) return s.low;
    if (altEvery > 0) {
      const n = (altCount.get(style) ?? 0) + 1;
      altCount.set(style, n);
      if (n % altEvery === Math.floor(altEvery / 2)) return s.alt;
    }
    return s.wall;
  };
  const hangSconce = (piece: string, style: EdgeStyle, x: number, z: number, rot: number, room: string) => {
    if (!sconce || piece !== STYLE_PIECES[style].wall || sconce.every <= 0 || ++plain % sconce.every !== 1) return;
    const meta = pieceMeta(sconce.piece);
    if (meta && meta.height < wallH) put({ piece: sconce.piece, x, z, rot, scale: 1, height: meta.height, room, band: 'edge' }, 0.05);
  };
  // Walled edges run straight: segments fitted along each run, pillars where runs turn.
  const straight = new Set<number>();
  const runs = straightRuns(layout).filter((r) => {
    if (r.door) return false;
    const style = styleOf(def, layout.edges[r.edges[0]!]!.room);
    return STYLE_PIECES[style].walled && r.edges.every((i) => styleOf(def, layout.edges[i]!.room) === style);
  });
  for (const r of runs) {
    for (const i of r.edges) straight.add(i);
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
    const count = Math.max(1, Math.round(len));
    const piece = len / count;
    const dx = (r.bx - r.ax) / len;
    const dz = (r.bz - r.az) / len;
    const rot = inward(r.nx, r.nz);
    for (let k = 0; k < count; k++) {
      const x = r.ax + dx * piece * (k + 0.5);
      const z = r.az + dz * piece * (k + 0.5);
      // Room and cut-away from the nearest hex edge this run replaces.
      let near = layout.edges[r.edges[0]!]!;
      let nearD = Infinity;
      for (const i of r.edges) {
        const e = layout.edges[i]!;
        const d = (e.x - x) ** 2 + (e.z - z) ** 2;
        if (d < nearD) {
          nearD = d;
          near = e;
        }
      }
      const style = styleOf(def, near.room);
      const id = wallPiece(style, near.front);
      put({ piece: id, x, z, rot, scale: 1, sx: piece, height: near.front ? lowH : wallH, room: near.room, band: 'edge' }, 0.05);
      hangSconce(id, style, x, z, rot, near.room);
    }
  }
  // Pillars where two straight runs meet at an angle.
  for (const r of runs) {
    const next = runs.find((o) => Math.hypot(o.ax - r.bx, o.az - r.bz) < 0.05);
    if (!next || r.nx * next.nx + r.nz * next.nz > 0.94) continue;
    const style = styleOf(def, layout.edges[r.edges[r.edges.length - 1]!]!.room);
    const s = STYLE_PIECES[style];
    const lowA = layout.edges[r.edges[r.edges.length - 1]!]!.front;
    const lowB = layout.edges[next.edges[0]!]!.front;
    const piece = lowA && lowB ? s.cornerLow : s.corner;
    if (!piece) continue;
    let nx = r.nx + next.nx;
    let nz = r.nz + next.nz;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    put({ piece, x: r.bx + nx * 0.12, z: r.bz + nz * 0.12, rot: inward(nx, nz), scale: 1, height: lowA && lowB ? lowH : wallH, room: layout.edges[r.edges[0]!]!.room, band: 'corner' }, 0.2);
  }
  layout.edges.forEach((e, i) => {
    if (straight.has(i)) return;
    const style = styleOf(def, e.room);
    const s = STYLE_PIECES[style];
    if (e.door) {
      put({ piece: s.door, x: e.x, z: e.z, rot: inward(e.nx, e.nz), scale: 1, height: wallH, room: null, band: 'door' }, 0.1);
      const feature = e.door === 'entrance' ? def.entrance : def.exit;
      if (feature) placeFeature(feature, e, put);
      return;
    }
    if (s.walled) {
      const piece = wallPiece(style, e.front);
      // Walls take no room from the strip: props stand right against their inner face.
      put({ piece, x: e.x, z: e.z, rot: inward(e.nx, e.nz), scale: 1, height: e.front ? lowH : wallH, room: e.room, band: 'edge' }, 0.05);
      hangSconce(piece, style, e.x, e.z, inward(e.nx, e.nz), e.room);
      return;
    }
    // Loose clumps a little outside the edge, varied in size; low in front of the board.
    const low = e.front || hidesBoard(layout, e.x + e.nx * 0.3, e.z + e.nz * 0.3, wallH * 0.8);
    const alt = !low && altEvery > 0 && i % altEvery === 1;
    const piece = low ? s.low : alt ? s.alt : s.wall;
    const scale = (low ? 0.85 : 0.9) + rnd() * 0.35;
    const out1 = 0.18 + rnd() * 0.12;
    const t = (rnd() - 0.5) * 0.3;
    const x = e.x + e.nx * out1 + (e.bx - e.ax) * t;
    const z = e.z + e.nz * out1 + (e.bz - e.az) * t;
    put({ piece, x, z, rot: inward(e.nx, e.nz) + (rnd() - 0.5) * 0.6, scale, height: low ? lowH : wallH * (0.8 + rnd() * 0.4), room: e.room, band: 'edge' }, 0.4);
    if (!low && rnd() < 0.5) {
      const x2 = e.x + e.nx * (0.75 + rnd() * 0.3);
      const z2 = e.z + e.nz * (0.75 + rnd() * 0.3);
      if (!hidesBoard(layout, x2, z2, wallH)) put({ piece: s.wall, x: x2, z: z2, rot: rnd() * Math.PI * 2, scale: 1 + rnd() * 0.4, height: wallH * (0.9 + rnd() * 0.5), room: e.room, band: 'edge' }, 0.45);
    }
  });
  for (const c of layout.corners) {
    if (c.edges.every((i) => straight.has(i))) continue;
    const edges = c.edges.map((i) => layout.edges[i]!);
    const s = STYLE_PIECES[styleOf(def, edges[0]!.room)];
    if (!s.corner) continue;
    const low = edges.every((e) => e.front);
    const piece = low ? s.cornerLow : s.corner;
    if (!piece) continue;
    const height = low ? lowH : wallH;
    // Pillars sit on the outline's vertex, pushed out to the walls' outer faces.
    put({ piece, x: c.x + c.nx * 0.12, z: c.z + c.nz * 0.12, rot: inward(c.nx, c.nz), scale: s.walled ? 1 : 0.8 + rnd() * 0.5, height, room: edges[0]!.room, band: 'corner' }, 0.2);
  }

  // ── Landmarks just beyond a room's far edge.
  for (const lm of def.landmarks ?? []) {
    const meta = pieceMeta(lm.piece);
    const cs = layout.centres.filter((c) => c.room === lm.room);
    if (!meta || !cs.length) continue;
    const mid = { x: cs.reduce((s, c) => s + c.x, 0) / cs.length, z: cs.reduce((s, c) => s + c.z, 0) / cs.length };
    const edges = layout.edges.filter((e) => e.room === lm.room && !e.front && !e.door);
    const e = edges.sort((a, b) => a.nz - b.nz + 0.15 * (Math.hypot(a.x - mid.x, a.z - mid.z) - Math.hypot(b.x - mid.x, b.z - mid.z)))[0];
    if (!e) continue;
    const out1 = meta.radius + 0.5;
    put({ piece: lm.piece, x: e.x + e.nx * out1, z: e.z + e.nz * out1, rot: inward(e.nx, e.nz) + Math.PI / 2, scale: 1, height: meta.height, room: null, band: 'feature' }, meta.radius);
  }

  // ── Anchors: pieces that always stand in the ring, spread apart along the far and side walls.
  const anchored = new Set<string>();
  const anchorList = (def.dressing.anchors ?? []).flatMap(([id, n]) => Array.from({ length: n }, () => id));
  if (anchorList.length) {
    const spots = [...layout.ring.keys()].sort().filter((k) => {
      if (layout.clear.has(k)) return false;
      const own = layout.edges.filter((e) => hexKey(e.inner) === k);
      return own.length > 0 && own.every((e) => !e.front && !e.door);
    });
    const chosen: { x: number; z: number }[] = [];
    for (const piece of anchorList) {
      const meta = pieceMeta(piece);
      if (!meta) continue;
      let best: string | null = null;
      let bestD = -1;
      for (const k of spots) {
        if (anchored.has(k)) continue;
        const [q, r] = parseHexKey(k);
        const c = hexToWorld(q, r);
        if (hidesBoard(layout, c.x, c.z, meta.height, meta.radius * 0.6)) continue;
        // The first one nearest the board's middle, the rest as far from the others as possible;
        // all of them rather behind the board than on the camera's side.
        const spread = chosen.length ? Math.min(...chosen.map((o) => Math.hypot(o.x - c.x, o.z - c.z))) : -Math.hypot(c.x - layout.centre.x, c.z - layout.centre.z);
        const d = spread - 1.5 * Math.max(0, c.z - layout.centre.z);
        if (d > bestD || best === null) {
          bestD = d;
          best = k;
        }
      }
      if (!best) break;
      anchored.add(best);
      const [q, r] = parseHexKey(best);
      const c = hexToWorld(q, r);
      const own = layout.edges.filter((e) => hexKey(e.inner) === best);
      let nx = own.reduce((s, e) => s + e.nx, 0);
      let nz = own.reduce((s, e) => s + e.nz, 0);
      const len = Math.hypot(nx, nz) || 1;
      nx /= len;
      nz /= len;
      chosen.push(c);
      put({ piece, x: c.x + nx * 0.22, z: c.z + nz * 0.22, rot: inward(nx, nz), scale: 1, height: meta.height, room: layout.ring.get(best)!, band: 'ring' }, meta.radius);
    }
  }

  // ── Ring strip, in groups: barrels together, a crate on a crate, a sack leaning on a barrel.
  if (def.dressing.sets?.length) {
    placeSets(layout, def, rnd, share * density, anchored, put, free);
  }

  // ── Ring strip: props against the walls (or along the forest edge).
  const ringList = def.dressing.ring;
  for (const k of [...layout.ring.keys()].sort()) {
    if (def.dressing.sets?.length) break;
    if (layout.clear.has(k) || anchored.has(k)) continue;
    if (rnd() > share * density) continue;
    const [q, r] = parseHexKey(k);
    const c = hexToWorld(q, r);
    const own = layout.edges.filter((e) => hexKey(e.inner) === k);
    let nx = 0;
    let nz = 0;
    for (const e of own) {
      nx += e.nx;
      nz += e.nz;
    }
    const len = Math.hypot(nx, nz);
    if (len > 1e-6) {
      nx /= len;
      nz /= len;
    }
    for (let n = 0; n < 2; n++) {
      if (n === 1 && rnd() > share * density * 0.6) break;
      const along = n === 0 ? (rnd() - 0.5) * 0.3 : (rnd() < 0.5 ? -1 : 1) * (0.42 + rnd() * 0.12);
      const push = len > 1e-6 ? 0.28 + rnd() * 0.08 : 0;
      const x = c.x + nx * push + -nz * along + (len > 1e-6 ? 0 : (rnd() - 0.5) * 0.5);
      const z = c.z + nz * push + nx * along + (len > 1e-6 ? 0 : (rnd() - 0.5) * 0.5);
      let piece = pick(ringList, rnd, n === 1 ? LOW_PIECE + 0.2 : Infinity);
      if (!piece) continue;
      let meta = pieceMeta(piece)!;
      if (meta.height > LOW_PIECE && hidesBoard(layout, x, z, meta.height, meta.radius * 0.6)) {
        piece = pick(ringList, rnd, LOW_PIECE);
        if (!piece) continue;
        meta = pieceMeta(piece)!;
      }
      if (!free(x, z, meta.radius)) continue;
      const rot = len > 1e-6 ? inward(nx, nz) + (rnd() - 0.5) * 0.35 : rnd() * Math.PI * 2;
      put({ piece, x, z, rot, scale: 0.9 + rnd() * 0.2, height: meta.height, room: layout.ring.get(k)!, band: 'ring' }, meta.radius);
    }
  }

  // ── Beyond the edge (outdoors) and far out in the fog.
  const bands: { list: Weighted[] | undefined; from: number; to: number; step: number; chance: number; band: Band }[] = [
    { list: def.dressing.outside, from: 1.9, to: 6, step: 1.15, chance: share * density, band: 'outside' },
    { list: def.dressing.far, from: 6, to: Math.max(9, def.fog.end + 1), step: 2.3, chance: share * 0.75, band: 'far' },
  ];
  for (const b of bands) {
    if (!b.list?.length) continue;
    const span = b.to + 1;
    for (let gx = layout.min.x - span; gx <= layout.max.x + span; gx += b.step) {
      for (let gz = layout.min.z - span; gz <= layout.max.z + span; gz += b.step) {
        const x = gx + (rnd() - 0.5) * b.step * 0.8;
        const z = gz + (rnd() - 0.5) * b.step * 0.8;
        const d = distanceToFootprint(layout, x, z);
        if (d < b.from || d > b.to) continue;
        // Thinner toward the outer side of the band.
        if (rnd() > b.chance * (1 - 0.45 * ((d - b.from) / (b.to - b.from)))) continue;
        // On the camera's side only low growth: big trees there would fill the foreground.
        const near = z > layout.max.z + 0.5;
        if (near && b.band === 'far') continue;
        let piece = pick(b.list, rnd, near ? NEAR_SIDE_HEIGHT : Infinity);
        if (!piece) continue;
        let meta = pieceMeta(piece)!;
        if (hidesBoard(layout, x, z, meta.height, meta.radius * 0.5)) {
          piece = pick(b.list, rnd, LOW_PIECE);
          if (!piece) continue;
          meta = pieceMeta(piece)!;
        }
        if (!free(x, z, meta.radius * 0.8)) continue;
        put({ piece, x, z, rot: rnd() * Math.PI * 2, scale: 0.85 + rnd() * 0.4, height: meta.height, room: null, band: b.band }, meta.radius * 0.8);
      }
    }
  }
  return out;
}

/** How tall a piece stands once shown (its prop model's height in the location's table, else the
 *  procedural piece's). */
function standHeight(def: EnvironmentDef, piece: string): number {
  const entry = def.propModels?.[piece];
  const h = entry && typeof entry !== 'string' ? entry.height : undefined;
  return h ?? pieceMeta(piece)?.height ?? 0;
}

function placeSets(
  layout: EnvLayout,
  def: EnvironmentDef,
  rnd: () => number,
  chance: number,
  used: Set<string>,
  put: (p: Placement, r: number) => void,
  free: (x: number, z: number, r: number) => boolean,
): void {
  const sets = def.dressing.sets!;
  const total = sets.reduce((s, x) => s + x.weight, 0);
  const ownEdges = (k: string) => layout.edges.filter((e) => hexKey(e.inner) === k && !e.door);
  // Corners (two or more walls) first: that is where things pile up.
  const keys = [...layout.ring.keys()].sort().filter((k) => !layout.clear.has(k) && !used.has(k));
  keys.sort((a, b) => ownEdges(b).length - ownEdges(a).length);
  for (const k of keys) {
    const own = ownEdges(k);
    if (!own.length) continue;
    // Fewer groups on the camera's side: they would fill the foreground.
    const front = own.every((e) => e.front);
    if (rnd() > Math.min(1, chance * (own.length > 1 ? 1.5 : 1) * (front ? 0.35 : 1))) continue;
    let t = rnd() * total;
    const set = sets.find((x) => (t -= x.weight) <= 0) ?? sets[sets.length - 1]!;
    const [q, r] = parseHexKey(k);
    const c = hexToWorld(q, r);
    let nx = own.reduce((s, e) => s + e.nx, 0);
    let nz = own.reduce((s, e) => s + e.nz, 0);
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    const flip = rnd() < 0.5 ? -1 : 1;
    const spin = (rnd() - 0.5) * 0.3;
    const ax = Math.cos(spin) * -nz - Math.sin(spin) * nx;
    const az = Math.cos(spin) * nx - Math.sin(spin) * nz;
    const ox = c.x + nx * 0.28;
    const oz = c.z + nz * 0.28;
    const base = inward(nx, nz);
    const tops: (number | null)[] = [];
    let placed = 0;
    for (const item of set.items) {
      const meta = pieceMeta(item.piece);
      const below = item.on !== undefined ? tops[item.on] : 0;
      if (!meta || below === null || below === undefined) {
        tops.push(null);
        continue;
      }
      const x = ox + ax * item.x * flip - nx * item.z;
      const z = oz + az * item.x * flip - nz * item.z;
      const scale = 0.92 + rnd() * 0.16;
      const height = standHeight(def, item.piece) * scale;
      const onHex = layout.footprint.has(hexKey(worldToHex(x, z)));
      const hides = below + height > LOW_PIECE && hidesBoard(layout, x, z, below + height, meta.radius * 0.6);
      if (onHex || hides || (below === 0 && !free(x, z, meta.radius * 0.75))) {
        tops.push(null);
        continue;
      }
      const rot = item.align ? base + (rnd() - 0.5) * 0.2 : rnd() * Math.PI * 2;
      const lean = item.tilt ? item.tilt * flip : below === 0 && rnd() < 0.25 ? (rnd() - 0.5) * 0.08 : 0;
      const p: Placement = { piece: item.piece, x, z, rot, scale, height: meta.height, room: layout.ring.get(k)!, band: 'ring' };
      if (below > 0) p.y = below;
      if (lean) p.tilt = [0, lean];
      put(p, below > 0 ? 0 : meta.radius * 0.75);
      tops.push(below + height);
      placed++;
    }
    if (placed) used.add(k);
  }
}

/** The entrance or exit piece beyond a doorway edge: stairs start right behind it, a lantern post
 *  stands beside the gap, a big piece (the forester's hut) stands well out. */
function placeFeature(id: string, e: OutlineEdge, put: (p: Placement, r: number) => void): void {
  const meta = pieceMeta(id);
  if (!meta) return;
  const rot = inward(e.nx, e.nz);
  if (id === 'stairs') {
    put({ piece: id, x: e.x, z: e.z, rot, scale: 1, height: meta.height, room: null, band: 'feature' }, 0.3);
    return;
  }
  const out = meta.radius >= 1 ? meta.radius + 1.0 : 0.35;
  const side = meta.radius >= 1 ? 0 : 0.62;
  put(
    { piece: id, x: e.x + e.nx * out - e.nz * side, z: e.z + e.nz * out + e.nx * side, rot, scale: 1, height: meta.height, room: null, band: 'feature' },
    meta.radius,
  );
}
