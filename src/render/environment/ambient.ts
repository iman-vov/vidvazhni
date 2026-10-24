// Ambient life of a location: flame tongues and embers over every fire (candles, torches, braziers),
// dust motes drifting in the light around lamps and in the beam from the entrance, and soft patches
// of low fog lying on the floor along the walls. Everything moves in the shaders from one time
// uniform (no work per particle on the CPU), one draw call per kind; particles in rooms that are not
// revealed yet fade with the room's veil. Low quality keeps only the fires.

import * as THREE from 'three';
import { MAX_VEILED_ROOMS } from './morok';

export interface FireSpot {
  pos: THREE.Vector3;
  /** 1 = a candle flame; torches ≈ 1.6, braziers ≈ 2.6. */
  size: number;
  room: string | null;
}

export interface DustVolume {
  pos: THREE.Vector3;
  radius: number;
  /** Squashed vertically for a lamp's halo; a beam is tall and thin. */
  height: number;
  count: number;
  room: string | null;
}

export interface FogPatch {
  x: number;
  z: number;
  size: number;
  room: string | null;
}

/** A shaft of light falling from `top` to `bottom` (light from the tavern down the cellar stairs). */
export interface LightBeam {
  top: THREE.Vector3;
  bottom: THREE.Vector3;
  radius: number;
}

/** Particles blown across the whole location (see `weather` in the location data). */
export interface Weather {
  kind: 'snow' | 'dust' | 'sparks';
  count: number;
  color: THREE.Vector3;
  /** World units per second along x and z. */
  wind: [number, number];
  /** The area they fill: x and z bounds, and the height of the layer. */
  min: THREE.Vector2;
  max: THREE.Vector2;
  height: number;
}

export interface AmbientOptions {
  fires: FireSpot[];
  /** Flame tongues and embers per fire of size 1 (bigger fires get more). */
  flames: number;
  embers: number;
  dust: DustVolume[];
  fog: FogPatch[];
  beam: LightBeam | null;
  weather?: Weather | null;
  fogColor: THREE.Vector3;
  rooms: string[];
}

const ROOM_VEIL = `
  uniform float uRoomVeil[${MAX_VEILED_ROOMS}];
  float roomClear(float room) { return room < 0.0 ? 1.0 : 1.0 - uRoomVeil[int(room + 0.5)]; }
`;

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Ambient {
  readonly root = new THREE.Group();
  readonly uniforms = {
    uTime: { value: 0 },
    /** Half the drawing-buffer height in px: turns world sizes into point sizes. */
    uScale: { value: 400 },
    uRoomVeil: { value: new Array<number>(MAX_VEILED_ROOMS).fill(0) },
  };
  private readonly rooms: string[];
  private readonly owned: { dispose(): void }[] = [];

  constructor(opts: AmbientOptions) {
    this.root.name = 'env:ambient';
    this.rooms = opts.rooms.slice(0, MAX_VEILED_ROOMS);
    const scaleSize = new THREE.Vector2();
    const sync = (renderer: THREE.WebGLRenderer) => {
      this.uniforms.uScale.value = renderer.getDrawingBufferSize(scaleSize).y * 0.5;
    };
    if (opts.fires.length) this.root.add(this.fire(opts, sync));
    const dust = opts.dust.filter((d) => d.count > 0);
    if (dust.length) this.root.add(this.motes(dust, sync));
    if (opts.fog.length) this.root.add(this.lowFog(opts.fog, opts.fogColor));
    if (opts.beam) this.root.add(this.shaft(opts.beam));
    if (opts.weather && opts.weather.count > 0) this.root.add(this.blown(opts.weather, sync));
  }

  /** Whether there is anything at all to animate. */
  get empty(): boolean {
    return this.root.children.length === 0;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  setRoomVeil(room: string, veil: number): void {
    const i = this.rooms.indexOf(room);
    if (i >= 0) this.uniforms.uRoomVeil.value[i] = veil;
  }

  dispose(): void {
    for (const d of this.owned) d.dispose();
    this.owned.length = 0;
    this.root.clear();
  }

  private roomIndex(room: string | null): number {
    return room ? this.rooms.indexOf(room) : -1;
  }

  private points(geometry: THREE.BufferGeometry, material: THREE.ShaderMaterial, name: string, sync: (r: THREE.WebGLRenderer) => void): THREE.Points {
    const points = new THREE.Points(geometry, material);
    points.name = name;
    points.frustumCulled = false;
    points.renderOrder = 4;
    points.onBeforeRender = (renderer) => sync(renderer);
    this.owned.push(geometry, material);
    return points;
  }

  /** Flame tongues licking up from each fire and embers rising higher, additive. */
  private fire(opts: AmbientOptions, sync: (r: THREE.WebGLRenderer) => void): THREE.Points {
    const rnd = seeded(7);
    const pos: number[] = [];
    const seed: number[] = [];
    const size: number[] = [];
    const kind: number[] = [];
    const room: number[] = [];
    for (const f of opts.fires) {
      const k = Math.sqrt(f.size);
      const flames = Math.max(2, Math.round(opts.flames * k));
      const embers = Math.round(opts.embers * k);
      // One soft halo, then the tongues, then the embers.
      for (let i = 0; i < 1 + flames + embers; i++) {
        pos.push(f.pos.x, f.pos.y, f.pos.z);
        seed.push(rnd());
        size.push(f.size);
        kind.push(i === 0 ? 2 : i <= flames ? 0 : 1);
        room.push(this.roomIndex(f.room));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    g.setAttribute('aRoom', new THREE.Float32BufferAttribute(room, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSeed;
        attribute float aSize;
        attribute float aKind;
        attribute float aRoom;
        uniform float uTime;
        uniform float uScale;
        ${ROOM_VEIL}
        varying float vLife;
        varying float vKind;
        varying float vAlpha;
        void main() {
          float s = aSize;
          float k = sqrt(s);
          vec3 p = position;
          float life;
          float px;
          if (aKind < 0.5) {
            // A flame tongue: quick, short, narrowing as it rises.
            life = fract(uTime * (1.7 + aSeed * 0.9) + aSeed * 13.0);
            float a = aSeed * 40.0;
            p += vec3(sin(a) * 0.028 * k * (1.0 - life), life * 0.16 * k, cos(a) * 0.028 * k * (1.0 - life));
            p.x += sin(uTime * 7.0 + aSeed * 20.0) * 0.012 * k * life;
            px = 0.17 * k * (1.0 - life * 0.7);
            vAlpha = smoothstep(0.0, 0.12, life) * (1.0 - life);
          } else if (aKind > 1.5) {
            // The halo: a wide warm glow breathing with the flicker.
            life = 0.0;
            p.y += 0.06 * k;
            px = 0.75 * k;
            vAlpha = 0.3 + 0.06 * sin(uTime * 8.3 + aSeed * 9.0) + 0.04 * sin(uTime * 13.7 + aSeed * 4.0);
          } else {
            // An ember: slow, drifting and winking out high above the fire.
            life = fract(uTime * (0.32 + aSeed * 0.25) + aSeed * 7.0);
            p += vec3(sin(uTime * 1.9 + aSeed * 31.0) * 0.07 * life * k, life * (0.35 + 0.35 * aSeed) * k, cos(uTime * 1.6 + aSeed * 17.0) * 0.07 * life * k);
            px = 0.03 + 0.01 * k;
            vAlpha = sin(life * 3.14159) * (0.6 + 0.4 * sin(uTime * 11.0 + aSeed * 50.0));
          }
          vLife = life;
          vKind = aKind;
          vAlpha *= roomClear(aRoom);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = px * uScale * projectionMatrix[1][1] / -mv.z;
        }`,
      fragmentShader: `
        varying float vLife;
        varying float vKind;
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float disc = 1.0 - smoothstep(0.2, 1.0, r);
          vec3 hot = vec3(1.0, 0.86, 0.5);
          vec3 cool = vec3(1.0, 0.36, 0.08);
          vec3 c = vKind < 0.5 ? mix(hot, cool, vLife) : vKind > 1.5 ? vec3(1.0, 0.55, 0.22) : vec3(1.0, 0.55, 0.18);
          if (vKind > 1.5) disc = (1.0 - r) * (1.0 - r) * step(r, 1.0);
          gl_FragColor = vec4(c * disc * vAlpha, 1.0);
        }`,
    });
    return this.points(g, m, 'env:fire', sync);
  }

  /** Dust motes floating slowly in the lit air, twinkling as they turn. */
  private motes(volumes: DustVolume[], sync: (r: THREE.WebGLRenderer) => void): THREE.Points {
    const rnd = seeded(11);
    const pos: number[] = [];
    const seed: number[] = [];
    const bright: number[] = [];
    const room: number[] = [];
    for (const v of volumes) {
      for (let i = 0; i < v.count; i++) {
        // Uniform in a disc, spread in height: brightest near the light's axis.
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd());
        const y = (rnd() - 0.5) * v.height;
        pos.push(v.pos.x + Math.cos(a) * d * v.radius, Math.max(0.08, v.pos.y + y), v.pos.z + Math.sin(a) * d * v.radius);
        seed.push(rnd());
        bright.push((1 - d * 0.75) * (1 - Math.abs(y / v.height)));
        room.push(this.roomIndex(v.room));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    g.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1));
    g.setAttribute('aRoom', new THREE.Float32BufferAttribute(room, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSeed;
        attribute float aBright;
        attribute float aRoom;
        uniform float uTime;
        uniform float uScale;
        ${ROOM_VEIL}
        varying float vAlpha;
        void main() {
          float a = aSeed * 60.0;
          vec3 p = position + vec3(sin(uTime * 0.17 + a) * 0.16, sin(uTime * 0.11 + a * 1.7) * 0.12, cos(uTime * 0.14 + a * 0.6) * 0.16);
          vAlpha = aBright * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + a), 3.0)) * roomClear(aRoom);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.022 + 0.014 * aSeed) * uScale * projectionMatrix[1][1] / -mv.z;
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(vec3(1.0, 0.88, 0.66) * (1.0 - smoothstep(0.0, 1.0, r)) * vAlpha * 0.55, 1.0);
        }`,
    });
    return this.points(g, m, 'env:dust', sync);
  }

  /** Flat soft patches of fog lying on the floor, drifting and thinning in turn. */
  private lowFog(patches: FogPatch[], color: THREE.Vector3): THREE.InstancedMesh {
    const rnd = seeded(23);
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const phase = new Float32Array(patches.length);
    const room = new Float32Array(patches.length);
    patches.forEach((p, i) => {
      phase[i] = rnd() * Math.PI * 2;
      room[i] = this.roomIndex(p.room);
    });
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    g.setAttribute('aRoom', new THREE.InstancedBufferAttribute(room, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uColor: { value: color.clone() } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aPhase;
        attribute float aRoom;
        uniform float uTime;
        ${ROOM_VEIL}
        varying vec2 vUv;
        varying float vAlpha;
        varying float vPhase;
        void main() {
          vUv = uv;
          vPhase = aPhase;
          vAlpha = (0.55 + 0.45 * sin(uTime * 0.23 + aPhase)) * roomClear(aRoom);
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          w.x += sin(uTime * 0.07 + aPhase) * 0.25;
          w.z += cos(uTime * 0.05 + aPhase * 1.3) * 0.2;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uTime;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vPhase;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float lumps = 0.7 + 0.3 * sin(p.x * 8.0 + vPhase + uTime * 0.11) * sin(p.y * 6.0 - vPhase - uTime * 0.08);
          float a = (1.0 - smoothstep(0.1, 1.0, r)) * lumps;
          gl_FragColor = vec4(uColor, a * a * vAlpha * 0.45);
        }`,
    });
    const mesh = new THREE.InstancedMesh(g, m, patches.length);
    const mat = new THREE.Matrix4();
    patches.forEach((p, i) => mesh.setMatrixAt(i, mat.makeScale(p.size, 1, p.size).setPosition(p.x, 0.1 + rnd() * 0.12, p.z)));
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.name = 'env:low-fog';
    this.owned.push(g, m, { dispose: () => mesh.dispose() });
    return mesh;
  }

  /** Snow, dust or sparks carried by the wind over the location, wrapping around its area. Snow
   *  falls and swirls, dust hangs low and drifts, sparks rise and wink out. */
  private blown(w: Weather, sync: (r: THREE.WebGLRenderer) => void): THREE.Points {
    const rnd = seeded(31);
    const pos: number[] = [];
    for (let i = 0; i < w.count; i++) pos.push(rnd(), rnd(), rnd());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const kind = w.kind === 'snow' ? 0 : w.kind === 'dust' ? 1 : 2;
    const m = new THREE.ShaderMaterial({
      uniforms: {
        ...this.uniforms,
        uColor: { value: w.color.clone() },
        uMin: { value: w.min.clone() },
        uSize: { value: w.max.clone().sub(w.min) },
        uHeight: { value: w.height },
        uWind: { value: new THREE.Vector2(...w.wind) },
      },
      transparent: true,
      depthWrite: false,
      blending: kind === 2 ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        uniform float uTime;
        uniform float uScale;
        uniform vec2 uMin;
        uniform vec2 uSize;
        uniform float uHeight;
        uniform vec2 uWind;
        varying float vAlpha;
        void main() {
          float seed = fract(position.x * 7.13 + position.y * 3.71 + position.z * 1.37);
          float a = seed * 60.0;
          vec2 drift = uWind * uTime * (0.7 + 0.6 * seed);
          float y;
          float px;
          vec2 sway = vec2(sin(uTime * 0.9 + a), cos(uTime * 0.7 + a * 1.3));
          ${kind === 0 ? `
          // Snow: falls, swirls in gusts.
          float life = fract(position.y + uTime * (0.12 + seed * 0.1));
          y = uHeight * (1.0 - life);
          drift += sway * 0.35 + uWind * 0.4 * sin(uTime * 0.5 + seed * 3.0);
          px = 0.03 + 0.03 * seed;
          vAlpha = smoothstep(0.0, 0.1, life) * (0.55 + 0.35 * seed);` : kind === 1 ? `
          // Dust: hangs low, drifts slowly, twinkles where the light catches it.
          float life = 0.5;
          y = 0.08 + position.y * position.y * uHeight * 0.55 + sway.x * 0.08;
          drift += sway * 0.2;
          px = 0.018 + 0.016 * seed;
          vAlpha = (0.25 + 0.3 * pow(0.5 + 0.5 * sin(uTime * (0.5 + seed) + a), 2.0));` : `
          // Sparks: rise from the floor, sway and wink out.
          float life = fract(position.y + uTime * (0.16 + seed * 0.22));
          y = life * uHeight;
          drift = uWind * life * 1.5 + sway * 0.25 * life;
          px = 0.022 + 0.018 * seed;
          vAlpha = sin(life * 3.14159) * (0.55 + 0.45 * sin(uTime * 9.0 + a));`}
          vec2 f = fract(position.xz + drift / uSize);
          vAlpha *= smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x) * smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.92, f.y);
          vec4 mv = modelViewMatrix * vec4(uMin.x + f.x * uSize.x, y, uMin.y + f.y * uSize.y, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = px * uScale * projectionMatrix[1][1] / -mv.z;
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float disc = 1.0 - smoothstep(${kind === 0 ? '0.35' : '0.0'}, 1.0, r);
          ${kind === 2 ? 'gl_FragColor = vec4(uColor * disc * vAlpha, 1.0);' : 'gl_FragColor = vec4(uColor, disc * vAlpha);'}
        }`,
    });
    return this.points(g, m, `env:weather:${w.kind}`, sync);
  }

  /** A soft cone of warm light, brightest at the top and at its axis, slowly breathing. */
  private shaft(beam: LightBeam): THREE.Mesh {
    const axis = beam.bottom.clone().sub(beam.top);
    const length = axis.length();
    const g = new THREE.CylinderGeometry(beam.radius * 0.35, beam.radius, length, 16, 1, true).translate(0, -length / 2, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying float vH;
        varying float vEdge;
        void main() {
          vH = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          vEdge = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime;
        varying float vH;
        varying float vEdge;
        void main() {
          float a = pow(vEdge, 2.0) * smoothstep(0.0, 0.35, vH) * (0.85 + 0.15 * sin(uTime * 0.6));
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * a * 0.16, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(beam.top);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis.normalize());
    mesh.renderOrder = 4;
    mesh.name = 'env:beam';
    this.owned.push(g, m);
    return mesh;
  }
}
