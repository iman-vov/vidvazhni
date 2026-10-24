// One figure on the board: its model (or a placeholder standee until a model exists or loads), a
// painted base (gold ring for elites), the target ring and outline, an invisible pick cylinder,
// and the HTML badge with health and conditions. Positions and clips are driven by boardView.

import * as THREE from 'three';
import type { ConditionId } from '../rules/content';
import type { Hex } from '../rules/hex';
import type { Figure, FigureId } from '../rules/state';
import type { FigureBadge, OverlayItem } from './boardOverlay';
import { modelScale, type FigureLook } from './figureLook';
import { PLATE_HEIGHT } from './boardTiles';
import { hexToWorld } from './hexLayout';
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

export interface FigureParts {
  baseGeometry: THREE.BufferGeometry;
  ringGeometry: THREE.BufferGeometry;
  targetGeometry: THREE.BufferGeometry;
  proxyGeometry: THREE.BufferGeometry;
  fogTexture: THREE.Texture;
  goldMaterial: THREE.Material;
  targetMaterial: THREE.Material;
  proxyMaterial: THREE.Material;
}

export function createFigureParts(): FigureParts {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(190,196,210,0.55)');
  g.addColorStop(0.6, 'rgba(160,166,182,0.28)');
  g.addColorStop(1, 'rgba(150,156,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const fogTexture = new THREE.CanvasTexture(c);
  fogTexture.colorSpace = THREE.SRGBColorSpace;
  const proxyMaterial = new THREE.MeshBasicMaterial();
  proxyMaterial.visible = false;
  return {
    baseGeometry: new THREE.CylinderGeometry(0.56, 0.6, 0.07, 28).translate(0, 0.035, 0),
    ringGeometry: new THREE.TorusGeometry(0.6, 0.045, 6, 36).rotateX(Math.PI / 2).translate(0, 0.07, 0),
    targetGeometry: new THREE.RingGeometry(0.66, 0.8, 36).rotateX(-Math.PI / 2).translate(0, 0.03, 0),
    proxyGeometry: new THREE.CylinderGeometry(0.62, 0.62, 1, 10).translate(0, 0.5, 0),
    fogTexture,
    goldMaterial: new THREE.MeshStandardMaterial({ color: '#f0c040', metalness: 0.7, roughness: 0.3, emissive: '#5a3a00' }),
    targetMaterial: new THREE.MeshBasicMaterial({ color: '#ff7a3d', transparent: true, opacity: 0.95, depthWrite: false }),
    proxyMaterial,
  };
}

export function disposeFigureParts(p: FigureParts): void {
  for (const x of [p.baseGeometry, p.ringGeometry, p.targetGeometry, p.proxyGeometry, p.fogTexture, p.goldMaterial, p.targetMaterial, p.proxyMaterial]) x.dispose();
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
  private readonly base = new THREE.Group();
  private readonly targetRing: THREE.Mesh;
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
    this.buildBase();
    this.targetRing = new THREE.Mesh(parts.targetGeometry, parts.targetMaterial);
    this.targetRing.visible = false;
    this.targetRing.renderOrder = 2;
    this.root.add(this.targetRing);
    this.proxy = new THREE.Mesh(parts.proxyGeometry, parts.proxyMaterial);
    this.proxy.scale.y = look.height + 0.2;
    this.proxy.userData['figureId'] = f.id;
    this.root.add(this.proxy);
    this.setPlaceholder();
    this.placeAt(this.hex);
    // Monsters face the heroes' side of the board (toward the camera), heroes face away from it.
    this.setYaw(f.kind === 'hero' ? Math.PI : 0);
  }

  private buildBase(): void {
    const kind = this.look.kind;
    const baseColor = kind === 'hero' ? this.look.color : kind === 'summon' ? '#2f8f8a' : '#4a4e58';
    const m = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.6 });
    this.ownMaterials.push(m);
    const disc = new THREE.Mesh(this.parts.baseGeometry, m);
    disc.receiveShadow = true;
    disc.position.y = PLATE_HEIGHT;
    this.base.add(disc);
    if (kind === 'elite' || kind === 'boss') {
      const ring = new THREE.Mesh(this.parts.ringGeometry, this.parts.goldMaterial);
      ring.position.y = PLATE_HEIGHT;
      if (kind === 'boss') ring.scale.setScalar(1.15);
      this.base.add(ring);
    }
    if (kind !== 'hero' && kind !== 'summon') {
      // The grey fog that has «заморочило» the creature, pooling around its feet.
      const fogMat = new THREE.MeshBasicMaterial({ map: this.parts.fogTexture, transparent: true, depthWrite: false, opacity: 0.9 });
      this.ownMaterials.push(fogMat);
      const fogGeometry = new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2);
      this.ownGeometries.push(fogGeometry);
      const fog = new THREE.Mesh(fogGeometry, fogMat);
      fog.position.y = PLATE_HEIGHT + 0.09;
      fog.renderOrder = 1;
      fog.name = 'fog';
      this.base.add(fog);
    }
  }

  /** The standee: a painted card with the initial and standee number, used until a model loads. */
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
    ctx.strokeStyle = look.kind === 'elite' ? '#f0c040' : 'rgba(255,255,255,0.85)';
    ctx.stroke();
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
    const height = look.height * 0.78;
    const cardGeometry = new THREE.BoxGeometry(height * 0.8, height, 0.06);
    this.ownGeometries.push(cardGeometry);
    const card = new THREE.Mesh(cardGeometry, [edge, edge, edge, edge, face, face]);
    card.position.y = PLATE_HEIGHT + 0.07 + height / 2;
    card.castShadow = true;
    const g = new THREE.Group();
    g.add(card);
    this.placeholder = g;
    this.setContent(g, [face, edge]);
    this.height = height + 0.1;
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
    model.scene.position.y = PLATE_HEIGHT + 0.07;
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
      const transparent = a < 0.999 || (m as THREE.MeshBasicMaterial).map === this.parts.fogTexture;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      if (m.userData['baseOpacity'] === undefined) m.userData['baseOpacity'] = m.opacity;
      m.opacity = (m.userData['baseOpacity'] as number) * a;
    }
    this.root.visible = a > 0.001;
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

  /** Target ring on the ground and an outline around the figure. */
  setTargeted(on: boolean): void {
    this.targeted = on;
    this.targetRing.visible = on;
    if (on && this.outlines.length === 0) this.buildOutline();
    for (const o of this.outlines) o.visible = on;
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

  /** Hides the fog pool (a dispersed creature no longer stands in fog). */
  setFog(opacity: number): void {
    const fog = this.base.getObjectByName('fog') as THREE.Mesh | undefined;
    if (!fog) return;
    (fog.material as THREE.Material).userData['baseOpacity'] = 0.9 * opacity;
    this.applyOpacity();
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
