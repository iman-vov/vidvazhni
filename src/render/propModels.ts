// Prop models (barrels, crates, chests, doors, levers, braziers… made in Meshy, in
// assets/models/<id>/) standing in for the procedural props once they exist. The location's
// `propModels` table (data/environments/*.json) says which model shows which piece, obstacle,
// object look or tile thing; anything without a model keeps its procedural placeholder.
// A prototype is the model normalised to the piece frame: feet at y = 0, centred over the origin,
// scaled to the wanted height, facing +Z. Instances share its geometry and materials.

import * as THREE from 'three';
import type { EnvironmentDef, PropModelSpec } from './environment/types';
import { onAssetRelease, partsInUse, partsOf, StampedCache } from './assetRelease';
import { loadModel } from './models';
import type { GraphicsQuality } from './quality';

export interface PropPrototype {
  spec: Required<PropModelSpec>;
  /** The normalised model (clone it with `.clone()` for each use; skinned props are not expected). */
  object: THREE.Group;
  /** Footprint radius after normalising (for the contact shadow). */
  radius: number;
}

/**
 * The model spec for a key in a location: the table entry for the key itself, else for its
 * fallback keys in order (an object look `brazier:lit` → piece `brazier-lit`), else the key as a
 * model id when such a model exists (a scenario obstacle `barrel` with assets/models/barrel/).
 * Null when nothing in `available` can show it.
 */
export function propModelFor(def: Pick<EnvironmentDef, 'propModels'> | null, keys: readonly string[], available: ReadonlySet<string>, defaultHeight: number): Required<PropModelSpec> | null {
  for (const key of keys) {
    const entry = def?.propModels?.[key];
    if (!entry) continue;
    const spec = typeof entry === 'string' ? { model: entry } : entry;
    if (!available.has(spec.model)) continue;
    return { model: spec.model, height: spec.height ?? defaultHeight, rotY: spec.rotY ?? 0, stack: spec.stack ?? 1 };
  }
  for (const key of keys) if (available.has(key)) return { model: key, height: MODEL_HEIGHT[key] ?? defaultHeight, rotY: 0, stack: 1 };
  return null;
}

/** Scale, offset and footprint that put a box's bottom centre at the origin and its height at `height`. */
export function fitToHeight(box: THREE.Box3, height: number): { scale: number; offset: THREE.Vector3; radius: number } {
  const size = box.getSize(new THREE.Vector3());
  const scale = size.y > 1e-6 ? height / size.y : 1;
  const centre = box.getCenter(new THREE.Vector3());
  return {
    scale,
    offset: new THREE.Vector3(-centre.x * scale, -box.min.y * scale, -centre.z * scale),
    radius: (Math.max(size.x, size.z) / 2) * scale,
  };
}

/**
 * Heights (hex units) for props found by their own id rather than a location's table, where the
 * caller's generic default would size them wrong (a bookshelf shown at a barrel's height).
 * The Glass Town and Sleepy Marsh props of Act III are Blender-made (art/blender/act3-props).
 * Lily pads are flat: their height is the model's own, so a pad keeps its ~0.75 width.
 */
export const MODEL_HEIGHT: Readonly<Record<string, number>> = {
  mirror: 1.15,
  'mirror-broken': 1.15,
  'glassware-shelf': 1.4,
  'glass-furnace': 1.9,
  bookshelf: 1.35,
  'glass-cart': 0.85,
  'crystal-heart': 1.0,
  'wind-up-key': 0.85,
  blueprint: 0.75,
  loom: 1.3,
  bell: 1.1,
  cocoon: 1.0,
  'lily-pad': 0.116,
  'lily-pad-2': 0.154,
  'lily-pad-3': 0.054,
  // Glass Town room dressing (crystals from the floor, lantern post, glassmaker's bench, pane rack)
  'glass-crystals': 0.85,
  'glass-crystals-2': 1.15,
  'glass-lantern': 1.5,
  'glass-workbench': 1.15,
  'glass-panes': 0.8,
};

/**
 * Difficult-terrain clumps (art/blender/terrain-props): low litter round a hex's rim, one set of
 * variants per region, picked per location. They are modelled in hex units round the hex centre
 * and shown as made (anchoredModel), so a clump heavy on one side stays on the rim.
 */
export const ROUGH_SETS: Readonly<Record<string, string>> = {
  'thorn-path': 'forest',
  'flooded-mill': 'marsh',
  'dark-depths': 'cave',
  'mine-tunnel': 'cave',
  'gloom-heart': 'cave',
  'mountain-pass': 'cave',
  cellar: 'town',
  copperdale: 'town',
  'old-forge': 'town',
  watchtower: 'town',
  'glass-town': 'glass',
  'glass-heights': 'glass',
};
export const ROUGH_VARIANTS = 3;

/** The difficult-terrain clump model for a hex of a location, or null when it has no set. */
export function roughModelFor(environmentId: string | null | undefined, q: number, r: number): string | null {
  const set = environmentId ? ROUGH_SETS[environmentId] : undefined;
  if (!set) return null;
  const h = Math.abs(Math.sin(q * 91.7 + r * 47.3) * 15731.7) % 1;
  return `rough-${set}-${1 + Math.floor(h * ROUGH_VARIANTS)}`;
}

/** Location → trap set (art/blender/terrain-props): a snare among leaves and stakes in the forest
 *  and the marsh, a spiked pit in caves and mines, caltrops round a sprung plate in town, glass
 *  spikes in the Glass Town. Locations without one keep their `trap` prop (a bear trap). */
export const TRAP_SETS: Readonly<Record<string, string>> = {
  'thorn-path': 'forest',
  'flooded-mill': 'forest',
  'dark-depths': 'cave',
  'mine-tunnel': 'cave',
  'gloom-heart': 'cave',
  'mountain-pass': 'cave',
  cellar: 'town',
  copperdale: 'town',
  'old-forge': 'town',
  watchtower: 'town',
  'glass-town': 'glass',
  'glass-heights': 'glass',
};

/** The trap model of a location, or null when it has no set. */
export function trapModelFor(environmentId: string | null | undefined): string | null {
  const set = environmentId ? TRAP_SETS[environmentId] : undefined;
  return set ? `trap-${set}` : null;
}

/** Models shown at their authored size and origin rather than fitted to a height and centred. */
export function anchoredModel(model: string): boolean {
  return model.startsWith('rough-') || /^trap-(forest|cave|town|glass)$/.test(model);
}

const cache = new StampedCache<PropPrototype | null>();
// Prototypes of earlier boards that nothing drawn shares geometry or materials with; their model's
// GPU copies go with the model (models.ts).
onAssetRelease((used) => cache.release((proto) => !!proto && partsInUse(partsOf(proto.object), used), () => {}));

/** Loads and normalises a prop model (cached per model, height, turn and quality); null if it fails. */
export function loadPropPrototype(spec: Required<PropModelSpec>, quality: GraphicsQuality): Promise<PropPrototype | null> {
  const key = `${spec.model}@${quality}:${spec.height.toFixed(3)}:${spec.rotY}:${spec.stack}`;
  let p = cache.get(key);
  if (!p) {
    p = loadModel(spec.model, { quality })
      .then((model) => {
        const inner = model.scene;
        inner.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(inner);
        if (box.isEmpty()) return null;
        const count = Math.max(1, spec.stack);
        const fit = anchoredModel(spec.model)
          ? { scale: 1, offset: new THREE.Vector3(), radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z) }
          : fitToHeight(box, spec.height / count);
        inner.scale.multiplyScalar(fit.scale);
        inner.position.multiplyScalar(fit.scale).add(fit.offset);
        const object = new THREE.Group();
        object.name = `prop:${spec.model}`;
        object.rotation.y = THREE.MathUtils.degToRad(spec.rotY);
        object.add(inner);
        // A pile: each copy on the one below, a little turned and shifted, a touch smaller.
        for (let i = 1; i < count; i++) {
          const copy = new THREE.Group();
          copy.add(inner.clone());
          copy.position.set(Math.sin(i * 2.3) * 0.04, (spec.height / count) * i * 0.97, Math.cos(i * 1.7) * 0.03);
          copy.rotation.y = 0.35 * (i % 2 ? 1 : -1.4);
          copy.scale.setScalar(1 - 0.06 * i);
          object.add(copy);
        }
        object.updateMatrixWorld(true);
        return { spec, object, radius: fit.radius };
      })
      .catch(() => null);
    p.then((r) => {
      if (!r) cache.delete(key);
    });
    cache.set(key, p);
  }
  return p;
}

/** Meshes of a prototype with their matrices in the prototype's frame (for instancing). */
export function prototypeMeshes(proto: PropPrototype): { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] {
  const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = [];
  proto.object.updateMatrixWorld(true);
  proto.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    out.push({ geometry: mesh.geometry, material: list[0]!, matrix: mesh.matrixWorld.clone() });
  });
  return out;
}

/** A small seeded variation for a prop on a hex: turn (radians) and scale, so rows do not look stamped. */
export function hexVariation(q: number, r: number): { rot: number; scale: number } {
  const h = Math.abs(Math.sin(q * 127.1 + r * 311.7) * 43758.5453) % 1;
  const g = Math.abs(Math.sin(q * 269.5 + r * 183.3) * 24634.6345) % 1;
  return { rot: h * Math.PI * 2, scale: 0.93 + g * 0.13 };
}
