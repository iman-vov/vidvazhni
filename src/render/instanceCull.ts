// Per-instance view culling for the big instanced layers around the board (marsh reeds, floor
// scatter, prop models). three culls an InstancedMesh as a whole, by a sphere around all its
// instances, so a reed variant spread over the whole map is drawn in full whenever one clump is in
// view; at the normal zoom most of them are off screen. Here each registered mesh keeps its full
// instance list aside and, whenever the camera moves, packs only the instances inside the view
// (grown by a margin, so shadows thrown into the view from just outside it stay) to the front and
// draws that many. Same draw calls, fewer triangles in the scene pass and in the sun's map.
// Instances keep their matrices and colours, so shaders reading instanceMatrix (sway) do not jump.

import * as THREE from 'three';

/** Meshes with fewer triangles than this in all (triangles × instances) are left to three. */
const MIN_TRIS = 6000;

interface Entry {
  mesh: THREE.InstancedMesh;
  matrices: Float32Array;
  colors: Float32Array | null;
  /** Sphere per instance in the mesh's frame: x, y, z, radius. */
  spheres: Float32Array;
  total: number;
  margin: number;
  /** Has been in the scene (a mesh registered just before it is added is not let go). */
  shown: boolean;
}

const live = new Set<Entry>();
const frustum = new THREE.Frustum();
const projView = new THREE.Matrix4();
const lastView = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const m = new THREE.Matrix4();
let dirty = true;

function triangles(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

/** Takes the mesh's instances as they are now (set them first). Returns whether it was taken:
 *  small meshes, and meshes that move their instances later (spinners), are left as they are. */
export function cullInstances(mesh: THREE.InstancedMesh, margin = 1.5): boolean {
  if (mesh.count < 8 || triangles(mesh.geometry) * mesh.count < MIN_TRIS) return false;
  const g = mesh.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const local = g.boundingSphere!;
  const total = mesh.count;
  const spheres = new Float32Array(total * 4);
  for (let i = 0; i < total; i++) {
    mesh.getMatrixAt(i, m);
    sphere.copy(local).applyMatrix4(m);
    spheres.set([sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius], i * 4);
  }
  const entry: Entry = {
    mesh,
    matrices: (mesh.instanceMatrix.array as Float32Array).slice(0, total * 16),
    colors: mesh.instanceColor ? (mesh.instanceColor.array as Float32Array).slice(0, total * 3) : null,
    spheres,
    total,
    margin,
    shown: false,
  };
  // The packed buffers change whenever the camera moves.
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
  live.add(entry);
  dirty = true;
  return true;
}

function topOf(o: THREE.Object3D): THREE.Object3D {
  while (o.parent) o = o.parent;
  return o;
}

/** Packs every registered mesh in `scene` to what `camera` sees; cheap when the camera has not
 *  moved. Meshes no longer in the scene (a layer rebuilt) are let go. */
export function updateInstanceCulling(scene: THREE.Object3D, camera: THREE.Camera): void {
  projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  if (!dirty && projView.equals(lastView)) return;
  lastView.copy(projView);
  dirty = false;
  frustum.setFromProjectionMatrix(projView);
  for (const e of live) {
    const { mesh } = e;
    if (topOf(mesh) !== scene) {
      if (e.shown) live.delete(e);
      continue;
    }
    e.shown = true;
    mesh.updateWorldMatrix(true, false);
    pack(e, frustum);
  }
}

function pack(e: Entry, view: THREE.Frustum): void {
  const { mesh, matrices, colors, spheres, total } = e;
  const out = mesh.instanceMatrix.array as Float32Array;
  const outColors = mesh.instanceColor?.array as Float32Array | undefined;
  const world = mesh.matrixWorld;
  const grow = world.getMaxScaleOnAxis();
  let n = 0;
  for (let i = 0; i < total; i++) {
    sphere.center.set(spheres[i * 4]!, spheres[i * 4 + 1]!, spheres[i * 4 + 2]!).applyMatrix4(world);
    sphere.radius = spheres[i * 4 + 3]! * grow + e.margin;
    if (!view.intersectsSphere(sphere)) continue;
    out.set(matrices.subarray(i * 16, i * 16 + 16), n * 16);
    if (colors && outColors) outColors.set(colors.subarray(i * 3, i * 3 + 3), n * 3);
    n++;
  }
  if (n === mesh.count && n === total) return;
  mesh.count = n;
  // Nothing in view: hide it (a draw of no instances still costs a call); show it again only if
  // the hiding was ours.
  if (n === 0 && mesh.visible) {
    mesh.visible = false;
    mesh.userData['culledOut'] = true;
  } else if (n > 0 && mesh.userData['culledOut']) {
    mesh.visible = true;
    delete mesh.userData['culledOut'];
  }
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, n * 16);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, n * 3);
    mesh.instanceColor.needsUpdate = true;
  }
}
