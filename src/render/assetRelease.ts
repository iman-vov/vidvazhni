// Model and kit caches outlive a board: the game keeps one board view and loads mission after mission
// into it, and a quality switch loads every model again in another tier. Kept forever, every model and
// kit ever shown stays in memory with its decoded images and GPU textures (textures on the GPU grew
// 87 → 230+ over a sweep of s1–s10 on high). Each cache stamps its entries with the generation that
// last asked for them; the board starts a new generation when it loads another map or quality, and once
// it has settled, entries of earlier generations that nothing in the scene draws are dropped and their
// GPU copies freed.
//
// Freeing is always safe: three uploads a disposed geometry or texture again if it is drawn later, and
// the decoded images stay with whatever still holds them, so a stale reference costs an upload, never
// a broken picture.

import type * as THREE from 'three';

let generation = 0;

/** A new board (another map or quality): what it asks for from now on counts as in use. */
export function nextAssetGeneration(): void {
  generation++;
}

/** What a scene draws, hidden things included (merged sources stay in the scene, hidden). */
export interface InUse {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  textures: Set<THREE.Texture>;
}

function texturesOf(m: THREE.Material, out: (t: THREE.Texture) => void): void {
  for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) out(v as THREE.Texture);
  const uniforms = (m as THREE.ShaderMaterial).uniforms;
  if (uniforms) for (const u of Object.values(uniforms)) if ((u?.value as THREE.Texture | null)?.isTexture) out(u.value as THREE.Texture);
}

function eachMesh(root: THREE.Object3D, fn: (geometry: THREE.BufferGeometry | undefined, materials: THREE.Material[]) => void): void {
  root.traverse((o) => {
    const { geometry, material } = o as THREE.Mesh;
    if (!material) return;
    fn(geometry, Array.isArray(material) ? material : [material]);
  });
}

export function sceneInUse(scene: THREE.Object3D): InUse {
  const used: InUse = { geometries: new Set(), materials: new Set(), textures: new Set() };
  eachMesh(scene, (geometry, materials) => {
    if (geometry) used.geometries.add(geometry);
    for (const m of materials) {
      used.materials.add(m);
      texturesOf(m, (t) => used.textures.add(t));
    }
  });
  return used;
}

/** A mesh's geometry and material; kit parts may name a shared material by key instead. */
export interface PartLike {
  geometry?: THREE.BufferGeometry;
  material: THREE.Material | string;
}

/** True when the scene draws any geometry, material or texture of these parts. */
export function partsInUse(parts: Iterable<PartLike>, used: InUse): boolean {
  for (const p of parts) {
    if (p.geometry && used.geometries.has(p.geometry)) return true;
    if (typeof p.material === 'string') continue;
    if (used.materials.has(p.material)) return true;
    let hit = false;
    texturesOf(p.material, (t) => (hit ||= used.textures.has(t)));
    if (hit) return true;
  }
  return false;
}

/** The meshes under `root` as parts. */
export function partsOf(root: THREE.Object3D): PartLike[] {
  const out: PartLike[] = [];
  eachMesh(root, (geometry, materials) => {
    for (const material of materials) out.push({ geometry, material });
  });
  return out;
}

/** Frees the GPU copies of these parts' geometry and textures. */
export function freeParts(parts: Iterable<PartLike>): void {
  for (const p of parts) {
    p.geometry?.dispose();
    if (typeof p.material !== 'string') texturesOf(p.material, (t) => t.dispose());
  }
}

/** A promise cache whose entries remember the last generation that asked for them. */
export class StampedCache<V> {
  private entries = new Map<string, { value: Promise<V>; gen: number; resolved?: V; done: boolean }>();

  get(key: string): Promise<V> | undefined {
    const e = this.entries.get(key);
    if (e) e.gen = generation;
    return e?.value;
  }

  set(key: string, value: Promise<V>): void {
    const e: { value: Promise<V>; gen: number; resolved?: V; done: boolean } = { value, gen: generation, done: false };
    value.then(
      (v) => {
        e.resolved = v;
        e.done = true;
      },
      () => {},
    );
    this.entries.set(key, e);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Drops the loaded entries of earlier generations for which `inUse` is false, freeing each.
   *  Returns how many went. */
  release(inUse: (v: V) => boolean, free: (v: V) => void): number {
    let n = 0;
    for (const [key, e] of this.entries) {
      if (e.gen >= generation || !e.done || inUse(e.resolved as V)) continue;
      this.entries.delete(key);
      free(e.resolved as V);
      n++;
    }
    return n;
  }
}

const releasers: ((used: InUse) => number)[] = [];

/** A cache module registers how it releases what the scene no longer draws. */
export function onAssetRelease(fn: (used: InUse) => number): void {
  releasers.push(fn);
}

/** Frees cached models and kits of earlier generations that `scene` does not draw. Returns how many
 *  cache entries went. */
export function releaseUnusedAssets(scene: THREE.Object3D): number {
  const used = sceneInUse(scene);
  return releasers.reduce((n, fn) => n + fn(used), 0);
}
