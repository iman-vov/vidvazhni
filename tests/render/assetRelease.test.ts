import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { nextAssetGeneration, partsInUse, partsOf, sceneInUse, StampedCache } from '../../src/render/assetRelease';

const flush = () => new Promise((r) => setTimeout(r, 0));

function model(): THREE.Group {
  const map = new THREE.Texture();
  return new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map })));
}

describe('StampedCache', () => {
  it('frees what an earlier board loaded once nothing draws it, and keeps what is drawn or asked for again', async () => {
    const cache = new StampedCache<THREE.Group>();
    const gone = model();
    const drawn = model();
    const again = model();
    cache.set('gone', Promise.resolve(gone));
    cache.set('drawn', Promise.resolve(drawn));
    cache.set('again', Promise.resolve(again));
    await flush();
    nextAssetGeneration();
    void cache.get('again');
    // The scene draws a clone of `drawn`: shared geometry and material.
    const scene = new THREE.Scene().add(drawn.clone());
    const freed: THREE.Group[] = [];
    const used = sceneInUse(scene);
    expect(cache.release((g) => partsInUse(partsOf(g), used), (g) => freed.push(g))).toBe(1);
    expect(freed).toEqual([gone]);
    expect(cache.get('gone')).toBeUndefined();
    expect(cache.get('drawn')).toBeDefined();
    expect(cache.get('again')).toBeDefined();
  });

  it('keeps an entry still loading', () => {
    const cache = new StampedCache<THREE.Group>();
    cache.set('slow', new Promise(() => {}));
    nextAssetGeneration();
    expect(cache.release(() => false, () => {})).toBe(0);
  });

  it('counts a texture shared with a drawn material as in use', () => {
    const m = model();
    const mesh = m.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const copy = new THREE.Mesh(new THREE.BoxGeometry(), mesh.material.clone());
    expect(partsInUse(partsOf(m), sceneInUse(new THREE.Scene().add(copy)))).toBe(true);
    expect(partsInUse(partsOf(m), sceneInUse(new THREE.Scene().add(new THREE.Mesh(new THREE.BoxGeometry()))))).toBe(false);
  });
});
