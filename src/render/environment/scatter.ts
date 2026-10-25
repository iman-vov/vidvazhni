// The small-things layer: pebbles, grass tufts, flowers, twigs, candle stubs, bones, pottery
// shards, ore chunks, straw, coal… scattered over the floor in loose natural clumps so a location
// feels lived in. Each kind is a few tiny procedural meshes drawn as instanced meshes (one draw
// call per kind and material), seeded by the scenario so they stay put between loads.
//
// They never compete with the game: on playable hexes they keep to the rim (figures and tokens
// stand in the middle), never on a hex with an obstacle, door or object, never in water, and they
// stay a hand's width off walls, partitions and the props along the walls. Tall kinds (reeds) stay
// off the playable hexes altogether. The amount follows the quality (low is sparse).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hexKey, type HexKey } from '../../rules/hex';
import { hexToWorld, worldToHex } from '../hexLayout';
import type { GraphicsQuality } from '../quality';
import { distanceToOutline, seededRandom, valueNoise, type EnvLayout } from './layout';
import { pieceMeta, type MaterialKey } from './pieces';
import type { Placement } from './plan';
import type { EdgeStyle } from './types';

export type ScatterKind =
  | 'pebbles'
  | 'tuft'
  | 'dry-tuft'
  | 'flowers'
  | 'mushrooms'
  | 'glow-caps'
  | 'twigs'
  | 'leaves'
  | 'moss'
  | 'straw'
  | 'grain'
  | 'shards'
  | 'bones'
  | 'candle'
  | 'droppings'
  | 'ore'
  | 'coal'
  | 'scraps'
  | 'snow'
  | 'reeds'
  | 'chips';

/** A kind's look: its parts (palette material, geometry in a ~0.25 cell around the origin). */
interface KindDef {
  parts: () => { material: MaterialKey; geometry: THREE.BufferGeometry }[];
  /** Tall enough to hide a token's edge: only on ring hexes, never on playable ones. */
  ringOnly?: boolean;
  /** Bends in the wind (plants): sideways reach per unit of height squared. */
  sway?: number;
  /** Footprint radius, for spacing. */
  radius: number;
}

/** Instances per playable-or-ring hex at full (high) quality, and the kinds of a location. */
export interface ScatterProfile {
  perHex: number;
  kinds: [ScatterKind, number][];
}

const SHARE: Record<GraphicsQuality, number> = { low: 0.3, medium: 0.65, high: 1 };
/** The shapes are modelled at life size; this makes them read from the board camera. */
const SIZE = 1.8;

/** By location id; locations without an entry use their edge style. */
export const SCATTER: Record<string, ScatterProfile> = {
  cellar: { perHex: 2.4, kinds: [['straw', 4], ['pebbles', 2], ['shards', 2], ['bones', 1], ['candle', 2], ['droppings', 2], ['chips', 2], ['grain', 1]] },
  'thorn-path': { perHex: 3.4, kinds: [['tuft', 5], ['flowers', 3], ['mushrooms', 2], ['twigs', 3], ['leaves', 4], ['pebbles', 2], ['moss', 2]] },
  'flooded-mill': { perHex: 2.8, kinds: [['reeds', 3], ['tuft', 3], ['grain', 3], ['straw', 2], ['pebbles', 2], ['moss', 2], ['twigs', 1], ['flowers', 1]] },
  watchtower: { perHex: 2.2, kinds: [['pebbles', 3], ['shards', 2], ['straw', 2], ['bones', 1], ['candle', 2], ['chips', 2], ['moss', 1]] },
  'gloom-heart': { perHex: 2.4, kinds: [['pebbles', 4], ['glow-caps', 3], ['bones', 2], ['moss', 1], ['candle', 1], ['chips', 1]] },
  'mine-tunnel': { perHex: 2.6, kinds: [['ore', 3], ['pebbles', 4], ['coal', 2], ['chips', 3], ['candle', 1], ['scraps', 1]] },
  'mountain-pass': { perHex: 2.8, kinds: [['pebbles', 4], ['snow', 4], ['dry-tuft', 3], ['twigs', 1], ['moss', 1]] },
  copperdale: { perHex: 2.4, kinds: [['straw', 3], ['pebbles', 3], ['snow', 2], ['shards', 2], ['chips', 2], ['grain', 1], ['droppings', 1]] },
  'dark-depths': { perHex: 2.4, kinds: [['pebbles', 4], ['ore', 2], ['glow-caps', 2], ['bones', 1], ['chips', 1], ['coal', 1]] },
  'old-forge': { perHex: 2.6, kinds: [['coal', 4], ['scraps', 3], ['ore', 2], ['pebbles', 2], ['chips', 2]] },
};

const BY_EDGE: Record<EdgeStyle, ScatterProfile> = {
  stone: SCATTER.cellar!,
  tower: SCATTER.watchtower!,
  timber: SCATTER.cellar!,
  forest: SCATTER['thorn-path']!,
  shore: SCATTER['flooded-mill']!,
  cave: SCATTER['gloom-heart']!,
  mine: SCATTER['mine-tunnel']!,
  cliff: SCATTER['mountain-pass']!,
  forge: SCATTER['old-forge']!,
};

export function scatterProfile(id: string | undefined, edge: EdgeStyle): ScatterProfile {
  return (id && SCATTER[id]) || BY_EDGE[edge];
}

// ─── Shapes ───────────────────────────────────────────────────────────────────

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

/** Places a template geometry (non-indexed copy) at a spot, turned and scaled. */
function at(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.BufferGeometry {
  const c = g.index ? g.toNonIndexed() : g.clone();
  c.applyMatrix4(M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)));
  return c;
}

/** Merges parts of one material and gives them a white vertex colour (the palette materials
 *  multiply by it), a little darker toward the ground. */
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const g of list) {
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  const g = mergeGeometries(list)!;
  for (const x of list) x.dispose();
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 0.78 + 0.22 * Math.min(1, Math.max(0, pos.getY(i) / 0.06));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const stone = () => new THREE.IcosahedronGeometry(1, 0);
const blade = () => new THREE.ConeGeometry(1, 1, 3, 1).translate(0, 0.5, 0);
const rod = () => new THREE.CylinderGeometry(1, 1, 1, 5, 1).translate(0, 0.5, 0);
const disc = () => new THREE.CircleGeometry(1, 6).rotateX(-Math.PI / 2);

function tuft(n: number, h: number, spread: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i;
    const r = spread * (0.3 + 0.7 * ((i * 0.618) % 1));
    out.push(at(blade(), Math.cos(a) * r, 0, Math.sin(a) * r, Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35, 0.012, h * (0.7 + 0.5 * ((i * 0.37) % 1)), 0.012));
  }
  return out;
}

const KINDS: Record<ScatterKind, KindDef> = {
  pebbles: {
    radius: 0.09,
    parts: () => [
      { material: 'rock', geometry: merge([at(stone(), 0, 0.012, 0, 0.3, 0.2, 0, 0.034, 0.02, 0.028), at(stone(), 0.06, 0.008, 0.03, 0, 1, 0.4, 0.022, 0.014, 0.02)]) },
      { material: 'rockDark', geometry: merge([at(stone(), -0.05, 0.007, 0.04, 0.5, 0, 0.2, 0.02, 0.012, 0.017), at(stone(), 0.02, 0.006, -0.06, 0, 0.4, 0, 0.016, 0.01, 0.014)]) },
    ],
  },
  tuft: { radius: 0.08, sway: 1.4, parts: () => [{ material: 'leaf', geometry: merge(tuft(6, 0.11, 0.035)) }, { material: 'leafDark', geometry: merge(tuft(4, 0.08, 0.05)) }] },
  'dry-tuft': { radius: 0.08, sway: 1.2, parts: () => [{ material: 'straw', geometry: merge(tuft(6, 0.1, 0.04)) }, { material: 'reed', geometry: merge(tuft(3, 0.07, 0.03)) }] },
  flowers: {
    radius: 0.08,
    sway: 1.4,
    parts: () => [
      { material: 'leaf', geometry: merge(tuft(4, 0.09, 0.03)) },
      { material: 'berry', geometry: merge([at(stone(), 0.02, 0.09, 0.01, 0, 0, 0, 0.014), at(stone(), -0.03, 0.075, 0.02, 0, 0, 0, 0.012)]) },
      { material: 'straw', geometry: merge([at(stone(), 0.01, 0.07, -0.03, 0, 0, 0, 0.012)]) },
    ],
  },
  mushrooms: {
    radius: 0.07,
    parts: () => [
      { material: 'cloth', geometry: merge([at(rod(), 0, 0, 0, 0, 0, 0.1, 0.008, 0.045, 0.008), at(rod(), 0.04, 0, 0.02, 0, 0, -0.15, 0.006, 0.03, 0.006)]) },
      {
        material: 'berry',
        geometry: merge([at(new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0.004, 0.044, 0, 0, 0, 0.1, 0.026, 0.016, 0.026), at(new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0.044, 0.03, 0.02, 0, 0, -0.15, 0.018, 0.011, 0.018)]),
      },
    ],
  },
  'glow-caps': {
    radius: 0.07,
    parts: () => [
      { material: 'rockDark', geometry: merge([at(rod(), 0, 0, 0, 0, 0, 0.1, 0.006, 0.035, 0.006), at(rod(), 0.035, 0, -0.02, 0, 0, -0.2, 0.005, 0.025, 0.005), at(rod(), -0.03, 0, 0.025, 0.2, 0, 0, 0.004, 0.02, 0.004)]) },
      {
        material: 'glowCold',
        geometry: merge([
          at(new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0.004, 0.034, 0, 0, 0, 0.1, 0.02, 0.012, 0.02),
          at(new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0.04, 0.024, -0.02, 0, 0, -0.2, 0.014, 0.009, 0.014),
          at(new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), -0.034, 0.02, 0.026, 0.2, 0, 0, 0.011, 0.007, 0.011),
        ]),
      },
    ],
  },
  twigs: {
    radius: 0.1,
    parts: () => [{ material: 'bark', geometry: merge([at(rod(), -0.06, 0.006, 0, 0, 0.3, Math.PI / 2, 0.006, 0.14, 0.006), at(rod(), -0.01, 0.006, 0.04, 0, -0.9, Math.PI / 2, 0.004, 0.08, 0.004), at(rod(), 0.02, 0.005, -0.03, 0, 1.6, Math.PI / 2, 0.004, 0.06, 0.004)]) }],
  },
  leaves: {
    radius: 0.1,
    parts: () => [
      { material: 'leafWarm', geometry: merge([at(disc(), 0, 0.004, 0, 0.1, 0.4, 0, 0.026, 1, 0.014), at(disc(), 0.06, 0.003, 0.04, -0.1, 1.4, 0, 0.022, 1, 0.012), at(disc(), -0.05, 0.003, -0.03, 0, 2.2, 0.1, 0.024, 1, 0.013)]) },
      { material: 'leaf', geometry: merge([at(disc(), 0.02, 0.005, -0.06, 0, 0.9, 0.1, 0.022, 1, 0.012), at(disc(), -0.06, 0.004, 0.05, 0.1, 2.8, 0, 0.02, 1, 0.011)]) },
    ],
  },
  moss: { radius: 0.12, parts: () => [{ material: 'moss', geometry: merge([at(stone(), 0, 0, 0, 0, 0, 0, 0.09, 0.012, 0.07), at(stone(), 0.07, 0, 0.05, 0, 0.7, 0, 0.05, 0.01, 0.04)]) }] },
  straw: {
    radius: 0.12,
    parts: () => [
      {
        material: 'straw',
        geometry: merge([0, 1, 2, 3, 4, 5, 6].map((i) => at(rod(), Math.cos(i * 2.4) * 0.05, 0.004, Math.sin(i * 2.4) * 0.05, 0, i * 0.9, Math.PI / 2, 0.003, 0.09 + (i % 3) * 0.03, 0.003))),
      },
    ],
  },
  grain: {
    radius: 0.12,
    parts: () => [
      { material: 'cloth', geometry: merge([at(stone(), 0, 0, 0, 0, 0, 0, 0.1, 0.008, 0.07), at(stone(), 0.08, 0, 0.04, 0, 0.5, 0, 0.05, 0.006, 0.04)]) },
      { material: 'straw', geometry: merge([0, 1, 2, 3, 4].map((i) => at(stone(), Math.cos(i * 1.7) * 0.07, 0.006, Math.sin(i * 1.7) * 0.05, 0, i, 0, 0.007, 0.005, 0.011))) },
    ],
  },
  shards: {
    radius: 0.09,
    parts: () => [
      { material: 'ore', geometry: merge([at(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true, 0, 1.6), 0, 0.012, 0, 0.2, 0.3, Math.PI / 2, 0.04, 0.03, 0.04), at(new THREE.BoxGeometry(1, 1, 1), 0.05, 0.004, 0.03, 0, 0.7, 0.1, 0.03, 0.006, 0.022), at(new THREE.BoxGeometry(1, 1, 1), -0.04, 0.003, 0.04, 0, -0.4, 0, 0.022, 0.005, 0.016)]) },
    ],
  },
  bones: {
    radius: 0.09,
    parts: () => [
      {
        material: 'cloth',
        geometry: merge([at(rod(), -0.045, 0.008, 0, 0, 0.2, Math.PI / 2, 0.006, 0.09, 0.006), at(stone(), -0.05, 0.009, 0.01, 0, 0, 0, 0.011), at(stone(), 0.044, 0.009, -0.008, 0, 0, 0, 0.011), at(rod(), 0, 0.005, 0.04, 0, 1.3, Math.PI / 2, 0.004, 0.05, 0.004)]),
      },
    ],
  },
  candle: {
    radius: 0.06,
    parts: () => [
      { material: 'cloth', geometry: merge([at(rod(), 0, 0, 0, 0, 0, 0, 0.012, 0.045, 0.012), at(rod(), 0.03, 0, 0.018, 0, 0, 0, 0.01, 0.028, 0.01), at(disc(), 0.01, 0.002, 0.008, 0, 0, 0, 0.035)]) },
      { material: 'flame', geometry: merge([at(blade(), 0, 0.047, 0, 0, 0, 0, 0.006, 0.018, 0.006), at(blade(), 0.03, 0.03, 0.018, 0, 0, 0, 0.005, 0.015, 0.005)]) },
    ],
  },
  droppings: { radius: 0.05, parts: () => [{ material: 'woodDark', geometry: merge([0, 1, 2, 3].map((i) => at(stone(), Math.cos(i * 2.1) * 0.025, 0.003, Math.sin(i * 2.1) * 0.02, 0, i, 0, 0.007, 0.004, 0.004))) }] },
  ore: {
    radius: 0.09,
    parts: () => [
      { material: 'ore', geometry: merge([at(new THREE.DodecahedronGeometry(1, 0), 0, 0.016, 0, 0.4, 0.3, 0, 0.03, 0.022, 0.026), at(new THREE.DodecahedronGeometry(1, 0), 0.05, 0.01, 0.03, 0, 1, 0.3, 0.018)]) },
      { material: 'rockDark', geometry: merge([at(stone(), -0.04, 0.01, 0.03, 0.2, 0, 0, 0.024, 0.016, 0.02), at(stone(), 0.02, 0.008, -0.05, 0, 0.6, 0, 0.018, 0.012, 0.016)]) },
    ],
  },
  coal: { radius: 0.09, parts: () => [{ material: 'shadow', geometry: merge([0, 1, 2, 3, 4].map((i) => at(new THREE.DodecahedronGeometry(1, 0), Math.cos(i * 2.3) * 0.04, 0.008, Math.sin(i * 2.3) * 0.035, i, i * 0.7, 0, 0.014 + (i % 2) * 0.006))) }] },
  scraps: {
    radius: 0.1,
    parts: () => [
      { material: 'iron', geometry: merge([at(new THREE.BoxGeometry(1, 1, 1), 0, 0.004, 0, 0, 0.5, 0.05, 0.07, 0.006, 0.018), at(new THREE.TorusGeometry(1, 0.25, 4, 8), 0.05, 0.006, 0.04, Math.PI / 2, 0, 0, 0.018), at(rod(), -0.04, 0.005, 0.04, 0, 1.2, Math.PI / 2, 0.004, 0.06, 0.004)]) },
    ],
  },
  snow: { radius: 0.12, parts: () => [{ material: 'snow', geometry: merge([at(stone(), 0, 0, 0, 0, 0, 0, 0.1, 0.02, 0.07), at(stone(), 0.08, 0, 0.04, 0, 0.6, 0, 0.05, 0.014, 0.045), at(stone(), -0.06, 0, -0.03, 0, 1.2, 0, 0.04, 0.012, 0.035)]) }] },
  reeds: { radius: 0.1, ringOnly: true, sway: 0.5, parts: () => [{ material: 'reed', geometry: merge(tuft(7, 0.3, 0.05)) }, { material: 'leafDark', geometry: merge(tuft(4, 0.2, 0.06)) }] },
  chips: { radius: 0.08, parts: () => [{ material: 'woodLight', geometry: merge([0, 1, 2].map((i) => at(new THREE.BoxGeometry(1, 1, 1), Math.cos(i * 2.2) * 0.04, 0.003, Math.sin(i * 2.2) * 0.035, 0, i * 1.1, 0, 0.03, 0.005, 0.01))) }] },
};

// ─── Placement (pure) ─────────────────────────────────────────────────────────

export interface ScatterSpot {
  kind: ScatterKind;
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export interface ScatterInput {
  layout: EnvLayout;
  profile: ScatterProfile;
  quality: GraphicsQuality;
  /** Hexes with an obstacle, door, object or other token on them: nothing goes there. */
  busy: ReadonlySet<HexKey>;
  /** Props along the walls (plan.ts): kept clear. */
  placements: readonly Placement[];
  /** Thin walls between rooms, as polylines. */
  partitions: readonly { x: number; z: number }[][];
}

/** On a playable hex: how far from the centre a small thing may lie (figures stand in the middle). */
export const RIM_MIN = 0.66;
const RIM_MAX = 0.9;

function segDistance(px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = dx * dx + dz * dz;
  const t = l > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l)) : 0;
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

/** Where the small things go: clumps around seeded points, thinned by noise so some areas are
 *  rich and others bare. */
export function planScatter(input: ScatterInput): ScatterSpot[] {
  const { layout, profile, busy, placements, partitions } = input;
  const rnd = seededRandom(`scatter:${layout.scenarioId}`);
  const hexes = [...layout.footprint.keys(), ...[...layout.ring.keys()].filter((k) => !layout.clear.has(k))];
  const target = Math.round(hexes.length * profile.perHex * SHARE[input.quality]);
  const total = profile.kinds.reduce((s, [, w]) => s + w, 0);
  const pickKind = (): ScatterKind => {
    let r = rnd() * total;
    for (const [k, w] of profile.kinds) if ((r -= w) <= 0) return k;
    return profile.kinds[0]![0];
  };
  const props = placements.map((p) => ({ x: p.x, z: p.z, r: (pieceMeta(p.piece)?.radius ?? 0.3) * (p.scale ?? 1) + 0.06 }));
  const out: ScatterSpot[] = [];
  const ok = (kind: ScatterKind, x: number, z: number): boolean => {
    const rad = KINDS[kind].radius * SIZE;
    const def = KINDS[kind];
    const [q, r] = worldToHex(x, z);
    const k = hexKey([q, r]);
    const playable = layout.footprint.has(k);
    if (!playable && !layout.ring.has(k)) return false;
    if (layout.clear.has(k) || busy.has(k)) return false;
    if (playable) {
      if (def.ringOnly) return false;
      const t = layout.terrain.get(k);
      if (t === 'water' || t === 'hazardous') return false;
      const c = hexToWorld(q, r);
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < RIM_MIN || d > RIM_MAX) return false;
    }
    if (distanceToOutline(layout, x, z) < 0.14 + rad) return false;
    for (const line of partitions) for (let i = 1; i < line.length; i++) if (segDistance(x, z, line[i - 1]!, line[i]!) < 0.16 + rad) return false;
    if (props.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + rad)) return false;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (KINDS[o.kind].radius * SIZE + rad) * 0.9)) return false;
    return true;
  };
  for (let tries = 0; out.length < target && tries < target * 12; tries++) {
    const k = hexes[Math.floor(rnd() * hexes.length)]!;
    const [q, r] = k.split(',').map(Number) as [number, number];
    const c = hexToWorld(q, r);
    const cx = c.x + (rnd() - 0.5) * 1.6;
    const cz = c.z + (rnd() - 0.5) * 1.6;
    // Bare and rich patches: a clump is likelier where the noise is high.
    if (valueNoise(cx * 0.55 + 11, cz * 0.55 - 7) < rnd() * 0.75) continue;
    const kind = pickKind();
    const n = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < n && out.length < target; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * 0.42;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      // Mostly the clump's kind, now and then a neighbour of another.
      const kk = rnd() < 0.75 ? kind : pickKind();
      if (!ok(kk, x, z)) continue;
      out.push({ kind: kk, x, z, rot: rnd() * Math.PI * 2, scale: (0.75 + rnd() * 0.55) * SIZE });
    }
  }
  return out;
}

// ─── Building ─────────────────────────────────────────────────────────────────

export interface ScatterBuild {
  root: THREE.Group;
  dispose(): void;
}

/** Instanced meshes for the spots: one per kind and part. `material` gives the palette material
 *  (with `sway` for plants). Nothing casts shadows; everything receives them. */
export function buildScatter(spots: readonly ScatterSpot[], material: (key: MaterialKey, sway: number | null) => THREE.Material): ScatterBuild {
  const root = new THREE.Group();
  root.name = 'env:scatter';
  const geometries: THREE.BufferGeometry[] = [];
  const byKind = new Map<ScatterKind, ScatterSpot[]>();
  for (const s of spots) {
    let list = byKind.get(s.kind);
    if (!list) byKind.set(s.kind, (list = []));
    list.push(s);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (const [kind, list] of byKind) {
    const def = KINDS[kind];
    for (const part of def.parts()) {
      geometries.push(part.geometry);
      const mesh = new THREE.InstancedMesh(part.geometry, material(part.material, def.sway ?? null), list.length);
      list.forEach((s, i) => mesh.setMatrixAt(i, m.compose(p.set(s.x, 0, s.z), q.setFromAxisAngle(up, s.rot), sc.setScalar(s.scale))));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = `env:scatter:${kind}`;
      root.add(mesh);
    }
  }
  return {
    root,
    dispose() {
      for (const g of geometries) g.dispose();
    },
  };
}
