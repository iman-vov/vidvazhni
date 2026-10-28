// How a hero holds its weapon. Meshy weapons come out of `npm run models` normalised to about two
// units on their longest side, lying in whatever pose Meshy gave them, while a rigged hero is about
// 1.7 units tall. So a weapon parented to the hand bone as is ends up bigger than the hero and lies
// flat. Each grip says how long the weapon is next to its hero, where on the weapon the hand closes
// and which way it points while the hero stands in idle; placeWeapon turns that into the weapon's
// transform in the hand bone's space, so walk and attack carry it along with the hand.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

type Vec3 = THREE.Vector3Tuple;

export interface WeaponGrip {
  /** Longest side of the weapon as a fraction of the hero's height. */
  size: number;
  /** Where the hand closes, in the weapon's own box: -1..1 of the half-size on each axis, 0 = centre. */
  grip: Vec3;
  /** Weapon axis from the grip toward the tip (the wrench's jaw, the staff's head). */
  tip: Vec3;
  /** A second weapon axis, across `tip` (a blade's flat, a shield's face). */
  face: Vec3;
  /** Where `tip` points while the hero stands in idle, in the hero's frame: +Y up, +Z forward, +X away from the body on the hand's side. */
  tipDir: Vec3;
  /** Where `face` points in idle, same frame (only its part across tipDir counts). */
  faceDir: Vec3;
  /** 'hand': tipDir and faceDir are in the fist's own frame instead: +X through the closed fist
   *  toward the thumb, +Y along the fingers, +Z out of the back of the hand. Then the handle runs
   *  through the fist in every pose, not only in idle (a bow stays upright when the arm aims). */
  frame?: 'hero' | 'hand';
  /** Hand bone to hold it in, instead of the weapon's manifest `attachTo.bones`. */
  bone?: string;
}

/** Grips of the weapons in figureLook's WEAPONS; a weapon without one is sized by DEFAULT_GRIP. */
export const WEAPON_GRIPS: Record<string, WeaponGrip> = {
  // Jaw at -X, red handle at +X, thin along Y: carried forward and up, jaw out front.
  'tinker-wrench': { size: 0.55, grip: [0.62, 0, 0], tip: [-1, 0, 0], face: [0, 1, 0], tipDir: [0.15, 0.55, 1], faceDir: [1, 0, 0] },
  // Blade toward -Z, pommel at +Z, wide guard along X, flats on ±Y: handle through the fist, blade out
  // of the thumb side and a little forward, flats facing the palm and the back of the hand.
  'rogue-dagger': { size: 0.26, grip: [0, 0, 0.6], tip: [0, 0, -1], face: [0, 1, 0], tipDir: [1, 0.3, 0], faceDir: [0, 0, 1], frame: 'hand' },
  // Upright, head at +Y: held at the middle, foot near the ground.
  'herbalist-staff': { size: 1.0, grip: [0, -0.05, 0], tip: [0, 1, 0], face: [0, 0, 1], tipDir: [0.05, 1, 0.12], faceDir: [0, 0, 1] },
  // Limbs along X, string on +Y, belly on -Y: through the fist, tipped a little toward the fingers,
  // string toward the wrist, so the bow stands upright when she aims.
  'wind-archer-bow': { size: 0.85, grip: [0, -0.6, 0], tip: [1, 0, 0], face: [0, 1, 0], tipDir: [1, 0.5, 0], faceDir: [0, -1, 0], frame: 'hand' },
  // Door shield, emblem on +Z, bowed: its middle sits at the front of the box (z ≈ 0.36), so the fist
  // closes just behind it there. Upright on the forearm, face forward and a little outward.
  'warden-shield': { size: 0.55, grip: [0, 0, 0.2], tip: [0, 1, 0], face: [0, 0, 1], tipDir: [0, 1, 0], faceDir: [0.35, 0, 1] },
  // Blender-made (art/blender/weapons): blade at +Y, guard along X, flats on ±Z, leather grip low on
  // -Y. Through the fist, blade out of the thumb side and a little forward, edge leading.
  'warden-sword': { size: 0.55, grip: [0, -0.66, 0], tip: [0, 1, 0], face: [0, 0, 1], tipDir: [1, 0.25, 0], faceDir: [0, 0, 1], frame: 'hand' },
  // Spiked head at -X, wrapped handle at +X sloping down a little: held at the handle's end, head out of the thumb side.
  'bandit-club': { size: 0.5, grip: [0.7, -0.46, 0], tip: [-1, 0.29, 0], face: [0, 0, 1], tipDir: [1, 0.3, 0], faceDir: [0, 0, 1], frame: 'hand' },
  // Prod (bow) at -X, butt at +X, rail on +Y. The bandit shoots with Meshy's Gun_Hold (stock to the
  // shoulder, docs/art/animations-sources.md): the left fist holds the fore-stock with the prod out past
  // the fingers and the rail toward the back of the hand (up when he aims), the right hand on the stock.
  crossbow: { size: 0.6, grip: [-0.3, 0.1, 0], tip: [-1, 0, 0], face: [0, 1, 0], tipDir: [0, 1, 0], faceDir: [0, 0, -1], frame: 'hand', bone: 'mixamorig:LeftHand' },
  // Fork at +Y, handle at -Y and toward +Z (the bands and pouch hang back to -Z, so the wooden frame
  // sits at the front of the box): upright in the fist, pouch toward the gremlin. Kept in the
  // hero's frame: his attack is a throw, not an aimed shot, and the upright Y reads better in idle.
  'gremlin-slingshot': { size: 0.4, grip: [0, -0.62, 0.73], tip: [0, 1, 0], face: [0, 0, -1], tipDir: [0, 1, 0.35], faceDir: [0, 0, -1] },
  // Tied neck at +Y: hangs from the fist by the neck.
  'flour-sack': { size: 0.32, grip: [0, 0.8, 0], tip: [0, -1, 0], face: [0, 0, 1], tipDir: [0, -1, 0.1], faceDir: [0, 0, 1] },
  // Upright, crescent head at +Y: through the fist a little below the middle, head out of the thumb side.
  'cultist-staff': { size: 1.0, grip: [0, -0.05, 0], tip: [0, 1, 0], face: [0, 0, 1], tipDir: [1, 0.15, 0], faceDir: [0, 0, 1], frame: 'hand' },
};

/** Monsters' weapons and anything new: hand-sized, at its centre, as it lies. */
export const DEFAULT_GRIP: WeaponGrip = { size: 0.35, grip: [0, 0, 0], tip: [0, 1, 0], face: [0, 0, 1], tipDir: [0, 1, 0], faceDir: [0, 0, 1] };

export function weaponGrip(weaponId: string): WeaponGrip {
  return WEAPON_GRIPS[weaponId] ?? DEFAULT_GRIP;
}

/** The hero in idle: its height and each hand bone's transform, relative to the hero's root. */
interface IdlePose {
  height: number;
  bones: Map<string, { matrix: THREE.Matrix4; grip: THREE.Vector3; fist: THREE.Matrix4 }>;
}

const poses = new WeakMap<THREE.AnimationClip | THREE.Object3D, IdlePose>();

function idlePose(hero: THREE.Object3D, idle: THREE.AnimationClip | undefined): IdlePose {
  const key = idle ?? hero;
  let pose = poses.get(key);
  if (pose) return pose;
  // A posed copy, so the hero's own mixer and attached objects stay untouched.
  const copy = cloneSkinned(hero);
  copy.position.set(0, 0, 0);
  copy.quaternion.identity();
  copy.scale.setScalar(1);
  if (idle) {
    const mixer = new THREE.AnimationMixer(copy);
    mixer.clipAction(idle).play();
    mixer.update(0);
  }
  copy.updateMatrixWorld(true);
  const box = new THREE.Box3();
  copy.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    sm.skeleton.update();
    sm.computeBoundingBox();
    box.union(sm.boundingBox!.clone().applyMatrix4(sm.matrixWorld));
  });
  if (box.isEmpty()) box.setFromObject(copy);
  pose = { height: Math.max(1e-6, box.max.y - Math.min(0, box.min.y)), bones: new Map() };
  const bones = pose.bones;
  copy.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    // Where the fist closes: most of the way from the wrist to the middle knuckle.
    const child = (re: RegExp) => o.children.find((c) => re.test(c.name))?.position;
    const knuckle = child(/Middle1$/) ?? o.children[0]?.position;
    const grip = knuckle ? knuckle.clone().multiplyScalar(0.75) : new THREE.Vector3();
    bones.set(o.name, { matrix: o.matrixWorld.clone(), grip, fist: fistFrame(/Left/.test(o.name), knuckle, child(/Pinky1$/), child(/Thumb1$/)) });
  });
  poses.set(key, pose);
  return pose;
}

const toVec = (v: Vec3) => new THREE.Vector3(...v);

/** The fist's axes in the hand bone's space (see WeaponGrip.frame): through the fist along the
 *  knuckles from the little finger (or, without one, from the middle knuckle toward the thumb). */
function fistFrame(left: boolean, middle?: THREE.Vector3, pinky?: THREE.Vector3, thumb?: THREE.Vector3): THREE.Matrix4 {
  if (!middle || (!pinky && !thumb)) return new THREE.Matrix4();
  const y = middle.clone().normalize();
  const across = pinky ? middle.clone().sub(pinky) : thumb!.clone().sub(middle);
  const x = across.addScaledVector(y, -across.dot(y)).normalize();
  // x × y is the palm on a right hand and the back on a left one (they are mirror images).
  return new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y).multiplyScalar(left ? 1 : -1));
}

/** Rotation that turns axes (a1, a2) into directions (b1, b2); a2/b2 count only across a1/b1. */
function alignAxes(a1: THREE.Vector3, a2: THREE.Vector3, b1: THREE.Vector3, b2: THREE.Vector3): THREE.Quaternion {
  const basis = (x: THREE.Vector3, y: THREE.Vector3) => {
    const u = x.clone().normalize();
    const v = y.clone().addScaledVector(u, -y.dot(u)).normalize();
    return new THREE.Matrix4().makeBasis(u, v, u.clone().cross(v));
  };
  const from = basis(a1, a2);
  const to = basis(b1, b2);
  return new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
}

/**
 * Sets the weapon's position, rotation and scale for parenting it to `boneName` of the hero, from
 * its grip. `hero` is the hero's scene (its own scale and placement on the board do not matter),
 * `idle` the hero's idle clip. Returns false if the hero has no such bone.
 */
export function placeWeapon(
  hero: THREE.Object3D,
  idle: THREE.AnimationClip | undefined,
  weapon: THREE.Object3D,
  weaponId: string,
  boneName: string,
): boolean {
  const pose = idlePose(hero, idle);
  const bone = pose.bones.get(THREE.PropertyBinding.sanitizeNodeName(boneName)) ?? pose.bones.get(boneName);
  if (!bone) return false;
  const g = weaponGrip(weaponId);

  weapon.position.set(0, 0, 0);
  weapon.quaternion.identity();
  weapon.scale.setScalar(1);
  weapon.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(weapon);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = (g.size * pose.height) / Math.max(size.x, size.y, size.z, 1e-6);
  const gripPoint = centre.add(size.multiplyScalar(0.5).multiply(toVec(g.grip)));

  // The hero's frame for this hand: +X away from the body on the hand's side.
  const handPos = new THREE.Vector3().setFromMatrixPosition(bone.matrix);
  const out = handPos.x < 0 ? -1 : 1;
  const side =
    g.frame === 'hand'
      ? (v: Vec3) => toVec(v).applyMatrix4(bone.fist).transformDirection(bone.matrix)
      : (v: Vec3) => new THREE.Vector3(v[0] * out, v[1], v[2]);
  const rotation = alignAxes(toVec(g.tip), toVec(g.face), side(g.tipDir), side(g.faceDir));

  // In the hero's frame: grip point on the fist. Then into the bone's space.
  const handGrip = bone.grip.clone().applyMatrix4(bone.matrix);
  const origin = handGrip.sub(gripPoint.multiplyScalar(scale).applyQuaternion(rotation));
  const inHero = new THREE.Matrix4().compose(origin, rotation, new THREE.Vector3(scale, scale, scale));
  const local = bone.matrix.clone().invert().multiply(inHero);
  local.decompose(weapon.position, weapon.quaternion, weapon.scale);
  return true;
}
