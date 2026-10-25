// One small texture over the whole location that every environment material reads by world XZ:
//   R  fade into the location's fog with distance from the playable hexes (the board never fades),
//   G  how much a texel belongs to a room that is not revealed yet (it lies under the Морок veil),
//   B  shallow water (flooded mill: puddles beyond the edge and by the water hexes),
//   A  painted occlusion along the feet of the walls.
// Baking is plain arithmetic (testable); the veil is re-baked cheaply when a room is revealed.

import * as THREE from 'three';
import { hexKey } from '../../rules/hex';
import { worldToHex } from '../hexLayout';
import { distanceToOutline, HEX_INNER, nearestCentre, valueNoise, type EnvLayout } from './layout';
import type { EnvironmentDef } from './types';

export interface Field {
  /** World XZ of texel (0, 0) and the side length of the square, in world units. */
  minX: number;
  minZ: number;
  size: number;
  n: number;
  data: Uint8Array;
  /** Per texel: index into `rooms` of the room the veil follows, and the veil's strength there. */
  roomOf: Int16Array;
  veilWeight: Float32Array;
  rooms: string[];
  hasWater: boolean;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function bakeField(layout: EnvLayout, def: EnvironmentDef, n = 160): Field {
  const margin = Math.max(8, def.fog.end + 2);
  const size = Math.max(layout.max.x - layout.min.x, layout.max.z - layout.min.z) + 2 * margin;
  const minX = layout.centre.x - size / 2;
  const minZ = layout.centre.z - size / 2;
  const data = new Uint8Array(n * n * 4);
  const roomOf = new Int16Array(n * n);
  const veilWeight = new Float32Array(n * n);
  const rooms = [...new Set(layout.centres.map((c) => c.room))];
  const roomIndex = new Map(rooms.map((r, i) => [r, i]));
  const water = def.ground.water ?? 0;
  const walled = def.edge !== 'forest' && def.edge !== 'shore';
  // Behind solid walls (or cave rock) there is nothing to see: darkness closes in right there.
  const behindWalls = walled ? (def.edge === 'cave' ? [0.4, 3.2] : [0.1, 1.7]) : null;
  let hasWater = false;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = minX + ((i + 0.5) / n) * size;
      const z = minZ + ((j + 0.5) / n) * size;
      const o = j * n + i;
      const near = nearestCentre(layout, x, z);
      const d = near.d - HEX_INNER;
      let fog = smoothstep(def.fog.start, def.fog.end, d);
      const outline = distanceToOutline(layout, x, z);
      if (behindWalls) {
        const k = hexKey(worldToHex(x, z));
        const inside = layout.footprint.has(k) || layout.ring.has(k);
        if (!inside) fog = Math.max(fog, smoothstep(behindWalls[0]!, behindWalls[1]!, outline));
      }
      roomOf[o] = roomIndex.get(layout.centres[near.index]!.room) ?? -1;
      veilWeight[o] = 1 - smoothstep(1.1, 2.9, near.d);
      let wet = 0;
      if (water > 0) {
        const noise = valueNoise(x * 0.33, z * 0.33) * 0.65 + valueNoise(x * 0.9 + 7.3, z * 0.9 - 2.1) * 0.35;
        wet = smoothstep(1 - water - 0.07, 1 - water + 0.07, noise) * smoothstep(1.5, 2.1, d);
      }
      const nearHex = layout.centres[near.index]!;
      if (d > 0.02 && d < 2.3 && layout.terrain.get(hexKey(worldToHex(nearHex.x, nearHex.z))) === 'water') wet = Math.max(wet, 1 - smoothstep(1.4, 2.3, d));
      if (wet > 0.01) hasWater = true;
      // The floor runs on under the grid unbroken: the feet of the walls are darker, and the light
      // falls off softly over the last two hexes toward the room's edges.
      const wallFoot = 1 - smoothstep(0, walled ? 0.55 : 0.4, outline);
      const edgeDark = 1 - smoothstep(0, 2.6, outline);
      const occl = Math.max(wallFoot * (walled ? 0.6 : 0.3), edgeDark * (walled ? 0.34 : 0.2));
      data[o * 4] = Math.round(fog * 255);
      data[o * 4 + 2] = Math.round(wet * 255);
      data[o * 4 + 3] = Math.round(occl * 255);
    }
  }
  return { minX, minZ, size, n, data, roomOf, veilWeight, rooms, hasWater };
}

/** Writes the veil channel: `veil(room)` = 1 for a room under the fog, 0 once revealed. */
export function writeVeil(f: Field, veil: (room: string) => number): void {
  const values = f.rooms.map((r) => veil(r));
  for (let o = 0; o < f.roomOf.length; o++) {
    const r = f.roomOf[o]!;
    f.data[o * 4 + 1] = r < 0 ? 0 : Math.round(f.veilWeight[o]! * values[r]! * 255);
  }
}

/** Reads a channel at a world point (nearest texel), for tests and placement checks. */
export function sampleField(f: Field, x: number, z: number, channel: 0 | 1 | 2 | 3): number {
  const i = Math.min(f.n - 1, Math.max(0, Math.floor(((x - f.minX) / f.size) * f.n)));
  const j = Math.min(f.n - 1, Math.max(0, Math.floor(((z - f.minZ) / f.size) * f.n)));
  return f.data[(j * f.n + i) * 4 + channel]! / 255;
}

export function fieldTexture(f: Field): THREE.DataTexture {
  const t = new THREE.DataTexture(f.data, f.n, f.n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// ─── Shader patch ──────────────────────────────────────────────────────────

export interface EnvUniforms {
  uEnvField: { value: THREE.Texture | null };
  /** minX, minZ, 1/size, 1/size */
  uEnvRect: { value: THREE.Vector4 };
  /** Output-space (sRGB) colours: fog near, fog toward the top of the screen, the veil. */
  uEnvFog: { value: THREE.Vector3 };
  uEnvGlow: { value: THREE.Vector3 };
  uEnvVeilColor: { value: THREE.Vector3 };
  /** Board centre z (the glow gradient runs from here away from the camera). */
  uEnvCentreZ: { value: number };
  uEnvVeil: { value: number };
  uEnvTexScale: { value: number };
  /** The floor's relief (relief.ts): normal u, v, height, cavity; used where ENV_RELIEF is defined. */
  uEnvRelief: { value: THREE.Texture | null };
  uEnvReliefStrength: { value: number };
}

export function createUniforms(): EnvUniforms {
  return {
    uEnvField: { value: null },
    uEnvRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uEnvFog: { value: new THREE.Vector3() },
    uEnvGlow: { value: new THREE.Vector3() },
    uEnvVeilColor: { value: new THREE.Vector3() },
    uEnvCentreZ: { value: 0 },
    uEnvVeil: { value: 0.8 },
    uEnvTexScale: { value: 1 / 2.6 },
    uEnvRelief: { value: null },
    uEnvReliefStrength: { value: 1 },
  };
}

/** A colour as the shader sees it after the colour-space conversion (sRGB components). */
export function outputColor(hex: string, out = new THREE.Vector3()): THREE.Vector3 {
  const c = new THREE.Color(hex);
  const rgb = { r: 0, g: 0, b: 0 };
  c.getRGB(rgb, THREE.SRGBColorSpace);
  return out.set(rgb.r, rgb.g, rgb.b);
}

export type PatchMode = 'prop' | 'ground' | 'water';

/** Adds the field's fog, veil (and for the ground: world-UV texture, grooves, wet patches; for
 *  water: alpha from the water mask) to a built-in material. */
export function patchMaterial(m: THREE.Material, u: EnvUniforms, mode: PatchMode): void {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    // The ground's texture may span more world than uEnvTexScale says (stone floors, surfaces.ts):
    // its repeat, read from the map transform, scales the world UVs.
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEnvWorld;\nvarying float vEnvTexK;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 envW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      envW = instanceMatrix * envW;
      #endif
      vEnvWorld = (modelMatrix * envW).xyz;
      #ifdef USE_MAP
      vEnvTexK = mapTransform[0][0];
      #else
      vEnvTexK = 1.0;
      #endif`,
    );
    const head = `#include <common>
      varying vec3 vEnvWorld;
      varying float vEnvTexK;
      uniform sampler2D uEnvField;
      uniform vec4 uEnvRect;
      uniform vec3 uEnvFog;
      uniform vec3 uEnvGlow;
      uniform vec3 uEnvVeilColor;
      uniform float uEnvCentreZ;
      uniform float uEnvVeil;
      uniform float uEnvTexScale;
      vec4 envField() { return texture2D(uEnvField, (vEnvWorld.xz - uEnvRect.xy) * uEnvRect.zw); }
      float envHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float envNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(envHash(i), envHash(i + vec2(1.0, 0.0)), f.x), mix(envHash(i + vec2(0.0, 1.0)), envHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      #ifdef ENV_RELIEF
      uniform sampler2D uEnvRelief;
      uniform float uEnvReliefStrength;
      #endif`;
    let frag = shader.fragmentShader.replace('#include <common>', head);
    if (mode === 'ground') {
      frag = frag.replace(
        '#include <map_fragment>',
        `vec4 envG = envField();
        float envK = uEnvTexScale * vEnvTexK;
        vec2 envUv = vEnvWorld.xz * envK;
        #ifdef ENV_RELIEF
        #ifdef ENV_PARALLAX
        // One-step parallax: raised stone shifts toward the eye, joints away from it.
        vec3 envEye = normalize(cameraPosition - vEnvWorld);
        float envH = texture2D(uEnvRelief, envUv).b;
        envUv += envEye.xz / max(envEye.y, 0.35) * (envH - 0.5) * 0.05 * envK;
        #endif
        vec4 envR = texture2D(uEnvRelief, envUv);
        #endif
        #ifdef USE_MAP
        diffuseColor *= texture2D(map, envUv);
        #endif
        #ifdef ENV_RELIEF
        diffuseColor.rgb *= mix(1.0, envR.a, 0.85);
        #endif
        // Broad, unpatterned light and dark patches and a drift between warmer and cooler, so the
        // floor does not read as one texture repeated (stronger on the big-period stone floors).
        float envMacro = envNoise(vEnvWorld.xz * 0.21 + 3.7) * 0.65 + envNoise(vEnvWorld.xz * 0.57 - 1.3) * 0.35;
        float envHue = envNoise(vEnvWorld.xz * 0.13 + 11.0) - 0.5;
        float envMacroK = vEnvTexK < 0.99 ? 1.0 : 0.45;
        diffuseColor.rgb *= 1.0 + (envMacro - 0.5) * 0.42 * envMacroK;
        diffuseColor.rgb *= 1.0 + vec3(0.07, 0.0, -0.07) * envHue * envMacroK;
        diffuseColor.rgb *= 1.0 - envG.a * 0.7;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.58, 0.62), envG.b);`,
      );
      // Relief: the floor's normal (texture u along world X, v along world Z) and wear: high,
      // open stone polished by feet, joints and the feet of the walls matt.
      frag = frag
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          #ifdef ENV_RELIEF
          roughnessFactor = clamp(roughnessFactor * mix(1.08, 0.62, smoothstep(0.45, 0.85, envR.b) * envR.a * (1.0 - envG.a * 1.4)), 0.25, 1.0);
          #endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          #ifdef ENV_RELIEF
          vec2 envNt = (envR.rg * 2.0 - 1.0) * uEnvReliefStrength;
          vec3 envNw = normalize(vec3(envNt.x, sqrt(max(0.0, 1.0 - dot(envNt, envNt))), envNt.y));
          normal = normalize((viewMatrix * vec4(envNw, 0.0)).xyz);
          #endif`,
        );
    } else if (mode === 'water') {
      frag = frag.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.a *= smoothstep(0.08, 0.55, envField().b);`,
      );
    }
    frag = frag.replace(
      '#include <fog_fragment>',
      `#include <fog_fragment>
      vec4 envF = envField();
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uEnvVeilColor, envF.g * uEnvVeil);
      vec3 envFogColor = mix(uEnvFog, uEnvGlow, smoothstep(2.0, -16.0, vEnvWorld.z - uEnvCentreZ));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, envFogColor, envF.r);`,
    );
    shader.fragmentShader = frag;
  };
  m.customProgramCacheKey = () => `bv-env-${mode}`;
}
