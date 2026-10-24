// Motion in the locations that is not fire or dust (ambient.ts): animated water on the water hexes
// and the puddles beyond the edge (moving ripples, a soft fresnel toward the sky, darker depth toward
// the middle, a broken light line along shores and walkways, rings around figures standing in water,
// slow flow along the location), and a turning mill wheel.
// Everything runs in shaders from shared time uniforms; the CPU only sets a few numbers per frame.
// Low quality keeps the water to a cheap UV scroll; with reduced motion the clock stops, so the
// location stands still (fire keeps its flicker).

import * as THREE from 'three';
import { hexKey, parseHexKey, DIRECTIONS, type HexKey } from '../../rules/hex';
import type { Terrain } from '../../rules/content';
import { HEX_SIZE, hexToWorld, worldToHex } from '../hexLayout';

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
