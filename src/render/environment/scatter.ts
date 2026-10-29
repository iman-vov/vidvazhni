// The small-things layer: pebbles, twigs, fallen leaves, pine cones, grass tufts, wood chips, plank
// shards, straw, pottery shards and snow scattered over the floor so a location feels lived in.
// The shapes are Blender models (the scatter kit); here they are placed, seeded by the scenario so
// they stay put between loads, and drawn in one batch per material look.
//
// Two passes: clumps of the location's kinds (rich and bare patches by noise), and a light litter
// on the free hexes (chips, a bit of plank, straw indoors; leaves, twigs, pebbles, tufts outdoors,
// by season) so open floor is not bare. Pure decoration: nothing here is a rule.
//
// They never compete with the game: on playable hexes they keep to a band between the middle
// (figures, tokens and coins stand there) and the hex outline, never on a hex with an obstacle,
// door or object, never in water, and they stay a hand's width off walls, partitions and the props
// along the walls. The amount follows the floor-detail setting (floorDetail.ts: off / few / many,
// by quality until the player picks).

import * as THREE from 'three';
import { hexKey, type HexKey } from '../../rules/hex';
import { hexToWorld, worldToHex } from '../hexLayout';
import { floorDetail, type FloorDetail } from '../floorDetail';
import type { GraphicsQuality } from '../quality';
import { distanceToOutline, onWoodFloor, seededRandom, valueNoise, type EnvLayout } from './layout';
import { pieceMeta, UNLIT, type MaterialKey, type Part } from './pieces';
import type { Placement } from './plan';
import type { EdgeStyle, EnvironmentDef, Season } from './types';

export type ScatterKind = 'pebbles' | 'stick' | 'leaf-pile' | 'chips' | 'plank' | 'straw' | 'pine-cone' | 'snow' | 'tuft' | 'shards';

/** What placement needs to know of a kind (its shapes come from the Blender kit). */
interface KindDef {
  /** How far its shapes reach across the floor from the origin, at scale 1. */
  reach: number;
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

/** Share of the clumps, and of the free hexes that get litter (with up to how many bits). */
const LEVEL: Record<FloorDetail, { clumps: number; litter: number; bits: number }> = {
  off: { clumps: 0, litter: 0, bits: 0 },
  few: { clumps: 0.3, litter: 0.3, bits: 1 },
  many: { clumps: 1, litter: 0.6, bits: 2 },
};
/** The shapes are modelled at life size; this makes them read from the board camera. */
const SIZE = 1.8;

/** By location id; locations without an entry use their edge style. */
export const SCATTER: Record<string, ScatterProfile> = {
  cellar: { perHex: 2.2, kinds: [['straw', 4], ['pebbles', 3], ['shards', 2], ['chips', 3], ['plank', 1]] },
  'thorn-path': { perHex: 3, kinds: [['tuft', 5], ['leaf-pile', 4], ['stick', 3], ['pine-cone', 2], ['pebbles', 2]] },
  'flooded-mill': { perHex: 2.6, kinds: [['tuft', 5], ['straw', 3], ['pebbles', 2], ['stick', 2], ['plank', 1]] },
  watchtower: { perHex: 2.2, kinds: [['pebbles', 3], ['shards', 2], ['straw', 2], ['chips', 3], ['plank', 1]] },
  'gloom-heart': { perHex: 2.2, kinds: [['pebbles', 5], ['shards', 1], ['chips', 1], ['stick', 1]] },
  'mine-tunnel': { perHex: 2.4, kinds: [['pebbles', 6], ['chips', 3], ['plank', 1], ['shards', 1]] },
  'mountain-pass': { perHex: 2.6, kinds: [['pebbles', 4], ['snow', 4], ['tuft', 2], ['stick', 1], ['pine-cone', 1]] },
  copperdale: { perHex: 2.2, kinds: [['straw', 3], ['pebbles', 3], ['snow', 2], ['shards', 2], ['chips', 2], ['plank', 1]] },
  'dark-depths': { perHex: 2.2, kinds: [['pebbles', 6], ['shards', 1], ['chips', 1]] },
  'old-forge': { perHex: 2.4, kinds: [['pebbles', 4], ['chips', 3], ['plank', 1], ['shards', 1]] },
  // Glass Town: swept floors, a glint of broken glass here and there.
  'glass-town': { perHex: 1.1, kinds: [['shards', 4], ['chips', 1], ['pebbles', 1]] },
  'glass-heights': { perHex: 1.8, kinds: [['pebbles', 4], ['shards', 3], ['tuft', 1]] },
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
  glass: SCATTER['glass-town']!,
};

const OUTDOOR: ReadonlySet<EdgeStyle> = new Set(['forest', 'shore', 'cliff']);
const UNDERGROUND: ReadonlySet<EdgeStyle> = new Set(['cave', 'mine', 'forge']);

/** The location's clump kinds, turned to its season when it is outdoors (autumn: more fallen
 *  leaves; winter: snow instead of leaves, less grass; spring and summer: green, hardly a leaf). */
export function scatterProfile(id: string | undefined, edge: EdgeStyle, season?: Season): ScatterProfile {
  const base = (id && SCATTER[id]) || BY_EDGE[edge];
  if (!season || !OUTDOOR.has(edge)) return base;
  const w = new Map<ScatterKind, number>();
  const add = (k: ScatterKind, n: number) => n > 0 && w.set(k, (w.get(k) ?? 0) + n);
  for (const [k, n] of base.kinds) {
    if (season === 'autumn') add(k, k === 'leaf-pile' ? n * 2 : k === 'tuft' ? n * 0.6 : n);
    else if (season === 'winter') add(k, k === 'leaf-pile' ? 0 : k === 'tuft' ? n * 0.4 : n);
    else add(k, k === 'leaf-pile' ? (season === 'summer' ? n * 0.3 : 0) : k === 'tuft' ? n * 1.5 : n);
  }
  if (season === 'winter') add('snow', 4);
  return { perHex: base.perHex, kinds: [...w] };
}

/** What lies on the free hexes, by the kind of room: indoors, underground, outdoors by season. */
const LITTER: Record<'indoor' | 'underground' | Season | 'mixed', [ScatterKind, number][]> = {
  indoor: [['chips', 4], ['plank', 1], ['straw', 2], ['shards', 1], ['pebbles', 2]],
  underground: [['pebbles', 5], ['chips', 1]],
  // The forest floor texture is already painted with leaves: what lifts off it is grey stone,
  // green grass, cones and sticks; a few leaf heaps.
  autumn: [['stick', 3], ['pebbles', 3], ['tuft', 2], ['pine-cone', 2], ['leaf-pile', 1]],
  summer: [['tuft', 4], ['pebbles', 2], ['stick', 1], ['pine-cone', 1], ['leaf-pile', 1]],
  spring: [['tuft', 5], ['pebbles', 2], ['stick', 1]],
  winter: [['snow', 4], ['stick', 3], ['pebbles', 2], ['pine-cone', 1]],
  mixed: [['tuft', 3], ['leaf-pile', 2], ['stick', 2], ['pebbles', 2]],
};

/** The litter kinds of a room by its edge (indoors, underground, outdoors in the season). */
export function litterKinds(edge: EdgeStyle, season?: Season): [ScatterKind, number][] {
  if (OUTDOOR.has(edge)) return LITTER[season ?? 'mixed'];
  return UNDERGROUND.has(edge) ? LITTER.underground : LITTER.indoor;
}

// ─── Kinds ────────────────────────────────────────────────────────────────────
//
// The shapes are modelled in Blender (art/blender/scatter-kit/scatter_kit.py) and ship as one GLB,
// assets/models/scatter-kit: each top-level node is `<kind>_<n>`, 4 variants per kind, at life
// size around its origin, with materials named by palette key (rock, woodLight, leafWarm…). The
// table below is what placement needs before the GLB has loaded: spacing radius and how far the
// shapes reach across the floor (every variant stays inside its kind's reach).

const KINDS: Record<ScatterKind, KindDef> = {
  pebbles: { radius: 0.08, reach: 0.06 },
  stick: { radius: 0.1, reach: 0.18 },
  'leaf-pile': { radius: 0.08, reach: 0.075 },
  chips: { radius: 0.07, reach: 0.055 },
  plank: { radius: 0.1, reach: 0.11 },
  straw: { radius: 0.1, reach: 0.105 },
  'pine-cone': { radius: 0.05, reach: 0.042 },
  snow: { radius: 0.1, reach: 0.085 },
  tuft: { radius: 0.07, reach: 0.062, sway: 1.4 },
  shards: { radius: 0.07, reach: 0.063 },
};

/** Model id of the Blender kit with every kind's variants. */
export const SCATTER_KIT = 'scatter-kit';

/** Variants a spot may pick from; the build uses `variant % <variants in the GLB>`. */
const VARIANTS = 4;

/** Kit node name of a kind's variant (1-based, as in Blender). */
export function variantNode(kind: ScatterKind, n: number): string {
  return `${kind}_${n + 1}`;
}

/** Every kind, for the kit's completeness check. */
export const SCATTER_KINDS = Object.keys(KINDS) as ScatterKind[];

// ─── Placement (pure) ─────────────────────────────────────────────────────────

/** How far a kind's shapes reach across the floor from its origin, at scale 1. */
export function kindReach(kind: ScatterKind): number {
  return KINDS[kind].reach;
}

export interface ScatterSpot {
  kind: ScatterKind;
  x: number;
  z: number;
  rot: number;
  scale: number;
  /** Which of the kind's modelled variants. */
  variant: number;
  /** Brightness of this one (a little lighter or darker, so repeats do not show). */
  tint: number;
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
  /** Off / few / many; default: the player's setting for the quality (floorDetail.ts). */
  detail?: FloorDetail;
  /** The location's edges and season, for the litter on free hexes (none without it). */
  def?: Pick<EnvironmentDef, 'edge' | 'rooms' | 'season'>;
}

/** On a playable hex, how far from the middle a small thing may lie, as the distance toward the
 *  nearest side (0.866 is the outline): figures, tokens and coins stand inside RIM_MIN. */
export const RIM_MIN = 0.5;
/** Clumps keep a little further out than the single litter bits. */
const CLUMP_MIN = 0.56;
/** How far toward the outline a piece's edge may reach (it is drawn at 0.866). */
export const RIM_MAX = 0.8;
const SQ3_2 = Math.sqrt(3) / 2;

/** Distance from a flat-top hex's centre toward its nearest side (0 in the middle, 0.866 on the
 *  outline): the hex-shaped counterpart of the radius. */
export function hexRim(dx: number, dz: number): number {
  return Math.max(Math.abs(dz), Math.abs(SQ3_2 * dx + 0.5 * dz), Math.abs(-SQ3_2 * dx + 0.5 * dz));
}

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
  const level = LEVEL[input.detail ?? floorDetail(input.quality)];
  const rnd = seededRandom(`scatter:${layout.scenarioId}`);
  const hexes = [...layout.footprint.keys(), ...[...layout.ring.keys()].filter((k) => !layout.clear.has(k))];
  const target = Math.round(hexes.length * profile.perHex * level.clumps);
  const total = profile.kinds.reduce((s, [, w]) => s + w, 0);
  const pickKind = (): ScatterKind => {
    let r = rnd() * total;
    for (const [k, w] of profile.kinds) if ((r -= w) <= 0) return k;
    return profile.kinds[0]![0];
  };
  // No pebbles on a room's wooden floor: wood chips there instead.
  const onFloor = (kind: ScatterKind, x: number, z: number): ScatterKind => (kind === 'pebbles' && onWoodFloor(layout, hexKey(worldToHex(x, z))) ? 'chips' : kind);
  const props = placements.map((p) => ({ x: p.x, z: p.z, r: (pieceMeta(p.piece)?.radius ?? 0.3) * (p.scale ?? 1) + 0.06 }));
  const out: ScatterSpot[] = [];
  const ok = (kind: ScatterKind, x: number, z: number, scale: number, rimMin: number): boolean => {
    const rad = KINDS[kind].radius * scale;
    const [q, r] = worldToHex(x, z);
    const k = hexKey([q, r]);
    const playable = layout.footprint.has(k);
    if (!playable && !layout.ring.has(k)) return false;
    if (layout.clear.has(k) || busy.has(k)) return false;
    if (playable) {
      const t = layout.terrain.get(k);
      if (t === 'water' || t === 'hazardous') return false;
      const c = hexToWorld(q, r);
      const d = hexRim(x - c.x, z - c.z);
      // The whole shape stays inside the band: off the middle and short of the outline.
      if (d < rimMin || d + kindReach(kind) * scale > RIM_MAX) return false;
    }
    if (distanceToOutline(layout, x, z) < 0.14 + rad) return false;
    for (const line of partitions) for (let i = 1; i < line.length; i++) if (segDistance(x, z, line[i - 1]!, line[i]!) < 0.16 + rad) return false;
    if (props.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + rad)) return false;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (KINDS[o.kind].radius * o.scale + rad) * 0.9)) return false;
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
      const kk = onFloor(rnd() < 0.75 ? kind : pickKind(), x, z);
      const scale = (0.75 + rnd() * 0.55) * SIZE;
      const rot = rnd() * Math.PI * 2;
      const tint = 0.86 + rnd() * 0.24;
      const variant = Math.floor(rnd() * VARIANTS);
      if (!ok(kk, x, z, scale, CLUMP_MIN)) continue;
      out.push({ kind: kk, x, z, rot, scale, variant, tint });
    }
  }
  // Litter: a bit or two on a share of the free hexes, so open floor is not bare. The hexes go in
  // map order with their own seed, so a hex keeps its bits whatever the clumps did.
  if (input.def && level.litter > 0) {
    const def = input.def;
    for (const [k, room] of layout.footprint) {
      if (busy.has(k)) continue;
      const lr = seededRandom(`litter:${layout.scenarioId}:${k}`);
      if (lr() >= level.litter) continue;
      const kinds = litterKinds(def.rooms?.[room]?.edge ?? def.edge, def.season);
      const sum = kinds.reduce((s, [, w]) => s + w, 0);
      const [q, r] = k.split(',').map(Number) as [number, number];
      const c = hexToWorld(q, r);
      const bits = level.bits > 1 && lr() < 0.4 ? 2 : 1;
      for (let b = 0, tries = 0; b < bits && tries < 8; tries++) {
        let pick = lr() * sum;
        const kind = onFloor(kinds.find(([, w]) => (pick -= w) <= 0)?.[0] ?? kinds[0]![0], c.x, c.z);
        // As big as reads from the board camera, but never so big that it cannot lie between the
        // middle and the outline; then anywhere in what is left of the band.
        const reach = KINDS[kind].reach;
        const scale = Math.min((1.15 + lr() * 0.35) * SIZE, (RIM_MAX - RIM_MIN) / reach);
        const a = lr() * Math.PI * 2;
        const d = RIM_MIN + lr() * Math.max(0, RIM_MAX - RIM_MIN - reach * scale);
        const x = c.x + Math.cos(a) * d;
        const z = c.z + Math.sin(a) * d;
        const rot = lr() * Math.PI * 2;
        const tint = 0.86 + lr() * 0.24;
        const variant = Math.floor(lr() * VARIANTS);
        if (!ok(kind, x, z, scale, RIM_MIN)) continue;
        out.push({ kind, x, z, rot, scale, variant, tint });
        b++;
      }
    }
  }
  return out;
}

// ─── Building ─────────────────────────────────────────────────────────────────

export interface ScatterBuild {
  root: THREE.Group;
  dispose(): void;
}

/** The look of a batch: lit (bending in the wind by `sway`), or unlit (candle flames, glow caps). */
export type ScatterLook = { unlit: true } | { unlit: false; sway: number | null };

/** Height over which a piece goes from its darker foot to full colour. */
const FOOT = 0.06;

/** White materials with vertex colours: the palette colour is painted into the vertices, so every
 *  kind and variant of a look shares one material and one draw call. */
const PROTOS = new Map<string, THREE.Material>();
export function scatterProto(quality: GraphicsQuality, unlit: boolean): THREE.Material {
  const id = unlit ? 'unlit' : quality === 'low' ? 'lambert' : 'standard';
  let m = PROTOS.get(id);
  if (!m) {
    m = unlit
      ? new THREE.MeshBasicMaterial({ vertexColors: true })
      : quality === 'low'
        ? new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
        : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 });
    m.name = `scatter:${id}`;
    PROTOS.set(id, m);
  }
  return m;
}

/** A kit part's geometry with its node matrix applied and the palette colour in its vertices, a
 *  little darker toward the ground. */
function painted(part: Part, colour: THREE.Color): THREE.BufferGeometry {
  const g = part.geometry.clone().applyMatrix4(part.matrix);
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 0.78 + 0.22 * Math.min(1, Math.max(0, pos.getY(i) / FOOT));
    col[i * 3] = colour.r * k;
    col[i * 3 + 1] = colour.g * k;
    col[i * 3 + 2] = colour.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * The spots drawn from the Blender kit (`kit`: node name → parts). One BatchedMesh per look (lit,
 * each sway, unlit): every kind and variant of it in one draw call, culled per instance.
 * `palette` gives a palette key's colour, `material` the board's material for a look (with fog
 * and veil patched in). Nothing casts shadows on any quality (a centimetre-high bit has no
 * visible shadow from the board camera, and the shadow pass would draw it again); everything
 * receives them. Kinds missing from the kit are left out.
 */
export function buildScatter(
  spots: readonly ScatterSpot[],
  kit: ReadonlyMap<string, readonly Part[]>,
  palette: (key: MaterialKey) => THREE.Color,
  material: (look: ScatterLook) => THREE.Material,
): ScatterBuild {
  const root = new THREE.Group();
  root.name = 'env:scatter';
  // The kit's variants of each kind, painted, each part tagged with its look.
  const variants = new Map<ScatterKind, { look: string; geometry: THREE.BufferGeometry }[][]>();
  const looks = new Map<string, ScatterLook>();
  const variantsOf = (kind: ScatterKind) => {
    let list = variants.get(kind);
    if (list) return list;
    list = [];
    const sway = KINDS[kind].sway ?? null;
    for (let n = 0; n < VARIANTS; n++) {
      const parts = kit.get(variantNode(kind, n));
      if (!parts) continue;
      const painted_ = parts.map((part) => {
        const key = (part.material as THREE.Material).name as MaterialKey;
        const unlit = UNLIT.has(key);
        const id = unlit ? 'unlit' : `lit:${sway ?? 0}`;
        looks.set(id, unlit ? { unlit: true } : { unlit: false, sway });
        return { look: id, geometry: painted(part, palette(key)) };
      });
      // Nothing floats: a variant whose lowest point is above the floor (a heap of leaves) is
      // lowered onto it; sunk ones (stones) stay sunk.
      const low = Math.min(...painted_.map((v) => (v.geometry.computeBoundingBox(), v.geometry.boundingBox!.min.y)));
      if (low > 0) for (const v of painted_) v.geometry.translate(0, -low, 0);
      list.push(painted_);
    }
    variants.set(kind, list);
    return list;
  };
  // Per look: its geometries (one per kind, variant and part) and the instances of each.
  const batches = new Map<string, { geometries: THREE.BufferGeometry[]; instances: { geometry: number; spot: ScatterSpot }[] }>();
  const geoIndex = new Map<THREE.BufferGeometry, number>();
  for (const spot of spots) {
    const list = variantsOf(spot.kind);
    if (!list.length) continue;
    for (const part of list[spot.variant % list.length]!) {
      let batch = batches.get(part.look);
      if (!batch) batches.set(part.look, (batch = { geometries: [], instances: [] }));
      let gi = geoIndex.get(part.geometry);
      if (gi === undefined) {
        gi = batch.geometries.push(part.geometry) - 1;
        geoIndex.set(part.geometry, gi);
      }
      batch.instances.push({ geometry: gi, spot });
    }
  }
  const owned = [...variants.values()].flat(2).map((v) => v.geometry);
  const meshes: THREE.BatchedMesh[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  for (const [id, batch] of batches) {
    const vertices = batch.geometries.reduce((n, g) => n + g.getAttribute('position').count, 0);
    const mesh = new THREE.BatchedMesh(batch.instances.length, vertices, 0, material(looks.get(id)!));
    const ids = batch.geometries.map((g) => mesh.addGeometry(g));
    for (const { geometry, spot } of batch.instances) {
      const i = mesh.addInstance(ids[geometry]!);
      mesh.setMatrixAt(i, m.compose(p.set(spot.x, 0, spot.z), q.setFromAxisAngle(up, spot.rot), sc.setScalar(spot.scale)));
      mesh.setColorAt(i, col.setScalar(spot.tint));
    }
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = `env:scatter:${id}`;
    root.add(mesh);
    meshes.push(mesh);
  }
  return {
    root,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const g of owned) g.dispose();
    },
  };
}
