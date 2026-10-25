// The board's finishing pass: ambient occlusion (high), then a per-location colour grade and a soft
// darkening toward the screen's edges (medium and high). Low draws the scene straight to the canvas.
//
// The composer's targets are flagged like XR targets so three encodes sRGB into them exactly as it
// does for the canvas: the custom shaders (fire, Морок, the grid) write sRGB values and blend in that
// space, so the picture through the composer matches the direct one before the grade.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { RendererPreset } from './quality';

/** Colour grade in output (sRGB) space: c·gain + lift·(1 − c), then saturation, contrast and the
 *  vignette (0 = none, 1 = black corners). */
export interface ColorGrade {
  lift: [number, number, number];
  gain: [number, number, number];
  saturation: number;
  contrast: number;
  vignette: number;
}

export const NEUTRAL_GRADE: ColorGrade = { lift: [0, 0, 0], gain: [1, 1, 1], saturation: 1, contrast: 1, vignette: 0.3 };

const GradeShader = {
  name: 'BoardGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uLift: { value: new THREE.Vector3() },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0.3 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform float uSat;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
      c = c * uGain + uLift * (1.0 - c);
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      // Darker toward the edges, a little more at the top (the far end of the room).
      vec2 d = (vUv - 0.5) * vec2(min(uAspect, 1.6), 1.0);
      d.y *= d.y > 0.0 ? 1.15 : 0.9;
      float v = smoothstep(0.3, 0.85, length(d));
      c *= 1.0 - uVignette * v;
      // A whisper of noise against banding in the dark gradients.
      c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/** GTAO from the depth the scene pass already drew (normals rebuilt from it), at half resolution:
 *  no second render of the whole scene, and no second draw of the shadow maps. */
class BoardAOPass extends GTAOPass {
  override setSize(width: number, height: number): void {
    super.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    if (readBuffer.depthTexture && this.depthTexture !== readBuffer.depthTexture) this.setGBuffer(readBuffer.depthTexture);
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

export class BoardPost {
  private composer: EffectComposer | null = null;
  private ao: BoardAOPass | null = null;
  private grade = new ShaderPass(GradeShader);
  private mode: RendererPreset['post'] = 'none';
  private width = 1;
  private height = 1;
  private ratio = 1;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private camera: THREE.Camera,
  ) {
    this.setGrade(NEUTRAL_GRADE);
  }

  get active(): boolean {
    return this.mode !== 'none';
  }

  /** Builds (or drops) the pass chain for the preset; call again after the renderer is replaced. */
  configure(renderer: THREE.WebGLRenderer, preset: RendererPreset): void {
    if (renderer === this.renderer && preset.post === this.mode && (this.composer || preset.post === 'none')) return;
    this.disposeChain();
    this.renderer = renderer;
    this.mode = preset.post;
    if (this.mode === 'none') return;
    // AO reads the scene pass's depth (each of the composer's two targets has its own).
    const depthTexture = this.mode === 'ao' ? new THREE.DepthTexture(1, 1) : null;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: preset.antialias ? 4 : 0, depthTexture });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.mode === 'ao') {
      this.ao = new BoardAOPass(this.scene, this.camera, 1, 1);
      this.ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.ao.blendIntensity = 0.85;
      composer.addPass(this.ao);
    }
    composer.addPass(this.grade);
    // The grade pass writes the final sRGB picture itself (no OutputPass).
    for (const t of [composer.renderTarget1, composer.renderTarget2]) {
      t.texture.colorSpace = THREE.SRGBColorSpace;
      (t as THREE.WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    }
    this.composer = composer;
    this.applySize();
  }

  setGrade(g: ColorGrade): void {
    const u = this.grade.uniforms as typeof GradeShader.uniforms;
    u.uLift.value.set(...g.lift);
    u.uGain.value.set(...g.gain);
    u.uSat.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uVignette.value = g.vignette;
  }

  setSize(width: number, height: number, ratio: number): void {
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.applySize();
  }

  render(): void {
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Count the draw calls of every pass in the frame, not just the last one.
    const info = this.renderer.info;
    info.autoReset = false;
    info.reset();
    this.composer.render();
    info.autoReset = true;
  }

  dispose(): void {
    this.disposeChain();
    this.grade.dispose();
  }

  private applySize(): void {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.ratio);
    this.composer.setSize(this.width, this.height);
    (this.grade.uniforms as typeof GradeShader.uniforms).uAspect.value = this.width / Math.max(1, this.height);
  }

  private disposeChain(): void {
    this.ao?.dispose();
    this.ao = null;
    if (this.composer) {
      for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
        t.depthTexture?.dispose();
        t.dispose();
      }
    }
    this.composer = null;
  }
}
