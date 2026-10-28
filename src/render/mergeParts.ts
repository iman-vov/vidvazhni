// Merges a static prop's parts into one mesh per material. A piece is built one mesh per part (so a
// door body can move its parts, rubble its stones), which makes a crate 21 draw calls for 3
// materials, twice over with its shadow. An obstacle never moves its parts, so they are baked into
// the group's space and merged: same look, a draw call per material.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const local = new THREE.Matrix4();

/** Replaces the plain meshes under `group` that share a material (and the same attributes, draw
 *  order and flags) with one merged mesh each. Skinned, instanced, morphing and multi-material meshes
 *  stay as they are. Returns how many meshes were merged away. */
export function mergeStaticParts(group: THREE.Object3D): number {
  group.updateMatrixWorld(true);
  const toGroup = group.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.visible) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    const g = mesh.geometry;
    if (Object.keys(g.morphAttributes).length) return;
    if (Object.values(g.attributes).some((a) => (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute)) return;
    const attrs = Object.entries(g.attributes)
      .map(([name, a]) => `${name}${a.itemSize}${a.normalized ? 'n' : ''}${(a as THREE.BufferAttribute).array.constructor.name}`)
      .sort()
      .join(',');
    const key = `${mesh.material.uuid}|${attrs}|${g.index ? 'i' : '-'}|${mesh.renderOrder}|${mesh.castShadow}|${mesh.receiveShadow}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(mesh);
  });
  let merged = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geometries = list.map((m) => m.geometry.clone().applyMatrix4(local.multiplyMatrices(toGroup, m.matrixWorld)));
    const geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!geometry) continue;
    const first = list[0]!;
    const mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = first.name;
    mesh.renderOrder = first.renderOrder;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    for (const m of list) m.removeFromParent();
    group.add(mesh);
    merged += list.length - 1;
  }
  return merged;
}

/** Marks a mesh hidden because a batch draws it (it still counts as shown for the next batch). */
const BATCHED = 'batchedInto';

function batchable(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || Array.isArray(mesh.material)) return false;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  const m = mesh.material;
  // See-through and glowing things keep their own draw (sorting, additive blending).
  if (m.transparent || m.blending !== THREE.NormalBlending) return false;
  const g = mesh.geometry;
  if (Object.keys(g.morphAttributes).length) return false;
  return !Object.values(g.attributes).some((a) => (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute);
}

/** The meshes a batch of `sources` would draw: shown ones (or hidden by an earlier batch) under
 *  shown parents; the sources themselves may be hidden. */
function batchMeshes(sources: THREE.Object3D[]): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D, top: boolean): void => {
    if (!top && !o.visible && !o.userData[BATCHED]) return;
    if (o.name === 'static-batch') return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && batchable(mesh)) out.push(mesh);
    for (const c of o.children) visit(c, false);
  };
  for (const s of sources) visit(s, true);
  return out;
}

/** What a batch of `sources` depends on: its meshes, their geometry and shadow flags. Static props
 *  do not move, so the same signature means the same batch. */
export function batchSignature(sources: THREE.Object3D[]): string {
  return batchMeshes(sources)
    .map((m) => `${m.id}:${m.geometry.id}:${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`)
    .join(',');
}

/** Draws the static props `sources` as one mesh per material under `target` (their parent group:
 *  rooms rise and sink with it), hiding the meshes it took over. Shadow flags come from those meshes
 *  and are kept (userData.keepShadow: shadows.ts would judge the batch by its room-wide size).
 *  Null when nothing shares a material. */
export function batchStatic(target: THREE.Object3D, sources: THREE.Object3D[]): THREE.Group | null {
  target.updateMatrixWorld(true);
  const toTarget = target.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  for (const mesh of batchMeshes(sources)) {
    const g = mesh.geometry;
    const attrs = Object.entries(g.attributes)
      .map(([name, a]) => `${name}${a.itemSize}${a.normalized ? 'n' : ''}${(a as THREE.BufferAttribute).array.constructor.name}`)
      .sort()
      .join(',');
    const key = `${(mesh.material as THREE.Material).uuid}|${attrs}|${g.index ? 'i' : '-'}|${mesh.renderOrder}|${mesh.castShadow}|${mesh.receiveShadow}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(mesh);
  }
  const batch = new THREE.Group();
  batch.name = 'static-batch';
  const hidden: THREE.Mesh[] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geometries = list.map((m) => {
      m.updateWorldMatrix(true, false);
      return m.geometry.clone().applyMatrix4(local.multiplyMatrices(toTarget, m.matrixWorld));
    });
    const geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!geometry) continue;
    const first = list[0]!;
    const mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = 'static-batch';
    mesh.renderOrder = first.renderOrder;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.userData['keepShadow'] = true;
    batch.add(mesh);
    for (const m of list) {
      m.visible = false;
      m.userData[BATCHED] = true;
      hidden.push(m);
    }
  }
  if (!batch.children.length) return null;
  batch.userData['hidden'] = hidden;
  target.add(batch);
  return batch;
}

/** Undoes batchStatic: shows the meshes again and frees the merged geometry. */
export function unbatch(batch: THREE.Group | null | undefined): void {
  if (!batch) return;
  for (const m of (batch.userData['hidden'] as THREE.Mesh[] | undefined) ?? []) {
    m.visible = true;
    delete m.userData[BATCHED];
  }
  for (const c of batch.children) (c as THREE.Mesh).geometry?.dispose();
  batch.removeFromParent();
}
