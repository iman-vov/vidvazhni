import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { poseSnap, snapCurve, snapLength, snapParts, SNAP_HIT, SNAP_SECONDS } from '../../src/render/trapSnap';

/** A trap like trap-forest: a static part and a jaw on a hinge, as the GLB loader gives them. */
function trap(): { root: THREE.Group; jaw: THREE.Object3D; teeth: THREE.Object3D } {
  const root = new THREE.Group();
  root.add(new THREE.Mesh());
  const jaw = new THREE.Object3D();
  jaw.position.set(0, 0.02, 0);
  jaw.userData = { snapAxis: [1, 0, 0], snapAngle: Math.PI / 4 };
  const teeth = new THREE.Object3D();
  teeth.position.set(0.3, -0.05, 0);
  teeth.userData = { snapMove: [0, 0.05, 0], snapScale: 1.6, snapDelay: 0.1 };
  root.add(jaw, teeth);
  return { root, jaw, teeth };
}

describe('trapSnap', () => {
  it('finds the moving parts by their extras', () => {
    const { root, jaw, teeth } = trap();
    expect(snapParts(root).map((p) => p.node)).toEqual([jaw, teeth]);
    expect(snapLength(snapParts(root))).toBeCloseTo(SNAP_SECONDS + 0.1);
  });

  it('hits home at SNAP_HIT, gives a little, and ends shut', () => {
    expect(snapCurve(0)).toBe(0);
    expect(snapCurve(SNAP_HIT)).toBeCloseTo(1);
    expect(snapCurve((1 + SNAP_HIT) / 2)).toBeCloseTo(0.92);
    expect(snapCurve(1)).toBe(1);
  });

  it('poses each part from its set pose to the sprung one, after its delay', () => {
    const { root, jaw, teeth } = trap();
    const parts = snapParts(root);
    poseSnap(parts, 0.05);
    expect(teeth.position.y).toBeCloseTo(-0.05);
    poseSnap(parts, 1);
    expect(jaw.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI / 4);
    expect(jaw.position.y).toBeCloseTo(0.02);
    expect(teeth.position.y).toBeCloseTo(0);
    expect(teeth.scale.x).toBeCloseTo(1.6);
    poseSnap(parts, 0);
    expect(jaw.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0);
    expect(teeth.scale.x).toBeCloseTo(1);
  });
});
