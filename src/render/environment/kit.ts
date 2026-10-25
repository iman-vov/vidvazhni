// Art-kit pieces from Blender replace the procedural pieces of the same id. Two sources:
//   assets/models/env-<location>/env-<location>{.low,,.hq}.glb  one GLB per location (made by
//       `npm run models env-<location>`), each top-level node a piece named by its kit id; a
//       location may also borrow pieces from other kits (`kits` in its data, e.g. the mill takes
//       rocks and logs from the thorn path). This is how the Blender kit ships.
//   assets/environment/<location>/<piece>.glb (or common/<piece>.glb)  one GLB per piece.
// A kit piece uses the frame described in pieces.ts (origin at the bottom centre, 1 unit = one hex,
// facing +Z, walls along X with their inner face at z = 0). Its meshes keep their own materials
// (the location atlas); the board adds its fog to them. Node transforms count (meshopt moves the
// quantisation offset and scale into the node), so parts carry the node's world matrix.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { listModels, modelUrl, resolveTier } from '../models';
import type { GraphicsQuality } from '../quality';
import type { Part } from './pieces';

const KIT_URLS = import.meta.glob<string>('/assets/environment/**/*.glb', { query: '?url', import: 'default', eager: true });

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<Part[] | null>>();
const kitCache = new Map<string, Promise<Map<string, Part[]>>>();

/** URL of the kit GLB for a piece in a location, if the build has one. */
export function kitUrl(location: string, piece: string): string | undefined {
  return KIT_URLS[`/assets/environment/${location}/${piece}.glb`] ?? KIT_URLS[`/assets/environment/common/${piece}.glb`];
}

/** Piece ids with a kit GLB for this location. */
export function kitPieces(location: string): Set<string> {
  const out = new Set<string>();
  for (const path of Object.keys(KIT_URLS)) {
    const m = /^\/assets\/environment\/([^/]+)\/([^/]+)\.glb$/.exec(path);
    if (m && (m[1] === location || m[1] === 'common')) out.add(m[2]!);
  }
  return out;
}

/** A geometry with plain float position and normal (meshopt quantises them to normalised ints,
 *  which cannot take a matrix), no index, and nothing else but its UVs. */
export function floatGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) {
      g.deleteAttribute(name);
      continue;
    }
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

function partsOf(root: THREE.Object3D): Part[] {
  const parts: Part[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Pieces sit at the kit's origin; the node's own transform is the quantisation offset and scale.
    parts.push({ geometry: floatGeometry(mesh.geometry), material: materials[0]!, matrix: mesh.matrixWorld.clone(), detail: false });
  });
  return parts;
}

/** Loads a kit piece as parts (shared geometry and materials; callers clone geometry). */
export function loadKitPiece(location: string, piece: string): Promise<Part[] | null> {
  const url = kitUrl(location, piece);
  if (!url) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    p = loader
      .loadAsync(url)
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const parts: Part[] = [];
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          parts.push({ geometry: floatGeometry(mesh.geometry), material: materials[0]!, matrix: mesh.matrixWorld.clone(), detail: false });
        });
        return parts;
      })
      .catch(() => null);
    cache.set(url, p);
  }
  return p;
}

/** Model ids of the location kits a location uses (its own first), that exist in this build. */
export function locationKits(location: string, borrowed: readonly string[] = []): string[] {
  const all = new Set(listModels());
  // Every location borrows the shared rock kit last (stone.ts).
  return [`env-${location}`, ...borrowed, 'env-rocks'].filter((id, i, a) => a.indexOf(id) === i && all.has(id));
}

/** Every piece of a location kit GLB (`env-<location>` model), by node name. */
export function loadLocationKit(modelId: string, quality: GraphicsQuality): Promise<Map<string, Part[]>> {
  const tier = resolveTier(modelId, quality);
  const url = tier ? modelUrl(modelId, tier) : undefined;
  if (!url) return Promise.resolve(new Map());
  let p = kitCache.get(url);
  if (!p) {
    p = loader
      .loadAsync(url)
      .then((gltf) => {
        const out = new Map<string, Part[]>();
        gltf.scene.updateMatrixWorld(true);
        for (const node of gltf.scene.children) {
          const parts = partsOf(node);
          if (parts.length && node.name) out.set(node.name, parts);
        }
        return out;
      })
      .catch(() => new Map<string, Part[]>());
    kitCache.set(url, p);
  }
  return p;
}
