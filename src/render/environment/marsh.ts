// Marsh growth around the board: dense reed clumps (blades of mixed height, some bent or broken,
// cattails on a few) along the water's edge and in the shallows, lily pads with a flower here and
// there and duckweed on still water, mossy logs, roots and mud banks on the shore. The shapes are
// a Blender kit (`marsh-kit`: art/blender/env-kit/marsh-kit.blend, nodes `<kind>-<n>`, 4–6
// variants each, materials named by palette key); here they are only placed and drawn.
//
// Placement is pure: the field's water channel (field.ts) says where the shallows and the shore
// are; noise gathers reeds into stands with gaps; nothing grows on playable hexes, nothing tall
// between the camera and the board. The old single reed and lily pieces of the location kit give
// way to this layer once the kit has loaded. The amount follows the floor-detail setting.
//
// Drawing: one InstancedMesh per variant part and look, random turn, size and tint per instance;
// reeds and lilies bend in the wind (life.ts sway). Low quality loads the kit's simplified tier.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { floorDetail, type FloorDetail } from '../floorDetail';
import type { GraphicsQuality } from '../quality';
import { sampleField, type Field } from './field';
import { distanceToFootprint, hidesBoard, seededRandom, valueNoise, type EnvLayout } from './layout';
import type { Part } from './pieces';
import type { Placement } from './plan';
import type { EnvironmentDef } from './types';

export const MARSH_KIT = 'marsh-kit';

export type MarshKind = 'reeds' | 'reeds-low' | 'lily' | 'duckweed' | 'log' | 'roots' | 'bank';

interface KindSpec {
  /** Variants modelled in the kit (nodes `<kind>-1` … `<kind>-<n>`). */
  variants: number;
  /** Footprint radius at scale 1, for spacing. */
  radius: number;
  /** Wind sway of its soft parts (life.ts); none for logs, banks. */
  sway?: number;
  /** Floats on the water (lifted to its surface). */
  floats?: boolean;
}
const KINDS: Record<MarshKind, KindSpec> = {
  reeds: { variants: 6, radius: 0.32, sway: 0.045 },
  'reeds-low': { variants: 4, radius: 0.28, sway: 0.06 },
  lily: { variants: 5, radius: 0.3, sway: 0.012, floats: true },
  duckweed: { variants: 4, radius: 0.4, floats: true },
  log: { variants: 4, radius: 0.55 },
  roots: { variants: 4, radius: 0.35 },
  bank: { variants: 4, radius: 0.5 },
};
export const MARSH_KINDS = Object.keys(KINDS) as MarshKind[];
/** Water surface height (index.ts lays the water plane there). */
const WATER_Y = 0.04;

/** Locations that grow marsh. */
export function isMarsh(def: EnvironmentDef): boolean {
  return def.edge === 'shore' || ((def.ground.water ?? 0) > 0 && !!def.palette?.reed);
}

/** Stones standing in for a shore gap: x, z along the gap's frame, size. */
const GAP_STONES: [number, number, number][] = [[-0.5, -0.05, 0.75], [0.52, 0, 0.6]];

/** Old one-piece plants this layer replaces once its kit is in. */
const REPLACED = new Set(['reeds', 'reeds-bank', 'reeds-low', 'lilies', 'log']);

export interface MarshSpot {
  kind: MarshKind;
  x: number;
  z: number;
  y: number;
  rot: number;
  scale: number;
  variant: number;
  /** Colour multiplier (drier, greener, darker). */
  tint: [number, number, number];
  room: string | null;
}

/** Share of the extras per quality (reeds are the heaviest thing around the board). */
const QUALITY_SHARE: Record<GraphicsQuality, number> = { low: 0.5, medium: 0.8, high: 1 };

/** Extras (beyond the clumps standing in for the old pieces) per floor-detail level. */
const AMOUNT: Record<FloorDetail, number> = { off: 0.3, few: 0.6, many: 1 };

export interface MarshInput {
  layout: EnvLayout;
  def: EnvironmentDef;
  field: Field;
  quality: GraphicsQuality;
  placements: readonly Placement[];
  detail?: FloorDetail;
}

/**
 * Where the marsh grows: spots for the kit, and the placements without the plant pieces they
 * replace. Pure.
 */
export function planMarsh(input: MarshInput): { spots: MarshSpot[]; placements: Placement[] } {
  const { layout, def, field, placements } = input;
  if (!isMarsh(def)) return { spots: [], placements: [...placements] };
  const rnd = seededRandom(`marsh:${layout.scenarioId}`);
  const amount = AMOUNT[input.detail ?? floorDetail(input.quality)] * QUALITY_SHARE[input.quality];
  const low = input.quality === 'low';
  const spots: MarshSpot[] = [];
  const taken: { x: number; z: number; r: number }[] = [];
  const kept: Placement[] = [];
  for (const p of placements) {
    if (REPLACED.has(p.piece)) continue;
    if (p.piece === 'forest-gap') {
      // The shore's gap: two stones of the shared rock kit (stone.ts) instead of the old faceted pair.
      for (const [dx, dz, k] of GAP_STONES) {
        const c = Math.cos(p.rot);
        const sn = Math.sin(p.rot);
        kept.push({ ...p, piece: 'rock', x: p.x + (dx * c + dz * sn) * p.scale, z: p.z + (-dx * sn + dz * c) * p.scale, rot: p.rot + dx * 3.1, scale: p.scale * k, height: 0.45 });
      }
      continue;
    }
    kept.push(p);
    // Other pieces keep their ground (crates, posts, rocks).
    if (p.band !== 'far') taken.push({ x: p.x, z: p.z, r: 0.3 * p.scale });
  }
  const free = (x: number, z: number, r: number) => taken.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 >= (t.r + r) ** 2);
  const wet = (x: number, z: number) => sampleField(field, x, z, 2);
  const add = (kind: MarshKind, x: number, z: number, scale: number, room: string | null, force = false): boolean => {
    const r = KINDS[kind].radius * scale * 0.75;
    if (!force && !free(x, z, r)) return false;
    // Nothing on playable hexes; tall reeds turn low where they would hide one.
    if (distanceToFootprint(layout, x, z) < (kind === 'lily' || kind === 'duckweed' ? 0.05 : 0.12)) return false;
    // Lily pads and duckweed only on water.
    if (KINDS[kind].floats && wet(x, z) < 0.5) return false;
    let k = kind;
    if (k === 'reeds' && hidesBoard(layout, x, z, 0.95 * scale, r)) k = 'reeds-low';
    if (k === 'reeds-low' && hidesBoard(layout, x, z, 0.45 * scale, r)) return false;
    const spec = KINDS[k];
    const dry = rnd();
    const g = 0.86 + rnd() * 0.24;
    spots.push({
      kind: k,
      x,
      z,
      y: spec.floats ? WATER_Y + 0.004 + rnd() * 0.003 : 0,
      rot: rnd() * Math.PI * 2,
      scale,
      variant: Math.floor(rnd() * spec.variants),
      // Some clumps drier (straw), some lusher; all a little lighter or darker.
      tint: k === 'reeds' || k === 'reeds-low' ? [g * (1 + dry * 0.12), g * (1 - dry * 0.04), g * (1 - dry * 0.1)] : spec.floats ? [g * 0.8, g * 0.84, g * 0.78] : [g, g, g],
      room,
    });
    taken.push({ x, z, r });
    return true;
  };
  const roomAt = (x: number, z: number) => nearestRoom(layout, x, z);

  // 1. Stands of reeds where the old pieces stood (they close the shore's edge): 3–5 clumps each.
  for (const p of placements) {
    if (!REPLACED.has(p.piece)) continue;
    if (p.piece === 'log') {
      add('log', p.x, p.z, p.scale * (0.85 + rnd() * 0.3), p.room, true);
      continue;
    }
    if (p.piece === 'lilies') {
      for (let i = 0; i < 2; i++) add('lily', p.x + (rnd() - 0.5) * 0.7, p.z + (rnd() - 0.5) * 0.7, 0.8 + rnd() * 0.5, p.room);
      continue;
    }
    const short = p.piece === 'reeds-low';
    // Fewer, bigger clumps on low quality; the edge stays closed either way.
    const n = Math.max(1, (p.piece === 'reeds' ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 2)) - (low ? 1 : 0));
    const big = low ? 1.25 : 1;
    // Along the piece's own X (the edge it closes).
    const ax = Math.cos(p.rot);
    const az = -Math.sin(p.rot);
    for (let i = 0; i < n; i++) {
      const s = (i / Math.max(1, n - 1) - 0.5) * 0.95 * p.scale + (rnd() - 0.5) * 0.2;
      const back = (rnd() - 0.3) * 0.35;
      const x = p.x + ax * s + Math.sin(p.rot) * -back;
      const z = p.z + az * s + Math.cos(p.rot) * -back;
      add(short ? 'reeds-low' : 'reeds', x, z, ((short ? 0.85 : 1.0) + rnd() * 0.35) * big, p.room, true);
    }
  }

  // 2. The water's edge and the shallows, sampled on a jittered grid around the board.
  const step = 0.42;
  const reach = 3.6;
  for (let z = layout.min.z - reach; z <= layout.max.z + reach; z += step) {
    for (let x = layout.min.x - reach; x <= layout.max.x + reach; x += step) {
      const px = x + (rnd() - 0.5) * step;
      const pz = z + (rnd() - 0.5) * step;
      const d = distanceToFootprint(layout, px, pz);
      if (d < 0.1 || d > reach) continue;
      const w = wet(px, pz);
      // How much water is near: the shore is dry here with water a step away.
      const near = Math.max(wet(px + 0.5, pz), wet(px - 0.5, pz), wet(px, pz + 0.5), wet(px, pz - 0.5));
      const stand = valueNoise(px * 0.55 + 3.1, pz * 0.55 - 1.7);
      const fade = d > 2.4 ? 0.35 : 1;
      const room = roomAt(px, pz);
      const roll = rnd();
      if (w > 0.2 && w < 0.75) {
        // Shallow edge: reeds in stands with gaps between them.
        if (stand > 0.5 && roll < 0.2 * amount * fade) add(rnd() < 0.2 ? 'reeds-low' : 'reeds', px, pz, 0.75 + rnd() * 0.5, room);
      } else if (w >= 0.75) {
        // Open still water: lily pads in loose groups, duckweed in drifts.
        if (stand > 0.55 && roll < 0.16 * amount * fade) add('lily', px, pz, 0.7 + rnd() * 0.6, room);
        else if (stand < 0.35 && roll < 0.1 * amount * fade) add('duckweed', px, pz, 0.8 + rnd() * 0.7, room);
      } else if (near > 0.5) {
        // Shore: mud banks, roots, now and then a log; reeds where the stand runs ashore.
        if (roll < 0.16 * amount) add('bank', px, pz, 0.7 + rnd() * 0.5, room);
        else if (roll < 0.26 * amount) add('roots', px, pz, 0.7 + rnd() * 0.5, room);
        else if (roll < 0.31 * amount) add('log', px, pz, 0.8 + rnd() * 0.4, room);
        else if (stand > 0.55 && roll < 0.4 * amount) add('reeds', px, pz, 0.7 + rnd() * 0.4, room);
      }
    }
  }
  return { spots, placements: kept };
}

function nearestRoom(layout: EnvLayout, x: number, z: number): string | null {
  let best = Infinity;
  let room: string | null = null;
  for (const c of layout.centres) {
    const d = (x - c.x) ** 2 + (z - c.z) ** 2;
    if (d < best) {
      best = d;
      room = c.room;
    }
  }
  return room;
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

/** Kit node name of a kind's variant (1-based, as in Blender). */
export function marshNode(kind: MarshKind, n: number): string {
  return `${kind}-${n + 1}`;
}

/** Whether the loaded kit has every kind (else the old pieces stay). */
export function marshKitReady(kit: ReadonlyMap<string, readonly Part[]>): boolean {
  return MARSH_KINDS.every((k) => kit.has(marshNode(k, 0)));
}

export interface MarshLook {
  sway: number | null;
}

export interface MarshBuild {
  root: THREE.Group;
  dispose(): void;
}

/** Materials whose parts move in the wind (the rest of a kind stands still: mud, logs). */
const SOFT = new Set<string>(['reed', 'straw', 'leaf', 'leafDark', 'lily', 'flower', 'cattail']);

/**
 * A kit part with its node matrix applied and painted: the palette colour of its material, darker
 * and muddier at the water line, plants drying toward the tips.
 */
function painted(part: Part, key: string, palette: (key: string) => THREE.Color, waterLine: boolean): THREE.BufferGeometry {
  const g = part.geometry.clone().applyMatrix4(part.matrix);
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const pos = g.getAttribute('position');
  g.computeBoundingBox();
  const top = Math.max(0.05, g.boundingBox!.max.y);
  const base = palette(key);
  const mud = palette('mud');
  const tipCol = palette('straw');
  const plant = key === 'reed' || key === 'leaf' || key === 'leafDark';
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.min(1, Math.max(0, y / top));
    c.copy(base);
    // Plants: green below, a dry straw cast toward the tips.
    if (plant) c.lerp(tipCol, Math.max(0, t - 0.55) * 0.9);
    // Wet and dark at the water line, a muddy tide mark just above it.
    // Stems are wet and dark at the water line (the mud they stand in keeps its own colour).
    const line = waterLine && plant ? Math.min(1, Math.max(0, 1 - (y - WATER_Y) / 0.1)) : 0;
    c.lerp(mud, line * 0.35).multiplyScalar(1 - line * 0.2);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * The marsh drawn from the kit: per kind, variant and look one InstancedMesh with each spot's
 * turn, size and tint. `material` gives the (shared) material for a look.
 */
export function buildMarsh(
  spots: readonly MarshSpot[],
  kit: ReadonlyMap<string, readonly Part[]>,
  palette: (key: string) => THREE.Color,
  material: (look: MarshLook) => THREE.Material,
): MarshBuild {
  const root = new THREE.Group();
  root.name = 'env:marsh';
  const owned: THREE.BufferGeometry[] = [];
  const byVariant = new Map<string, MarshSpot[]>();
  for (const s of spots) {
    const node = marshNode(s.kind, s.variant);
    const key = kit.has(node) ? node : marshNode(s.kind, 0);
    let list = byVariant.get(key);
    if (!list) byVariant.set(key, (list = []));
    list.push(s);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (const [node, list] of byVariant) {
    const parts = kit.get(node);
    if (!parts) continue;
    const sway = KINDS[list[0]!.kind].sway ?? null;
    // Parts of one look merge into one geometry per variant.
    const looks = new Map<string, THREE.BufferGeometry[]>();
    for (const part of parts) {
      const key = ((part.material as THREE.Material).name || 'reed').split('.')[0]!;
      if (key === 'mud' && list[0]!.kind === 'reeds-low') continue;
      const look = sway && SOFT.has(key) ? 'soft' : 'still';
      let gs = looks.get(look);
      if (!gs) looks.set(look, (gs = []));
      gs.push(painted(part, key, palette, !KINDS[list[0]!.kind].floats));
    }
    for (const [look, gs] of looks) {
      const geo = gs.length === 1 ? gs[0]! : mergeAll(gs);
      owned.push(geo);
      const mesh = new THREE.InstancedMesh(geo, material({ sway: look === 'soft' ? sway : null }), list.length);
      list.forEach((s, i) => {
        q.setFromAxisAngle(up, s.rot);
        m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.scale, s.scale, s.scale));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, tint.setRGB(...s.tint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `env:marsh:${node}:${look}`;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
  return {
    root,
    dispose() {
      for (const g of owned) g.dispose();
    },
  };
}

function mergeAll(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(gs, false)!;
  for (const g of gs) g.dispose();
  return out;
}

/** Palette keys the kit may name that are not location palette keys, with their colours. */
export const MARSH_COLOURS: Record<string, string> = {
  mud: '#64563f',
  lily: '#4f7a3e',
  flower: '#f0e6ea',
  cattail: '#5a3a22',
  duckweed: '#7f9a3c',
  bark: '#5a4632',
};

/** How wet a rock or log standing at (x, z) looks: 0 dry, 1 in the water. */
export function wetness(field: Field, x: number, z: number): number {
  let w = sampleField(field, x, z, 2);
  for (const [dx, dz] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]] as const) w = Math.max(w, sampleField(field, x + dx, z + dz, 2) * 0.8);
  return w;
}

/** Re-paints a rock vertex for the marsh: dark and glistening low down, algae at the water line,
 *  greener moss on top. `y` is the height above the floor, `ny` the normal's up part. */
export function wetRock(c: THREE.Color, y: number, ny: number, wet: number): void {
  const band = Math.min(1, Math.max(0, 1 - y / (0.1 + wet * 0.18)));
  c.multiplyScalar(1 - band * (0.25 + wet * 0.3));
  // Algae: a green-brown tide line at the water.
  const algae = Math.max(0, 1 - Math.abs(y - WATER_Y - 0.03) / 0.05) * wet;
  c.lerp(ALGAE, algae * 0.55);
  // Moss creeps over the tops of stones near water.
  if (ny > 0.55) c.lerp(MOSS, Math.min(1, (ny - 0.55) * 2.2) * (0.25 + wet * 0.35));
}
const ALGAE = new THREE.Color('#4a5a2a');
const MOSS = new THREE.Color('#5d7a34');

