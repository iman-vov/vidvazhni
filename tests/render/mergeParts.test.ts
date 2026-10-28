import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchSignature, batchStatic, mergeStaticParts, unbatch } from '../../src/render/mergeParts';

const red = new THREE.MeshStandardMaterial({ color: 'red' });
const blue = new THREE.MeshStandardMaterial({ color: 'blue' });

function part(material: THREE.Material, x: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  m.position.x = x;
  return m;
}

function box(o: THREE.Object3D): THREE.Box3 {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
}

describe('mergeStaticParts', () => {
  it('merges parts sharing a material and keeps where they stand', () => {
    const g = new THREE.Group();
    g.position.set(5, 0, 0);
    g.add(part(red, 0), part(red, 3), part(blue, -2));
    const before = box(g);
    expect(mergeStaticParts(g)).toBe(1);
    expect(g.children).toHaveLength(2);
    expect(box(g).equals(before)).toBe(true);
  });
});

describe('batchStatic', () => {
  it('draws the sources as one mesh per material, hides them, and undoes cleanly', () => {
    const room = new THREE.Group();
    const a = new THREE.Group().add(part(red, 0), part(blue, 1));
    const b = new THREE.Group().add(part(red, 4));
    a.position.z = 2;
    room.add(a, b);
    const sig = batchSignature([a, b]);
    const batch = batchStatic(room, [a, b])!;
    expect(batch.children).toHaveLength(1);
    expect(batch.children[0]!.userData['keepShadow']).toBe(true);
    const shown: THREE.Mesh[] = [];
    room.traverseVisible((o) => (o as THREE.Mesh).isMesh && shown.push(o as THREE.Mesh));
    // The red batch and the blue part (alone in its material) remain drawn.
    expect(shown).toHaveLength(2);
    // Hidden by the batch, the parts still count: the same signature, no rebuild.
    expect(batchSignature([a, b])).toBe(sig);
    unbatch(batch);
    expect(batch.parent).toBeNull();
    let visible = 0;
    room.traverseVisible((o) => (o as THREE.Mesh).isMesh && visible++);
    expect(visible).toBe(3);
  });

  it('leaves see-through parts alone', () => {
    const glass = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 });
    const room = new THREE.Group();
    room.add(part(glass, 0), part(glass, 2));
    expect(batchStatic(room, [...room.children])).toBeNull();
  });
});
