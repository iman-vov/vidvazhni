// Prop models (barrels, crates, chests, doors, levers, braziers… made in Meshy, in
// assets/models/<id>/) standing in for the procedural props once they exist. The location's
// `propModels` table (data/environments/*.json) says which model shows which piece, obstacle,
// object look or tile thing; anything without a model keeps its procedural placeholder.
// A prototype is the model normalised to the piece frame: feet at y = 0, centred over the origin,
// scaled to the wanted height, facing +Z. Instances share its geometry and materials.

import * as THREE from 'three';
import type { EnvironmentDef, PropModelSpec } from './environment/types';
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
    return { model: spec.model, height: spec.height ?? defaultHeight, rotY: spec.rotY ?? 0 };
  }
  for (const key of keys) if (available.has(key)) return { model: key, height: defaultHeight, rotY: 0 };
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

const cache = new Map<string, Promise<PropPrototype | null>>();

/** Loads and normalises a prop model (cached per model, height, turn and quality); null if it fails. */
export function loadPropPrototype(spec: Required<PropModelSpec>, quality: GraphicsQuality): Promise<PropPrototype | null> {
  const key = `${spec.model}@${quality}:${spec.height.toFixed(3)}:${spec.rotY}`;
  let p = cache.get(key);
  if (!p) {
    p = loadModel(spec.model, { quality })
      .then((model) => {
        const inner = model.scene;
        inner.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(inner);
        if (box.isEmpty()) return null;
        const fit = fitToHeight(box, spec.height);
        inner.scale.multiplyScalar(fit.scale);
        inner.position.multiplyScalar(fit.scale).add(fit.offset);
        const object = new THREE.Group();
        object.name = `prop:${spec.model}`;
        object.rotation.y = THREE.MathUtils.degToRad(spec.rotY);
        object.add(inner);
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
