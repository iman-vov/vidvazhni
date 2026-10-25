// Motion in the locations that is not fire or dust (ambient.ts): animated water on the water hexes
// and the puddles beyond the edge (a calm shimmer, a soft fresnel toward the sky, darker depth toward
// the middle, a broken light line along shores and walkways, rings around figures standing in water
// and from the odd drip; only water tagged as flowing drifts along the location), plants and cloth swaying in a vertex wind, a turning mill wheel,
// fireflies over the marsh and leaves falling on the forest path.
// Everything runs in shaders from shared time uniforms; the CPU only sets a few numbers per frame.
// Low quality keeps the water to a cheap oscillating offset and fewer particles; with reduced motion the
// clock stops, so the location stands still (fire keeps its flicker).

import * as THREE from 'three';
import { hexKey, parseHexKey, DIRECTIONS, type HexKey } from '../../rules/hex';
import type { Terrain } from '../../rules/content';
import { HEX_SIZE, hexToWorld, worldToHex } from '../hexLayout';
import type { GraphicsQuality } from '../quality';
import { valueNoise } from './layout';

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
  /** World units per second the surface drifts where the water flows (e.g. along a mill race). */
  uWaterFlow: { value: new THREE.Vector2(0.06, 0.03) },
  /** 1: the location's water flows (drifts with uWaterFlow); 0: it is still and only shimmers. */
  uWaterFlowing: { value: 0 },
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

/** The location's water: its sky colour (output space), whether it flows and the flow in world
 *  units per second (unused while the water is still). */
export function setWaterLook(sky: THREE.Vector3, flow: THREE.Vector2, flowing = false): void {
  WATER.uWaterSky.value.copy(sky);
  WATER.uWaterFlow.value.copy(flow);
  WATER.uWaterFlowing.value = flowing ? 1 : 0;
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

/** How far the shore wanders from the hex edges, in world units: out onto the dry hexes beside the
 *  water (up to ~0.29) or back into the water's own hexes (up to ~0.25). */
const SHORE_WANDER = 0.27;
/** Range of the signed shore distance in the mask's G channel (±, world units). */
export const SHORE_RANGE = 0.5;
/** Distance from the shore at which the water reaches its full depth (R channel). */
const DEEP_AT = 1.1;

/** Bakes the board's ponds: water hexes that touch are one body of water. R: depth (0 at the shore,
 *  1 toward the middle of a pond); G: the signed distance to the shore (inside positive), as
 *  0.5 + d / (2 · SHORE_RANGE), the shore wandering off the hex edges by a seeded noise (the same on
 *  every load of a map); A: whether a texel is on the water or a dry hex beside it. Edges shared
 *  with a dry tile are shore, and so are edges toward a hex off the map (`map`, when known: the
 *  pond ends on the ground beyond the board); edges toward a room not revealed yet stay open. */
export function bakeWaterMask(tiles: Record<HexKey, { terrain: Terrain }>, map?: ReadonlySet<HexKey>): { data: Uint8Array; w: number; h: number; rect: THREE.Vector4 } | null {
  const water = Object.keys(tiles).filter((k) => tiles[k]!.terrain === 'water').sort();
  if (!water.length) return null;
  const wet = new Set(water);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const dry = (k: HexKey) => !wet.has(k) && (!!tiles[k] || (!!map && !map.has(k)));
  // The shore: edges between a water hex and a dry hex, as segments (x0, z0, x1, z1).
  const shore: number[] = [];
  for (const k of water) {
    const [q, r] = parseHexKey(k);
    const c = hexToWorld(q, r);
    // A ring of dry hexes around the water: the shore may creep onto them.
    minX = Math.min(minX, c.x - 2 * HEX_SIZE);
    maxX = Math.max(maxX, c.x + 2 * HEX_SIZE);
    minZ = Math.min(minZ, c.z - 2 * HEX_SIZE);
    maxZ = Math.max(maxZ, c.z + 2 * HEX_SIZE);
    for (const [dq, dr] of DIRECTIONS) {
      const nk = hexKey([q + dq, r + dr]);
      if (!dry(nk)) continue;
      const nc = hexToWorld(q + dq, r + dr);
      const mx = (c.x + nc.x) / 2;
      const mz = (c.z + nc.z) / 2;
      const len = Math.hypot(nc.x - c.x, nc.z - c.z);
      const px = (-(nc.z - c.z) / len) * HEX_SIZE * 0.5;
      const pz = ((nc.x - c.x) / len) * HEX_SIZE * 0.5;
      shore.push(mx - px, mz - pz, mx + px, mz + pz);
    }
  }
  // The map's own seed: the same water always gets the same shore.
  let seed = 0;
  for (const ch of water.join('|')) seed = (seed * 31 + ch.charCodeAt(0)) % 100003;
  const ox = (seed % 317) * 1.37;
  const oz = (Math.floor(seed / 317) % 317) * 1.91;
  const w = Math.min(512, Math.ceil((maxX - minX) * MASK_TEXELS_PER_UNIT));
  const h = Math.min(512, Math.ceil((maxZ - minZ) * MASK_TEXELS_PER_UNIT));
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = minX + ((i + 0.5) / w) * (maxX - minX);
      const z = minZ + ((j + 0.5) / h) * (maxZ - minZ);
      const k = hexKey(worldToHex(x, z));
      const inWater = wet.has(k);
      if (!inWater && !dry(k)) continue;
      let d = DEEP_AT * 2;
      for (let s = 0; s < shore.length; s += 4) {
        const ax = shore[s]!;
        const az = shore[s + 1]!;
        const bx = shore[s + 2]! - ax;
        const bz = shore[s + 3]! - az;
        const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
        d = Math.min(d, Math.hypot(x - ax - bx * t, z - az - bz * t));
      }
      if (!inWater) d = -d;
      // Broad bays and points with smaller wiggles along them.
      const n = valueNoise((x + ox) * 0.95, (z + oz) * 0.95) * 0.6 + valueNoise((x + ox) * 2.7 + 5.1, (z + oz) * 2.7 - 2.7) * 0.4;
      // Value noise stays near its middle: stretched so the shore really reaches its bays and points.
      const sd = d + Math.min(1, Math.max(-1, (n - 0.5) * 4.4)) * SHORE_WANDER + 0.02;
      const o = (j * w + i) * 4;
      data[o] = Math.round(Math.min(1, Math.max(0, sd / DEEP_AT)) * 255);
      data[o + 1] = Math.round(Math.min(1, Math.max(0, 0.5 + sd / (2 * SHORE_RANGE))) * 255);
      data[o + 3] = 255;
    }
  }
  return { data, w, h, rect: new THREE.Vector4(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ)) };
}

let maskTiles: Record<HexKey, { terrain: Terrain }> | null = null;
let maskMap: ReadonlySet<HexKey> | undefined;
let mapKey = '';

/** The scenario's hexes (TileLayer): beyond them a pond has a shore, toward unrevealed rooms not. */
export function setWaterMap(map: ReadonlySet<HexKey>): void {
  const key = [...map].sort().join('|');
  if (key === mapKey) return;
  mapKey = key;
  maskMap = map;
  if (maskTiles) setBoardWater(maskTiles);
}

/** Rebakes the shared mask when the board's water hexes change (a room revealed, a new scenario). */
export function setBoardWater(tiles: Record<HexKey, { terrain: Terrain }>): void {
  maskTiles = tiles;
  const key = Object.keys(tiles)
    .filter((k) => tiles[k]!.terrain === 'water')
    .sort()
    .join('|') + `#${Object.keys(tiles).length}#${mapKey.length}`;
  if (key === maskKey) return;
  maskKey = key;
  WATER.uWaterMask.value?.dispose();
  WATER.uWaterMask.value = null;
  const mask = bakeWaterMask(tiles, maskMap);
  if (!mask) return;
  const t = new THREE.DataTexture(mask.data, mask.w, mask.h, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  WATER.uWaterMask.value = t;
  WATER.uWaterMaskRect.value.copy(mask.rect);
}

// ─── Water shader ──────────────────────────────────────────────────────────

// The board's ponds (bakeWaterMask): the signed distance to the shore, how much of a texel is
// water, and a band of dark wet mud on the bank just outside it (broken up a little).
const HEX_SHORE = `vec4 wMask = texture2D(uWaterMask, (vWaterW.xz - uWaterMaskRect.xy) * uWaterMaskRect.zw);
      float wSd = (wMask.g - 0.5) * ${(2 * SHORE_RANGE).toFixed(2)};
      float wCover = smoothstep(-0.012, 0.03, wSd) * wMask.a;
      float wBank = smoothstep(-0.3 + 0.12 * waterHash(floor(vWaterW.xz * 7.0)), -0.02, wSd) * wMask.a;`;
const HEX_BANK = `gl_FragColor.a *= wCover;
      gl_FragColor.rgb = mix(vec3(0.15, 0.12, 0.085), gl_FragColor.rgb, wCover);
      gl_FragColor.a = max(gl_FragColor.a, wBank * (1.0 - wCover) * 0.62);`;

const WATER_HEAD = `
  uniform float uWaterTime;
  uniform vec2 uWaterFlow;
  uniform float uWaterFlowing;
  uniform vec3 uWaterSky;
  uniform vec4 uWaterRipples[${MAX_RIPPLES}];
  uniform sampler2D uWaterMask;
  uniform vec4 uWaterMaskRect;
  varying vec3 vWaterW;
  float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // Still water: gradient of three small standing wave sets at different angles, each rising and
  // sinking in place with its own slow period (about 9, 7 and 5.5 s), on a domain that only sways
  // back and forth. Nothing travels, so the sets cancel into a calm shimmer.
  vec2 waterCalm(vec2 q, float t) {
    q += 0.16 * vec2(sin(q.y * 0.7 + t * 0.13), sin(q.x * 0.6 - t * 0.11));
    vec2 g = vec2(0.80, 0.60) * cos(dot(q, vec2(0.80, 0.60)) * 3.4) * sin(t * 0.70) * 0.30;
    g += vec2(-0.47, 0.88) * cos(dot(q, vec2(-0.47, 0.88)) * 5.3 + 1.3) * sin(t * 0.90 + 2.1) * 0.22;
    g += vec2(0.97, -0.24) * cos(dot(q, vec2(0.97, -0.24)) * 8.1 + 0.4) * sin(t * 1.15 + 4.0) * 0.14;
    return g;
  }
  // Flowing water: two layers carried downstream at different speeds, each on a domain stirred by
  // slow eddies, so the surface flows and churns instead of sliding as one sheet.
  vec2 waterStream(vec2 p, float t, vec2 flow) {
    vec2 a = p - flow * t;
    vec2 b = p - flow * t * 0.6 + vec2(3.7, 1.3);
    a += 0.30 * vec2(sin(a.y * 1.3 + t * 0.50), sin(a.x * 1.1 - t * 0.43));
    b += 0.25 * vec2(sin(b.y * 1.7 - t * 0.37), sin(b.x * 1.5 + t * 0.41));
    vec2 g = vec2(0.80, 0.60) * cos(dot(a, vec2(0.80, 0.60)) * 4.3 + t * 0.6) * 0.40;
    g += vec2(-0.47, 0.88) * cos(dot(a, vec2(-0.47, 0.88)) * 6.7 - t * 0.8) * 0.26;
    g += vec2(0.97, -0.24) * cos(dot(b, vec2(0.97, -0.24)) * 10.3 + t * 1.0) * 0.18;
    g += vec2(-0.71, -0.70) * cos(dot(b, vec2(-0.71, -0.70)) * 15.1 - t * 1.3) * 0.10;
    return g;
  }
  // The odd drip: in each 2.6-unit cell a ring now and then (every 6-14 s, not every cycle),
  // spreading slowly for about two seconds and fading. Gradient (xy) and height (z).
  vec3 waterDrips(vec2 p, float t) {
    vec2 cell = floor(p / 2.6);
    float period = 6.0 + 8.0 * waterHash(cell);
    float local = t + waterHash(cell + 7.3) * period;
    float cyc = floor(local / period);
    float age = local - cyc * period;
    if (waterHash(cell + cyc * 5.0 + 9.7) < 0.45) return vec3(0.0);
    vec2 h = vec2(waterHash(cell + cyc * 17.0), waterHash(cell - cyc * 13.0 + 3.1));
    vec2 dv = p - (cell + 0.3 + 0.4 * h) * 2.6;
    float d = length(dv) + 1e-4;
    float x = d - age * 0.34;
    float fade = exp(-x * x * 45.0) * (1.0 - smoothstep(0.4, 2.4, age)) * smoothstep(0.0, 0.08, age);
    float ph = x * 22.0;
    return vec3(dv / d * cos(ph), sin(ph)) * fade;
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
        float ph = d * 15.0 - t * 2.2 + r.w;
        g += vec3(dv / d * cos(ph), sin(ph)) * fade;
      }
    }
    return g;
  }`;

export type WaterMode = 'hex' | 'env';

/** A small back-and-forth offset of the water's coordinate (periods about 10 and 13 s): still water
 *  and the low tier sway in place, they never scroll. */
const OSC = 'vec2(sin(uWaterTime * 0.63), cos(uWaterTime * 0.48)) * 0.06';

/**
 * Makes a material animated water. `hex`: the board's water hexes (depth and shores from the board
 * mask, ripples around figures); `env`: the location's water (depth and shores from the environment
 * field's water channel, so field.ts must patch first). Still water (the default) shimmers in place
 * and gets the odd drip ring; water tagged as flowing (uWaterFlowing) drifts with the flow, the
 * hexes' map with it. `full` = medium and high: moving normals, fresnel toward the sky, a foam line;
 * else only a small oscillating offset, a slow shimmer and the depth, never a scroll.
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
    // The map sways a little in place; on full quality flowing water carries it downstream.
    const sway = 'vec2(sin(uWaterTime * 0.61), cos(uWaterTime * 0.47)) * 0.012';
    const mapUv = full ? `mix(${sway}, -uWaterFlow * uWaterTime * ${flow} * 0.3, uWaterFlowing)` : sway;
    if (mode === 'hex') frag = frag.replace('texture2D(map, vBvUv)', `texture2D(map, vBvUv + ${mapUv})`);
    const depth =
      mode === 'hex'
        ? 'wMask.r'
        : 'smoothstep(0.35, 1.0, envField().b)';
    // A light line along the shore: full on the board's hexes, softer on the location's puddles.
    const shore = mode === 'hex' ? '(1.0 - smoothstep(0.0, 0.12, wSd)) * wCover * 0.5' : 'smoothstep(0.12, 0.2, envField().b) * (1.0 - smoothstep(0.22, 0.34, envField().b)) * 0.4';
    frag = frag.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      vec2 wQ = vWaterW.xz + ${OSC};
      vec3 wN = vec3(0.0, 1.0, 0.0);
      vec2 wG = vec2(0.0);
      float wRing = 0.0;
      #ifdef WATER_FULL
      wQ = mix(wQ, vWaterW.xz - uWaterFlow * uWaterTime * ${flow}, uWaterFlowing);
      wG = uWaterFlowing > 0.5 ? waterStream(vWaterW.xz, uWaterTime, uWaterFlow * ${flow}) * 0.11 : waterCalm(vWaterW.xz, uWaterTime) * 0.07;
      vec3 wD = waterDrips(vWaterW.xz, uWaterTime) * (1.0 - uWaterFlowing);
      wG += wD.xy * 0.2;
      wRing = wD.z * 0.6;
      ${mode === 'hex' ? 'vec3 wR = waterRipples(vWaterW.xz, uWaterTime); wG += wR.xy * 0.45; wRing += wR.z;' : ''}
      wN = normalize(vec3(-wG.x, 1.0, -wG.y));
      normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
      #endif`,
    );
    // Lambert (low) has the same chunk; a material without it still gets the flow coordinate.
    if (!frag.includes('vec2 wQ')) frag = frag.replace('void main() {', `void main() {\nvec2 wQ = vWaterW.xz + ${OSC};\nvec3 wN = vec3(0.0, 1.0, 0.0);`);
    frag = frag.replace(
      '#include <fog_fragment>',
      `${mode === 'hex' ? HEX_SHORE : ''}
      float wDepth = ${depth};
      // Shallows a touch warmer (the bottom shows through), the water darker toward a pond's middle.
      ${mode === 'hex' ? 'gl_FragColor.rgb *= mix(vec3(1.06, 1.02, 0.86), vec3(1.0), smoothstep(0.0, 0.4, wDepth));' : ''}
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
      wFoam *= smoothstep(-0.25, 0.7, sin(dot(wQ, vec2(7.1, 5.3)) + uWaterTime * 0.5) * sin(dot(wQ, vec2(-4.7, 8.9)) - uWaterTime * 0.4) + 0.35);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.9, 0.88), wFoam);
      gl_FragColor.a = max(gl_FragColor.a, wFoam * 1.2);
      #else
      gl_FragColor.rgb *= 0.95 + 0.05 * sin(dot(wQ, vec2(2.3, 1.7))) * sin(dot(wQ, vec2(-1.3, 2.9)) + uWaterTime * 0.45);
      #endif
      ${mode === 'hex' ? HEX_BANK : ''}
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
      // Instanced plants: the phase follows where each one stands, so a stand does not sway in step.
      vec2 swP = transformed.xz;
      #ifdef USE_INSTANCING
      swP += instanceMatrix[3].xz;
      #endif
      #ifdef USE_BATCHING
      swP += batchingMatrix[3].xz;
      #endif
      float swGust = 0.6 + 0.4 * sin(uWindTime * 0.37 + swP.x * 0.11 + swP.y * 0.07);
      float swS = sin(uWindTime * 1.6 + swP.x * 1.3 + swP.y * 0.9) + 0.45 * sin(uWindTime * 2.7 + swP.x * 2.9 - swP.y * 2.1);
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
