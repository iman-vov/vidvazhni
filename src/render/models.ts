// Loads the game's GLB models (assets/models/<id>/<id>.glb, made by `npm run models`) and plays
// their clips. Each GLB is fetched and parsed once; every loadModel call returns its own clone with
// its own skeleton and AnimationMixer, sharing geometry, textures and clips with the others.

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/** The game's clip names; `npm run models` renames Meshy's clips to these. */
export type ClipName = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'cast' | 'death';

/** Clips that play once; the others loop. */
const ONE_SHOT = new Set<string>(['attack', 'hit', 'cast', 'death']);
/** Where a finished one-shot goes back to, unless play() says otherwise. Death holds its last frame. */
const RETURN_TO: Record<string, string> = { attack: 'idle', hit: 'idle', cast: 'idle' };
const DEFAULT_CROSS_FADE = 0.2;

/** Written by tools/optimize-models.mjs into the GLB's scene extras. */
export interface ModelMeta {
  id: string;
  kind: string;
  clips: string[];
  attachTo: { hand: 'left' | 'right' | 'both'; bones: string[] } | null;
}

export interface PlayOptions {
  /** Seconds to blend from the current clip. Default 0.2. */
  crossFade?: number;
  /** Clip to blend into when a one-shot finishes; null to hold its last frame. Default: idle after attack/hit/cast. */
  then?: string | null;
}

export interface Model {
  id: string;
  /** Add this to the scene. Feet stand at y = 0 and the model faces +Z. */
  scene: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Record<string, THREE.AnimationClip>;
  meta: ModelMeta;
  /** Name of the clip playing now, or null. */
  readonly current: string | null;
  /** Starts a clip, blending from the current one. Returns null if the model has no such clip. */
  play(name: string, opts?: PlayOptions): THREE.AnimationAction | null;
  /** Advances the animation; call every frame while a clip plays. */
  update(dt: number): void;
}

// Vite emits each GLB as a hashed asset; the PWA precaches them. Interim *-1k files are left out.
const MODEL_URLS = import.meta.glob<string>(['/assets/models/*/*.glb', '!/assets/models/*/*-1k.glb'], {
  query: '?url',
  import: 'default',
  eager: true,
});

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();

/** URL of a model's optimized GLB, or undefined if `npm run models` has not produced it. */
export function modelUrl(id: string): string | undefined {
  return MODEL_URLS[`/assets/models/${id}/${id}.glb`];
}

/** Ids of every optimized model in the build. */
export function listModels(): string[] {
  return Object.keys(MODEL_URLS)
    .map((path) => /^\/assets\/models\/([^/]+)\/\1\.glb$/.exec(path)?.[1])
    .filter((id): id is string => id !== undefined)
    .sort();
}

function loadGltf(id: string): Promise<GLTF> {
  let pending = cache.get(id);
  if (!pending) {
    const url = modelUrl(id);
    if (!url) return Promise.reject(new Error(`No optimized model "${id}"; run npm run models ${id}`));
    pending = loader.loadAsync(url);
    pending.catch(() => cache.delete(id));
    cache.set(id, pending);
  }
  return pending;
}

export async function loadModel(id: string): Promise<Model> {
  const gltf = await loadGltf(id);
  const scene = cloneSkinned(gltf.scene) as THREE.Group;
  const meta: ModelMeta = (gltf.scene.userData['vidvazhni'] as ModelMeta | undefined) ?? {
    id,
    kind: 'unknown',
    clips: gltf.animations.map((c) => c.name),
    attachTo: null,
  };
  const clips = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip]));
  const mixer = new THREE.AnimationMixer(scene);
  let current: string | null = null;
  let currentAction: THREE.AnimationAction | null = null;
  let onFinished: ((e: { action: THREE.AnimationAction }) => void) | null = null;

  function play(name: string, opts: PlayOptions = {}): THREE.AnimationAction | null {
    const clip = clips[name];
    if (!clip) return null;
    const fade = opts.crossFade ?? DEFAULT_CROSS_FADE;
    const action = mixer.clipAction(clip);
    const once = ONE_SHOT.has(name);
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.enabled = true;
    action.setEffectiveWeight(1);
    if (currentAction && currentAction !== action && fade > 0) action.crossFadeFrom(currentAction, fade, false);
    else if (currentAction && currentAction !== action) currentAction.stop();
    action.play();

    if (onFinished) mixer.removeEventListener('finished', onFinished);
    onFinished = null;
    const next = opts.then === undefined ? RETURN_TO[name] : opts.then;
    if (once && next && clips[next]) {
      const listener = (e: { action: THREE.AnimationAction }): void => {
        if (e.action !== action) return;
        mixer.removeEventListener('finished', listener);
        onFinished = null;
        play(next, { crossFade: fade });
      };
      onFinished = listener;
      mixer.addEventListener('finished', listener);
    }
    current = name;
    currentAction = action;
    return action;
  }

  return {
    id,
    scene,
    mixer,
    clips,
    meta,
    get current() {
      return current;
    },
    play,
    update: (dt) => mixer.update(dt),
  };
}

export interface AttachOptions {
  /** Bone names to attach to, overriding the weapon's manifest `attachTo.bones`. */
  bones?: string[];
  /** Placement of the weapon in the bone's space (Meshy weapons need per-weapon tuning). */
  position?: THREE.Vector3Tuple;
  rotation?: THREE.Vector3Tuple;
  scale?: number;
}

/**
 * Loads a weapon or shield and parents it to the model's hand bone (one copy per bone for
 * two-handed sets like the rogue's daggers). Bone names come from the manifest's `attachTo.bones`
 * in their GLB spelling (`mixamorig:RightHand`); three.js drops the `:` (`mixamorigRightHand`),
 * so both spellings are accepted. Returns the attached objects.
 */
export async function attachWeapon(model: Model, weaponId: string, opts: AttachOptions = {}): Promise<THREE.Object3D[]> {
  const weapon = await loadModel(weaponId);
  const bones = opts.bones ?? weapon.meta.attachTo?.bones ?? [];
  if (!bones.length) throw new Error(`Weapon "${weaponId}" has no attachTo bones`);
  return bones.map((boneName, i) => {
    const object = i === 0 ? weapon.scene : cloneSkinned(weapon.scene);
    attachToBone(model, object, boneName, opts);
    return object;
  });
}

/** Parents any object to a bone of the model. Throws if the bone does not exist. */
export function attachToBone(model: Model, object: THREE.Object3D, boneName: string, opts: AttachOptions = {}): THREE.Object3D {
  const bone = findBone(model.scene, boneName);
  if (!bone) throw new Error(`Model "${model.id}" has no bone "${boneName}"`);
  if (opts.position) object.position.set(...opts.position);
  if (opts.rotation) object.rotation.set(...opts.rotation);
  if (opts.scale !== undefined) object.scale.setScalar(opts.scale);
  bone.add(object);
  return object;
}

export function findBone(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  return root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ?? root.getObjectByName(name);
}
