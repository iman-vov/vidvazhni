// One figure on the board: its model (or a small painted standee until a model exists or loads)
// standing straight on the hex like a real miniature: no base disc, a soft contact shadow under its
// feet, a thin hex-edge tint for its side (heroes warm gold, monsters cool grey-violet), a slowly
// turning glowing ring around its feet when it is active, selected or a target (targets also pulse
// and get an outline), an invisible pick cylinder, and the HTML badge with health and conditions.
// Positions and clips are driven by boardView.

import * as THREE from 'three';
import type { ConditionId } from '../rules/content';
import type { Hex } from '../rules/hex';
import type { Figure, FigureId } from '../rules/state';
import type { FigureBadge, OverlayItem } from './boardOverlay';
import { modelScale, type FigureLook } from './figureLook';
import { PLATE_HEIGHT } from './boardTiles';
import { HEX_SIZE, hexToWorld } from './hexLayout';
import { blobShadowTexture } from './contactShadow';
import { HOVER_HEIGHT, hoverBob } from './motion';
import { attachWeapon, loadModel, type Model } from './models';
import type { GraphicsQuality } from './quality';

/** Desired seconds for one-shot clips on the board (Meshy clips run 1.6–5 s). */
const CLIP_SECONDS: Record<string, number> = { attack: 1.0, hit: 0.7, death: 1.3, cast: 1.0 };
/** Fraction of the attack clip at which the blow lands or the shot leaves. */
const ATTACK_IMPACT = 0.45;
const MAX_TIME_SCALE = 3.2;

const heightCache = new Map<string, number>();

/** Height of a model in its own units (bind pose, feet at 0). Skinned meshes need their bones. */
function measureHeight(model: Model): number {
  const key = `${model.id}@${model.quality}`;
  const cached = heightCache.get(key);
  if (cached !== undefined) return cached;
  const scene = model.scene;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      sm.skeleton.update();
      sm.computeBoundingBox();
    }
  });
  const box = new THREE.Box3().setFromObject(scene);
  const h = Number.isFinite(box.max.y - box.min.y) ? box.max.y - Math.min(0, box.min.y) : 0;
  heightCache.set(key, h);
  return h;
}

/** Side colours of the thin hex edge under a figure. */
export const SIDE_EDGE_COLORS: Record<'hero' | 'foe', string> = { hero: '#f0c470', foe: '#9a90c0' };
/** Glowing ring around the feet: the active figure (warm gold), a selected one (soft white), a
 *  valid target (ember, pulsing). The ring turns slowly. */
export type FigureGlow = 'active' | 'selected' | 'target';
export const GLOW_COLORS: Record<FigureGlow, string> = { active: '#ffc040', selected: '#eef1ff', target: '#ff5422' };
const GLOW_OPACITY: Record<FigureGlow, number> = { active: 0.95, selected: 0.7, target: 0.95 };
/** Turns per second of the ring (active and selected turn one way, targets the other). */
const RING_SPIN: Record<FigureGlow, number> = { active: 0.08, selected: 0.05, target: -0.12 };
/** Ring radius around a figure's feet: a little wider than its contact shadow, inside the hex. */
const RING_SCALE = 1.2;
const RING_MAX = 0.8;

export interface FigureParts {
  edgeGeometry: THREE.BufferGeometry;
  ringGeometry: THREE.BufferGeometry;
  blobGeometry: THREE.BufferGeometry;
  proxyGeometry: THREE.BufferGeometry;
  blobTexture: THREE.Texture;
  glowMaterials: Record<FigureGlow, THREE.Material>;
  proxyMaterial: THREE.Material;
}

/**
 * A flat hexagonal band on the ground (XZ, flat-top hex: a corner at +X) through loops at the given
 * radii (in hex sizes), with an alpha per loop in the vertex colour (RGBA), so a glow fades out
 * toward its rims while keeping its own colour on light and dark ground alike.
 */
export function hexBand(radii: readonly number[], levels: readonly number[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const corners = 6;
  radii.forEach((r, loop) => {
    const l = levels[loop] ?? 1;
    for (let i = 0; i < corners; i++) {
      const a = (i / corners) * Math.PI * 2;
      pos.push(Math.cos(a) * r * HEX_SIZE, 0, -Math.sin(a) * r * HEX_SIZE);
      col.push(1, 1, 1, l);
    }
  });
  for (let loop = 0; loop < radii.length - 1; loop++) {
    for (let i = 0; i < corners; i++) {
      const a = loop * corners + i;
      const b = loop * corners + ((i + 1) % corners);
      // Counter-clockwise seen from above, so the band faces up.
      index.push(a, b + corners, b, a, a + corners, b + corners);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(index);
  return g;
}

/**
 * A flat glowing ring of unit radius on the ground: `arcs` bright arcs with tapered ends over a faint
 * full circle, each a band whose alpha (vertex colour, RGBA) peaks on the line and fades to 0 at the
 * rims, so it reads as a thin line with a soft glow.
 */
export function footRing(arcs = 3, gapDeg = 34): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const band = (start: number, length: number, radii: number[], alphas: number[], taper: number) => {
    const steps = Math.max(4, Math.ceil(length / (Math.PI / 36)));
    const base = pos.length / 3;
    for (let s = 0; s <= steps; s++) {
      const a = start + (s / steps) * length;
      const along = Math.min(a - start, start + length - a);
      const k = taper > 0 ? Math.min(1, along / taper) : 1;
      const fade = k * k * (3 - 2 * k);
      radii.forEach((r, i) => {
        pos.push(Math.cos(a) * r, 0, -Math.sin(a) * r);
        col.push(1, 1, 1, (alphas[i] ?? 0) * fade);
      });
    }
    const n = radii.length;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n - 1; i++) {
        const a = base + s * n + i;
        const b = a + n;
        // Counter-clockwise seen from above, so the ring faces up.
        index.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
  };
  band(0, Math.PI * 2, [0.9, 0.965, 1.03], [0, 0.3, 0], 0);
  const gap = (gapDeg * Math.PI) / 180;
  const arc = (Math.PI * 2) / arcs - gap;
  for (let i = 0; i < arcs; i++) band((i * Math.PI * 2) / arcs, arc, [0.82, 0.935, 0.995, 1.13], [0, 1, 1, 0], arc * 0.3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(index);
  return g;
}

/** Board-wide glow animation at `time` seconds: targets pulse (shared material). */
export function animateGlows(parts: FigureParts, time: number): void {
  const target = parts.glowMaterials.target as THREE.MeshBasicMaterial;
  target.opacity = GLOW_OPACITY.target * (0.7 + 0.3 * Math.sin(time * Math.PI * 1.4));
}

export function createFigureParts(): FigureParts {
  const proxyMaterial = new THREE.MeshBasicMaterial();
  proxyMaterial.visible = false;
  const glow = (g: FigureGlow) => new THREE.MeshBasicMaterial({ color: GLOW_COLORS[g], vertexColors: true, transparent: true, opacity: GLOW_OPACITY[g], depthWrite: false });
  return {
    edgeGeometry: hexBand([0.83, 0.9], [1, 1]),
    ringGeometry: footRing(),
    blobGeometry: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    proxyGeometry: new THREE.CylinderGeometry(0.62, 0.62, 1, 10).translate(0, 0.5, 0),
    blobTexture: blobShadowTexture(),
    glowMaterials: { active: glow('active'), selected: glow('selected'), target: glow('target') },
    proxyMaterial,
  };
}

export function disposeFigureParts(p: FigureParts): void {
  for (const x of [p.edgeGeometry, p.ringGeometry, p.blobGeometry, p.proxyGeometry, p.blobTexture, p.proxyMaterial, ...Object.values(p.glowMaterials)]) x.dispose();
}

/** Inverted-hull outline material; works with skinning (pushes vertices along the skinned normal). */
function outlineMaterial(color: string, thickness: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <skinning_vertex>',
      `#include <skinning_vertex>
      #ifdef USE_SKINNING
      transformed += normalize(objectNormal) * ${thickness.toFixed(5)};
      #else
      transformed += normalize(normal) * ${thickness.toFixed(5)};
      #endif`,
    );
  };
  m.customProgramCacheKey = () => `bv-outline-${thickness.toFixed(5)}`;
  return m;
}

export class FigureView {
  readonly id: FigureId;
  look: FigureLook;
  /** On the hex; moved by walk/jump/slide animations. */
  readonly root = new THREE.Group();
  /** Turned toward where the figure faces; lunges and tilts happen here. */
  readonly body = new THREE.Group();
  private content: THREE.Object3D | null = null;
  private placeholder: THREE.Group | null = null;
  model: Model | null = null;
  /** Things on the ground under the figure: contact shadow, side edge, glow. Not lifted by jumps. */
  private readonly base = new THREE.Group();
  private readonly blob: THREE.Mesh;
  private readonly blobRadius: number;
  private readonly glowMesh: THREE.Mesh;
  private glow: FigureGlow | null = null;
  readonly proxy: THREE.Mesh;
  private outlines: THREE.Mesh[] = [];
  private materials: THREE.Material[] = [];
  private ownMaterials: THREE.Material[] = [];
  private ownTextures: THREE.Texture[] = [];
  private ownGeometries: THREE.BufferGeometry[] = [];
  private loadToken = 0;
  /** Rest height of the content inside the body (flying figures hover above it). */
  private contentBaseY = 0;
  private clock = 0;
  private readonly hoverPhase: number;
  private opacity = 1;
  private targeted = false;
  /** Height of the standing figure in world units (after scale). */
  height: number;
  hex: Hex;
  yaw = 0;
  hp = 0;
  maxHp = 0;
  conditions: ConditionId[] = [];
  shield = 0;
  downed = false;
  gone = false;
  badge: FigureBadge | null = null;
  badgeItem: OverlayItem | null = null;
  /** Called when a model swaps in (the board redraws). */
  onChange: () => void = () => {};

  constructor(f: Figure, look: FigureLook, private readonly parts: FigureParts) {
    this.id = f.id;
    this.look = look;
    this.hex = [f.hex[0], f.hex[1]];
    this.height = look.height;
    this.root.name = `figure:${f.id}`;
    this.root.add(this.base, this.body);
    // Yaw first, then the lean in the figure's own frame (jumps and pushes tilt it).
    this.body.rotation.order = 'YXZ';
    this.hoverPhase = (f.hex[0] * 1.7 + f.hex[1] * 2.3) % (Math.PI * 2);
    this.blobRadius = THREE.MathUtils.clamp(look.height * 0.42, 0.42, 0.85);
    this.blob = this.buildBase();
    this.glowMesh = new THREE.Mesh(parts.ringGeometry, parts.glowMaterials.active);
    this.glowMesh.position.y = PLATE_HEIGHT + 0.012;
    this.glowMesh.scale.setScalar(Math.min(RING_MAX, this.blobRadius * RING_SCALE));
    this.glowMesh.name = 'foot-ring';
    this.glowMesh.renderOrder = 3;
    this.glowMesh.visible = false;
    this.base.add(this.glowMesh);
    this.proxy = new THREE.Mesh(parts.proxyGeometry, parts.proxyMaterial);
    this.proxy.scale.y = look.height + 0.2;
    this.proxy.userData['figureId'] = f.id;
    this.root.add(this.proxy);
    this.setPlaceholder();
    this.placeAt(this.hex);
    // Monsters face the heroes' side of the board (toward the camera), heroes face away from it.
    this.setYaw(f.kind === 'hero' ? Math.PI : 0);
  }

  /** Contact shadow and the thin side-coloured hex edge. */
  private buildBase(): THREE.Mesh {
    const blobMat = new THREE.MeshBasicMaterial({ map: this.parts.blobTexture, color: '#000000', transparent: true, depthWrite: false, opacity: 0.8 });
    blobMat.userData['alwaysTransparent'] = true;
    this.ownMaterials.push(blobMat);
    const blob = new THREE.Mesh(this.parts.blobGeometry, blobMat);
    blob.position.y = PLATE_HEIGHT + 0.006;
    blob.scale.setScalar(this.blobRadius * 2.3);
    blob.renderOrder = 1;
    blob.name = 'contact-shadow';
    const kind = this.look.kind;
    const hero = kind === 'hero' || kind === 'summon';
    const edgeMat = new THREE.MeshBasicMaterial({ color: SIDE_EDGE_COLORS[hero ? 'hero' : 'foe'], transparent: true, opacity: hero ? 0.55 : 0.5, depthWrite: false });
    edgeMat.userData['alwaysTransparent'] = true;
    this.ownMaterials.push(edgeMat);
    const edge = new THREE.Mesh(this.parts.edgeGeometry, edgeMat);
    edge.position.y = PLATE_HEIGHT + 0.009;
    edge.renderOrder = 2;
    edge.name = 'side-edge';
    this.base.add(blob, edge);
    return blob;
  }

  /** The standee: a small painted card with the initial and standee number in a plastic clip, used
   *  until a model loads. */
  private setPlaceholder(): void {
    const look = this.look;
    const w = 256;
    const h = 320;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, look.color);
    grad.addColorStop(1, '#1e2230');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, 28);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = look.kind === 'elite' || look.kind === 'boss' ? '#f0c040' : 'rgba(255,240,215,0.85)';
    ctx.stroke();
    // Painted, not printed: a few soft brush strokes across the face.
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 14; i++) {
      const y = (i * 41) % h;
      ctx.strokeStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},0.07)`;
      ctx.lineWidth = 14 + (i % 4) * 6;
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.quadraticCurveTo(w / 2, y + 30 - (i % 3) * 25, w + 20, ((i * 67) % h) - 10);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${look.initial.length > 1 ? 120 : 160}px system-ui, sans-serif`;
    ctx.fillText(look.initial, w / 2, h * 0.42);
    if (look.number !== null) {
      ctx.font = '800 72px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.8, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(String(look.number), w / 2, h * 0.8 + 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.ownTextures.push(tex);
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const edge = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.7 });
    this.ownMaterials.push(face, edge);
    const height = look.height * 0.72;
    const clipHeight = 0.07;
    const cardGeometry = new THREE.BoxGeometry(height * 0.78, height, 0.04);
    const clipGeometry = new THREE.BoxGeometry(height * 0.5, clipHeight, 0.16);
    this.ownGeometries.push(cardGeometry, clipGeometry);
    const card = new THREE.Mesh(cardGeometry, [edge, edge, edge, edge, face, face]);
    card.position.y = PLATE_HEIGHT + clipHeight * 0.6 + height / 2;
    card.castShadow = true;
    const clipMat = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.5 });
    const clip = new THREE.Mesh(clipGeometry, clipMat);
    clip.position.y = PLATE_HEIGHT + clipHeight / 2;
    clip.castShadow = true;
    this.ownMaterials.push(clipMat);
    const g = new THREE.Group();
    g.add(card, clip);
    this.placeholder = g;
    this.setContent(g, [face, edge, clipMat]);
    this.height = height + clipHeight;
  }

  private setContent(object: THREE.Object3D, materials: THREE.Material[]): void {
    if (this.content) this.body.remove(this.content);
    this.content = object;
    this.contentBaseY = object.position.y;
    this.materials = materials;
    this.body.add(object);
    this.outlines = [];
    this.applyOpacity();
    if (this.targeted) this.setTargeted(true);
  }

  get hasModel(): boolean {
    return this.model !== null;
  }

  /** Loads (or reloads at another quality) the figure's model; keeps the placeholder on failure. */
  async loadModel(quality: GraphicsQuality, available: Set<string>, castShadow: boolean): Promise<void> {
    if (!available.has(this.look.modelId)) return;
    const token = ++this.loadToken;
    let model: Model;
    try {
      model = await loadModel(this.look.modelId, { quality });
    } catch {
      return;
    }
    if (token !== this.loadToken || this.gone) return;
    const measured = measureHeight(model);
    const scale = modelScale(this.look.height, measured);
    model.scene.scale.setScalar(scale);
    model.scene.position.y = PLATE_HEIGHT;
    // Own material copies, so fading, greying and outlining one figure leaves the others alone.
    const materials: THREE.Material[] = [];
    model.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = castShadow;
      mesh.frustumCulled = false; // skinned bounds do not follow the clips
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const copies = list.map((m) => m.clone());
      mesh.material = Array.isArray(mesh.material) ? copies : copies[0]!;
      materials.push(...copies);
    });
    const old = this.model;
    this.model = model;
    this.placeholder = null;
    this.setContent(model.scene, materials);
    this.setYaw(this.yaw);
    this.height = this.look.height;
    this.proxy.scale.y = this.height + 0.2;
    if (old) old.mixer.stopAllAction();
    if (this.gone) model.play('death', { crossFade: 0 });
    else if (this.downed) this.holdDeath();
    else model.play('idle', { crossFade: 0 });
    this.onChange();
    for (const weaponId of this.look.weapons) {
      if (!available.has(weaponId)) continue;
      try {
        const objects = await attachWeapon(model, weaponId);
        if (token !== this.loadToken) return;
        for (const o of objects) {
          o.traverse((c) => {
            const mesh = c as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = castShadow;
            mesh.material = (mesh.material as THREE.Material).clone();
            this.materials.push(mesh.material as THREE.Material);
          });
        }
        this.applyOpacity();
        this.onChange();
      } catch {
        // Weapon without bones in this rig: leave it off.
      }
    }
  }

  setCastShadow(on: boolean): void {
    this.content?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = on;
    });
  }

  hasClip(name: string): boolean {
    return !!this.model?.clips[name];
  }

  /** Plays a clip scaled to the board's pace; returns its length in seconds (0 if there is none). */
  playClip(name: string, opts: { then?: string | null; seconds?: number; crossFade?: number } = {}): number {
    const model = this.model;
    if (!model || !model.clips[name]) return 0;
    const action = model.play(name, { crossFade: opts.crossFade ?? 0.15, ...(opts.then !== undefined ? { then: opts.then } : {}) });
    if (!action) return 0;
    const duration = action.getClip().duration;
    const want = opts.seconds ?? CLIP_SECONDS[name];
    const ts = want ? Math.min(MAX_TIME_SCALE, Math.max(1, duration / want)) : 1;
    action.setEffectiveTimeScale(ts);
    return duration / ts;
  }

  /** Seconds from the attack start to the hit, at the board's pace (default when there is no clip). */
  attackWindup(fallback: number): number {
    const clip = this.model?.clips['attack'];
    if (!clip) return fallback;
    const ts = Math.min(MAX_TIME_SCALE, Math.max(1, clip.duration / CLIP_SECONDS['attack']!));
    return (clip.duration * ATTACK_IMPACT) / ts;
  }

  /** Death clip held at its last frame (downed heroes lie on their hex). */
  holdDeath(): void {
    const model = this.model;
    if (!model?.clips['death']) return;
    const action = model.play('death', { crossFade: 0, then: null });
    if (action) action.time = action.getClip().duration;
    model.update(0);
  }

  update(dt: number): void {
    this.model?.update(dt);
    this.clock += dt;
    if (this.look.flying && this.content) this.content.position.y = this.contentBaseY + this.hover;
    this.updateBlob();
  }

  /** The contact shadow spreads and fades as the figure leaves the ground (jumps, hovering). */
  private updateBlob(): void {
    const lift = Math.max(0, this.body.position.y + this.hover);
    const k = 1 / (1 + lift * 1.6);
    this.blob.scale.setScalar(this.blobRadius * 2.3 * (1 + (1 - k) * 0.5));
    const m = this.blob.material as THREE.MeshBasicMaterial;
    m.userData['baseOpacity'] = 0.8 * k;
    m.opacity = 0.8 * k * this.opacity;
  }

  /** How far above its stance the figure floats now (ghosts hover and bob; others 0). */
  get hover(): number {
    if (!this.look.flying || this.downed || this.gone) return 0;
    return HOVER_HEIGHT + hoverBob(this.clock, this.hoverPhase);
  }

  /** Time scale of the clip playing now (a slowed run while airborne). */
  setClipSpeed(scale: number): void {
    const m = this.model;
    const clip = m?.current ? m.clips[m.current] : undefined;
    if (m && clip) m.mixer.existingAction(clip)?.setEffectiveTimeScale(scale);
  }

  /** Squash (< 1) or stretch (> 1) of the body, keeping its volume. */
  setSquash(s: number): void {
    const side = 1 / Math.sqrt(Math.max(0.2, s));
    this.body.scale.set(side, s, side);
  }

  placeAt(hex: Hex): void {
    this.hex = [hex[0], hex[1]];
    const { x, z } = hexToWorld(hex[0], hex[1]);
    this.root.position.set(x, 0, z);
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
    // Standees always face the camera; only models turn.
    this.body.rotation.y = this.placeholder ? 0 : yaw;
  }

  /** Yaw that faces a world point from the figure. */
  yawTo(x: number, z: number): number {
    return Math.atan2(x - this.root.position.x, z - this.root.position.z);
  }

  /** Point above the head for the badge and floating numbers. */
  headPoint(out = new THREE.Vector3()): THREE.Vector3 {
    const lying = this.downed ? 0.45 : 1;
    return out.copy(this.root.position).setY(this.root.position.y + this.body.position.y + this.hover + PLATE_HEIGHT + this.height * lying + 0.18);
  }

  /** Chest height: where projectiles hit. */
  chestPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.root.position).setY(this.root.position.y + this.body.position.y + this.hover + PLATE_HEIGHT + this.height * 0.6);
  }

  setOpacity(a: number): void {
    this.opacity = a;
    this.applyOpacity();
  }

  private applyOpacity(): void {
    const a = this.opacity;
    for (const m of [...this.materials, ...this.ownMaterials]) {
      if (m.name === 'bv-keep') continue;
      const transparent = a < 0.999 || m.userData['alwaysTransparent'] === true;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      if (m.userData['baseOpacity'] === undefined) m.userData['baseOpacity'] = m.opacity;
      m.opacity = (m.userData['baseOpacity'] as number) * a;
    }
    this.root.visible = a > 0.001;
    this.glowMesh.visible = this.glow !== null && a > 0.5;
  }

  /** Grey tint for a downed hero. */
  setGrey(on: boolean): void {
    for (const m of this.materials) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std.color) continue;
      if (std.userData['baseColor'] === undefined) std.userData['baseColor'] = std.color.getHex();
      if (on) std.color.set('#8a8f99');
      else std.color.setHex(std.userData['baseColor'] as number);
    }
  }

  /** An outline around the figure (valid targets); the glowing ring comes from setGlow. */
  setTargeted(on: boolean): void {
    this.targeted = on;
    if (on && this.outlines.length === 0) this.buildOutline();
    for (const o of this.outlines) o.visible = on;
  }

  /** Whether a ring is showing (it turns, so the board keeps drawing slowly). */
  get glowing(): boolean {
    return this.glowMesh.visible;
  }

  /** Turns the ring to where it is at `time` seconds (absolute, so frame gaps do not matter). */
  spinGlow(time: number): void {
    if (this.glow) this.glowMesh.rotation.y = (time * RING_SPIN[this.glow] + this.hoverPhase / (Math.PI * 2)) * Math.PI * 2;
  }

  /** Glowing ring around the feet for the active figure, a selected one or a valid target; null for none. */
  setGlow(glow: FigureGlow | null): void {

    this.glow = glow;
    if (glow) this.glowMesh.material = this.parts.glowMaterials[glow];
    this.glowMesh.visible = glow !== null && this.opacity > 0.5;
  }

  private buildOutline(): void {
    if (!this.content) return;
    const meshes: THREE.Mesh[] = [];
    this.content.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name !== 'bv-outline') meshes.push(mesh);
    });
    for (const mesh of meshes) {
      const geo = mesh.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const size = geo.boundingBox!.getSize(new THREE.Vector3());
      const mat = outlineMaterial('#ffb347', Math.max(size.x, size.y, size.z) * 0.018);
      mat.name = 'bv-keep';
      this.ownMaterials.push(mat);
      const sm = mesh as THREE.SkinnedMesh;
      let outline: THREE.Mesh;
      if (sm.isSkinnedMesh) {
        const skinned = new THREE.SkinnedMesh(geo, mat);
        skinned.bind(sm.skeleton, sm.bindMatrix);
        skinned.bindMode = sm.bindMode;
        outline = skinned;
      } else {
        outline = new THREE.Mesh(geo, mat);
      }
      outline.name = 'bv-outline';
      outline.frustumCulled = false;
      outline.position.copy(mesh.position);
      outline.quaternion.copy(mesh.quaternion);
      outline.scale.copy(mesh.scale);
      mesh.parent?.add(outline);
      this.outlines.push(outline);
    }
  }

  /** Changes the look (e.g. a hero's class colour is the same, but a monster may turn elite after undo). */
  sameLook(look: FigureLook): boolean {
    return look.modelId === this.look.modelId && look.kind === this.look.kind && look.number === this.look.number && look.color === this.look.color;
  }

  dispose(): void {
    this.loadToken++;
    this.model?.mixer.stopAllAction();
    this.root.removeFromParent();
    for (const m of [...this.materials, ...this.ownMaterials]) m.dispose();
    for (const t of this.ownTextures) t.dispose();
    for (const g of this.ownGeometries) g.dispose();
  }
}
