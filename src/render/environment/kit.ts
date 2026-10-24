// Art-kit pieces from Blender: assets/environment/<location>/<piece>.glb (or common/<piece>.glb)
// replaces the procedural piece of the same id. A kit GLB uses the piece frame described in
// pieces.ts (origin at the bottom centre, 1 unit = one hex, facing +Z, walls along X with their
// inner face at z = 0). Its meshes keep their own materials; the board adds its fog to them.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Part } from './pieces';

const KIT_URLS = import.meta.glob<string>('/assets/environment/**/*.glb', { query: '?url', import: 'default', eager: true });

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<Part[] | null>>();

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

/** Loads a kit piece as parts (shared geometry and materials; callers clone geometry). */
export function loadKitPiece(location: string, piece: string): Promise<Part[] | null> {
  const url = kitUrl(location, piece);
  if (!url) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    p = loader
      .loadAsync(url)
      .then((gltf) => {
        const parts: Part[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          parts.push({ geometry: g, material: materials[0]!, matrix: mesh.matrixWorld.clone(), detail: false });
        });
        return parts;
      })
      .catch(() => null);
    cache.set(url, p);
  }
  return p;
}
