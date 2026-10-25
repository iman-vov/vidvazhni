// Weapons in the figures' hands: every hero and monster weapon, in every tier, attached the way the game does
// it (render/weaponGrip.ts), must come out at a believable size next to its hero and sit in the
// hand, in idle, walk and attack. Guards against the weapon being parented to the hand bone at its
// raw Meshy size (about two units, bigger than the 1.7-unit hero) or lying across the hex.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { existsSync } from 'node:fs';
import { WEAPONS } from '../../src/render/figureLook';
import { findBone } from '../../src/render/models';
import { placeWeapon, weaponGrip } from '../../src/render/weaponGrip';

const HEROES = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'];
const MONSTERS = ['bandit-brute', 'bandit-crossbow', 'gremlin', 'gloom-cultist', 'bog-miller'];
const TIERS = ['.low', '', '.hq'];
/** Longest side of each weapon next to its hero's height (idle), min and max. */
const RATIO: Record<string, [number, number]> = {
  'warden-shield': [0.4, 0.7],
  'wind-archer-bow': [0.65, 1.0],
  'herbalist-staff': [0.8, 1.15],
  'rogue-dagger': [0.18, 0.4],
  'tinker-wrench': [0.4, 0.7],
  'warden-sword': [0.4, 0.7],
  'bandit-club': [0.35, 0.65],
  crossbow: [0.45, 0.75],
  'gremlin-slingshot': [0.25, 0.55],
  'cultist-staff': [0.8, 1.15],
  'flour-sack': [0.2, 0.45],
};

const file = (id: string, tier: string) => `assets/models/${id}/${id}${tier}.glb`;

const glbs = new Map<string, Promise<ArrayBuffer>>();

/** Geometry, skeleton and clips of a game GLB, without textures (no image decoding in node). */
async function load(path: string): Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }> {
  let glb = glbs.get(path);
  if (!glb) glbs.set(path, (glb = stripped(path)));
  const gltf = await new GLTFLoader().parseAsync((await glb).slice(0), '');
  return { scene: gltf.scene, clips: gltf.animations };
}

async function stripped(path: string): Promise<ArrayBuffer> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(path);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const ext of doc.getRoot().listExtensionsUsed()) if (/meshopt|texture|basisu|webp/i.test(ext.extensionName)) ext.dispose();
  const glb = await io.writeBinary(doc);
  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
}

function skinnedBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    sm.skeleton.update();
    sm.computeBoundingBox();
    box.union(sm.boundingBox!.clone().applyMatrix4(sm.matrixWorld));
  });
  return box;
}

const pairs = [...HEROES, ...MONSTERS].flatMap((hero) => (WEAPONS[hero] ?? []).map((weapon) => [hero, weapon] as const));

describe('weapons in hand', () => {
  it('every weapon has its own grip and size range', () => {
    for (const [, weapon] of pairs) {
      expect(RATIO[weapon], weapon).toBeDefined();
      expect(weaponGrip(weapon).size, weapon).toBeGreaterThanOrEqual(RATIO[weapon]![0]);
      expect(weaponGrip(weapon).size, weapon).toBeLessThanOrEqual(RATIO[weapon]![1]);
    }
  });

  describe.each(pairs.flatMap(([h, w]) => TIERS.map((t) => [h, w, t] as const)))('%s + %s (tier "%s")', (hero, weapon, tier) => {
    const present = existsSync(file(hero, tier)) && existsSync(file(weapon, tier));
    it.skipIf(!present).each(['idle', 'walk', 'attack'])('%s: in hand, in proportion', async (clipName) => {
      const h = await load(file(hero, tier));
      const w = await load(file(weapon, tier));
      // The board scales heroes; the grip must not care.
      h.scene.scale.setScalar(0.73);
      const idle = h.clips.find((c) => c.name === 'idle');
      const heroHeight = (() => {
        const box = skinnedBox(h.scene);
        return box.max.y - Math.min(0, box.min.y);
      })();

      const meta = (w.scene.userData['vidvazhni'] as { attachTo?: { bones: string[] } } | undefined)?.attachTo;
      const gripBone = weaponGrip(weapon).bone;
      const bones = gripBone ? [gripBone] : [...(meta?.bones ?? [])];
      expect(bones.length).toBeGreaterThan(0);

      // The weapon's own longest side; on the hero it counts with the scale it gets in the world.
      const ownSize = new THREE.Box3().setFromObject(w.scene).getSize(new THREE.Vector3());
      const ownLongest = Math.max(ownSize.x, ownSize.y, ownSize.z);
      const copies = bones.map((bone, i) => {
        const object = i === 0 ? w.scene : w.scene.clone();
        expect(placeWeapon(h.scene, idle, object, weapon, bone), bone).toBe(true);
        findBone(h.scene, bone)!.add(object);
        return { bone, object };
      });

      const clip = h.clips.find((c) => c.name === clipName);
      expect(clip, clipName).toBeDefined();
      const mixer = new THREE.AnimationMixer(h.scene);
      mixer.clipAction(clip!).play();
      for (const at of [0, 0.5]) {
        mixer.setTime(clip!.duration * at);
        h.scene.updateMatrixWorld(true);
        for (const { bone, object } of copies) {
          const box = new THREE.Box3().setFromObject(object);
          const worldScale = new THREE.Vector3().setFromMatrixScale(object.matrixWorld).x;
          const ratio = (ownLongest * worldScale) / heroHeight;
          const [lo, hi] = RATIO[weapon]!;
          expect(ratio, `${bone} @${at}: size ${ratio.toFixed(2)} of hero`).toBeGreaterThanOrEqual(lo);
          expect(ratio, `${bone} @${at}: size ${ratio.toFixed(2)} of hero`).toBeLessThanOrEqual(hi);
          // The hand is on the weapon: the box (a little padded) holds the hand bone.
          const hand = new THREE.Vector3().setFromMatrixPosition(findBone(h.scene, bone)!.matrixWorld);
          expect(box.expandByScalar(0.08 * heroHeight).containsPoint(hand), `${bone} @${at}: hand off the weapon`).toBe(true);
        }
      }
      if (clipName === 'idle') {
        // Not lying across the hex: in idle the weapon reaches above the hand (staff, bow, shield,
        // wrench) or at least not far below it (daggers point forward).
        for (const { bone, object } of copies) {
          const box = new THREE.Box3().setFromObject(object);
          const hand = new THREE.Vector3().setFromMatrixPosition(findBone(h.scene, bone)!.matrixWorld);
          expect(box.max.y, `${bone}: weapon top`).toBeGreaterThan(hand.y);
          expect(box.min.y, `${bone}: weapon under the floor`).toBeGreaterThan(-0.05 * heroHeight);
        }
      }
    });
  });
});
