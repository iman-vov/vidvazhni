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
  /** Whether swaying reed blades cast: hundreds of thousands of triangles drawn again into the
   *  sun's map for a shadow that reads as noise (their still stems keep casting). */
  reeds: boolean;
}

export const SHADOW_TIERS: Record<GraphicsQuality, ShadowTier> = {
  low: { mode: 'baked', mapSize: 0, radius: 0, casters: 'all', lamps: 0, reeds: true },
  medium: { mode: 'realtime', mapSize: 1024, radius: 1.5, casters: 'big', lamps: 0, reeds: false },
  // Only the big things cast on high too: a pebble's or a cup's shadow is a few pixels from the board
  // camera, and every small caster was drawn a second time into the sun's map.
  high: { mode: 'realtime', mapSize: 2048, radius: 3, casters: 'big', lamps: 2, reeds: false },
};

/** Layer of the things a lamp's shadow is drawn from: the static casters, not the figures (a lamp's
 *  map is drawn once and kept). */
export const LAMP_LAYER = 3;

/** The marsh's swaying reed blades (environment/marsh.ts names them env:marsh:<node>:soft). */
const SWAYING_REEDS = /^env:marsh:reeds[\w-]*:soft$/;
/** The floor scatter (environment/scatter.ts): centimetre-high bits, one batch per look, whose
 *  batch-wide bounds would read as big. */
const FLOOR_SCATTER = /^env:scatter:/;

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
  if (!mesh.isMesh || mesh.name === 'contact-shadow' || FLOOR_SCATTER.test(mesh.name) || !solid(mesh)) return 'none';
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
    // A merged batch of props keeps the flags its parts had (mergeParts.ts): its room-wide size says nothing.
    if (mesh.isMesh && !mesh.userData['keepShadow']) {
      const kind = casterSize(mesh);
      mesh.castShadow = kind !== 'none' && (tier.casters === 'all' || kind === 'big') && (tier.reeds || !SWAYING_REEDS.test(mesh.name)) && worldTop(mesh) > floorY + 0.015;
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
  cam.userData.full = { left: cam.left, right: cam.right, bottom: cam.bottom, top: cam.top, floorY: area.min.y + 0.05, topY: area.max.y };
}

/** Shrink steps of the view-fitted map: its size changes only between these (zooming), never while
 *  panning, so shadow edges do not crawl. */
const VIEW_STEP = Math.SQRT2;
const MAX_VIEW_STEPS = 2;
const ndc = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
const near = new THREE.Vector3();
const far = new THREE.Vector3();
const lightBox = new THREE.Box2();
const point = new THREE.Vector3();

/**
 * Narrows the sun's shadow camera (fitted to the whole board by fitSunShadow) to the part of the
 * board the view shows, with `margin` metres around it: casters outside it are not drawn into the
 * map (three culls them against the shadow camera), and the map's texels go where the eye is. The
 * light-space column over the visible floor is kept whole, so a wall off screen still throws its
 * shadow into view. The size moves in √2 steps and the position in whole texels, and the filter
 * radius follows the texel size, so the shadows look the same as from the whole-board fit.
 * Returns whether the camera changed.
 */
export function fitSunToView(sun: THREE.DirectionalLight, view: THREE.Camera, baseRadius: number, margin: number): boolean {
  const cam = sun.shadow.camera;
  const full = cam.userData.full as { left: number; right: number; bottom: number; top: number; floorY: number; topY: number } | undefined;
  if (!full) return false;
  const toLight = cam.matrixWorldInverse;
  lightBox.makeEmpty();
  for (const [x, y] of ndc) {
    near.set(x, y, -1).unproject(view);
    far.set(x, y, 1).unproject(view);
    // Where this corner's ray meets the floor; a ray above the horizon ends at the far plane.
    const t = far.y < full.floorY ? (full.floorY - near.y) / (far.y - near.y) : 1;
    point.lerpVectors(near, far, Math.min(1, Math.max(0, t)));
    for (const h of [full.floorY, full.topY]) {
      // Each floor point and the same spot at wall height (the tops of walls seen at the screen's edge).
      const v = new THREE.Vector3(point.x, h, point.z).applyMatrix4(toLight);
      lightBox.expandByPoint(new THREE.Vector2(v.x, v.y));
    }
  }
  lightBox.expandByScalar(margin);
  const fullW = Math.max(full.right - full.left, full.top - full.bottom);
  const needW = Math.max(lightBox.max.x - lightBox.min.x, lightBox.max.y - lightBox.min.y);
  // The smallest step that holds the view, never more than the whole board.
  // At most two steps (half the board's width): the 5-tap filter turns grainy past twice its radius.
  const steps = Math.min(MAX_VIEW_STEPS, Math.max(0, Math.floor(Math.log(fullW / Math.max(needW, 1e-3)) / Math.log(VIEW_STEP))));
  const w = fullW / Math.pow(VIEW_STEP, steps);
  const mapSize = Math.max(1, sun.shadow.mapSize.x);
  const texel = w / mapSize;
  const snap = (x: number) => Math.floor(x / texel) * texel;
  let left: number;
  let bottom: number;
  if (steps === 0) {
    left = full.left;
    bottom = full.bottom;
  } else {
    const cx = THREE.MathUtils.clamp((lightBox.min.x + lightBox.max.x) / 2, full.left + w / 2, full.right - w / 2);
    const cy = THREE.MathUtils.clamp((lightBox.min.y + lightBox.max.y) / 2, full.bottom + w / 2, full.top - w / 2);
    left = snap(cx - w / 2);
    bottom = snap(cy - w / 2);
  }
  const width = steps === 0 ? full.right - full.left : w;
  const height = steps === 0 ? full.top - full.bottom : w;
  sun.shadow.radius = baseRadius * (fullW / w);
  sun.shadow.normalBias = texel * 1.4;
  if (cam.left === left && cam.bottom === bottom && cam.right === left + width && cam.top === bottom + height) return false;
  cam.left = left;
  cam.right = left + width;
  cam.bottom = bottom;
  cam.top = bottom + height;
  cam.updateProjectionMatrix();
  return true;
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
    // three makes the cube map only when it draws one. Until then the shader's samplerCubeShadow
    // gets an empty colour cube, and D3D11 (ANGLE) drops every lit draw call: a black board for
    // the 600 ms before the caller's redraw. So a lamp without a map draws it on the next frame.
    if (!l.shadow.map) l.shadow.needsUpdate = true;
  }
  return on;
}

/**
 * Hands the cube maps of lamps that stopped casting (gone with the last map, or turned off) to the
 * lamps that cast now and have none, and keeps the rest for later. Freeing them would not give the
 * memory back: three r186 deletes a point light's cube depth texture only from the render target's
 * properties, not from the GPU (~6 MB per lamp at 512², at every map change).
 */
export function passLampMaps(before: readonly THREE.PointLight[], now: readonly THREE.PointLight[], spare: THREE.RenderTarget[]): void {
  for (const l of before) {
    if (now.includes(l) || !l.shadow.map) continue;
    spare.push(l.shadow.map);
    l.shadow.map = null;
  }
  for (const l of now) {
    if (l.shadow.map || !spare.length) continue;
    l.shadow.map = spare.pop()!;
    l.shadow.needsUpdate = true;
  }
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
