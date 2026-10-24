// Loads the game's GLB models (made by `npm run models`) and plays their clips. Every model comes in
// three tiers, picked by the graphics quality (render/quality.ts):
//   low    assets/models/<id>/<id>.low.glb  textures ≤ 512, mesh simplified to ~50%; precached by the PWA
//   medium assets/models/<id>/<id>.glb      textures ≤ 1024
//   high   assets/models/<id>/<id>.hq.glb   source textures up to 4096
// Each GLB is fetched and parsed once; every loadModel call returns its own clone with its own
// skeleton and AnimationMixer, sharing geometry, textures and clips with the other clones.

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { castsShadow, getGraphicsQuality, GRAPHICS_QUALITIES, rendererPreset, type GraphicsQuality } from './quality';

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

export interface LoadOptions {
  /** Model tier. Default: the current graphics quality. A missing tier falls back to medium, then low. */
  quality?: GraphicsQuality;
}

export interface Model {
  id: string;
  /** Tier actually loaded (after fallback). */
  quality: GraphicsQuality;
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

// Vite emits each GLB as a hashed asset. The PWA precaches only the low tier (vite.config.ts);
// prefetchModels() puts the selected tier into a runtime cache. Interim *-1k files are left out.
const MODEL_URLS = import.meta.glob<string>(['/assets/models/*/*.glb', '!/assets/models/*/*-1k.glb'], {
  query: '?url',
  import: 'default',
  eager: true,
});

const TIER_SUFFIX: Record<GraphicsQuality, string> = { low: '.low', medium: '', high: '.hq' };
const FALLBACK: Record<GraphicsQuality, GraphicsQuality[]> = {
  low: ['low', 'medium'],
  medium: ['medium', 'low'],
  high: ['high', 'medium', 'low'],
};
/** Runtime cache for medium/high GLBs; vite.config.ts serves *.glb CacheFirst from the same name. */
export const MODEL_CACHE = 'vidvazhni-models';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();

/** Models added at run time (dev pages and tests: fixtures outside assets/models), by id and tier. */
const EXTRA_URLS = new Map<string, Partial<Record<GraphicsQuality, string>>>();

/**
 * Makes a GLB outside assets/models loadable under an id (a dev page showing a test fixture before
 * the real model exists). Register before the board is created; the real model wins if both exist.
 */
export function registerModelUrl(id: string, url: string, quality: GraphicsQuality = 'medium'): void {
  EXTRA_URLS.set(id, { ...EXTRA_URLS.get(id), [quality]: url });
}

/** URL of a model's GLB in exactly this tier, or undefined if `npm run models` has not produced it. */
export function modelUrl(id: string, quality: GraphicsQuality = 'medium'): string | undefined {
  const built = (q: GraphicsQuality) => MODEL_URLS[`/assets/models/${id}/${id}${TIER_SUFFIX[q]}.glb`];
  const url = built(quality);
  if (url || GRAPHICS_QUALITIES.some(built)) return url;
  return EXTRA_URLS.get(id)?.[quality];
}

/** The tier loadModel will use for this request, after fallback; undefined if the model is missing. */
export function resolveTier(id: string, quality: GraphicsQuality): GraphicsQuality | undefined {
  return FALLBACK[quality].find((q) => modelUrl(id, q));
}

/** Ids of every model in the build (any tier). */
export function listModels(): string[] {
  const ids = new Set<string>();
  for (const path of Object.keys(MODEL_URLS)) {
    const id = /^\/assets\/models\/([^/]+)\/\1(?:\.low|\.hq)?\.glb$/.exec(path)?.[1];
    if (id) ids.add(id);
  }
  for (const id of EXTRA_URLS.keys()) ids.add(id);
  return [...ids].sort();
}

function loadGltf(id: string, quality: GraphicsQuality): Promise<GLTF> {
  const key = `${id}@${quality}`;
  let pending = cache.get(key);
  if (!pending) {
    const url = modelUrl(id, quality);
    if (!url) return Promise.reject(new Error(`No ${quality} model "${id}"; run npm run models ${id}`));
    pending = loader.loadAsync(url);
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

/**
 * Downloads every model of the tier into the runtime cache so it works offline from the next
 * launch, and drops cached files of other tiers. The low tier is precached by the service worker,
 * so it needs nothing here. Safe to call on every start; already cached files are skipped.
 */
export async function prefetchModels(quality = getGraphicsQuality()): Promise<void> {
  if (typeof caches === 'undefined') return;
  const store = await caches.open(MODEL_CACHE);
  const wanted = new Set<string>();
  for (const id of quality === 'low' ? [] : listModels()) {
    const tier = resolveTier(id, quality);
    const url = tier && tier !== 'low' ? modelUrl(id, tier) : undefined;
    if (url) wanted.add(new URL(url, location.href).href);
  }
  for (const request of await store.keys()) if (!wanted.has(request.url)) await store.delete(request);
  for (const url of wanted) {
    if (await store.match(url)) continue;
    try {
      await store.add(url);
    } catch {
      // Offline or the server is gone: try again on the next start.
    }
  }
}

export async function loadModel(id: string, opts: LoadOptions = {}): Promise<Model> {
  const quality = resolveTier(id, opts.quality ?? getGraphicsQuality());
  if (!quality) throw new Error(`No optimized model "${id}"; run npm run models ${id}`);
  const gltf = await loadGltf(id, quality);
  const scene = cloneSkinned(gltf.scene) as THREE.Group;
  const meta: ModelMeta = (gltf.scene.userData['vidvazhni'] as ModelMeta | undefined) ?? {
    id,
    kind: 'unknown',
    clips: gltf.animations.map((c) => c.name),
    attachTo: null,
  };
  const shadow = castsShadow(rendererPreset(), meta.kind);
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = shadow;
  });
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
    quality,
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
  const weapon = await loadModel(weaponId, { quality: model.quality });
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
