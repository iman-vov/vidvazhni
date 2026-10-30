// A trap set springing (art/blender/terrain-props/trap_rig.py): its moving parts are nodes whose
// glTF extras (three's userData) say how they snap, from the pose the trap is set in to the sprung
// one: `snapAxis` + `snapAngle` (radians, about the node's own origin, its pivot), `snapMove`
// (metres), `snapScale` (from 1) and `snapDelay` (seconds into the snap). The snap is fast and
// hits at SNAP_HIT of its length, then gives a little and settles shut; the sprung trap keeps
// that pose until it fades.

import * as THREE from 'three';

/** Seconds a snap takes, the hit and the small give after it included. */
export const SNAP_SECONDS = 0.22;
/** The fraction of the snap at which the parts hit home (the damage number pops about then). */
export const SNAP_HIT = 0.75;

export interface SnapPart {
  node: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  axis: THREE.Vector3 | null;
  angle: number;
  move: THREE.Vector3 | null;
  grow: number;
  delay: number;
}

const vec = (v: unknown): THREE.Vector3 | null => (Array.isArray(v) && v.length === 3 ? new THREE.Vector3(Number(v[0]), Number(v[1]), Number(v[2])) : null);

/** The moving parts under `root` with their set pose; empty for a model without them. */
export function snapParts(root: THREE.Object3D): SnapPart[] {
  const out: SnapPart[] = [];
  root.traverse((node) => {
    const d = node.userData;
    const axis = vec(d['snapAxis']);
    const move = vec(d['snapMove']);
    const grow = typeof d['snapScale'] === 'number' ? d['snapScale'] : 1;
    if (!axis && !move && grow === 1) return;
    out.push({
      node,
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
      axis: axis?.normalize() ?? null,
      angle: typeof d['snapAngle'] === 'number' ? d['snapAngle'] : 0,
      move,
      grow,
      delay: typeof d['snapDelay'] === 'number' ? d['snapDelay'] : 0,
    });
  });
  return out;
}

/** How far shut at x (0..1 of the snap): speeding up into the hit, giving 8 % and closing again. */
export function snapCurve(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x < SNAP_HIT) return (x / SNAP_HIT) ** 2;
  return 1 - 0.08 * Math.sin((Math.PI * (x - SNAP_HIT)) / (1 - SNAP_HIT));
}

const turn = new THREE.Quaternion();

/** Poses the parts `seconds` into the snap (each part starting after its delay). */
export function poseSnap(parts: readonly SnapPart[], seconds: number): void {
  for (const p of parts) {
    const k = snapCurve((seconds - p.delay) / SNAP_SECONDS);
    p.node.position.copy(p.position);
    if (p.move) p.node.position.addScaledVector(p.move, k);
    p.node.quaternion.copy(p.quaternion);
    if (p.axis) p.node.quaternion.premultiply(turn.setFromAxisAngle(p.axis, p.angle * k));
    p.node.scale.copy(p.scale).multiplyScalar(1 + (p.grow - 1) * k);
  }
}

/** Seconds from the start of the snap until its last part is shut. */
export function snapLength(parts: readonly SnapPart[]): number {
  return SNAP_SECONDS + Math.max(0, ...parts.map((p) => p.delay));
}

/** Gives `root` its own see-through copies of its materials; `set(k)` fades it (1 = solid), and
 *  `dispose` frees the copies. */
export function fader(root: THREE.Object3D): { set(k: number): void; dispose(): void } {
  const copies: { m: THREE.Material; opacity: number }[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const own = list.map((m) => {
      const c = m.clone();
      c.transparent = true;
      copies.push({ m: c, opacity: m.opacity });
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? own : own[0]!;
    mesh.castShadow = false;
  });
  return {
    set(k) {
      for (const c of copies) c.m.opacity = c.opacity * k;
    },
    dispose() {
      for (const c of copies) c.m.dispose();
    },
  };
}
