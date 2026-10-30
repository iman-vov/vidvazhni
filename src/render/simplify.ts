// Lighter copies of geometry for things that are small on screen: the figures at the normal zoom
// (figureView.ts) and the shared rock kit's stones (~1500 triangles each whatever their size, so a
// pebble-sized chunk beside a boulder was drawn with as many as the boulder). meshoptimizer simplifies a copy down to an error relative to the
// shape's own size (so a chunk a fifth of a stone's height may lose more), weighing normals and
// UVs so the facets keep their shading and the texture stays put. Seams stay closed: the
// 'Permissive' mode, which collapses across them, saves twice as much but opened cracks in the
// boulders. Done once per geometry and error, at kit load.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

let ready = false;
/** Resolves once the simplifier's WebAssembly is in; before that `simplified` returns its input. */
export const simplifierReady: Promise<void> = MeshoptSimplifier.ready.then(
  () => {
    ready = true;
  },
  () => {},
);

/** Weight of the normal and UV differences against the shape error: low enough that flat facets
 *  merge, high enough that a crease or a UV seam is not dragged across. */
const ATTRIBUTE_WEIGHT = 0.25;

const cache = new WeakMap<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();

/**
 * A copy of `src` simplified to `error` (a fraction of its size), indexed or not like the source;
 * an indexed copy shares the source's attributes (only the triangle list changes). The shape is
 * judged by position, normal and UV. Returns `src` itself when the simplifier is not loaded or the
 * copy would save under a tenth.
 */
export function simplified(src: THREE.BufferGeometry, error: number): THREE.BufferGeometry {
  if (!ready) return src;
  let byError = cache.get(src);
  if (!byError) cache.set(src, (byError = new Map()));
  const known = byError.get(error);
  if (known) return known;
  // A model's mesh comes indexed (its attributes quantised and interleaved): simplified as it is,
  // the copy shares its attributes. A kit part is a plain triangle soup: welded first.
  const welded = src.index ? src : mergeVertices(src, 1e-5);
  const pos = welded.getAttribute('position');
  const nrm = welded.getAttribute('normal');
  const uv = welded.getAttribute('uv');
  let out = src;
  if (welded.index && pos && nrm) {
    const n = pos.count;
    const positions = new Float32Array(n * 3);
    const attributes = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = pos.getX(i);
      positions[i * 3 + 1] = pos.getY(i);
      positions[i * 3 + 2] = pos.getZ(i);
      attributes[i * 5] = nrm.getX(i);
      attributes[i * 5 + 1] = nrm.getY(i);
      attributes[i * 5 + 2] = nrm.getZ(i);
      attributes[i * 5 + 3] = uv ? uv.getX(i) : 0;
      attributes[i * 5 + 4] = uv ? uv.getY(i) : 0;
    }
    const w = ATTRIBUTE_WEIGHT;
    const [indices] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(welded.index.array), positions, 3, attributes, 5, [w, w, w, w, w], null, 0, error);
    if (indices.length > 0 && indices.length < welded.index.count * 0.9) {
      if (src.index) {
        out = new THREE.BufferGeometry();
        for (const [name, a] of Object.entries(src.attributes)) out.setAttribute(name, a);
        out.setIndex(new THREE.BufferAttribute(indices, 1));
        out.boundingBox = src.boundingBox;
        out.boundingSphere = src.boundingSphere;
      } else {
        welded.setIndex(new THREE.BufferAttribute(indices, 1));
        out = welded.toNonIndexed();
      }
    }
  }
  if (welded !== src) welded.dispose();
  byError.set(error, out);
  return out;
}
