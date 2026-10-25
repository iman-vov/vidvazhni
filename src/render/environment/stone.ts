// Stones for the rock pieces (`boulder`, `snow-rock`, `rock`, `rubble-heap`), from the shared Blender rock kit
// `env-rocks` (art/blender/env-kit/rocks.py): six stone shapes, each bare, mossy and snowy, nodes
// `stone-<a..f>`, `stone-moss-<a..f>`, `stone-snow-<a..f>`, 1.0 tall, foot sunk below y = 0. Every
// placement picks its shapes by a seed and gets its own turn and size within the piece, so a ring
// of rocks never repeats one stone. Until the kit has loaded (and for a location without it) the
// pieces keep their placeholders.

import * as THREE from 'three';
import type { Part } from './pieces';

/** Which look a location's stones take. */
export type StoneLook = 'stone' | 'stone-moss' | 'stone-snow';

/** One stone of a piece: height (world units before the placement's scale), offset, and whether
 *  it is a small chunk (any shape) or a main stone. */
interface StoneSlot {
  h: number;
  x: number;
  z: number;
  small?: boolean;
}

const SPECS: Record<string, { slots: StoneSlot[]; look?: StoneLook }> = {
  boulder: { slots: [{ h: 0.75, x: 0, z: 0 }, { h: 0.24, x: 0.42, z: 0.22, small: true }] },
  'snow-rock': { slots: [{ h: 0.6, x: 0, z: 0 }, { h: 0.22, x: 0.36, z: 0.18, small: true }], look: 'stone-snow' },
  rock: { slots: [{ h: 0.4, x: -0.06, z: 0 }, { h: 0.22, x: 0.3, z: 0.1, small: true }, { h: 0.15, x: -0.32, z: 0.2, small: true }] },
  // A heap of broken rock (mine, cave): stones leaning on each other, small ones around.
  'rubble-heap': {
    slots: [
      { h: 0.42, x: 0, z: -0.05 },
      { h: 0.3, x: 0.26, z: 0.12 },
      { h: 0.26, x: -0.27, z: 0.1 },
      { h: 0.16, x: 0.05, z: 0.3, small: true },
      { h: 0.13, x: -0.4, z: -0.18, small: true },
      { h: 0.12, x: 0.42, z: -0.16, small: true },
    ],
    look: 'stone',
  },
};
/** Big shapes for main stones, chunky ones for the small. */
const MAIN = ['a', 'b', 'c', 'd', 'e'];
const SMALL = ['f', 'd', 'a', 'e'];

export interface StoneEnv {
  look: StoneLook;
  /** The location's rock colour: bare stones take it on (dark slate in the depths, warm in the forge). */
  rock: string;
  /** The parts of a kit node, once the kit has loaded. */
  kit(id: string): Part[] | undefined;
}

/** The stone look of a location: snow on the pass, moss outdoors, bare rock underground and in town. */
export function stoneLook(def: { id: string; edge: string }): StoneLook {
  if (def.id === 'mountain-pass' || def.edge === 'cliff') return 'stone-snow';
  return def.edge === 'forest' || def.edge === 'shore' ? 'stone-moss' : 'stone';
}

/** The kit's own painted rock colour, which a location's `rock` colour is measured against. */
const KIT_ROCK = new THREE.Color('#8c8478');
const tinted = new Map<string, THREE.Material>();

/** The kit material in a location's rock colour (bare stones only; moss and snow keep theirs). */
function rockMaterial(m: Part['material'], look: StoneLook, rock: string): Part['material'] {
  if (typeof m === 'string' || look !== 'stone') return m;
  const c = new THREE.Color(rock);
  const k = [c.r / KIT_ROCK.r, c.g / KIT_ROCK.g, c.b / KIT_ROCK.b].map((v) => Math.min(1.2, Math.max(0.35, v)));
  if (k.every((v) => Math.abs(v - 1) < 0.05)) return m;
  const key = `${m.uuid}|${rock}`;
  let t = tinted.get(key);
  if (!t) {
    t = m.clone();
    (t as THREE.MeshStandardMaterial).color?.setRGB(k[0]!, k[1]!, k[2]!);
    tinted.set(key, t);
  }
  return t;
}

/** Whether a piece is drawn from the rock kit. */
export function isStone(piece: string): boolean {
  return piece in SPECS;
}

/**
 * The parts of a stone piece for a seed (a placement's position, a counter), or null when the
 * piece is not a stone or the kit has not loaded. Geometry is the kit's: callers clone it.
 */
export function stoneParts(piece: string, seed: number, env: StoneEnv): Part[] | null {
  const spec = SPECS[piece];
  if (!spec) return null;
  const look = spec.look ?? env.look;
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const parts: Part[] = [];
  const m = new THREE.Matrix4();
  for (const slot of spec.slots) {
    const shapes = slot.small ? SMALL : MAIN;
    const shape = shapes[Math.floor(rnd() * shapes.length)]!;
    const kit = env.kit(`${look}-${shape}`) ?? env.kit(`stone-${shape}`);
    if (!kit) return null;
    const h = slot.h * (0.85 + rnd() * 0.3);
    const turn = rnd() * Math.PI * 2;
    m.compose(new THREE.Vector3(slot.x, 0, slot.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(h * (0.9 + rnd() * 0.2), h, h * (0.9 + rnd() * 0.2)));
    for (const part of kit) parts.push({ geometry: part.geometry, material: rockMaterial(part.material, look, env.rock), matrix: m.clone().multiply(part.matrix), detail: !!slot.small });
  }
  return parts;
}
