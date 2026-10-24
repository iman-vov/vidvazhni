// Where every environment piece goes (pure: layout + data + quality → placements). Walls, thickets,
// reeds or rock follow the outline of footprint + ring; walls between the camera and the board are
// the low cut-away pieces; doorways stand at the entrance and exit edges; props fill the ring
// strip against the walls and, outdoors, the ground beyond the edge; big silhouettes stand far out
// in the fog. Nothing tall is put where it would hide a playable hex from the camera.

import { hexKey, parseHexKey } from '../../rules/hex';
import { hexToWorld } from '../hexLayout';
import type { GraphicsQuality } from '../quality';
import { distanceToFootprint, hidesBoard, seededRandom, type EnvLayout, type OutlineEdge } from './layout';
import { pieceMeta } from './pieces';
import type { EdgeStyle, EnvironmentDef, Weighted } from './types';

export type Band = 'edge' | 'corner' | 'door' | 'feature' | 'ring' | 'outside' | 'far';

export interface Placement {
  piece: string;
  x: number;
  z: number;
  /** Yaw: the piece's +Z turns to (sin rot, cos rot). */
  rot: number;
  scale: number;
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
  layout.edges.forEach((e, i) => {
    const style = styleOf(def, e.room);
    const s = STYLE_PIECES[style];
    if (e.door) {
      put({ piece: s.door, x: e.x, z: e.z, rot: inward(e.nx, e.nz), scale: 1, height: wallH, room: null, band: 'door' }, 0.1);
      const feature = e.door === 'entrance' ? def.entrance : def.exit;
      if (feature) placeFeature(feature, e, put);
      return;
    }
    if (s.walled) {
      let piece = e.front ? s.low : s.wall;
      if (!e.front && altEvery > 0) {
        const n = (altCount.get(style) ?? 0) + 1;
        altCount.set(style, n);
        if (n % altEvery === Math.floor(altEvery / 2)) piece = s.alt;
      }
      // Walls take no room from the strip: props stand right against their inner face.
      put({ piece, x: e.x, z: e.z, rot: inward(e.nx, e.nz), scale: 1, height: e.front ? lowH : wallH, room: e.room, band: 'edge' }, 0.05);
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

  // ── Ring strip: props against the walls (or along the forest edge).
  const ringList = def.dressing.ring;
  for (const k of [...layout.ring.keys()].sort()) {
    if (layout.clear.has(k)) continue;
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
