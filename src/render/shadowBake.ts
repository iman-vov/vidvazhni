// Baked shadows for the low quality level, the way older games did it: once per build or room
// reveal, the static things (walls, obstacles, props, litter) are drawn into a top-down texture
// over the board — squashed along the sun onto the floor for their shadows, and straight down for
// the soft dark rim where they touch the floor (ambient occlusion) — blurred, and laid over the
// floor as one multiplying decal. A frame then costs one textured quad; no shadow maps.

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Layer the bake camera sees (casters join it only while baking). */
const BAKE_LAYER = 6;
/** Texels per metre of the baked texture (and the cap on its side). */
const DENSITY = 40;
const MAX_SIDE = 2048;

export interface BakeInput {
  /** The floor area to bake (x, z), usually the board with its walls. */
  area: THREE.Box2;
  /** World height of the floor. */
  floorY: number;
  /** Direction the sunlight travels (from the sun to the board). */
  sun: THREE.Vector3;
  /** Static meshes that throw shadows. */
  casters: readonly THREE.Mesh[];
  /** Colour a full shadow multiplies the floor by (the sky's light that still reaches it). */
  shade: THREE.Color;
}

const PROJECT_VERTEX = /* glsl */ `
uniform float uFloorY;
uniform vec2 uShift;
varying float vH;
void main() {
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  float h = max(wp.y - uFloorY, 0.0);
  vH = h;
  wp.xz += uShift * h;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp.x, uFloorY, wp.z, 1.0);
}`;

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class ShadowBake {
  /** The decal over the floor (empty until the first bake). */
  readonly decal: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly camera = new THREE.OrthographicCamera();
  private readonly shadowMat = new THREE.ShaderMaterial({
    uniforms: { uFloorY: { value: 0 }, uShift: { value: new THREE.Vector2() } },
    vertexShader: PROJECT_VERTEX,
    fragmentShader: 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }',
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  // Straight down, darker the nearer the floor; the darkest value wins.
  private readonly aoMat = new THREE.ShaderMaterial({
    uniforms: { uFloorY: { value: 0 }, uShift: { value: new THREE.Vector2() } },
    vertexShader: PROJECT_VERTEX,
    fragmentShader: 'varying float vH; void main() { gl_FragColor = vec4(vec3(smoothstep(0.0, 0.45, vH)), 1.0); }',
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MinEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  private readonly blur = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec4 s = texture2D(tMap, vUv) * 0.227027;
          s += (texture2D(tMap, vUv + uDir * 1.384615) + texture2D(tMap, vUv - uDir * 1.384615)) * 0.316216;
          s += (texture2D(tMap, vUv + uDir * 3.230769) + texture2D(tMap, vUv - uDir * 3.230769)) * 0.070270;
          gl_FragColor = s;
        }`,
      depthTest: false,
      depthWrite: false,
    }),
  );
  private readonly combine = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tShadow: { value: null }, tAo: { value: null }, uShade: { value: new THREE.Color() } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tShadow; uniform sampler2D tAo; uniform vec3 uShade; varying vec2 vUv;
        void main() {
          float sh = texture2D(tShadow, vUv).r;
          float ao = texture2D(tAo, vUv).r;
          vec3 c = mix(uShade, vec3(1.0), sh) * mix(0.42, 1.0, ao);
          // Fade out at the edge of the baked area.
          vec2 e = smoothstep(vec2(0.0), vec2(0.04), vUv) * smoothstep(vec2(0.0), vec2(0.04), 1.0 - vUv);
          gl_FragColor = vec4(mix(vec3(1.0), c, e.x * e.y), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    }),
  );

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: { tBake: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tBake; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tBake, vUv).rgb, 1.0); }',
      transparent: true,
      depthWrite: false,
      // result = floor colour × baked light
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
      toneMapped: false,
    });
    this.decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
    this.decal.name = 'shadow-bake';
    this.decal.visible = false;
    this.decal.frustumCulled = false;
    // Over the floor and its stains, under the grid and the highlights.
    this.decal.renderOrder = -0.5;
  }

  /** Renders the bake (a few ms, once) and shows the decal over `input.area`. */
  bake(renderer: THREE.WebGLRenderer, scene: THREE.Scene, input: BakeInput): void {
    const { area, floorY, casters } = input;
    const w = area.max.x - area.min.x;
    const d = area.max.y - area.min.y;
    if (!(w > 0 && d > 0)) return;
    const k = Math.min(DENSITY, MAX_SIDE / Math.max(w, d));
    const width = Math.max(16, Math.round(w * k));
    const height = Math.max(16, Math.round(d * k));
    const rt = () => new THREE.WebGLRenderTarget(width, height, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    const shadow = rt();
    const ao = rt();
    const tmp = rt();
    if (!this.target || this.target.width !== width || this.target.height !== height) {
      this.target?.dispose();
      this.target = rt();
    }

    // Looking straight down; the image's top is the area's far (−z) side, like the decal's UVs.
    const cam = this.camera;
    cam.left = -w / 2;
    cam.right = w / 2;
    cam.top = d / 2;
    cam.bottom = -d / 2;
    cam.near = 0.1;
    cam.far = 200;
    cam.position.set((area.min.x + area.max.x) / 2, floorY + 100, (area.min.y + area.max.y) / 2);
    cam.up.set(0, 0, -1);
    cam.lookAt(cam.position.x, floorY, cam.position.z);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    cam.layers.set(BAKE_LAYER);

    const sun = input.sun.clone().normalize();
    const shift = new THREE.Vector2(sun.x, sun.z).divideScalar(Math.max(0.2, -sun.y));
    this.shadowMat.uniforms['uFloorY']!.value = floorY;
    this.shadowMat.uniforms['uShift']!.value.copy(shift);
    this.aoMat.uniforms['uFloorY']!.value = floorY;

    const prev = {
      target: renderer.getRenderTarget(),
      clear: renderer.getClearColor(new THREE.Color()),
      alpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear,
      override: scene.overrideMaterial,
      background: scene.background,
      fog: scene.fog,
    };
    for (const m of casters) m.layers.enable(BAKE_LAYER);
    scene.background = null;
    scene.fog = null;
    renderer.autoClear = false;
    renderer.setClearColor(0xffffff, 1);
    try {
      for (const [mat, out] of [[this.shadowMat, shadow], [this.aoMat, ao]] as const) {
        scene.overrideMaterial = mat;
        renderer.setRenderTarget(out);
        renderer.clear(true, false, false);
        renderer.render(scene, cam);
      }
      scene.overrideMaterial = prev.override;
      // Soft edges for the sun's shadow (~4 cm), a wide falloff for the occlusion (~25 cm).
      this.blurInto(renderer, shadow, tmp, 1.2);
      this.blurInto(renderer, ao, tmp, 3.5);
      this.blurInto(renderer, ao, tmp, 2.5);
      const cm = this.combine.material as THREE.ShaderMaterial;
      cm.uniforms['tShadow']!.value = shadow.texture;
      cm.uniforms['tAo']!.value = ao.texture;
      cm.uniforms['uShade']!.value.copy(input.shade);
      renderer.setRenderTarget(this.target);
      this.combine.render(renderer);
    } finally {
      for (const m of casters) m.layers.disable(BAKE_LAYER);
      scene.overrideMaterial = prev.override;
      scene.background = prev.background;
      scene.fog = prev.fog;
      renderer.setRenderTarget(prev.target);
      renderer.setClearColor(prev.clear, prev.alpha);
      renderer.autoClear = prev.autoClear;
      shadow.dispose();
      ao.dispose();
      tmp.dispose();
    }

    this.decal.material.uniforms['tBake']!.value = this.target!.texture;
    this.decal.position.set((area.min.x + area.max.x) / 2, floorY + 0.006, (area.min.y + area.max.y) / 2);
    this.decal.scale.set(w, 1, d);
    this.decal.visible = true;
  }

  /** Hides the decal and frees the texture (another quality level, another board). */
  clear(): void {
    this.decal.visible = false;
    this.decal.material.uniforms['tBake']!.value = null;
    this.target?.dispose();
    this.target = null;
  }

  dispose(): void {
    this.clear();
    this.decal.geometry.dispose();
    this.decal.material.dispose();
    this.shadowMat.dispose();
    this.aoMat.dispose();
    this.blur.material.dispose();
    this.combine.material.dispose();
    this.blur.dispose();
    this.combine.dispose();
  }

  /** Separable Gaussian blur of `rt` in place (through `tmp`), `spread` texels per tap step. */
  private blurInto(renderer: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget, tmp: THREE.WebGLRenderTarget, spread: number): void {
    const m = this.blur.material as THREE.ShaderMaterial;
    m.uniforms['tMap']!.value = rt.texture;
    m.uniforms['uDir']!.value.set(spread / rt.width, 0);
    renderer.setRenderTarget(tmp);
    this.blur.render(renderer);
    m.uniforms['tMap']!.value = tmp.texture;
    m.uniforms['uDir']!.value.set(0, spread / rt.height);
    renderer.setRenderTarget(rt);
    this.blur.render(renderer);
  }
}
