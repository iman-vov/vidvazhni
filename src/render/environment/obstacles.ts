// Obstacle clusters: what stands on the scenario's obstacle hexes. Never one object in the middle
// of its hex: a few things of mixed sizes set down at random (a big barrel, a small crate, a stool
// knocked over), and where obstacle hexes touch, one set piece across them (a long table with
// stools, a pile of barrels, a cart, a fallen log between trees). Flat litter (chips, straw,
// pebbles, leaves) lies around on the floor and never covers a hex outline.
// It is a pure render mapping from the blocked hexes, seeded by the scenario id and the hex, so the
// same scenario always looks the same; nothing leaves its obstacle hexes but the litter.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RoomKind, ScenarioDef } from '../../rules/content';
import { hexKey, neighbors, parseHexKey, type HexKey } from '../../rules/hex';
import { hexToWorld, worldToHex } from '../hexLayout';
import { mergeStaticParts } from '../mergeParts';
import { HEX_INNER, seededRandom } from './layout';
import MODEL_BOUNDS from './modelBounds.json';
import { PALETTE_DEFAULTS, pieceMeta, type MaterialKey, type Part } from './pieces';
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
  /** Which of the kit's variants (litter). */
  variant?: number;
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
  stool: 0.38,
  sack: 0.42,
  sacks: 0.5,
  'keg-rack': 0.8,
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
  shelf: 1.25,
  bookshelf: 1.35,
  pallet: 0.12,
  'weapon-rack': 1.1,
  'bookcase-long': 1.46,
  'rack-long': 1.5,
  'ridge-snow': 0.82,
  'ridge-cave': 1.0,
  'ridge-forest': 0.85,
};

/** Footprint box [x0, x1, z0, z1] in the piece's own frame at its meta height, where it is not a
 *  circle of the meta radius. */
const FOOT: Record<string, [number, number, number, number]> = {
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
  // Shelves stand back to back in a row: a unit is about half a hex long.
  shelf: [-0.49, 0.49, -0.31, 0.01],
  bookshelf: [-0.47, 0.47, -0.2, 0.2],
  pallet: [-0.46, 0.46, -0.4, 0.4],
  // A library case as long as its hex is across (Blender, art/blender/obstacle-sets): cases on
  // touching hexes meet end to end.
  'bookcase-long': [-0.86, 0.86, -0.32, 0.32],
  'rack-long': [-0.85, 0.85, -0.25, 0.25],
  // A ridge of rock lies over two hexes, its middle on their shared edge.
  'ridge-snow': [-1.52, 1.52, -0.56, 0.56],
  'ridge-cave': [-1.52, 1.52, -0.56, 0.56],
  'ridge-forest': [-1.52, 1.52, -0.56, 0.56],
  'weapon-rack': [-0.45, 0.45, -0.25, 0.0],
};

/** Shelf pieces shown as one hex-long unit (Blender, art/blender/obstacle-sets) that meets the next
 *  end to end. */
const LONG_UNIT: Record<string, string> = { bookshelf: 'bookcase-long', shelf: 'rack-long' };
/** Which ridge of rock (Blender, art/blender/obstacle-sets/rock_ridge.py) a location's edge gets. */
const RIDGE: Partial<Record<EdgeStyle, string>> = { cliff: 'snow', glass: 'cave', cave: 'cave', mine: 'cave', forest: 'forest', shore: 'forest' };

/** Things that lie as nature or a fall left them (rocks, piles, trees): any turn. Everything else
 *  is made and set down by people, square to the room (0/90° and a few degrees). */
const NATURAL: ReadonlySet<string> = new Set(['ridge-snow', 'ridge-cave', 'ridge-forest', 'boulder', 'snow-rock', 'stalagmite', 'rock', 'rubble-heap', 'ore-pile', 'coal-pile', 'rubble', 'obstacle-tree', 'stump', 'fern', 'mushrooms', 'crystals', 'campfire', 'pillar', 'sack', 'sacks']);
/** Most a made thing is off square, outside a knocked-about (wreck) group: about 3°. */
const SQUARE_JITTER = 0.055;
/** Most things standing on the floor of one obstacle hex. */
const FLOOR_PER_HEX = 3;
/** Most hexes one cluster spans. */
const MAX_GROUP = 5;
/** How close an overhanging item may come to the centre of a free neighbouring hex (a figure). */
const FIGURE_CLEAR = 0.58;

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
  /** Set out on purpose beside item `near`: at [x, z] in that item's own frame, turned `turn` more
   *  (quarter turns). A stool at a table's side, a crate by a shelf, a trough by an anvil. */
  at?: [number, number, number?];
}

const S = (p: string, o: Omit<Spec, 'p'> = {}): Spec => ({ p, ...o });
const SMALL: [number, number] = [0.6, 0.74];

/** Cluster recipes for one hex, by the piece the location stands on it; one is picked per hex. */
const SINGLE: Record<string, Spec[][]> = {
  // Made things are a furniture group set out on purpose around the main thing (`at`, in its frame):
  // what people would really put there, square to it.
  barrel: [
    [S('barrel', { s: [1, 1.08] }), S('barrel', { s: [0.9, 0.96], near: 0, at: [0.68, 0.04] }), S('crate', { s: SMALL, near: 0, at: [0.1, 0.6] })],
    [S('barrel'), S('barrel', { near: 0, tip: 'side', s: [0.8, 0.88], at: [0.05, 0.62, 1] }), S('sack', { near: 0, at: [-0.6, 0.12] })],
  ],
  crate: [
    [S('pallet'), S('crate', { s: [0.92, 1], on: 0 }), S('crate', { s: SMALL, on: 1 }), S('barrel', { s: [0.74, 0.84], near: 0, at: [0.78, 0.05] })],
    [S('crate', { s: [1.02, 1.12] }), S('crate', { s: SMALL, on: 0 }), S('crate', { s: [0.82, 0.9], near: 0, at: [0.66, 0.02] })],
  ],
  // A table with its stools at the sides, a third at the end now and then.
  table: [[S('table'), S('stool', { near: 0, at: [0, 0.52] }), S('stool', { s: [0.9, 0.96], near: 0, at: [0, -0.52] }), S('stool', { near: 0, chance: 0.4, at: [0.66, 0] })]],
  // A stack of crates on its pallet, a sack against it.
  'crate-stack': [[S('pallet', { s: [1.04, 1.1] }), S('crate-stack', { s: [0.86, 0.94], on: 0 }), S('sack', { near: 0, at: [0.1, 0.6] })]],
  sacks: [[S('sacks'), S('sack', { near: 0, at: [0.52, 0.1] }), S('crate', { s: SMALL, near: 0, at: [-0.56, 0.05] })]],
  sack: [[S('sacks'), S('sack', { near: 0, at: [0.52, 0.1] }), S('crate', { s: SMALL, near: 0, at: [-0.56, 0.05] })]],
  'keg-rack': [[S('keg-rack'), S('barrel', { s: [0.78, 0.9], near: 0, at: [0.78, -0.1] }), S('stool', { near: 0, at: [0, 0.62] })]],
  'crate-broken': [[S('crate-broken'), S('crate', { s: [0.74, 0.88], near: 0, at: [0.62, 0] }), S('barrel', { s: [0.8, 0.9], near: 0, tip: 'side', at: [0, 0.6, 1] })]],
  // The smith's corner: the trough with a barrel of water and the coal by it.
  'quench-trough': [[S('quench-trough'), S('barrel', { s: [0.74, 0.86], near: 0, at: [0.72, 0] }), S('coal-pile', { s: SMALL, near: 0, at: [-0.66, 0.1] })]],
  // An anvil with its tool rack behind and a crate of stock beside.
  anvil: [[S('anvil'), S('weapon-rack', { s: [0.82, 0.9], near: 0, at: [0, -0.5] }), S('crate', { s: SMALL, near: 0, at: [0.6, 0.15] })]],
  'obstacle-tree': [
    [S('obstacle-tree'), S('stump', { near: 0 }), S('fern', { near: 0 }), S('mushrooms', { near: 0 }), S('fern', { s: SMALL, near: 1, chance: 0.6 })],
    [S('obstacle-tree'), S('boulder', { s: [0.42, 0.56], near: 0 }), S('fern', { near: 0 }), S('log', { s: [0.45, 0.55], near: 0 }), S('fern', { s: SMALL, near: 1, chance: 0.6 })],
  ],
  boulder: [[S('boulder', { s: [1.02, 1.16] }), S('boulder', { s: [0.55, 0.7], near: 0 }), S('boulder', { s: [0.3, 0.4], near: 0 })]],
  'snow-rock': [[S('snow-rock', { s: [1.02, 1.16] }), S('snow-rock', { s: [0.5, 0.66], near: 0 }), S('boulder', { s: [0.3, 0.4], near: 0 })]],
  stalagmite: [[S('stalagmite'), S('stalagmite', { s: [0.45, 0.6], near: 0 }), S('boulder', { s: [0.35, 0.45], near: 0 })]],
  // The column brings its own fallen drums (column.ts); a stone and a boulder from the rock kit at its foot.
  pillar: [[S('pillar', { centre: true }), S('rock', { s: [0.6, 0.75], near: 0 }), S('boulder', { s: [0.26, 0.34], near: 0 })]],
  // In a cave a standing stone grows out of rock: a stalagmite and broken rock at its foot.
  'pillar@cave': [[S('pillar', { centre: true }), S('rubble-heap', { s: [0.55, 0.68], near: 0 }), S('stalagmite', { s: [0.55, 0.7], near: 0 }), S('crystals', { s: [0.7, 0.9], near: 0 })]],
  'mine-support': [[S('mine-support', { centre: true }), S('timber-stack', { s: [0.68, 0.8], near: 0 }), S('ore-pile', { s: [0.8, 0.95], near: 0 }), S('rubble', { s: [1.1, 1.3], near: 0, chance: 0.7 })]],
  'mine-cart': [[S('mine-cart', { s: [1.08, 1.18] }), S('ore-pile', { s: [0.9, 1.02], near: 0 }), S('rubble-heap', { s: [0.5, 0.6], near: 0 }), S('crate', { s: SMALL, near: 0, tip: 'lean', chance: 0.7 })]],
  'rubble-heap': [[S('rubble-heap', { s: [1.02, 1.15] }), S('boulder', { s: [0.36, 0.46], near: 0 }), S('timber-stack', { s: [0.5, 0.6], near: 0, chance: 0.7 }), S('rubble', { s: [1, 1.25], near: 0 })]],
  'ore-pile': [[S('ore-pile', { s: [1.05, 1.15] }), S('ore-pile', { s: SMALL, near: 0 }), S('rubble', { near: 0 })]],
  'coal-pile': [[S('coal-pile', { s: [1.05, 1.15] }), S('coal-pile', { s: SMALL, near: 0 }), S('barrel', { s: [0.7, 0.8], near: 0 })]],
  // A bunk with a stool at its foot and a kit bag by it.
  bunk: [[S('bunk'), S('stool', { near: 0, at: [0.48, 0.5] }), S('sack', { near: 0, at: [-0.46, 0.52] })]],
  hut: [[S('hut', { centre: true }), S('timber-stack', { s: [0.55, 0.65], near: 0 }), S('barrel', { s: [0.7, 0.8], near: 0 })]],
  campfire: [[S('campfire', { centre: true }), S('log', { s: [0.5, 0.6], near: 0 }), S('stump', { s: [0.8, 0.9], near: 0 })]],
  // Shelves are set out as a row (placeShelves), not from a recipe.
  shelf: [[S('shelf')]],
  bookshelf: [[S('bookshelf')]],
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
  'long-table': [S('long-table', { along: true, s: [0.94, 1.04] }), S('chair', { near: 0, s: [0.94, 1.04] }), S('chair', { near: 0, s: [0.94, 1.04] }), S('chair', { near: 0, tip: 'side', s: [0.94, 1.04] }), S('chair', { near: 0, chance: 0.5, s: [0.94, 1.04] }), S('barrel', { s: [0.62, 0.72], near: 0, chance: 0.6 })],
  'crate-pile': [
    S('crate', { s: [1.08, 1.18] }),
    S('crate', { s: [0.62, 0.72], on: 0 }),
    S('crate', { near: 0 }),
    S('crate-broken', { near: 2 }),
    S('sacks', { near: 0 }),
    S('crate', { s: SMALL, near: 2, tip: 'lean' }),
  ],
  wagon: [S('cart', { along: true, s: [0.94, 1.04] }), S('sacks', { near: 0 }), S('barrel', { s: [0.8, 0.9], near: 0 }), S('crate', { s: SMALL, near: 0, chance: 0.7 })],
  'trees-log': [S('obstacle-tree'), S('obstacle-tree', { s: [0.8, 0.92], near: 0 }), S('log', { near: 0, s: [1, 1.1] }), S('fern', { near: 1 }), S('mushrooms', { near: 2 })],
  outcrop: [S('boulder', { s: [1.2, 1.3] }), S('boulder', { s: [0.85, 0.95], near: 0 }), S('boulder', { s: [0.55, 0.65], near: 1 }), S('boulder', { s: [0.32, 0.4], near: 0 }), S('boulder', { s: [0.28, 0.36], near: 2 })],
  // A cart is longer than a hex and the hut fills the other one: a woodpile, a barrel and sacks instead.
  yard: [S('hut', { centre: true }), S('timber-stack', { s: [0.55, 0.65], near: 0 }), S('barrel', { s: [0.72, 0.82], near: 1 }), S('sacks', { s: [0.7, 0.8], near: 2 }), S('crate', { s: SMALL, near: 1 })],
};

/** Which pieces may join a set piece with a neighbour, by family. */
const FAMILY: Record<string, string> = {
  barrel: 'goods',
  crate: 'goods',
  'crate-stack': 'goods',
  'crate-broken': 'goods',
  // Tables join tables (a long table), not the crates beside them.
  table: 'table',
  sacks: 'goods',
  sack: 'goods',
  'keg-rack': 'goods',
  'obstacle-tree': 'tree',
  boulder: 'rock',
  'snow-rock': 'rock',
  stalagmite: 'rock',
  hut: 'hut',
  shelf: 'shelf',
  bookshelf: 'shelf',
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
  glass: ['crate-pile', 'long-table'],
};
/** Set pieces for goods in a room of this kind: no wagon indoors, a long table with stools in a
 *  house's rooms (not down a mine or in a forge). */
function goodsSets(edge: EdgeStyle, kind: RoomKind | undefined): string[] {
  if (kind !== 'indoor') return GOODS_SETS[edge];
  return edge === 'mine' || edge === 'forge' ? GOODS_SETS[edge] : ['long-table', 'barrel-pile', 'crate-pile'];
}
const FAMILY_SETS: Record<string, string[]> = { tree: ['trees-log'], rock: ['outcrop'], hut: ['yard'], table: ['long-table'] };

/** Litter on the floor by location look, and what certain things add. */
// The litter shapes are the Blender scatter kit's (assets/models/scatter-kit, scatter_kit.py):
// `<kind>_<n>` nodes, 4 variants each; how far each reaches across the floor at scale 1.
const LITTER_REACH: Record<string, number> = { chips: 0.07, plank: 0.11, stick: 0.22, straw: 0.17, pebbles: 0.09, 'leaf-pile': 0.09, 'pine-cone': 0.06, shards: 0.08, snow: 0.14 };
const LITTER_VARIANTS = 4;
const LITTER: Record<EdgeStyle, string[]> = {
  stone: ['chips', 'straw', 'stick', 'plank'],
  tower: ['chips', 'stick', 'straw', 'pebbles'],
  timber: ['straw', 'chips', 'stick', 'plank'],
  shore: ['straw', 'stick', 'leaf-pile'],
  forest: ['leaf-pile', 'stick', 'pine-cone', 'pebbles'],
  cliff: ['pebbles', 'stick', 'snow'],
  cave: ['pebbles', 'pebbles', 'shards'],
  mine: ['pebbles', 'chips', 'stick'],
  forge: ['pebbles', 'shards', 'stick'],
  glass: ['shards', 'shards', 'chips'],
};
const LITTER_BY_PIECE: Record<string, string> = {
  sacks: 'straw',
  sack: 'straw',
  'crate-broken': 'plank',
  'obstacle-tree': 'leaf-pile',
  'ore-pile': 'pebbles',
  'coal-pile': 'pebbles',
  'rubble-heap': 'pebbles',
  rubble: 'pebbles',
  'timber-stack': 'chips',
  campfire: 'stick',
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
  variant?: number;
  /** Footprint box in its own frame (scaled, after a tip onto its side). */
  box: [number, number, number, number];
  /** What it is stacked on. */
  under?: Placed;
}

/** Set pieces modelled in Blender (assets/models/cluster-kit, art/blender/cluster-kit/cluster_kit.py):
 *  `<kind>_<n>` nodes at life size, KIT_VARIANTS each, drawn from the kit with no stand-in. */
export const CLUSTER_KIT = 'cluster-kit';
const KIT_PIECES: ReadonlySet<string> = new Set(['long-table', 'chair', 'cart']);
const KIT_VARIANTS = 4;
const BOUNDS = MODEL_BOUNDS as Record<string, number[]>;

/** A kit piece's variant bounds [minX, maxX, minY, maxY, minZ, maxZ] at scale 1 (tools/model-bounds.mjs). */
function kitBounds(piece: string, variant = 0): number[] | undefined {
  return BOUNDS[`${CLUSTER_KIT}#${piece}_${(variant % KIT_VARIANTS) + 1}`];
}

/** Height of a piece in a cluster at scale 1 (a kit piece's own, else the nominal one). */
function heightOf(piece: string, variant?: number): number {
  const kb = KIT_PIECES.has(piece) ? kitBounds(piece, variant) : undefined;
  return kb ? kb[3]! : (HEIGHT[piece] ?? pieceMeta(piece)?.height ?? 1);
}

function footprint(piece: string, scale: number, tip: ClusterItem['tip'], variant?: number): [number, number, number, number] {
  const meta = pieceMeta(piece);
  const kb = KIT_PIECES.has(piece) ? kitBounds(piece, variant) : undefined;
  const k = kb ? 1 : (HEIGHT[piece] ?? meta?.height ?? 1) / (meta?.height ?? 1);
  const r = meta?.radius ?? 0.4;
  const [x0, x1, z0, z1] = kb ? [kb[0]!, kb[1]!, kb[4]!, kb[5]!] : (FOOT[piece] ?? [-r, r, -r, r]);
  const s = k * scale;
  if (tip === 'side') {
    // Tipped over onto its side (about local X): its height now lies along Z, centred.
    const h = heightOf(piece, variant) * scale;
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
  const kindOf = new Map(scenario.rooms.map((r) => [r.id, r.kind]));
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
  // Touching obstacle hexes of one family in one room are one thing (a row of shelves, a pile of
  // crates and barrels, a ridge of rocks): connected runs of up to MAX_GROUP hexes.
  const keys = [...pieces.keys()].sort();
  const taken = new Set<HexKey>();
  const groups: HexKey[][] = [];
  for (const k of keys) {
    if (taken.has(k)) continue;
    taken.add(k);
    const group = [k];
    const fam = FAMILY[pieces.get(k)!];
    for (let i = 0; fam && i < group.length; i++) {
      for (const n of neighbors(parseHexKey(group[i]!))
        .map((h) => hexKey(h))
        .sort()) {
        if (group.length >= MAX_GROUP) break;
        if (taken.has(n) || !pieces.has(n) || roomOf.get(n) !== roomOf.get(k) || FAMILY[pieces.get(n)!] !== fam) continue;
        taken.add(n);
        group.push(n);
      }
    }
    groups.push(group);
  }
  const centreOf = (k: HexKey) => hexToWorld(...parseHexKey(k));

  // At most one group of made things per room may be knocked about (toppled, leaning, at odd
  // angles), and only some rooms have one; the rest stands square.
  const wreck = new Set<number>();
  for (const room of scenario.rooms) {
    const made = groups.map((g, i) => ({ g, i })).filter(({ g }) => roomOf.get(g[0]!) === room.id && !NATURAL.has(pieces.get(g[0]!)!) && FAMILY[pieces.get(g[0]!)!] !== 'shelf');
    const rnd = seededRandom(`${scenario.id}:wreck:${room.id}`);
    if (made.length && rnd() < 0.6) wreck.add(made[Math.floor(rnd() * made.length)]!.i);
  }

  const usedSets: { set: string; x: number; z: number }[] = [];
  for (const [gi, group] of groups.entries()) {
    const room = roomOf.get(group[0]!)!;
    const edge = def.rooms?.[room]?.edge ?? def.edge;
    const rnd = seededRandom(`${scenario.id}:obstacles:${group.join('|')}`);
    const region = new Set(group);
    const fam = FAMILY[pieces.get(group[0]!)!];
    // The group's line (or, for one hex, the row it makes with the same thing nearby in its room),
    // snapped to the room's square when it is close to it.
    const line = groupAxis(group.map(centreOf)) ?? rowAxis(group[0]!, pieces, roomOf);
    // A lone shelf faces the room (its back to the far wall); other lone things take any quarter turn.
    const base = line !== null ? snapSquare(line) : fam === 'shelf' ? 0 : Math.floor(rnd() * 4) * (Math.PI / 2);
    const orient: Orient = { base, axis: line ?? base, wreck: wreck.has(gi) };
    let placed: Placed[];
    if (fam === 'shelf') {
      placed = placeShelves(group, pieces, orient, rnd);
    } else if (group.length > 1) {
      // Two tables side by side are always one long table with its stools.
      const tables = group.every((k) => pieces.get(k) === 'table');
      // Goods of one kind make one pile of it; mixed goods (a crate stack, a barrel, a crate stack)
      // stay what they are, each on its hex, set out square to one line ('row').
      const same = group.every((k) => pieces.get(k) === pieces.get(group[0]!));
      const options = tables ? ['long-table'] : fam === 'goods' ? (same ? goodsSets(edge, kindOf.get(room)).filter((o) => o !== 'long-table') : ['row']) : FAMILY_SETS[fam!]!;
      const centres = group.map(centreOf);
      const mid = centres.reduce((a, c) => ({ x: a.x + c.x / centres.length, z: a.z + c.z / centres.length }), { x: 0, z: 0 });
      // Not the same set piece as one close by, when the location has another.
      const near = new Set(usedSets.filter((u) => Math.hypot(u.x - mid.x, u.z - mid.z) < 6).map((u) => u.set));
      const order = options.map((o) => ({ o, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.o);
      const set = order.find((o) => !near.has(o)) ?? order[0]!;
      usedSets.push({ set, ...mid });
      // One set piece the length of the group: its hexes along the line in pairs, every pair the
      // same set, an odd one out its own hex's things, all square to one line.
      const along = [...group].sort((a, b) => proj(centreOf(a), orient.axis) - proj(centreOf(b), orient.axis));
      placed = [];
      for (let i = 0; i < along.length; i += 2) {
        const seg = along.slice(i, i + 2);
        if (set === 'row') {
          for (const k of seg) placed.push(...placeRecipe(singleRecipe(pieces.get(k)!, edge, rnd), region, [centreOf(k)], rnd, orient, placed, playable));
          continue;
        }
        if (fam === 'rock' && seg.length === 2) {
          // Two touching rock hexes are one ridge of the region's rock across both (Blender).
          const [a, b] = seg.map(centreOf) as [{ x: number; z: number }, { x: number; z: number }];
          const piece = `ridge-${RIDGE[edge] ?? 'cave'}`;
          const rot = Math.atan2(-(b.z - a.z), b.x - a.x) + (rnd() < 0.5 ? Math.PI : 0);
          placed.push({ spec: S(piece), piece, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: 0, rot, scale: 1, tip: 'none', lean: 0, leanDir: 0, box: footprint(piece, 1, 'none') });
          continue;
        }
        const recipe = seg.length === 2 ? COMPOSITE[set]! : singleRecipe(pieces.get(seg[0]!)!, edge, rnd);
        placed.push(...placeRecipe(recipe, region, seg.map(centreOf), rnd, orient, placed, playable));
      }
    } else {
      placed = placeRecipe(singleRecipe(pieces.get(group[0]!)!, edge, rnd), region, group.map(centreOf), rnd, orient, [], playable);
    }
    // One thing or a small pile: at most FLOOR_PER_HEX things on the floor, 2 more for every further
    // hex of a group (the recipes put the main things first); what stood on a dropped one goes too.
    let floor = 0;
    placed = placed.filter((p) => p.y > 0 || ++floor <= FLOOR_PER_HEX + 2 * (group.length - 1));
    placed = placed.filter((p) => !p.under || placed.includes(p.under));
    // Shelves and tables are where people keep things in order: swept, no litter.
    const litter = fam === 'shelf' || fam === 'table' ? [] : placeLitter(placed, edge, playable, blocked, rnd);
    for (const k of group) plans.set(k, { items: [], litter: [] });
    const toHex = (p: Placed, list: 'items' | 'litter', home?: HexKey) => {
      const k = home ?? hexKey(worldToHex(p.x, p.z));
      const plan = plans.get(k) ?? plans.get(group[0]!)!;
      const key = plans.has(k) ? k : group[0]!;
      const [q, r] = parseHexKey(key);
      const c = hexToWorld(q, r);
      plan[list].push({ piece: p.piece, x: p.x - c.x, y: p.y, z: p.z - c.z, rot: p.rot, scale: p.scale, h: heightOf(p.piece, p.variant) * p.scale, tip: p.tip, lean: p.lean, leanDir: p.leanDir, ...(p.variant !== undefined ? { variant: p.variant } : {}) });
    };
    // A stacked item goes with the hex of the one it stands on.
    for (const p of placed) toHex(p, 'items', p.under ? hexKey(worldToHex(p.under.x, p.under.z)) : undefined);
    // The group's litter all goes with its first hex (it may lie by another hex of the group, or in a
    // free hex beside it): one merged mesh per material for the group, not for every hex.
    for (const p of litter) toHex(p, 'litter', group[0]!);
  }
  return plans;
}

function between(rnd: () => number, [a, b]: [number, number]): number {
  return a + (b - a) * rnd();
}

/** How a group's things are turned: the room's square or the group's line, and whether this is
 *  the room's one knocked-about group. */
interface Orient {
  /** Turn of the made things (0/90° of the room, or the group's line when that is off square). */
  base: number;
  /** The group's line, for things that lie along it (a long table, a cart, a log). */
  axis: number;
  wreck: boolean;
}

/** Direction of a group's longest stretch (three.js turn of local +X onto it), or null for one hex. */
function groupAxis(centres: { x: number; z: number }[]): number | null {
  if (centres.length < 2) return null;
  let best = [centres[0]!, centres[1]!];
  let d = -1;
  for (const a of centres) {
    for (const b of centres) {
      const dd = Math.hypot(a.x - b.x, a.z - b.z);
      if (dd > d + 1e-6) {
        d = dd;
        best = a.x < b.x || (a.x === b.x && a.z < b.z) ? [a, b] : [b, a];
      }
    }
  }
  return Math.atan2(-(best[1]!.z - best[0]!.z), best[1]!.x - best[0]!.x);
}

/** A lone hex's row: the line to the nearest hex within 2 steps in its room with the same thing on
 *  it (a library's shelves set out in rows), or null. */
function rowAxis(k: HexKey, pieces: Map<HexKey, string>, roomOf: Map<HexKey, string>): number | null {
  const [q, r] = parseHexKey(k);
  let best: HexKey | null = null;
  let bd = Infinity;
  for (const [o, piece] of [...pieces].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (o === k || piece !== pieces.get(k) || roomOf.get(o) !== roomOf.get(k)) continue;
    const [oq, or] = parseHexKey(o);
    // On a straight hex line counts as nearer (a row), at the same distance.
    const straight = oq === q || or === r || oq + or === q + r;
    const d = (Math.abs(oq - q) + Math.abs(or - r) + Math.abs(oq + or - q - r)) / 2 - (straight ? 0.5 : 0);
    if (d <= 2 && d < bd) {
      bd = d;
      best = o;
    }
  }
  return best ? groupAxis([hexToWorld(q, r), hexToWorld(...parseHexKey(best))]) : null;
}

/** A line's turn, snapped onto the room's square (0/90°) when it is within 20° of it. */
function snapSquare(a: number): number {
  const q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  return Math.abs(a - q) < 0.35 ? q : a;
}

/** Position of a point along a turn's +X. */
function proj(c: { x: number; z: number }, axis: number): number {
  return c.x * Math.cos(axis) - c.z * Math.sin(axis);
}

function singleRecipe(piece: string, edge: EdgeStyle, rnd: () => number): Spec[] {
  const list = SINGLE[`${piece}@${edge}`] ?? SINGLE[piece]!;
  return list[Math.floor(rnd() * list.length)]!;
}

/** Shelves as a wall: every shelf hex is one hex-long unit along the row (LONG_UNIT), so units on
 *  touching hexes meet end to end as one long case or rack; every other one is turned round, so a
 *  row shows both faces, never the same face twice. */
function placeShelves(group: HexKey[], pieces: Map<HexKey, string>, orient: Orient, rnd: () => number): Placed[] {
  const along = [...group].sort((a, b) => proj(hexToWorld(...parseHexKey(a)), orient.base) - proj(hexToWorld(...parseHexKey(b)), orient.base));
  return group.map((k) => {
    const c = hexToWorld(...parseHexKey(k));
    const unit = LONG_UNIT[pieces.get(k)!]!;
    const turn = along.indexOf(k) % 2 ? Math.PI : 0;
    return { spec: S(unit), piece: unit, x: c.x, z: c.z, y: 0, rot: orient.base + turn + between(rnd, [-0.01, 0.01]), scale: 1, tip: 'none', lean: 0, leanDir: 0, box: footprint(unit, 1, 'none') };
  });
}

/** A made thing's turn: the group's square, a quarter turn of it, a few degrees off. */
function squareTurn(orient: Orient, rnd: () => number): number {
  return orient.base + Math.floor(rnd() * 4) * (Math.PI / 2) + between(rnd, [-SQUARE_JITTER, SQUARE_JITTER]);
}

/** Places a recipe's items inside the region (a set of hex keys), never overlapping each other or
 *  `others` (the rest of the group). Made things stand square (`orient`) unless the group is the
 *  room's wreck; things may overhang a free neighbouring hex's rim, never where its figure stands. */
function placeRecipe(recipe: Spec[], region: Set<HexKey>, centres: { x: number; z: number }[], rnd: () => number, orient: Orient, others: Placed[], playable: Set<HexKey>): Placed[] {
  const placed: Placed[] = [];
  const regionHas = (x: number, z: number) => region.has(hexKey(worldToHex(x, z)));
  const fits = (x: number, z: number) => {
    const k = hexKey(worldToHex(x, z));
    if (region.has(k)) return true;
    if (!playable.has(k)) return false;
    const c = hexToWorld(...parseHexKey(k));
    return Math.hypot(x - c.x, z - c.z) > FIGURE_CLEAR;
  };
  const axis = centres.length > 1 ? Math.atan2(-(centres[1]!.z - centres[0]!.z), centres[1]!.x - centres[0]!.x) : orient.axis;
  const mid = centres.reduce((a, c) => ({ x: a.x + c.x / centres.length, z: a.z + c.z / centres.length }), { x: 0, z: 0 });
  // A furniture group stands about its hex's middle, its things set out round the main one.
  const arranged = recipe.some((s) => s.at);
  for (const spec of recipe) {
    if (spec.chance !== undefined && rnd() > spec.chance) continue;
    const natural = NATURAL.has(spec.p);
    let scale = between(rnd, spec.s ?? [0.87, 1.15]);
    // Outside the wreck, made things stand; a barrel may lie on its side, as barrels are stored.
    const tip: ClusterItem['tip'] = orient.wreck || natural || (spec.tip === 'side' && spec.p === 'barrel') ? (spec.tip ?? 'none') : 'none';
    const lean = tip === 'lean' ? between(rnd, [0.14, 0.26]) : 0;
    const leanDir = rnd() * Math.PI * 2;
    const variant = KIT_PIECES.has(spec.p) ? Math.floor(rnd() * KIT_VARIANTS) : undefined;
    let box = footprint(spec.p, scale, tip, variant);
    const h = heightOf(spec.p, variant) * scale;
    if (spec.on !== undefined) {
      const base = placed[placedIndex(placed, recipe, spec.on)];
      if (!base) continue;
      const top = base.tip === 'side' ? (base.box[1] - base.box[0]) * 0.95 : heightOf(base.piece, base.variant) * base.scale * 0.97;
      const a = rnd() * Math.PI * 2;
      const d = between(rnd, [0.03, 0.09]);
      // A crate on a crate sits square on it (a quarter turn); only in a wreck is it askew.
      const rot = orient.wreck ? base.rot + between(rnd, [-0.7, 0.7]) : base.rot + Math.floor(rnd() * 4) * (Math.PI / 2) + between(rnd, [-SQUARE_JITTER, SQUARE_JITTER]);
      placed.push({ spec, piece: spec.p, x: base.x + Math.cos(a) * d, z: base.z + Math.sin(a) * d, y: base.y + top, rot, scale, tip, lean, leanDir, box, variant, under: base });
      continue;
    }
    // Never a copy beside a copy: the same thing in the group is a size apart.
    const floor = [...others, ...placed].filter((p) => p.y === 0 && p.piece === spec.p);
    for (let i = 0, up = rnd() < 0.5; i < 6; i++) {
      const twin = floor.find((p) => Math.abs(p.scale - scale) < 0.07);
      if (!twin) break;
      scale = twin.scale + (up ? 0.08 : -0.08);
    }
    box = footprint(spec.p, scale, tip, variant);
    const target = spec.near !== undefined ? placed[placedIndex(placed, recipe, spec.near)] : undefined;
    let done: Placed | null = null;
    for (let attempt = 0; attempt < 140 && !done; attempt++) {
      const strict = attempt < 70;
      let x: number;
      let z: number;
      let rot = natural || orient.wreck ? rnd() * Math.PI * 2 : squareTurn(orient, rnd);
      // Logs lie the way the group runs, as if they fell together.
      if (spec.p === 'log') rot = axis + between(rnd, [-0.25, 0.25]);
      if (spec.at && target && attempt < 4) {
        // Set out where it belongs beside its main thing (the other side on a second try), square
        // to it; a little off now and then, as people put things down.
        const [ax, az, turn = 0] = spec.at;
        const lx = (attempt % 2 ? -ax : ax) + between(rnd, [-0.04, 0.04]);
        const lz = az + between(rnd, [-0.04, 0.04]);
        const c = Math.cos(target.rot);
        const s = Math.sin(target.rot);
        x = target.x + lx * c + lz * s;
        z = target.z - lx * s + lz * c;
        rot = orient.wreck ? rnd() * Math.PI * 2 : natural ? rot : target.rot + turn * (Math.PI / 2) + Math.floor(rnd() * 2) * Math.PI + between(rnd, [-SQUARE_JITTER, SQUARE_JITTER]);
      } else if (spec.along) {
        // Along the pair's line, a few degrees off straight, anywhere along it.
        rot = axis + between(rnd, [-SQUARE_JITTER, SQUARE_JITTER]) + (rnd() < 0.5 ? Math.PI : 0);
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
        const d = arranged && !placed.length ? between(rnd, [0.03, 0.16]) : Math.sqrt(rnd()) * 0.55;
        x = c.x + Math.cos(a) * d;
        z = c.z + Math.sin(a) * d;
        if (!arranged && !placed.length && !others.length && centres.length === 1 && d < 0.12) continue;
      }
      const cand: Placed = { spec, piece: spec.p, x, z, y: 0, rot, scale, tip, lean, leanDir, box, variant };
      if (!regionHas(x, z)) continue;
      if (!outline(cand, strict ? 0.04 : 0.02).every((v) => fits(v.x, v.z))) continue;
      if ([...others, ...placed].some((p) => p.y === 0 && overlaps(p, cand, strict ? 0.02 : 0.08))) continue;
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
    const scale = between(rnd, [1.5, 2.2]);
    const r = (LITTER_REACH[piece] ?? 0.1) * scale;
    const variant = Math.floor(rnd() * LITTER_VARIANTS);
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
    out.push({ spec: { p: piece }, piece, x, z, y: 0, rot: rnd() * Math.PI * 2, scale, tip: 'none', lean: 0, leanDir: 0, box: [-r, r, -r, r], variant });
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
  /** The Blender scatter kit's shapes by node name (`chips_1`…). */
  loadKit(): Promise<Map<string, Part[]>>;
  /** The Blender cluster kit's set pieces by node name (`long-table_1`…). */
  loadClusterKit(): Promise<Map<string, Part[]>>;
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
  // What never moves is one mesh per material, not one per part (a draw call each); the merged
  // geometry is the location's to free with the rest (mergeParts marks it its own).
  const merge = (o: THREE.Object3D) => {
    mergeStaticParts(o);
    o.traverse((c) => {
      if (c.userData['mergedGeometry']) ctx.track((c as THREE.Mesh).geometry);
    });
    return o;
  };
  // The cluster's contact shadows, one mesh between them.
  const shadows = new THREE.Group();
  shadows.name = 'contact-shadows';
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
    const kitPiece = KIT_PIECES.has(it.piece);
    const placeholder = kitPiece ? null : ctx.makePiece(it.piece);
    const meta = pieceMeta(it.piece);
    if (placeholder && meta) {
      placeholder.scale.setScalar(it.h / meta.height);
      body.add(merge(placeholder));
    }
    if (kitPiece) {
      // A Blender kit piece at life size: shown once the kit has loaded, in the location's colours.
      void ctx.loadClusterKit().then((kit) => {
        const parts = kit.get(`${it.piece}_${((it.variant ?? 0) % KIT_VARIANTS) + 1}`);
        if (!parts || !ctx.alive() || !body.parent) return;
        const group = new THREE.Group();
        for (const part of parts) {
          const key = typeof part.material === 'string' ? part.material : part.material.name;
          const g = part.geometry;
          if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
          const mesh = new THREE.Mesh(g, ctx.material((key in PALETTE_DEFAULTS ? key : 'wood') as MaterialKey));
          mesh.applyMatrix4(part.matrix);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        }
        group.scale.setScalar(it.scale);
        body.add(group);
        settle(tilt, it.tip === 'side');
        ctx.onChange();
      });
    }
    settle(tilt, it.tip === 'side');
    const foot = footprint(it.piece, it.scale, it.tip, it.variant);
    const reach = Math.max(foot[1] - foot[0], foot[3] - foot[2]) / 2;
    // A contact shadow under the bigger things only (each is a draw call); a stool or a small crate
    // beside them sits in theirs.
    if (it.y === 0 && reach >= 0.3 && FAMILY[it.piece] !== 'shelf') {
      const blob = ctx.shadow(reach);
      if (blob) {
        blob.position.set(it.x, 0.004, it.z);
        shadows.add(blob);
      }
    }
    root.add(holder);
    const nominal = HEIGHT[it.piece] ?? meta?.height ?? 1;
    const spec = kitPiece ? null : ctx.propSpec(it.piece, nominal);
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
  if (shadows.children.length) root.add(merge(shadows));
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

/** Litter of one hex from the Blender scatter kit, merged into one mesh per palette material once
 *  the kit has loaded (nothing is drawn before). */
function buildLitter(items: ClusterItem[], ctx: ClusterContext): THREE.Group | null {
  if (!items.length) return null;
  const group = new THREE.Group();
  group.name = 'obstacle-litter';
  void ctx.loadKit().then((kit) => {
    if (!ctx.alive() || !group.parent) return;
    const byMat = new Map<string, THREE.BufferGeometry[]>();
    const m = new THREE.Matrix4();
    for (const it of items) {
      const parts = kit.get(`${it.piece}_${((it.variant ?? 0) % LITTER_VARIANTS) + 1}`) ?? kit.get(`${it.piece}_1`);
      if (!parts) continue;
      const place = new THREE.Matrix4().compose(new THREE.Vector3(it.x, 0, it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot), new THREE.Vector3(it.scale, it.scale, it.scale));
      for (const part of parts) {
        const key = typeof part.material === 'string' ? part.material : part.material.name;
        const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
        g.applyMatrix4(m.multiplyMatrices(place, part.matrix));
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        const list = byMat.get(key) ?? [];
        list.push(g);
        byMat.set(key, list);
      }
    }
    for (const [key, list] of byMat) {
      const merged = mergeGeometries(list);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(merged.getAttribute('position').count * 3).fill(1), 3));
      ctx.track(merged);
      const mesh = new THREE.Mesh(merged, ctx.material((key in PALETTE_DEFAULTS ? key : 'wood') as MaterialKey));
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    ctx.onChange();
  });
  return group;
}
