// Procedural placeholder pieces of the environment, by kit id. Each piece is a few painted low-poly
// parts (geometry + palette material + local matrix) in the kit's frame: origin at the bottom
// centre, 1 unit = one hex size, the piece faces +Z (toward the board). Walls run along X with
// their inner face at z = 0 and their body behind it (−Z). An art kit made in Blender replaces a
// piece by exporting a GLB with the same id and frame (see README.md here); everything that
// places pieces stays the same.

import * as THREE from 'three';

export type MaterialKey =
  | 'stone'
  | 'stoneDark'
  | 'stoneLight'
  | 'shadow'
  | 'wood'
  | 'woodDark'
  | 'woodLight'
  | 'iron'
  | 'cloth'
  | 'clothDark'
  | 'straw'
  | 'leaf'
  | 'leafDark'
  | 'leafWarm'
  | 'berry'
  | 'bark'
  | 'moss'
  | 'rock'
  | 'rockDark'
  | 'reed'
  | 'lily'
  | 'banner'
  | 'bottle'
  | 'crystal'
  | 'flame'
  | 'glow'
  | 'glowCold';

/** Default colours; data/environments/<id>.json `palette` overrides any of them. */
export const PALETTE_DEFAULTS: Record<MaterialKey, string> = {
  stone: '#a08f7c',
  stoneDark: '#6e6157',
  stoneLight: '#c2b29c',
  shadow: '#1e1814',
  wood: '#8a5a34',
  woodDark: '#5a3a22',
  woodLight: '#b08050',
  iron: '#4a4c52',
  cloth: '#d8c6a2',
  clothDark: '#9a8460',
  straw: '#c9a560',
  leaf: '#6a8a3a',
  leafDark: '#3e5a2c',
  leafWarm: '#c27a32',
  berry: '#b8342c',
  bark: '#5e4632',
  moss: '#6e8a44',
  rock: '#8a8478',
  rockDark: '#5a5650',
  reed: '#9aa05a',
  lily: '#5a8a4a',
  banner: '#4a2a5e',
  bottle: '#2e4a3a',
  crystal: '#9a6ad8',
  flame: '#ffc35a',
  glow: '#ffd27a',
  glowCold: '#8ad0e0',
};

/** Unlit (they shine): flames, lit windows, glowing fungi. Crystals are lit but emissive. */
export const UNLIT: ReadonlySet<MaterialKey> = new Set(['flame', 'glow', 'glowCold', 'shadow']);

export interface Part {
  geometry: THREE.BufferGeometry;
  /** A palette key for procedural parts; an art kit's own material for kit parts. */
  material: MaterialKey | THREE.Material;
  matrix: THREE.Matrix4;
  /** Small detail left out on the low quality level. */
  detail: boolean;
}

export type PieceKind = 'wall' | 'corner' | 'doorway' | 'edge' | 'prop' | 'feature';

export interface PieceMeta {
  kind: PieceKind;
  /** Height and footprint radius (for placement and for keeping the board in view). */
  height: number;
  radius: number;
  /** A light source on the piece (a point light may be put there), in the piece's frame. */
  light?: { x: number; y: number; z: number; kind: 'flame' | 'lantern' | 'crystal' | 'window' };
}

export interface BuildOptions {
  /** Wall height for wall, corner and doorway pieces. */
  height: number;
}

interface PieceDef extends PieceMeta {
  build(b: Builder, o: BuildOptions): void;
}

type V3 = [number, number, number];

/** Collects the parts of one piece. */
export class Builder {
  readonly parts: Part[] = [];

  add(geometry: THREE.BufferGeometry, material: MaterialKey, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], detail = false): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
    this.parts.push({ geometry: g, material, matrix: m, detail });
    return this;
  }

  /** Box by size, positioned by its centre. */
  box(material: MaterialKey, size: V3, pos: V3, rot: V3 = [0, 0, 0], detail = false): this {
    return this.add(new THREE.BoxGeometry(...size), material, pos, rot, [1, 1, 1], detail);
  }

  /** Cylinder standing on `pos` (bottom centre) unless rotated. */
  cyl(material: MaterialKey, rTop: number, rBottom: number, h: number, seg: number, pos: V3, rot: V3 = [0, 0, 0], detail = false): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg).translate(0, h / 2, 0), material, pos, rot, [1, 1, 1], detail);
  }

  cone(material: MaterialKey, r: number, h: number, seg: number, pos: V3, rot: V3 = [0, 0, 0], detail = false): this {
    return this.add(new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0), material, pos, rot, [1, 1, 1], detail);
  }

  /** A soft lumpy blob (foliage, sacks). */
  blob(material: MaterialKey, r: number, pos: V3, scale: V3 = [1, 1, 1], detail = false): this {
    return this.add(new THREE.IcosahedronGeometry(r, 1), material, pos, [0, 0, 0], scale, detail);
  }

  /** An angular rock. */
  rock(material: MaterialKey, r: number, pos: V3, scale: V3 = [1, 1, 1], rot: V3 = [0, 0, 0], detail = false): this {
    return this.add(new THREE.DodecahedronGeometry(r, 0), material, pos, rot, scale, detail);
  }
}

// ─── Walls and edges ───────────────────────────────────────────────────────

const WALL_LEN = 1.06;
const WALL_THICK = 0.3;

/** Stone blocks standing a little out of a wall's face, so it reads as masonry. */
function blocks(b: Builder, h: number, seed: number, mat: MaterialKey = 'stoneLight'): void {
  const rows = Math.max(1, Math.floor((h - 0.25) / 0.3));
  for (let i = 0; i < rows; i++) {
    const y = 0.32 + i * 0.3;
    const x = (((seed * 7 + i * 13) % 10) / 10 - 0.5) * 0.6;
    const w = 0.26 + ((seed + i * 3) % 4) * 0.05;
    b.box(mat, [w, 0.2, 0.04], [x, y, 0.01], [0, 0, 0], true);
  }
}

function masonryWall(b: Builder, h: number, seed: number): void {
  b.box('stone', [WALL_LEN, h, WALL_THICK], [0, h / 2, -WALL_THICK / 2]);
  b.box('stoneDark', [WALL_LEN + 0.02, 0.18, WALL_THICK + 0.06], [0, 0.09, -WALL_THICK / 2]);
  b.box('stoneDark', [WALL_LEN + 0.04, 0.1, WALL_THICK + 0.08], [0, h + 0.05, -WALL_THICK / 2]);
  blocks(b, h, seed);
}

function lowWall(b: Builder, h: number, mat: MaterialKey = 'stone', cap: MaterialKey = 'stoneDark'): void {
  b.box(mat, [WALL_LEN, h, WALL_THICK], [0, h / 2, -WALL_THICK / 2]);
  b.box(cap, [WALL_LEN + 0.02, 0.06, WALL_THICK + 0.04], [0, h + 0.03, -WALL_THICK / 2]);
}

function pillar(b: Builder, h: number, mat: MaterialKey = 'stone', cap: MaterialKey = 'stoneDark'): void {
  b.box(mat, [0.38, h + 0.12, 0.38], [0, (h + 0.12) / 2, -0.1]);
  b.box(cap, [0.46, 0.12, 0.46], [0, h + 0.18, -0.1]);
  b.box(cap, [0.44, 0.16, 0.44], [0, 0.08, -0.1]);
}

/** A wall with an arched niche holding a candle (cellar). */
function archWall(b: Builder, h: number): void {
  b.box('stone', [WALL_LEN, h, WALL_THICK], [0, h / 2, -WALL_THICK / 2]);
  b.box('stoneDark', [WALL_LEN + 0.02, 0.18, WALL_THICK + 0.06], [0, 0.09, -WALL_THICK / 2]);
  b.box('stoneDark', [WALL_LEN + 0.04, 0.1, WALL_THICK + 0.08], [0, h + 0.05, -WALL_THICK / 2]);
  const top = Math.min(h - 0.25, 1.05);
  b.box('shadow', [0.52, top - 0.25, 0.02], [0, 0.25 + (top - 0.25) / 2, 0.006]);
  b.add(new THREE.CircleGeometry(0.26, 10, 0, Math.PI), 'shadow', [0, top, 0.006]);
  b.add(new THREE.TorusGeometry(0.3, 0.06, 4, 10, Math.PI), 'stoneLight', [0, top, 0.02]);
  for (const x of [-0.3, 0.3]) b.box('stoneLight', [0.1, top - 0.2, 0.06], [x, 0.2 + (top - 0.2) / 2, 0.02]);
  b.box('stoneLight', [0.6, 0.05, 0.12], [0, 0.42, 0.04]);
  b.cyl('cloth', 0.035, 0.04, 0.14, 6, [0.08, 0.445, 0.05], [0, 0, 0], true);
  b.cone('flame', 0.03, 0.08, 5, [0.08, 0.59, 0.05], [0, 0, 0], true);
}

/** A wall with an arrow slit and a cold sliver of light (tower). */
function slitWall(b: Builder, h: number, seed: number): void {
  masonryWall(b, h, seed);
  b.box('shadow', [0.12, 0.62, 0.02], [0, h * 0.62, 0.006]);
  b.box('glowCold', [0.04, 0.5, 0.02], [0, h * 0.62, 0.012]);
  b.box('stoneLight', [0.3, 0.06, 0.08], [0, h * 0.62 - 0.34, 0.03]);
}

function doorway(b: Builder, h: number, frame: MaterialKey, cap: MaterialKey): void {
  const open = 1.2;
  for (const x of [-0.42, 0.42]) b.box(frame, [0.22, h, WALL_THICK + 0.04], [x, h / 2, -WALL_THICK / 2]);
  b.box(frame, [WALL_LEN, h - open, WALL_THICK], [0, open + (h - open) / 2, -WALL_THICK / 2]);
  b.box(cap, [WALL_LEN + 0.04, 0.1, WALL_THICK + 0.08], [0, h + 0.05, -WALL_THICK / 2]);
  b.box(cap, [0.86, 0.14, WALL_THICK + 0.08], [0, open + 0.07, -WALL_THICK / 2]);
  b.box('shadow', [0.62, 0.02, 0.5], [0, 0.005, -0.25]);
}

function timberWall(b: Builder, h: number, window: boolean): void {
  b.box('wood', [WALL_LEN, h, 0.16], [0, h / 2, -0.08]);
  for (let i = 0; i < 5; i++) b.box('woodDark', [0.02, h - 0.1, 0.02], [-0.42 + i * 0.21, h / 2, 0.005], [0, 0, 0], true);
  b.box('woodDark', [WALL_LEN + 0.04, 0.16, 0.22], [0, h * 0.55, -0.08]);
  b.box('woodDark', [WALL_LEN + 0.04, 0.14, 0.24], [0, h + 0.07, -0.08]);
  b.box('stoneDark', [WALL_LEN + 0.02, 0.2, 0.26], [0, 0.1, -0.08]);
  if (window) {
    b.box('woodDark', [0.5, 0.42, 0.06], [0, h * 0.75, 0.02]);
    b.box('glow', [0.38, 0.3, 0.02], [0, h * 0.75, 0.05]);
  }
}

/** A clump of thicket (autumn leaves, dark brambles) instead of a wall outdoors. */
function thicket(b: Builder, h: number, thorns: boolean): void {
  b.blob('leafDark', 0.42, [-0.25, h * 0.38, -0.12], [1.1, h * 1.1, 1]);
  b.blob(thorns ? 'leafDark' : 'leaf', 0.38, [0.22, h * 0.34, -0.05], [1, h * 1.15, 1]);
  b.blob('leafWarm', 0.3, [0.02, h * 0.62, -0.22], [1, h * 1.0, 1]);
  if (thorns) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      b.cone('woodDark', 0.03, 0.22, 4, [Math.cos(a) * 0.4, 0.15 + (i % 3) * h * 0.2, Math.sin(a) * 0.25 + 0.05], [Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8], true);
    }
    for (let i = 0; i < 4; i++) b.blob('berry', 0.045, [-0.3 + i * 0.2, h * 0.45 + (i % 2) * 0.12, 0.2], [1, 1, 1], true);
  }
}

function reedBank(b: Builder, h: number): void {
  b.rock('rock', 0.28, [-0.25, 0.04, -0.1], [1.4, 0.4, 1]);
  for (let i = 0; i < 9; i++) {
    const x = -0.45 + (i % 5) * 0.22 + (i > 4 ? 0.1 : 0);
    const z = i > 4 ? -0.18 : 0.02;
    const hh = h * (0.7 + ((i * 7) % 5) * 0.08);
    b.cone('reed', 0.035, hh, 4, [x, 0, z], [((i % 3) - 1) * 0.12, 0, ((i % 2) - 0.5) * 0.15]);
  }
  for (const x of [-0.2, 0.25]) b.cyl('woodDark', 0.03, 0.03, 0.14, 5, [x, h * 0.72, -0.05], [0, 0, 0], true);
}

function rockWall(b: Builder, h: number, crystal: boolean): void {
  b.rock('rockDark', 0.42, [-0.28, h * 0.42, -0.22], [1, h * 1.25, 0.9], [0.3, 0.5, 0.1]);
  b.rock('rock', 0.36, [0.25, h * 0.32, -0.12], [1.1, h * 1.1, 0.8], [0.2, 1.2, 0.3]);
  b.rock('rockDark', 0.3, [0.02, h * 0.75, -0.32], [1.2, h * 0.9, 0.9], [0.6, 0.2, 0.4]);
  b.rock('rock', 0.18, [0.05, 0.12, 0.12], [1.3, 0.7, 1], [0, 0.4, 0], true);
  if (crystal) {
    for (let i = 0; i < 4; i++) {
      b.add(new THREE.OctahedronGeometry(0.1, 0), 'crystal', [-0.1 + i * 0.09, 0.32 + (i % 2) * 0.1, 0.1], [0.3 * (i - 1.5), 0, 0.25 * (i - 1.5)], [0.7, 2.4, 0.7]);
    }
  }
}

function wall(build: (b: Builder, o: BuildOptions) => void, kind: PieceKind = 'wall', light?: PieceMeta['light']): PieceDef {
  return { kind, height: 1.6, radius: 0.55, ...(light ? { light } : {}), build };
}

// ─── Props ─────────────────────────────────────────────────────────────────

/** Bulge of a barrel's staves at height t (0..1 of its height), in units of its scale. */
function barrelRadius(t: number): number {
  return 0.27 + 0.06 * Math.sin(t * Math.PI);
}

/** A cooper's barrel: separate staves with dark gaps, iron hoops, a sunk lid with plank seams. */
function barrel(b: Builder, pos: V3 = [0, 0, 0], s = 1, rot: V3 = [0, 0, 0]): void {
  const h = 0.88;
  const staves = 12;
  const step = (Math.PI * 2) / staves;
  const pts = [0, 0.12, 0.3, 0.5, 0.7, 0.88, 1].map((t) => new THREE.Vector2(barrelRadius(t) * s, t * h * s));
  // Every part is built around the barrel's foot, then placed by `pos` and turned by `rot`.
  const part = (g: THREE.BufferGeometry, mat: MaterialKey, detail = false) => b.add(g, mat, pos, rot, [1, 1, 1], detail);
  for (let i = 0; i < staves; i++) part(new THREE.LatheGeometry(pts, 2, i * step, step * 0.9), i % 3 === 1 ? 'woodLight' : 'wood');
  part(new THREE.CylinderGeometry(0.26 * s, 0.26 * s, h * s * 0.97, staves, 1, true).translate(0, (h * s) / 2, 0), 'woodDark');
  part(new THREE.CircleGeometry(0.265 * s, staves).rotateX(-Math.PI / 2).translate(0, h * s * 0.96, 0), 'woodDark');
  for (const x of [-0.09, 0.09]) part(new THREE.BoxGeometry(0.012 * s, 0.004 * s, 0.48 * s).translate(x * s, h * s * 0.965, 0), 'shadow', true);
  for (const [t, detail] of [[0.1, false], [0.38, true], [0.9, false]] as const) {
    const r = (barrelRadius(t) + 0.012) * s;
    part(new THREE.CylinderGeometry(r, r, 0.045 * s, staves * 2, 1, true).translate(0, t * h * s, 0), 'iron', detail);
  }
}

/** Turns a point (x, z) by `ry` around the vertical axis. */
function turned(x: number, z: number, ry: number): [number, number] {
  return [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
}

/** A plank crate: a panelled box framed by dark beams on all twelve edges, braced across the sides. */
function crate(b: Builder, size: number, pos: V3, ry = 0): void {
  const half = size / 2;
  const beam = size * 0.11;
  const at = (x: number, y: number, z: number): V3 => {
    const [tx, tz] = turned(x, z, ry);
    return [pos[0] + tx, pos[1] + y, pos[2] + tz];
  };
  b.box('wood', [size * 0.96, size * 0.96, size * 0.96], at(0, half, 0), [0, ry, 0]);
  const e = half - beam / 2;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.box('woodDark', [beam, size, beam], at(x * e, half, z * e), [0, ry, 0]);
  for (const y of [beam / 2, size - beam / 2]) {
    for (const z of [-1, 1]) b.box('woodDark', [size, beam, beam], at(0, y, z * e), [0, ry, 0]);
    for (const x of [-1, 1]) b.box('woodDark', [beam, beam, size], at(x * e, y, 0), [0, ry, 0]);
  }
  // A diagonal brace on each side and a seam between two planks.
  const brace = Math.hypot(size, size) * 0.78;
  for (let side = 0; side < 4; side++) {
    const a = ry + (side * Math.PI) / 2;
    const [nx, nz] = [Math.sin(a), Math.cos(a)];
    b.box('woodDark', [beam * 0.8, brace, beam * 0.45], [pos[0] + nx * half, pos[1] + half, pos[2] + nz * half], [0, a, Math.PI / 4 * (side % 2 ? 1 : -1)], true);
    b.box('shadow', [size * 0.8, 0.008, 0.004], [pos[0] + nx * (half - 0.002), pos[1] + size * 0.36, pos[2] + nz * (half - 0.002)], [0, a, 0], true);
  }
}

/** A tied grain sack standing on its bottom. */
function sack(b: Builder, pos: V3, s: number, mat: MaterialKey, rot: V3 = [0, 0, 0]): void {
  const pts = [[0, 0], [0.19, 0.01], [0.25, 0.08], [0.27, 0.2], [0.24, 0.31], [0.15, 0.39], [0.07, 0.43], [0.06, 0.46], [0.1, 0.5], [0.08, 0.54], [0, 0.55]].map(([x, y]) => new THREE.Vector2(x! * s, y! * s));
  b.add(new THREE.LatheGeometry(pts, 9), mat, pos, rot);
  b.add(new THREE.TorusGeometry(0.068 * s, 0.014 * s, 4, 9).rotateX(Math.PI / 2).translate(0, 0.445 * s, 0), 'woodDark', pos, rot, [1, 1, 1], true);
}

/** A bank of reeds and cattails on a low mud ridge. */
function reedFence(b: Builder, h: number): void {
  b.blob('moss', 0.3, [0, 0.02, 0], [1.9, 0.25, 0.6]);
  for (let i = 0; i < 16; i++) {
    const x = -0.5 + (i / 15) * 1.0 + ((i * 37) % 7) * 0.006;
    const z = ((i * 53) % 5) * 0.04 - 0.08;
    const hh = h * (0.6 + ((i * 29) % 7) * 0.06);
    b.cone('reed', 0.03, hh, 4, [x, 0, z], [((i % 3) - 1) * 0.12, 0, ((i % 4) - 1.5) * 0.08]);
    if (i % 4 === 1) b.cyl('woodDark', 0.025, 0.025, 0.13, 5, [x + 0.01, hh * 0.72, z], [0, 0, 0], true);
  }
}

/** A hedge of brambles and leaves with a few thorns. */
function hedge(b: Builder, h: number): void {
  b.blob('leafDark', 0.32, [-0.3, h * 0.42, 0], [1.1, h * 1.3, 0.85]);
  b.blob('leaf', 0.3, [0.05, h * 0.5, 0.02], [1.15, h * 1.35, 0.85]);
  b.blob('leafWarm', 0.26, [0.36, h * 0.4, -0.02], [1, h * 1.2, 0.85]);
  for (let i = 0; i < 6; i++) b.cone('woodDark', 0.025, 0.2, 4, [-0.4 + i * 0.16, h * (0.3 + (i % 3) * 0.2), ((i % 2) - 0.5) * 0.4], [((i % 2) - 0.5) * 1.6, 0, 0.3 * (i - 2.5)], true);
  for (let i = 0; i < 4; i++) b.blob('berry', 0.04, [-0.3 + i * 0.2, h * (0.6 + (i % 2) * 0.15), 0.22], [1, 1, 1], true);
}

/** Tumbled rocks along an edge; `n` stones. */
function rockPile(b: Builder, h: number, seed: number): void {
  const stones: [number, number, number, number][] = [[-0.36, 0.14, 0.22, 0], [0.02, 0.16, 0.25, 0.04], [0.38, 0.13, 0.21, -0.04], [-0.17, h * 0.55, 0.17, 0.02], [0.2, h * 0.58, 0.16, 0], [0.02, h * 0.82, 0.12, 0.02], [-0.5, 0.08, 0.12, 0.1], [0.52, 0.08, 0.11, -0.1]];
  stones.forEach(([x, y, r, z], i) => b.rock(i % 3 === 1 ? 'rock' : 'rockDark', r, [x, y, z], [1.2, 0.85, 1], [seed * 0.3 + i, i * 0.9, seed * 0.1], i > 5));
}

/** Two fallen trunks stacked across an edge, with a stub and moss. */
function logWall(b: Builder): void {
  b.cyl('bark', 0.15, 0.17, 1.15, 8, [-0.57, 0.16, 0], [0, 0, -Math.PI / 2]);
  b.cyl('bark', 0.12, 0.14, 0.95, 8, [-0.45, 0.4, -0.03], [0.1, 0.15, -Math.PI / 2]);
  for (const x of [-0.57, 0.58]) b.add(new THREE.CircleGeometry(0.15, 8), 'woodLight', [x, 0.16, 0], [0, x < 0 ? -Math.PI / 2 : Math.PI / 2, 0], [1, 1, 1], true);
  b.blob('moss', 0.11, [0.1, 0.3, 0.02], [2.4, 0.45, 1], true);
  b.cyl('bark', 0.035, 0.05, 0.3, 5, [0.3, 0.45, 0], [0, 0, -0.6], true);
}

/** Sharpened stakes and cross planks lashed across a gap. */
function barricade(b: Builder): void {
  for (let i = 0; i < 5; i++) {
    const x = -0.42 + i * 0.21;
    const h = 0.72 + ((i * 37) % 5) * 0.05;
    b.cyl('wood', 0.045, 0.05, h, 6, [x, 0, 0], [0, 0, ((i % 2) - 0.5) * 0.12]);
    b.cone('woodLight', 0.045, 0.14, 6, [x + ((i % 2) - 0.5) * 0.12 * h, h, 0], [0, 0, ((i % 2) - 0.5) * 0.12], true);
  }
  for (const [y, a] of [[0.22, 0.05], [0.55, -0.06]] as const) b.box('woodDark', [1.08, 0.09, 0.05], [0, y, 0.07], [0, 0, a]);
  b.box('woodDark', [1.2, 0.07, 0.04], [0, 0.42, -0.06], [0, 0, 0.55], true);
  b.cyl('cloth', 0.05, 0.05, 0.06, 6, [-0.21, 0.52, 0.08], [Math.PI / 2, 0, 0], true);
}

/** A heap of cut branches and brush. */
function brushPile(b: Builder): void {
  b.blob('leafDark', 0.3, [-0.22, 0.24, 0], [1.2, 0.8, 0.85]);
  b.blob('leafWarm', 0.26, [0.22, 0.22, 0.04], [1.2, 0.8, 0.85]);
  b.blob('leaf', 0.22, [0, 0.45, -0.02], [1.3, 0.7, 0.8]);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI - Math.PI / 2;
    b.cyl('bark', 0.025, 0.03, 0.7, 5, [-0.35 + i * 0.12, 0.08, ((i % 3) - 1) * 0.12], [((i % 2) - 0.5) * 0.4, 0, Math.PI / 2 + a * 0.45]);
  }
}

/** A mine cart: a tapered wooden tub with iron bands on four wheels. */
function mineCart(b: Builder): void {
  b.add(new THREE.CylinderGeometry(0.42, 0.34, 0.42, 4, 1).rotateY(Math.PI / 4).scale(1.3, 1, 0.85).translate(0, 0.42, 0), 'wood');
  b.add(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 4, 1).rotateY(Math.PI / 4).scale(1.32, 1, 0.87).translate(0, 0.6, 0), 'woodDark');
  for (const y of [0.3, 0.52]) b.add(new THREE.CylinderGeometry(0.4, 0.37, 0.04, 4, 1, true).rotateY(Math.PI / 4).scale(1.31, 1, 0.86).translate(0, y, 0), 'iron', [0, 0, 0], [0, 0, 0], [1, 1, 1], true);
  for (const x of [-0.26, 0.26]) for (const z of [-0.24, 0.24]) b.cyl('iron', 0.11, 0.11, 0.05, 10, [x, 0.11, z + (z > 0 ? -0.025 : 0.025)], [Math.PI / 2, 0, 0]);
  b.rock('rockDark', 0.14, [0.08, 0.62, 0], [1.3, 0.6, 1], [0.3, 0.2, 0], true);
  b.rock('rock', 0.1, [-0.15, 0.62, 0.05], [1.2, 0.6, 1], [0.1, 0.7, 0], true);
}

function tree(b: Builder, h: number, warm: boolean): void {
  b.cyl('bark', 0.1, 0.2, h * 0.62, 7, [0, 0, 0]);
  b.cyl('bark', 0.05, 0.08, 0.5, 5, [0.1, h * 0.4, 0], [0, 0, -0.7], true);
  b.blob(warm ? 'leafWarm' : 'leaf', 0.62, [0, h * 0.72, 0], [1, 0.85, 1]);
  b.blob('leafDark', 0.5, [0.38, h * 0.6, -0.2], [1, 0.8, 1]);
  b.blob(warm ? 'leaf' : 'leafDark', 0.45, [-0.36, h * 0.62, 0.15], [1, 0.8, 1]);
  b.add(new THREE.TorusGeometry(0.22, 0.06, 4, 8, Math.PI), 'bark', [0.12, 0.02, 0.1], [Math.PI / 2, 0, 0.6], [1, 1, 1], true);
}

function pine(b: Builder, h: number): void {
  b.cyl('bark', 0.07, 0.14, h * 0.3, 6, [0, 0, 0]);
  b.cone('leafDark', 0.62, h * 0.45, 7, [0, h * 0.22, 0]);
  b.cone('leafDark', 0.48, h * 0.38, 7, [0, h * 0.44, 0]);
  b.cone('leaf', 0.32, h * 0.3, 7, [0, h * 0.64, 0]);
}

function flameOn(b: Builder, pos: V3, size = 1): void {
  b.cone('flame', 0.045 * size, 0.13 * size, 5, pos);
  b.blob('glow', 0.05 * size, [pos[0], pos[1] + 0.03 * size, pos[2]], [1, 1, 1], true);
}

function brazier(b: Builder, lit: boolean): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box('iron', [0.06, 0.45, 0.06], [Math.cos(a) * 0.2, 0.22, Math.sin(a) * 0.2], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25]);
  }
  b.add(new THREE.SphereGeometry(0.32, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 'stoneDark', [0, 0.72, 0]);
  b.add(new THREE.CircleGeometry(0.29, 10).rotateX(-Math.PI / 2), lit ? 'flame' : 'rockDark', [0, 0.66, 0]);
  if (lit) {
    flameOn(b, [0, 0.66, 0], 2.6);
    flameOn(b, [0.12, 0.66, 0.05], 1.6);
    flameOn(b, [-0.1, 0.66, -0.08], 1.8);
  } else {
    for (let i = 0; i < 4; i++) b.rock('rockDark', 0.07, [Math.cos(i * 1.6) * 0.12, 0.68, Math.sin(i * 1.6) * 0.12], [1, 0.7, 1], [0, 0, 0], true);
  }
}

function lever(b: Builder, down: boolean): void {
  b.box('stoneDark', [0.5, 0.25, 0.4], [0, 0.125, 0]);
  b.box('iron', [0.08, 0.12, 0.3], [0, 0.31, 0]);
  const angle = down ? 1.1 : -0.35;
  b.cyl('woodDark', 0.035, 0.04, 0.75, 6, [0, 0.3, 0], [angle, 0, 0]);
  b.blob('iron', 0.07, [0, 0.3 + Math.cos(angle) * 0.75, Math.sin(angle) * 0.75]);
}

const PIECES: Record<string, PieceDef> = {
  // Cellar (stone with arches), tower (stone with slits), mill hall (timber).
  'stone-wall': wall((b, o) => masonryWall(b, o.height, 3)),
  'stone-arch': wall((b, o) => archWall(b, o.height), 'wall', { x: 0.08, y: 0.62, z: 0.12, kind: 'flame' }),
  'stone-wall-low': wall((b, o) => lowWall(b, o.height)),
  'stone-pillar': wall((b, o) => pillar(b, o.height), 'corner'),
  'stone-pillar-low': wall((b, o) => pillar(b, o.height), 'corner'),
  'stone-doorway': wall((b, o) => doorway(b, o.height, 'stone', 'stoneDark'), 'doorway'),
  'tower-wall': wall((b, o) => masonryWall(b, o.height, 5)),
  'tower-slit': wall((b, o) => slitWall(b, o.height, 2), 'wall', { x: 0, y: 1.0, z: 0.25, kind: 'window' }),
  'tower-wall-low': wall((b, o) => lowWall(b, o.height)),
  'tower-pillar': wall((b, o) => pillar(b, o.height), 'corner'),
  'tower-pillar-low': wall((b, o) => pillar(b, o.height), 'corner'),
  'tower-doorway': wall((b, o) => doorway(b, o.height, 'stone', 'stoneDark'), 'doorway'),
  'timber-wall': wall((b, o) => timberWall(b, o.height, false)),
  'timber-window': wall((b, o) => timberWall(b, o.height, true), 'wall', { x: 0, y: 1.1, z: 0.3, kind: 'window' }),
  'timber-wall-low': wall((b, o) => lowWall(b, o.height, 'wood', 'woodDark')),
  'timber-post': wall((b, o) => pillar(b, o.height, 'woodDark', 'woodDark'), 'corner'),
  'timber-post-low': wall((b, o) => pillar(b, o.height, 'woodDark', 'woodDark'), 'corner'),
  'timber-doorway': wall((b, o) => doorway(b, o.height, 'woodDark', 'woodDark'), 'doorway'),
  // Outdoors: thickets, reeds and rock instead of walls.
  thicket: { kind: 'edge', height: 1.0, radius: 0.6, build: (b, o) => thicket(b, o.height, false) },
  'thicket-thorn': { kind: 'edge', height: 1.0, radius: 0.6, build: (b, o) => thicket(b, o.height, true) },
  'thicket-low': { kind: 'edge', height: 0.4, radius: 0.5, build: (b) => thicket(b, 0.42, false) },
  'forest-gap': {
    kind: 'doorway',
    height: 0.4,
    radius: 0.6,
    build: (b) => {
      b.rock('moss', 0.2, [-0.5, 0.1, -0.05], [1, 0.8, 1]);
      b.rock('rock', 0.16, [0.52, 0.08, 0], [1.2, 0.7, 1]);
    },
  },
  'reeds-bank': { kind: 'edge', height: 0.9, radius: 0.55, build: (b) => reedBank(b, 0.95) },
  'reeds-low': { kind: 'edge', height: 0.4, radius: 0.5, build: (b) => reedBank(b, 0.42) },
  'rock-wall': { kind: 'edge', height: 1.6, radius: 0.6, build: (b, o) => rockWall(b, o.height, false) },
  'rock-wall-crystal': { kind: 'edge', height: 1.6, radius: 0.6, light: { x: 0, y: 0.45, z: 0.2, kind: 'crystal' }, build: (b, o) => rockWall(b, o.height, true) },
  'rock-low': { kind: 'edge', height: 0.4, radius: 0.5, build: (b) => rockWall(b, 0.42, false) },
  'rock-pillar': {
    kind: 'corner',
    height: 2.0,
    radius: 0.4,
    build: (b, o) => {
      b.cone('rockDark', 0.34, o.height * 1.15, 6, [0, 0, -0.1]);
      b.rock('rock', 0.26, [0.05, 0.12, 0], [1.3, 0.6, 1.1], [0.2, 0.5, 0]);
    },
  },
  'rock-pillar-low': { kind: 'corner', height: 0.35, radius: 0.35, build: (b) => b.rock('rockDark', 0.24, [0, 0.1, 0], [1.2, 0.7, 1]) },
  'cave-mouth': {
    kind: 'doorway',
    height: 1.6,
    radius: 0.6,
    build: (b, o) => {
      b.rock('rockDark', 0.4, [-0.52, o.height * 0.4, -0.2], [0.8, o.height * 1.2, 0.9]);
      b.rock('rockDark', 0.4, [0.52, o.height * 0.4, -0.2], [0.8, o.height * 1.2, 0.9]);
      b.rock('rock', 0.45, [0, o.height * 0.95, -0.25], [1.6, 0.5, 0.9]);
      b.add(new THREE.CircleGeometry(0.5, 8), 'shadow', [0, 0.55, -0.3], [0, 0, 0], [0.9, 1.2, 1]);
    },
  },

  // Features by the entrance and the exit.
  stairs: {
    kind: 'feature',
    height: 1.4,
    radius: 0.7,
    light: { x: 0, y: 1.5, z: -1.4, kind: 'lantern' },
    build: (b) => {
      for (let i = 0; i < 5; i++) b.box(i % 2 ? 'wood' : 'woodLight', [0.7, 0.12, 0.3], [0, 0.06 + i * 0.24, -0.25 - i * 0.28]);
      for (const x of [-0.4, 0.4]) b.box('woodDark', [0.08, 0.1, 1.6], [x, 0.7, -0.8], [-0.7, 0, 0]);
      b.box('glow', [0.7, 0.5, 0.02], [0, 1.45, -1.6]);
    },
  },
  'lantern-post': {
    kind: 'feature',
    height: 1.7,
    radius: 0.3,
    light: { x: 0.32, y: 1.32, z: 0, kind: 'lantern' },
    build: (b) => {
      b.cyl('woodDark', 0.05, 0.07, 1.6, 6, [0, 0, 0]);
      b.box('woodDark', [0.4, 0.05, 0.05], [0.17, 1.55, 0]);
      b.box('iron', [0.18, 0.04, 0.18], [0.32, 1.5, 0]);
      b.box('glow', [0.14, 0.2, 0.14], [0.32, 1.37, 0]);
      b.box('iron', [0.18, 0.03, 0.18], [0.32, 1.26, 0]);
      b.rock('moss', 0.14, [0.05, 0.05, 0.08], [1.2, 0.6, 1], [0, 0, 0], true);
    },
  },
  hut: {
    kind: 'feature',
    height: 2.6,
    radius: 1.5,
    light: { x: 0.45, y: 0.9, z: 1.1, kind: 'window' },
    build: (b) => {
      b.box('wood', [2.0, 1.4, 1.7], [0, 0.7, 0]);
      b.add(new THREE.CylinderGeometry(1.3, 1.3, 2.3, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6), 'straw', [0, 1.75, 0], [0, 0, 0], [1, 0.62, 0.85]);
      b.box('woodDark', [0.42, 0.8, 0.04], [-0.45, 0.4, 0.86]);
      b.box('woodDark', [0.44, 0.38, 0.05], [0.45, 0.9, 0.86]);
      b.box('glow', [0.34, 0.28, 0.02], [0.45, 0.9, 0.89]);
      b.box('stoneDark', [0.3, 0.9, 0.3], [0.6, 2.2, -0.3], [0, 0, 0], true);
    },
  },
  'mill-wheel': {
    kind: 'prop',
    height: 2.8,
    radius: 1.4,
    build: (b) => {
      b.add(new THREE.TorusGeometry(1.25, 0.09, 5, 18), 'woodDark', [0, 1.3, 0]);
      b.add(new THREE.TorusGeometry(0.7, 0.06, 4, 14), 'woodDark', [0, 1.3, 0], [0, 0, 0], [1, 1, 1], true);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.box('wood', [0.08, 2.4, 0.08], [0, 1.3, 0], [0, 0, a]);
        b.box('wood', [0.4, 0.06, 0.5], [Math.cos(a) * 1.3, 1.3 + Math.sin(a) * 1.3, 0], [0, 0, a], true);
      }
      b.cyl('iron', 0.14, 0.14, 0.4, 8, [0, 1.3, -0.2], [Math.PI / 2, 0, 0]);
      b.blob('moss', 0.3, [-0.9, 0.5, 0.05], [1.2, 0.5, 0.6], true);
    },
  },

  // Cellar.
  barrel: { kind: 'prop', height: 0.9, radius: 0.35, build: (b) => barrel(b) },
  'keg-rack': {
    kind: 'prop',
    height: 0.95,
    radius: 0.6,
    build: (b) => {
      // Kegs lying on a cradle, their lids toward the board.
      for (const [x, y] of [[-0.25, 0.25], [0.25, 0.25], [0, 0.63]] as const) barrel(b, [x, y, -0.3], 0.66, [Math.PI / 2, 0, 0]);
      b.box('woodDark', [0.95, 0.08, 0.6], [0, 0.04, -0.02]);
      for (const x of [-0.42, 0, 0.42]) b.box('woodDark', [0.08, 0.12, 0.62], [x, 0.1, -0.02], [0, 0, 0], true);
    },
  },
  crate: { kind: 'prop', height: 0.6, radius: 0.4, build: (b) => crate(b, 0.58, [0, 0, 0]) },
  'crate-stack': {
    kind: 'prop',
    height: 1.1,
    radius: 0.5,
    build: (b) => {
      crate(b, 0.56, [0, 0, 0]);
      crate(b, 0.46, [0.04, 0.56, -0.02], 0.4);
      crate(b, 0.36, [0.5, 0, 0.12], -0.3);
    },
  },
  sack: { kind: 'prop', height: 0.5, radius: 0.3, build: (b) => sack(b, [0, 0, 0], 0.95, 'cloth', [0, 0, 0.06]) },
  sacks: {
    kind: 'prop',
    height: 0.55,
    radius: 0.5,
    build: (b) => {
      sack(b, [-0.2, 0, 0], 0.9, 'cloth', [0, 0, 0.1]);
      sack(b, [0.22, 0, 0.05], 0.85, 'clothDark', [0.05, 0, -0.12]);
      // One lying across the others' feet.
      sack(b, [-0.15, 0.17, 0.26], 0.75, 'cloth', [0, 0.4, -Math.PI / 2 + 0.1]);
    },
  },

  'wine-rack': {
    kind: 'prop',
    height: 1.3,
    radius: 0.55,
    build: (b) => {
      b.box('woodDark', [1.0, 1.3, 0.04], [0, 0.65, -0.32]);
      for (const x of [-0.48, 0.48]) b.box('woodDark', [0.06, 1.3, 0.36], [x, 0.65, -0.15]);
      for (let i = 0; i < 4; i++) b.box('wood', [0.98, 0.04, 0.36], [0, 0.1 + i * 0.36, -0.15]);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          b.cyl('bottle', 0.055, 0.055, 0.3, 6, [-0.36 + col * 0.18, 0.2 + row * 0.36, -0.28], [Math.PI / 2, 0, 0], true);
        }
      }
    },
  },
  candles: {
    kind: 'prop',
    height: 0.6,
    radius: 0.3,
    light: { x: 0, y: 0.62, z: 0, kind: 'flame' },
    build: (b) => {
      crate(b, 0.36, [0, 0, 0]);
      b.cyl('cloth', 0.045, 0.05, 0.16, 6, [-0.06, 0.36, 0]);
      b.cyl('cloth', 0.04, 0.045, 0.1, 6, [0.08, 0.36, 0.05]);
      flameOn(b, [-0.06, 0.52, 0]);
      flameOn(b, [0.08, 0.46, 0.05], 0.8);
    },
  },
  shelf: {
    kind: 'prop',
    height: 1.25,
    radius: 0.5,
    build: (b) => {
      for (const x of [-0.45, 0.45]) b.box('woodDark', [0.06, 1.25, 0.3], [x, 0.62, -0.15]);
      for (let i = 0; i < 3; i++) b.box('wood', [0.96, 0.04, 0.32], [0, 0.35 + i * 0.4, -0.15]);
      for (let i = 0; i < 6; i++) {
        const mat: MaterialKey = i % 3 === 0 ? 'clothDark' : i % 3 === 1 ? 'bottle' : 'cloth';
        b.cyl(mat, 0.07, 0.08, 0.18, 6, [-0.32 + (i % 3) * 0.3, 0.37 + Math.floor(i / 3) * 0.4, -0.15], [0, 0, 0], true);
      }
    },
  },

  // Forest.
  tree: { kind: 'prop', height: 3.0, radius: 0.9, build: (b) => tree(b, 3.0, true) },
  'tree-green': { kind: 'prop', height: 3.0, radius: 0.9, build: (b) => tree(b, 3.0, false) },
  pine: { kind: 'prop', height: 3.2, radius: 0.7, build: (b) => pine(b, 3.2) },
  'tree-far': {
    kind: 'prop',
    height: 4.6,
    radius: 1.3,
    build: (b) => {
      b.cyl('bark', 0.14, 0.26, 2.2, 6, [0, 0, 0]);
      b.blob('leafDark', 1.1, [0, 3.2, 0], [1, 1.15, 1]);
    },
  },
  bush: {
    kind: 'prop',
    height: 0.6,
    radius: 0.45,
    build: (b) => {
      b.blob('leaf', 0.32, [-0.1, 0.26, 0], [1.1, 0.85, 1]);
      b.blob('leafWarm', 0.24, [0.22, 0.22, 0.08], [1, 0.85, 1], true);
    },
  },
  'thorn-bush': { kind: 'prop', height: 0.75, radius: 0.5, build: (b) => thicket(b, 0.75, true) },
  rock: {
    kind: 'prop',
    height: 0.45,
    radius: 0.4,
    build: (b) => {
      b.rock('rock', 0.3, [0, 0.18, 0], [1.2, 0.75, 1], [0.3, 0.6, 0.2]);
      b.rock('moss', 0.16, [0.24, 0.08, 0.12], [1.1, 0.7, 1], [0.1, 0.2, 0], true);
    },
  },
  roots: {
    kind: 'prop',
    height: 0.25,
    radius: 0.5,
    build: (b) => {
      b.add(new THREE.TorusGeometry(0.34, 0.06, 4, 8, Math.PI), 'bark', [0, 0, 0], [Math.PI / 2, 0, 0.3]);
      b.add(new THREE.TorusGeometry(0.24, 0.045, 4, 7, Math.PI), 'bark', [0.25, 0, -0.15], [Math.PI / 2, 0, 1.6], [1, 1, 1], true);
    },
  },
  mushrooms: {
    kind: 'prop',
    height: 0.3,
    radius: 0.25,
    build: (b) => {
      for (const [x, z, s] of [[0, 0, 1], [0.14, 0.08, 0.7], [-0.1, 0.1, 0.55]] as const) {
        b.cyl('cloth', 0.03 * s, 0.04 * s, 0.16 * s, 5, [x, 0, z]);
        b.add(new THREE.SphereGeometry(0.1 * s, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 'berry', [x, 0.15 * s, z]);
      }
    },
  },
  stump: {
    kind: 'prop',
    height: 0.4,
    radius: 0.35,
    build: (b) => {
      b.cyl('bark', 0.24, 0.3, 0.36, 8, [0, 0, 0]);
      b.add(new THREE.CircleGeometry(0.235, 8).rotateX(-Math.PI / 2), 'woodLight', [0, 0.362, 0]);
    },
  },
  log: {
    kind: 'prop',
    height: 0.35,
    radius: 0.7,
    build: (b) => {
      b.cyl('bark', 0.16, 0.18, 1.3, 8, [-0.65, 0.17, 0], [0, 0, -Math.PI / 2]);
      b.add(new THREE.CircleGeometry(0.155, 8), 'woodLight', [0.66, 0.17, 0], [0, Math.PI / 2, 0]);
      b.blob('moss', 0.14, [0.1, 0.32, 0], [2, 0.4, 0.9], true);
    },
  },
  fern: {
    kind: 'prop',
    height: 0.4,
    radius: 0.35,
    build: (b) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.cone('leaf', 0.08, 0.42, 3, [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]);
      }
    },
  },

  // Flooded mill.
  reeds: { kind: 'prop', height: 0.9, radius: 0.35, build: (b) => reedBank(b, 0.9) },
  lilies: {
    kind: 'prop',
    height: 0.06,
    radius: 0.35,
    build: (b) => {
      for (const [x, z, r] of [[0, 0, 0.16], [0.24, 0.1, 0.12], [-0.15, 0.2, 0.1]] as const) b.add(new THREE.CircleGeometry(r, 7, 0.4, Math.PI * 1.8).rotateX(-Math.PI / 2), 'lily', [x, 0.06, z]);
      b.blob('cloth', 0.04, [0.02, 0.09, 0.02], [1, 0.6, 1], true);
    },
  },
  post: {
    kind: 'prop',
    height: 0.9,
    radius: 0.2,
    build: (b) => {
      b.cyl('woodDark', 0.07, 0.08, 0.9, 6, [0, 0, 0], [0.08, 0, 0.05]);
      b.add(new THREE.TorusGeometry(0.085, 0.02, 4, 8).rotateX(Math.PI / 2), 'straw', [0, 0.62, 0], [0, 0, 0], [1, 1, 1], true);
    },
  },
  fence: {
    kind: 'prop',
    height: 0.75,
    radius: 0.55,
    build: (b) => {
      for (const x of [-0.45, 0.45]) b.cyl('woodDark', 0.05, 0.06, 0.75, 5, [x, 0, 0]);
      b.box('wood', [1.0, 0.06, 0.04], [0, 0.55, 0], [0, 0, 0.05]);
      b.box('wood', [1.0, 0.06, 0.04], [0, 0.3, 0], [0, 0, -0.04]);
    },
  },

  // Watchtower.
  banner: {
    kind: 'prop',
    height: 1.9,
    radius: 0.3,
    build: (b) => {
      b.cyl('iron', 0.025, 0.03, 1.9, 5, [0, 0, -0.1]);
      b.box('iron', [0.6, 0.03, 0.03], [0, 1.8, -0.1]);
      b.box('banner', [0.5, 0.95, 0.02], [0, 1.3, -0.08]);
      b.add(new THREE.ConeGeometry(0.25, 0.25, 3).rotateZ(Math.PI), 'banner', [0, 0.72, -0.08], [0, 0, 0], [1, 1, 0.08]);
      b.box('crystal', [0.12, 0.12, 0.025], [0, 1.4, -0.065], [0, 0, Math.PI / 4], true);
    },
  },
  torch: {
    kind: 'prop',
    height: 1.4,
    radius: 0.25,
    light: { x: 0, y: 1.42, z: 0, kind: 'flame' },
    build: (b) => {
      b.cyl('iron', 0.03, 0.04, 1.2, 5, [0, 0, 0]);
      b.cyl('woodDark', 0.06, 0.04, 0.2, 6, [0, 1.15, 0]);
      flameOn(b, [0, 1.33, 0], 1.8);
    },
  },
  rubble: {
    kind: 'prop',
    height: 0.3,
    radius: 0.45,
    build: (b) => {
      b.box('stone', [0.3, 0.2, 0.22], [-0.15, 0.1, 0], [0, 0.4, 0.15]);
      b.box('stoneDark', [0.22, 0.16, 0.2], [0.18, 0.08, 0.1], [0.2, 1.1, 0]);
      b.rock('stone', 0.12, [0.05, 0.08, -0.2], [1.3, 0.7, 1], [0, 0, 0], true);
    },
  },
  'weapon-rack': {
    kind: 'prop',
    height: 1.4,
    radius: 0.5,
    build: (b) => {
      b.box('woodDark', [0.9, 0.08, 0.2], [0, 0.4, -0.15]);
      b.box('woodDark', [0.9, 0.08, 0.2], [0, 1.0, -0.15]);
      for (const x of [-0.42, 0.42]) b.box('woodDark', [0.07, 1.1, 0.07], [x, 0.55, -0.2]);
      for (let i = 0; i < 4; i++) {
        b.cyl('wood', 0.02, 0.02, 1.3, 4, [-0.3 + i * 0.2, 0.02, -0.1], [-0.1, 0, 0]);
        b.cone('iron', 0.04, 0.14, 4, [-0.3 + i * 0.2, 1.3, -0.23], [-0.1, 0, 0], true);
      }
    },
  },

  // Obstacles on the board (scenario obstacles whose model has no GLB yet), sized to one hex.
  'obstacle-tree': {
    kind: 'prop',
    height: 1.7,
    radius: 0.5,
    build: (b) => {
      b.cyl('bark', 0.09, 0.15, 1.0, 7, [0, 0, 0]);
      b.add(new THREE.TorusGeometry(0.2, 0.05, 4, 8, Math.PI), 'bark', [0, 0.02, 0], [Math.PI / 2, 0, 0.4], [1, 1, 1], true);
      b.blob('leafWarm', 0.42, [0, 1.25, 0], [1, 0.85, 1]);
      b.blob('leafDark', 0.32, [0.22, 1.08, -0.12], [1, 0.8, 1]);
      b.blob('leaf', 0.3, [-0.22, 1.12, 0.1], [1, 0.8, 1], true);
    },
  },
  boulder: {
    kind: 'prop',
    height: 0.75,
    radius: 0.5,
    build: (b) => {
      b.rock('rock', 0.42, [0, 0.3, 0], [1.1, 0.85, 1], [0.3, 0.6, 0.2]);
      b.rock('rockDark', 0.24, [0.3, 0.12, 0.18], [1.1, 0.7, 1], [0.1, 1.2, 0]);
      b.blob('moss', 0.2, [-0.05, 0.62, 0], [1.6, 0.35, 1.3], true);
    },
  },
  pillar: {
    kind: 'prop',
    height: 1.6,
    radius: 0.4,
    build: (b) => {
      b.box('stoneDark', [0.62, 0.16, 0.62], [0, 0.08, 0]);
      b.cyl('stone', 0.24, 0.27, 1.3, 8, [0, 0.16, 0]);
      b.box('stoneDark', [0.56, 0.14, 0.56], [0, 1.53, 0]);
      b.box('stoneLight', [0.3, 0.06, 0.04], [0, 0.7, 0.26], [0, 0, 0.2], true);
    },
  },
  bunk: {
    kind: 'prop',
    height: 0.7,
    radius: 0.5,
    build: (b) => {
      b.box('woodDark', [0.62, 0.32, 1.0], [0, 0.16, 0]);
      b.box('cloth', [0.54, 0.1, 0.92], [0, 0.37, 0]);
      b.box('clothDark', [0.56, 0.06, 0.5], [0, 0.44, 0.18]);
      b.blob('cloth', 0.14, [0, 0.46, -0.32], [1.4, 0.6, 1]);
      b.box('woodDark', [0.62, 0.62, 0.06], [0, 0.31, -0.5]);
    },
  },
  table: {
    kind: 'prop',
    height: 0.75,
    radius: 0.5,
    build: (b) => {
      b.box('wood', [0.9, 0.07, 0.62], [0, 0.66, 0]);
      for (const [x, z] of [[-0.38, -0.24], [0.38, -0.24], [-0.38, 0.24], [0.38, 0.24]] as const) b.box('woodDark', [0.07, 0.62, 0.07], [x, 0.31, z]);
      b.cyl('clothDark', 0.06, 0.05, 0.12, 6, [0.15, 0.7, 0.05], [0, 0, 0], true);
      b.box('cloth', [0.22, 0.02, 0.3], [-0.2, 0.705, -0.05], [0, 0.3, 0], true);
    },
  },

  // Scenario objects (state in the id: a lit brazier, a lever pulled down).
  brazier: { kind: 'prop', height: 0.75, radius: 0.4, build: (b) => brazier(b, false) },
  'brazier-lit': { kind: 'prop', height: 1.0, radius: 0.4, light: { x: 0, y: 0.95, z: 0, kind: 'lantern' }, build: (b) => brazier(b, true) },
  lever: { kind: 'prop', height: 1.0, radius: 0.35, build: (b) => lever(b, false) },
  'lever-down': { kind: 'prop', height: 0.8, radius: 0.35, build: (b) => lever(b, true) },
  millstone: {
    kind: 'prop',
    height: 0.5,
    radius: 0.5,
    build: (b) => {
      b.cyl('stone', 0.46, 0.48, 0.22, 14, [0, 0, 0]);
      b.cyl('stoneLight', 0.42, 0.44, 0.2, 14, [0, 0.22, 0]);
      b.cyl('woodDark', 0.07, 0.07, 0.12, 6, [0, 0.42, 0]);
      b.box('wood', [0.7, 0.06, 0.08], [0.3, 0.48, 0], [0, 0, 0], true);
    },
  },

  // Cave.
  stalagmite: {
    kind: 'prop',
    height: 1.4,
    radius: 0.4,
    build: (b) => {
      b.cone('rock', 0.3, 1.4, 6, [0, 0, 0]);
      b.cone('rockDark', 0.18, 0.8, 5, [0.25, 0, 0.1], [0, 0, -0.1]);
    },
  },
  'stalagmite-big': {
    kind: 'prop',
    height: 3.6,
    radius: 1.0,
    build: (b) => {
      b.cone('rockDark', 0.8, 3.6, 7, [0, 0, 0]);
      b.cone('rock', 0.45, 2.0, 6, [0.6, 0, 0.3], [0, 0, -0.12]);
    },
  },
  crystals: {
    kind: 'prop',
    height: 0.7,
    radius: 0.35,
    light: { x: 0, y: 0.45, z: 0, kind: 'crystal' },
    build: (b) => {
      b.rock('rockDark', 0.22, [0, 0.08, 0], [1.3, 0.5, 1.1]);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        b.add(new THREE.OctahedronGeometry(0.1, 0), 'crystal', [Math.cos(a) * 0.12, 0.25 + (i % 2) * 0.1, Math.sin(a) * 0.12], [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], [0.8, 2.6 + (i % 3) * 0.6, 0.8]);
      }
    },
  },
  'glow-mushrooms': {
    kind: 'prop',
    height: 0.3,
    radius: 0.3,
    build: (b) => {
      for (const [x, z, s] of [[0, 0, 1], [0.15, 0.1, 0.7], [-0.12, 0.12, 0.6], [0.05, -0.15, 0.5]] as const) {
        b.cyl('stoneLight', 0.025 * s, 0.035 * s, 0.18 * s, 5, [x, 0, z]);
        b.add(new THREE.SphereGeometry(0.09 * s, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 'glowCold', [x, 0.17 * s, z]);
      }
    },
  },

  // Boundaries between rooms on the board (centred on the hex edge, running along X, 1.06 long).
  'reed-fence': { kind: 'edge', height: 0.8, radius: 0.55, build: (b) => reedFence(b, 0.8) },
  'thicket-hedge': { kind: 'edge', height: 0.75, radius: 0.55, build: (b) => hedge(b, 0.75) },
  'rock-pile': { kind: 'edge', height: 0.55, radius: 0.55, build: (b) => rockPile(b, 0.55, 11) },
  'log-wall': { kind: 'edge', height: 0.5, radius: 0.55, build: (b) => logWall(b) },

  // Doors between outdoor rooms and in caves (centred on the edge; the board pushes them aside).
  barricade: { kind: 'prop', height: 0.95, radius: 0.55, build: (b) => barricade(b) },
  'brush-pile': { kind: 'prop', height: 0.7, radius: 0.55, build: (b) => brushPile(b) },
  'fallen-log': {
    kind: 'prop',
    height: 0.42,
    radius: 0.6,
    build: (b) => {
      // Rooted end on the left (the pivot it swings around), broken top on the right.
      b.cyl('bark', 0.17, 0.2, 1.15, 9, [-0.55, 0.2, 0], [0, 0, -Math.PI / 2]);
      b.add(new THREE.CircleGeometry(0.17, 9), 'woodLight', [0.6, 0.2, 0], [0, Math.PI / 2, 0], [1, 1, 1], true);
      for (const [x, a] of [[-0.62, 0.6], [-0.58, -0.7], [-0.66, 2.4]] as const) b.cone('bark', 0.07, 0.3, 5, [x, 0.2, 0], [a, 0, Math.PI / 2], true);
      b.cyl('bark', 0.04, 0.06, 0.4, 5, [0.1, 0.3, 0.05], [0.7, 0, -0.5], true);
      b.blob('moss', 0.12, [-0.1, 0.36, 0], [2.2, 0.45, 1], true);
      b.blob('leaf', 0.13, [0.2, 0.42, 0.08], [1, 0.8, 1], true);
    },
  },
  'rubble-heap': { kind: 'prop', height: 0.6, radius: 0.55, build: (b) => rockPile(b, 0.6, 5) },
  'mine-cart': { kind: 'prop', height: 0.75, radius: 0.5, build: (b) => mineCart(b) },
  rails: {
    kind: 'prop',
    height: 0.06,
    radius: 1.0,
    build: (b) => {
      for (const z of [-0.2, 0.2]) b.box('iron', [2.0, 0.04, 0.04], [0.45, 0.04, z]);
      for (let i = 0; i < 7; i++) b.box('woodDark', [0.1, 0.03, 0.56], [-0.45 + i * 0.3, 0.015, 0]);
    },
  },
};

export function pieceIds(): string[] {
  return Object.keys(PIECES);
}

export function pieceMeta(id: string): PieceMeta | undefined {
  const p = PIECES[id];
  if (!p) return undefined;
  const { build: _build, ...meta } = p;
  return meta;
}

/** Builds the procedural parts of a piece (fresh geometry the caller owns). */
export function buildPiece(id: string, o: BuildOptions): Part[] {
  const def = PIECES[id];
  if (!def) return [];
  const b = new Builder();
  def.build(b, o);
  return b.parts;
}
