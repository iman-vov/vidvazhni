// Motion in the locations that is not fire or dust (ambient.ts): animated water on the water hexes
// and the puddles beyond the edge (moving ripples, a soft fresnel toward the sky, darker depth toward
// the middle, a broken light line along shores and walkways, rings around figures standing in water,
// slow flow along the location), plants and cloth swaying in a vertex wind, a turning mill wheel,
// fireflies over the marsh and leaves falling on the forest path.
// Everything runs in shaders from shared time uniforms; the CPU only sets a few numbers per frame.
// Low quality keeps the water to a cheap UV scroll and fewer particles; with reduced motion the
// clock stops, so the location stands still (fire keeps its flicker).

import * as THREE from 'three';
import { hexKey, parseHexKey, DIRECTIONS, type HexKey } from '../../rules/hex';
import type { Terrain } from '../../rules/content';
import { HEX_SIZE, hexToWorld, worldToHex } from '../hexLayout';
import type { GraphicsQuality } from '../quality';

let reducedQuery: MediaQueryList | null | undefined;

/** The player asked the system for less motion. */
export function reducedMotion(): boolean {
  if (reducedQuery === undefined) {
    try {
      reducedQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    } catch {
      reducedQuery = null;
    }
  }
  return !!reducedQuery?.matches;
}

// ─── Shared uniforms ───────────────────────────────────────────────────────

export const MAX_RIPPLES = 6;

/** Water uniforms shared by the board's water hexes and the location's water. */
export const WATER = {
  uWaterTime: { value: 0 },
  /** World units per second the surface drifts (the location's flow, e.g. along the mill race). */
  uWaterFlow: { value: new THREE.Vector2(0.06, 0.03) },
  /** Output-space (sRGB) sky colour the water mirrors at grazing angles. */
  uWaterSky: { value: new THREE.Vector3(0.7, 0.77, 0.8) },
  /** x, z, strength (0 = off), phase: rings around figures standing in water. */
  uWaterRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4()) },
  /** R: depth inside the board's water hexes, 0 at a shore or walkway, 1 toward the middle. */
  uWaterMask: { value: null as THREE.Texture | null },
  /** minX, minZ, 1/width, 1/depth of the mask. */
  uWaterMaskRect: { value: new THREE.Vector4(0, 0, 1, 1) },
};

export const WIND = { uWindTime: { value: 0 } };

/** Advances the shared clocks (stopped with reduced motion). */
export function tickLife(time: number): number {
  const t = reducedMotion() ? 0 : time;
  WATER.uWaterTime.value = t;
  WIND.uWindTime.value = t;
  return t;
}

/** The location's water: its sky colour (output space) and flow in world units per second. */
export function setWaterLook(sky: THREE.Vector3, flow: THREE.Vector2): void {
  WATER.uWaterSky.value.copy(sky);
  WATER.uWaterFlow.value.copy(flow);
}

/** Rings around these points (figures standing in water); the rest switch off. */
export function setWaterRipples(points: readonly { x: number; z: number }[]): void {
  WATER.uWaterRipples.value.forEach((r, i) => {
    const p = points[i];
    r.set(p?.x ?? 0, p?.z ?? 0, p ? 1 : 0, i * 1.7);
  });
}

// ─── Board water mask ──────────────────────────────────────────────────────

const MASK_TEXELS_PER_UNIT = 12;
let maskKey = '';

/** Bakes the depth of the board's water hexes: distance from the nearest edge shared with a dry
 *  tile (a shore or walkway). Edges toward no tile stay open, the location's water runs on there. */
export function bakeWaterMask(tiles: Record<HexKey, { terrain: Terrain }>): { data: Uint8Array; w: number; h: number; rect: THREE.Vector4 } | null {
  const water = Object.keys(tiles).filter((k) => tiles[k]!.terrain === 'water');
  if (!water.length) return null;
  const wet = new Set(water);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const k of water) {
    const [q, r] = parseHexKey(k);
    const c = hexToWorld(q, r);
    minX = Math.min(minX, c.x - HEX_SIZE);
    maxX = Math.max(maxX, c.x + HEX_SIZE);
    minZ = Math.min(minZ, c.z - HEX_SIZE);
    maxZ = Math.max(maxZ, c.z + HEX_SIZE);
  }
  const w = Math.min(512, Math.ceil((maxX - minX) * MASK_TEXELS_PER_UNIT));
  const h = Math.min(512, Math.ceil((maxZ - minZ) * MASK_TEXELS_PER_UNIT));
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = minX + ((i + 0.5) / w) * (maxX - minX);
      const z = minZ + ((j + 0.5) / h) * (maxZ - minZ);
      const hex = worldToHex(x, z);
      if (!wet.has(hexKey(hex))) continue;
      const c = hexToWorld(hex[0], hex[1]);
      let d = 1;
      for (const [dq, dr] of DIRECTIONS) {
        const n: [number, number] = [hex[0] + dq, hex[1] + dr];
        const nk = hexKey(n);
        if (wet.has(nk) || !tiles[nk]) continue;
        const nc = hexToWorld(n[0], n[1]);
        const len = Math.hypot(c.x - nc.x, c.z - nc.z);
        // Distance inward from the shared edge (it lies halfway between the centres).
        const inward = ((x - (c.x + nc.x) / 2) * (c.x - nc.x) + (z - (c.z + nc.z) / 2) * (c.z - nc.z)) / len;
        d = Math.min(d, Math.max(0, inward / 0.62));
      }
      data[(j * w + i) * 4] = Math.round(d * 255);
      data[(j * w + i) * 4 + 3] = 255;
    }
  }
  return { data, w, h, rect: new THREE.Vector4(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ)) };
}

/** Rebakes the shared mask when the board's water hexes change (a room revealed, a new scenario). */
export function setBoardWater(tiles: Record<HexKey, { terrain: Terrain }>): void {
  const key = Object.keys(tiles)
    .filter((k) => tiles[k]!.terrain === 'water')
    .sort()
    .join('|') + `#${Object.keys(tiles).length}`;
  if (key === maskKey) return;
  maskKey = key;
  WATER.uWaterMask.value?.dispose();
  WATER.uWaterMask.value = null;
  const mask = bakeWaterMask(tiles);
  if (!mask) return;
  const t = new THREE.DataTexture(mask.data, mask.w, mask.h, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  WATER.uWaterMask.value = t;
  WATER.uWaterMaskRect.value.copy(mask.rect);
}

// ─── Water shader ──────────────────────────────────────────────────────────

const WATER_HEAD = `
  uniform float uWaterTime;
  uniform vec2 uWaterFlow;
  uniform vec3 uWaterSky;
  uniform vec4 uWaterRipples[${MAX_RIPPLES}];
  uniform sampler2D uWaterMask;
  uniform vec4 uWaterMaskRect;
  varying vec3 vWaterW;
  // Gradient of a gently moving height field: four crossing wave trains on a slowly warped
  // domain (so the pattern never reads as a grid), drifting with the flow.
  vec2 waterWaves(vec2 q, float t) {
    q += 0.35 * vec2(sin(q.y * 0.9 + t * 0.21), sin(q.x * 0.8 - t * 0.17));
    vec2 g = vec2(0.80, 0.60) * cos(dot(q, vec2(0.80, 0.60)) * 4.3 + t * 1.1) * 0.55;
    g += vec2(-0.47, 0.88) * cos(dot(q, vec2(-0.47, 0.88)) * 6.7 - t * 1.4) * 0.38;
    g += vec2(0.97, -0.24) * cos(dot(q, vec2(0.97, -0.24)) * 10.3 + t * 1.9) * 0.22;
    g += vec2(-0.71, -0.70) * cos(dot(q, vec2(-0.71, -0.70)) * 15.1 - t * 2.6) * 0.13;
    return g;
  }
  // Rings: gradient (xy) and height (z).
  vec3 waterRipples(vec2 p, float t) {
    vec3 g = vec3(0.0);
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 r = uWaterRipples[i];
      if (r.z > 0.0) {
        vec2 dv = p - r.xy;
        float d = length(dv) + 1e-4;
        float fade = r.z * exp(-d * 2.1) * smoothstep(0.16, 0.34, d);
        float ph = d * 15.0 - t * 3.2 + r.w;
        g += vec3(dv / d * cos(ph), sin(ph)) * fade;
      }
    }
    return g;
  }`;

export type WaterMode = 'hex' | 'env';

/**
 * Makes a material animated water. `hex`: the board's water hexes (map scrolled with the flow,
 * depth and shores from the board mask, ripples around figures); `env`: the location's water
 * (depth and shores from the environment field's water channel, so field.ts must patch first).
 * `full` = medium and high: moving normals, fresnel toward the sky, a foam line; else only the
 * scroll, a slow shimmer and the depth.
 */
export function patchWater(m: THREE.Material, mode: WaterMode, full: boolean): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey();
  const flow = mode === 'hex' ? '1.0' : '0.35';
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, WATER);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWaterW;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 waterW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      waterW = instanceMatrix * waterW;
      #endif
      vWaterW = (modelMatrix * waterW).xyz;`,
    );
    let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\n${WATER_HEAD}`);
    if (mode === 'hex') frag = frag.replace('texture2D(map, vBvUv)', `texture2D(map, vBvUv - uWaterFlow * uWaterTime * ${flow} * 0.3)`);
    const depth =
      mode === 'hex'
        ? 'texture2D(uWaterMask, (vWaterW.xz - uWaterMaskRect.xy) * uWaterMaskRect.zw).r'
        : 'smoothstep(0.35, 1.0, envField().b)';
    // A light line along the shore: full on the board's hexes, softer on the location's puddles.
    const shore = mode === 'hex' ? '(1.0 - smoothstep(0.0, 0.22, wDepth)) * 0.6' : 'smoothstep(0.12, 0.2, envField().b) * (1.0 - smoothstep(0.22, 0.34, envField().b)) * 0.4';
    frag = frag.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      vec2 wQ = vWaterW.xz - uWaterFlow * uWaterTime * ${flow};
      vec3 wN = vec3(0.0, 1.0, 0.0);
      vec2 wG = vec2(0.0);
      float wRing = 0.0;
      #ifdef WATER_FULL
      wG = waterWaves(wQ, uWaterTime) * 0.11;
      ${mode === 'hex' ? 'vec3 wR = waterRipples(vWaterW.xz, uWaterTime); wG += wR.xy * 0.55; wRing = wR.z;' : ''}
      wN = normalize(vec3(-wG.x, 1.0, -wG.y));
      normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
      #endif`,
    );
    // Lambert (low) has the same chunk; a material without it still gets the flow coordinate.
    if (!frag.includes('vec2 wQ')) frag = frag.replace('void main() {', 'void main() {\nvec2 wQ = vWaterW.xz - uWaterFlow * uWaterTime * ' + flow + ';\nvec3 wN = vec3(0.0, 1.0, 0.0);');
    frag = frag.replace(
      '#include <fog_fragment>',
      `float wDepth = ${depth};
      gl_FragColor.rgb *= mix(1.0, 0.52, wDepth);
      gl_FragColor.a = mix(gl_FragColor.a, min(1.0, gl_FragColor.a + 0.14), wDepth);
      #ifdef WATER_FULL
      // The waves catch the light from one side (seen from above, the normal alone barely shows),
      // the rings brighten and darken as they spread.
      gl_FragColor.rgb *= 1.0 + 0.9 * dot(wG, vec2(0.6, -0.8)) + 0.35 * wRing;
      vec3 wV = normalize(cameraPosition - vWaterW);
      float wFres = 0.06 + 0.94 * pow(1.0 - clamp(dot(wN, wV), 0.0, 1.0), 4.0);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uWaterSky, clamp(wFres * 1.4, 0.0, 0.55));
      float wFoam = ${shore};
      wFoam *= smoothstep(-0.25, 0.7, sin(dot(wQ, vec2(7.1, 5.3)) + uWaterTime * 0.9) * sin(dot(wQ, vec2(-4.7, 8.9)) - uWaterTime * 0.7) + 0.35);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.9, 0.88), wFoam);
      gl_FragColor.a = max(gl_FragColor.a, wFoam * 1.2);
      #else
      gl_FragColor.rgb *= 0.95 + 0.05 * sin(dot(wQ, vec2(2.3, 1.7))) * sin(dot(wQ, vec2(-1.3, 2.9)) + uWaterTime * 0.6);
      #endif
      #include <fog_fragment>`,
    );
    shader.fragmentShader = frag;
  };
  if (full) m.defines = { ...(m.defines ?? {}), WATER_FULL: '' };
  m.customProgramCacheKey = () => `${prevKey}-water-${mode}-${full ? 'full' : 'low'}`;
  m.needsUpdate = true;
}

// ─── Wind ──────────────────────────────────────────────────────────────────

export interface SwaySpec {
  /** Sideways reach per unit of height squared (plants) or of the wave (cloth). */
  amp: number;
  cloth?: boolean;
}

/** Pieces that move in the wind, by piece id. A kit piece sways whole; a procedural one only in
 *  its soft materials (`SOFT`). */
export const SWAY: Record<string, SwaySpec> = {
  reeds: { amp: 0.04 },
  'reeds-bank': { amp: 0.032 },
  'reeds-low': { amp: 0.05 },
  'reed-fence': { amp: 0.032 },
  grass: { amp: 0.08 },
  fern: { amp: 0.06 },
  bush: { amp: 0.03 },
  'thorn-bush': { amp: 0.025 },
  thicket: { amp: 0.018 },
  'thicket-thorn': { amp: 0.018 },
  'thicket-low': { amp: 0.03 },
  'thicket-hedge': { amp: 0.018 },
  tree: { amp: 0.01 },
  'tree-green': { amp: 0.01 },
  'obstacle-tree': { amp: 0.01 },
  banner: { amp: 0.03, cloth: true },
};
const SOFT = new Set(['reed', 'leaf', 'leafDark', 'leafWarm', 'straw', 'banner', 'cloth']);

/** How a part of a piece sways (null: it stands still). */
export function swayFor(piece: string, material: string | THREE.Material): SwaySpec | null {
  const s = SWAY[piece];
  if (!s) return null;
  return typeof material === 'string' && !SOFT.has(material) ? null : s;
}

/** Bends a material's vertices in the wind (geometry in location space: y = height above floor). */
export function patchSway(m: THREE.Material, spec: SwaySpec): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey();
  const amp = spec.amp.toFixed(3);
  const body = spec.cloth
    ? // Cloth: a wave running down the hanging part, still where it is fixed.
      `float swH = smoothstep(0.5, 0.9, transformed.y) * (1.0 - smoothstep(1.6, 1.95, transformed.y));
      float swD = ${amp} * swH * sin(uWindTime * 1.9 + transformed.y * 5.0 + (transformed.x + transformed.z) * 3.0);
      transformed.xz += vec2(swD, swD * 0.7);`
    : // Plants: the tips bend most, in slow gusts that roll across the location.
      `float swH = min(max(transformed.y, 0.0), 1.3);
      float swGust = 0.6 + 0.4 * sin(uWindTime * 0.37 + transformed.x * 0.11 + transformed.z * 0.07);
      float swS = sin(uWindTime * 1.6 + transformed.x * 1.3 + transformed.z * 0.9) + 0.45 * sin(uWindTime * 2.7 + transformed.x * 2.9 - transformed.z * 2.1);
      transformed.xz += vec2(0.83, 0.55) * swS * swGust * ${amp} * swH * swH;`;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uWindTime = WIND.uWindTime;
    // Inserted right after begin_vertex, before the environment's world position is taken.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n{\n${body}\n}`);
  };
  m.customProgramCacheKey = () => `${prevKey}-sway-${spec.cloth ? 'c' : 'p'}${amp}`;
}

// ─── Turning parts ─────────────────────────────────────────────────────────

/** Models that turn, by model id: radians per second about their thinnest axis. */
export const SPIN: Record<string, number> = { 'mill-wheel': -0.45 };

/** An instanced model turning about the axle through its bounding box (the box's thinnest side). */
export class Spinner {
  private readonly pivot = new THREE.Matrix4();
  private readonly back = new THREE.Matrix4();
  private readonly axis = new THREE.Vector3();
  private readonly rot = new THREE.Matrix4();
  private readonly m = new THREE.Matrix4();

  constructor(
    private readonly mesh: THREE.InstancedMesh,
    private readonly places: THREE.Matrix4[],
    private readonly part: THREE.Matrix4,
    private readonly speed: number,
  ) {
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox!.clone().applyMatrix4(part);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    if (size.x <= size.y && size.x <= size.z) this.axis.set(1, 0, 0);
    else if (size.z <= size.y) this.axis.set(0, 0, 1);
    else this.axis.set(0, 1, 0);
    this.pivot.makeTranslation(c.x, c.y, c.z);
    this.back.makeTranslation(-c.x, -c.y, -c.z);
  }

  update(time: number): void {
    this.rot.makeRotationAxis(this.axis, time * this.speed);
    this.places.forEach((place, i) => {
      this.m.copy(place).multiply(this.pivot).multiply(this.rot).multiply(this.back).multiply(this.part);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ─── Fireflies and falling leaves ──────────────────────────────────────────

/** Living particles per location: fireflies (marsh), falling leaves (forest path). */
export const LIFE: Record<string, { fireflies?: number; leaves?: number }> = {
  'flooded-mill': { fireflies: 40 },
  'thorn-path': { leaves: 46, fireflies: 10 },
};
const LIFE_SHARE: Record<GraphicsQuality, number> = { low: 0.35, medium: 0.7, high: 1 };

export interface LifeOptions {
  /** Where fireflies hover (ground points, preferably over water and reeds). */
  fireflies: THREE.Vector3[];
  /** The area leaves fall over: x and z bounds. */
  leaves: { min: THREE.Vector2; max: THREE.Vector2; count: number } | null;
}

/** How many of each a location shows on this quality. */
export function lifeCounts(id: string | undefined, quality: GraphicsQuality): { fireflies: number; leaves: number } {
  const l = (id && LIFE[id]) || {};
  return { fireflies: Math.round((l.fireflies ?? 0) * LIFE_SHARE[quality]), leaves: Math.round((l.leaves ?? 0) * LIFE_SHARE[quality]) };
}

export class Life {
  readonly root = new THREE.Group();
  readonly uniforms = { uTime: { value: 0 }, uScale: { value: 400 } };
  private readonly owned: { dispose(): void }[] = [];

  constructor(opts: LifeOptions) {
    this.root.name = 'env:life';
    const size = new THREE.Vector2();
    const sync = (r: THREE.WebGLRenderer) => {
      this.uniforms.uScale.value = r.getDrawingBufferSize(size).y * 0.5;
    };
    if (opts.fireflies.length) this.root.add(this.fireflies(opts.fireflies, sync));
    if (opts.leaves && opts.leaves.count > 0) this.root.add(this.leaves(opts.leaves, sync));
  }

  get empty(): boolean {
    return this.root.children.length === 0;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  dispose(): void {
    for (const d of this.owned) d.dispose();
    this.owned.length = 0;
    this.root.clear();
  }

  private points(g: THREE.BufferGeometry, m: THREE.ShaderMaterial, name: string, sync: (r: THREE.WebGLRenderer) => void): THREE.Points {
    const p = new THREE.Points(g, m);
    p.name = name;
    p.frustumCulled = false;
    p.renderOrder = 4;
    p.onBeforeRender = (r) => sync(r);
    this.owned.push(g, m);
    return p;
  }

  /** Soft yellow-green sparks wandering slowly over the water, each glowing up and fading. */
  private fireflies(spots: THREE.Vector3[], sync: (r: THREE.WebGLRenderer) => void): THREE.Points {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(spots.flatMap((p) => [p.x, p.y, p.z]), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(spots.map((_, i) => fract(Math.sin(i * 12.9898) * 43758.5453)), 1));
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        uniform float uScale;
        varying float vGlow;
        void main() {
          float a = aSeed * 50.0;
          float t = uTime * (0.22 + aSeed * 0.18);
          vec3 p = position + vec3(sin(t + a) * 0.55 + sin(t * 2.3 + a) * 0.12, sin(t * 1.7 + a * 1.3) * 0.18, cos(t * 0.8 + a) * 0.55);
          float blink = fract(uTime * (0.12 + aSeed * 0.1) + aSeed * 7.0);
          vGlow = smoothstep(0.0, 0.15, blink) * (1.0 - smoothstep(0.35, 0.6, blink));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.07 + 0.09 * vGlow) * uScale * projectionMatrix[1][1] / -mv.z;
        }`,
      fragmentShader: `
        varying float vGlow;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float core = 1.0 - smoothstep(0.0, 0.35, r);
          float halo = 1.0 - smoothstep(0.2, 1.0, r);
          gl_FragColor = vec4((vec3(1.0, 0.95, 0.55) * core + vec3(0.65, 0.85, 0.25) * halo * 0.45) * vGlow, 1.0);
        }`,
    });
    return this.points(g, m, 'env:fireflies', sync);
  }

  /** Leaves drifting down from the canopy, fluttering side to side and turning as they fall. */
  private leaves(area: NonNullable<LifeOptions['leaves']>, sync: (r: THREE.WebGLRenderer) => void): THREE.Points {
    const pos: number[] = [];
    let s = 17;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < area.count; i++) pos.push(rnd(), rnd(), rnd());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uMin: { value: area.min.clone() }, uSize: { value: area.max.clone().sub(area.min) } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        uniform float uTime;
        uniform float uScale;
        uniform vec2 uMin;
        uniform vec2 uSize;
        varying float vAlpha;
        varying float vTurn;
        varying float vTint;
        void main() {
          float seed = fract(position.x * 7.13 + position.y * 3.71 + position.z * 1.37);
          float a = seed * 60.0;
          float life = fract(position.y + uTime * (0.045 + seed * 0.03));
          float y = 3.0 * (1.0 - life);
          vec2 f = position.xz + vec2(sin(uTime * 1.3 + a) * 0.35, cos(uTime * 0.9 + a) * 0.2) / uSize + vec2(0.18, 0.08) * life / uSize * 3.0;
          f = fract(f);
          vAlpha = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.92, 1.0, life));
          vAlpha *= smoothstep(0.0, 0.06, f.x) * smoothstep(1.0, 0.94, f.x) * smoothstep(0.0, 0.06, f.y) * smoothstep(1.0, 0.94, f.y);
          vTurn = uTime * (1.5 + seed * 2.0) + a;
          vTint = seed;
          vec4 mv = modelViewMatrix * vec4(uMin.x + f.x * uSize.x, y, uMin.y + f.y * uSize.y, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.2 + 0.08 * seed) * uScale * projectionMatrix[1][1] / -mv.z;
        }`,
      fragmentShader: `
        varying float vAlpha;
        varying float vTurn;
        varying float vTint;
        void main() {
          // A leaf: an ellipse turning in the sprite, its width flickering as it flips over.
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vTurn), s = sin(vTurn);
          p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          float flip = 0.25 + 0.75 * abs(sin(vTurn * 1.3));
          float d = length(vec2(p.x / (0.22 * flip), p.y / 0.46));
          if (d > 1.0) discard;
          vec3 col = mix(vec3(0.95, 0.58, 0.2), vec3(0.78, 0.74, 0.3), vTint) * (0.85 + 0.25 * (1.0 - d));
          gl_FragColor = vec4(col, vAlpha * 0.9);
        }`,
    });
    return this.points(g, m, 'env:leaves', sync);
  }
}

const fract = (x: number): number => x - Math.floor(x);

/** Spots for fireflies: over the location's water and reeds beyond the board, near enough to see. */
export function fireflySpots(count: number, area: { min: THREE.Vector2; max: THREE.Vector2 }, accept: (x: number, z: number) => number, seed = 5): THREE.Vector3[] {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: THREE.Vector3[] = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const x = area.min.x + rnd() * (area.max.x - area.min.x);
    const z = area.min.y + rnd() * (area.max.y - area.min.y);
    if (rnd() > accept(x, z)) continue;
    out.push(new THREE.Vector3(x, 0.3 + rnd() * 0.8, z));
  }
  return out;
}
