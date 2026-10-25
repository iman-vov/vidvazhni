// Shadows per quality level, in one place:
// - high: everything solid casts and receives from the sun (a soft PCF map fitted to the board),
//   plus the lamps nearest the board, from the static things only (their maps drawn once);
// - medium: a smaller, harder map where only big things cast (figures, walls, obstacles, furniture);
// - low: no shadow maps at all — the static shadows are baked once into a texture on the floor
//   (shadowBake.ts) and figures stand on their blob.
// Which meshes cast is decided here from what they are (opaque and lit, not flat) and how big they
// are, so every builder (environment, tiles, figures, obstacle clusters) only has to make meshes.

import * as THREE from 'three';
import type { GraphicsQuality } from './quality';

export interface ShadowTier {
  /** Real-time shadow maps, or the one-time bake into the floor. */
  mode: 'realtime' | 'baked';
  mapSize: number;
  /** PCF filter radius in shadow-map texels (soft edges). */
  radius: number;
  /** Which solid meshes cast: all of them, or only the big ones. */
  casters: 'all' | 'big';
  /** Point lights (lanterns, torches) that cast shadows, nearest the board first. */
  lamps: number;
}

export const SHADOW_TIERS: Record<GraphicsQuality, ShadowTier> = {
  low: { mode: 'baked', mapSize: 0, radius: 0, casters: 'all', lamps: 0 },
  medium: { mode: 'realtime', mapSize: 1024, radius: 1.5, casters: 'big', lamps: 0 },
  high: { mode: 'realtime', mapSize: 2048, radius: 3, casters: 'all', lamps: 2 },
};

/** Layer of the things a lamp's shadow is drawn from: the static casters, not the figures (a lamp's
 *  map is drawn once and kept). */
export const LAMP_LAYER = 3;

/** Height (m) below which a mesh counts as flat: it casts nothing (floors, decals, a coin). */
const FLAT = 0.012;

const UNLIT = (m: THREE.Material) =>
  (m as THREE.MeshBasicMaterial).isMeshBasicMaterial || (m as THREE.ShaderMaterial).isShaderMaterial || (m as THREE.PointsMaterial).isPointsMaterial;

/** Opaque and lit: something that can throw a shadow and show one. */
function solid(mesh: THREE.Mesh): boolean {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return list.every((m) => m && m.visible !== false && !UNLIT(m) && (!m.transparent || m.opacity >= 0.99) && m.depthWrite && m.blending === THREE.NormalBlending);
}

const box = new THREE.Box3();
const size = new THREE.Vector3();
const scale = new THREE.Vector3();

/** How a mesh casts: not at all (see-through, glowing, flat, a contact blob), as a small thing
 *  (litter, pebbles, a cup), or as a big one (a figure, a barrel, a wall). */
export function casterSize(mesh: THREE.Mesh): 'none' | 'small' | 'big' {
  if (!mesh.isMesh || mesh.name === 'contact-shadow' || !solid(mesh)) return 'none';
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  if (!g.boundingBox || g.boundingBox.isEmpty()) return 'none';
  box.copy(g.boundingBox);
  mesh.matrixWorld.decompose(size, new THREE.Quaternion(), scale);
  box.getSize(size).multiply(scale);
  const height = size.y;
  const extent = Math.max(size.x, size.z);
  // A tipped body has its geometry's own Y lying sideways: take the smallest side as its thickness.
  const thick = Math.min(size.x, size.y, size.z);
  if (height < FLAT || thick < FLAT * 0.5) return 'none';
  return height >= 0.3 || (extent >= 0.45 && height >= 0.1) ? 'big' : 'small';
}

/** Top of a mesh in world space (all instances of an InstancedMesh). */
function worldTop(mesh: THREE.Mesh): number {
  const inst = mesh as THREE.InstancedMesh;
  if (inst.isInstancedMesh) {
    if (!inst.boundingBox) inst.computeBoundingBox();
    return box.copy(inst.boundingBox!).applyMatrix4(mesh.matrixWorld).max.y;
  }
  return box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).max.y;
}

/** Sets castShadow/receiveShadow on every mesh under `root` for the tier. `skip` leaves a subtree
 *  alone (figures keep their own flags). Nothing whose top is at or under the floor (`floorY`)
 *  casts: the hex plates under the floor would otherwise put the whole floor in their shadow. */
export function applyShadowFlags(root: THREE.Object3D, tier: ShadowTier, floorY: number, skip?: (o: THREE.Object3D) => boolean): void {
  const realtime = tier.mode === 'realtime';
  root.updateMatrixWorld();
  const visit = (o: THREE.Object3D): void => {
    if (skip?.(o)) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const kind = casterSize(mesh);
      mesh.castShadow = kind !== 'none' && (tier.casters === 'all' || kind === 'big') && worldTop(mesh) > floorY + 0.015;
      // On low the flag only marks what the bake draws; receiving costs nothing without a map.
      mesh.receiveShadow = realtime && solid(mesh);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
}

/** Whether the bake should draw this mesh: a static caster, visible with all its parents. */
export function bakeCaster(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || !mesh.castShadow || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return false;
  for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (!o.visible) return false;
  return true;
}

const corners = Array.from({ length: 8 }, () => new THREE.Vector3());

/**
 * Points the sun at the middle of `area` (the board with its walls, y from the floor to the top of
 * the walls) from the location's sun direction, and fits its orthographic shadow camera tightly
 * around the area as the sun sees it, so the map's texels are spent on the board only. Bias
 * follows the texel size: no acne on the floor and no gap under the feet.
 */
export function fitSunShadow(sun: THREE.DirectionalLight, area: THREE.Box3, direction: THREE.Vector3): void {
  const centre = area.getCenter(new THREE.Vector3());
  sun.target.position.copy(centre);
  sun.position.copy(centre).addScaledVector(direction.clone().normalize(), -20);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
  const cam = sun.shadow.camera;
  cam.position.copy(sun.position);
  cam.lookAt(centre);
  cam.updateMatrixWorld();
  const view = cam.matrixWorldInverse;
  const { min, max } = area;
  let i = 0;
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) corners[i++]!.set(x, y, z).applyMatrix4(view);
  const lb = new THREE.Box3().setFromPoints(corners);
  cam.left = lb.min.x;
  cam.right = lb.max.x;
  cam.bottom = lb.min.y;
  cam.top = lb.max.y;
  cam.near = Math.max(0.1, -lb.max.z - 1);
  cam.far = -lb.min.z + 1;
  cam.updateProjectionMatrix();
  const mapSize = Math.max(1, sun.shadow.mapSize.x);
  const texel = Math.max(lb.max.x - lb.min.x, lb.max.y - lb.min.y) / mapSize;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = texel * 1.4;
}

/**
 * Lets up to `count` point lights (lanterns, torches, the forge) nearest `centre` cast shadows from
 * the static things around them: walls, shelves, barrels, planks. Their cube maps are drawn once
 * (autoUpdate off; the caller sets shadow.needsUpdate after things changed, sparingly: six
 * passes of every static caster per lamp), so a frame pays only for reading them. Figures stay out (LAMP_LAYER); the sun shadows them.
 */
export function setupLampShadows(scene: THREE.Scene, count: number, centre: THREE.Vector3): THREE.PointLight[] {
  const lamps: THREE.PointLight[] = [];
  scene.traverse((o) => {
    if ((o as THREE.PointLight).isPointLight && o.visible) lamps.push(o as THREE.PointLight);
  });
  const p = new THREE.Vector3();
  lamps.sort((a, b) => a.getWorldPosition(p).distanceToSquared(centre) - b.getWorldPosition(p).distanceToSquared(centre));
  const on = lamps.slice(0, count);
  for (const l of lamps) {
    const cast = on.includes(l);
    l.castShadow = cast;
    if (!cast) continue;
    l.shadow.mapSize.set(512, 512);
    l.shadow.radius = 3;
    l.shadow.bias = -0.004;
    l.shadow.normalBias = 0.03;
    // The lamp's own post, legs and housing (within ~60 cm) are clipped away, or they throw long
    // spokes across the board.
    l.shadow.camera.near = 0.6;
    l.shadow.camera.far = Math.max(2, l.distance || 6);
    l.shadow.camera.layers.set(LAMP_LAYER);
    l.shadow.autoUpdate = false;
  }
  return on;
}

/** Puts every static caster (not under `skip`: the figures) in the lamps' layer. */
export function markLampCasters(root: THREE.Object3D, skip: (o: THREE.Object3D) => boolean): void {
  const visit = (o: THREE.Object3D): void => {
    if (skip(o)) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      if (mesh.castShadow) mesh.layers.enable(LAMP_LAYER);
      else mesh.layers.disable(LAMP_LAYER);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
}
