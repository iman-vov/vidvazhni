// Морок: soft grey wisps of fog that creep in from the edges of the location and lie over the rooms
// that are not revealed yet. One instanced mesh of camera-facing quads with an analytic soft disc
// (no texture), drifting slowly with time; wisps over a room fade out as the room is revealed.
// Medium and high quality only.

import * as THREE from 'three';
import { parseHexKey } from '../../rules/hex';
import { hexToWorld } from '../hexLayout';
import { distanceToFootprint, seededRandom, type EnvLayout } from './layout';

export const MAX_VEILED_ROOMS = 8;

export interface MorokOptions {
  color: THREE.Vector3;
  opacity: number;
  /** Wisps along the edge band (the veiled rooms get theirs on top). */
  edgeCount: number;
  /** Wisps over each veiled hex group (0 = none). */
  roomDensity: number;
}

export class Morok {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly rooms: string[];
  readonly uniforms: { uTime: { value: number }; uColor: { value: THREE.Vector3 }; uOpacity: { value: number }; uRoomVeil: { value: number[] } };

  constructor(layout: EnvLayout, opts: MorokOptions) {
    const rnd = seededRandom(`morok:${layout.scenarioId}`);
    this.rooms = [...new Set(layout.centres.map((c) => c.room))].slice(0, MAX_VEILED_ROOMS);
    const items: { x: number; y: number; z: number; s: number; a: number; room: number }[] = [];
    // Edge band: a ring of wisps between the walls and the dark.
    let guard = 0;
    while (items.length < opts.edgeCount && guard++ < opts.edgeCount * 40) {
      const x = layout.min.x - 6 + rnd() * (layout.max.x - layout.min.x + 12);
      const z = layout.min.z - 6 + rnd() * (layout.max.z - layout.min.z + 12);
      const d = distanceToFootprint(layout, x, z);
      if (d < 2.0 || d > 5.5) continue;
      items.push({ x, y: 0.35 + rnd() * 0.5, z, s: 2.4 + rnd() * 1.8, a: 0.55 + rnd() * 0.45, room: -1 });
    }
    if (opts.roomDensity > 0) {
      for (const [k, room] of layout.footprint) {
        const index = this.rooms.indexOf(room);
        if (index < 0 || rnd() > opts.roomDensity) continue;
        const [q, r] = parseHexKey(k);
        const c = hexToWorld(q, r);
        items.push({ x: c.x + (rnd() - 0.5) * 0.8, y: 0.45 + rnd() * 0.4, z: c.z + (rnd() - 0.5) * 0.8, s: 2.0 + rnd() * 1.2, a: 0.8 + rnd() * 0.2, room: index });
      }
    }
    const geometry = new THREE.PlaneGeometry(1, 1);
    const alpha = new Float32Array(items.length);
    const room = new Float32Array(items.length);
    const phase = new Float32Array(items.length);
    items.forEach((it, i) => {
      alpha[i] = it.a;
      room[i] = it.room;
      phase[i] = rnd() * Math.PI * 2;
    });
    geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    geometry.setAttribute('aRoom', new THREE.InstancedBufferAttribute(room, 1));
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uColor: { value: opts.color.clone() },
      uOpacity: { value: opts.opacity },
      uRoomVeil: { value: new Array<number>(MAX_VEILED_ROOMS).fill(1) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aAlpha;
        attribute float aRoom;
        attribute float aPhase;
        uniform float uTime;
        uniform float uRoomVeil[${MAX_VEILED_ROOMS}];
        varying vec2 vUv;
        varying float vAlpha;
        varying float vPhase;
        void main() {
          vUv = uv;
          vPhase = aPhase;
          float veil = aRoom < 0.0 ? 1.0 : uRoomVeil[int(aRoom + 0.5)];
          vAlpha = aAlpha * veil;
          vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float scale = length(instanceMatrix[0].xyz);
          centre.x += sin(uTime * 0.13 + aPhase) * 0.35;
          centre.y += sin(uTime * 0.09 + aPhase * 1.3) * 0.12;
          gl_Position = projectionMatrix * (centre + vec4(position.xy * scale * (1.0 + 0.06 * sin(uTime * 0.2 + aPhase)), 0.0, 0.0));
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vPhase;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float lumps = 0.78 + 0.22 * sin(p.x * 9.0 + vPhase + uTime * 0.07) * sin(p.y * 7.0 - vPhase);
          float a = (1.0 - smoothstep(0.15, 1.0, r)) * lumps;
          gl_FragColor = vec4(uColor, a * a * vAlpha * uOpacity);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, Math.max(1, items.length));
    this.mesh.count = items.length;
    const m = new THREE.Matrix4();
    items.forEach((it, i) => this.mesh.setMatrixAt(i, m.makeScale(it.s, it.s, it.s).setPosition(it.x, it.y, it.z)));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'env:morok';
  }

  setRoomVeil(room: string, veil: number): void {
    const i = this.rooms.indexOf(room);
    if (i >= 0) this.uniforms.uRoomVeil.value[i] = veil;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
