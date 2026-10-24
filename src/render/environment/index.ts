// The place around the playable hexes: a ground that runs out from under the board into the
// location's fog, the map edge closed by walls (or thicket, reeds, rock), doorways at the entrance
// and exit, props in the strip by the walls and beyond, the location's light (candles, torches,
// lanterns as point lights), drifting Морок and a veil of fog over rooms not yet revealed.
// All pieces are procedural placeholders with kit ids; an art kit replaces them by id (kit.ts), and
// a prop model from Meshy (assets/models, mapped by the location's `propModels`) replaces a prop
// piece once it exists, drawn instanced. Props stand on soft contact shadows.
// Static geometry is merged per material, so the whole environment costs ~15–30 draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ScenarioDef } from '../../rules/content';
import type { HexKey } from '../../rules/hex';
import { noiseTexture, textureUrl } from '../boardTiles';
import { blobShadowTexture } from '../contactShadow';
import { listModels } from '../models';
import { loadPropPrototype, propModelFor, prototypeMeshes, type PropPrototype } from '../propModels';
import type { GraphicsQuality } from '../quality';
import { environmentFor } from './data';
import { bakeField, createUniforms, fieldTexture, outputColor, patchMaterial, writeVeil, type EnvUniforms, type Field } from './field';
import { kitPieces, loadKitPiece } from './kit';
import { buildLayout, seededRandom, type EnvLayout } from './layout';
import { Morok } from './morok';
import { planEnvironment, type Placement } from './plan';
import { buildPiece, PALETTE_DEFAULTS, pieceMeta, UNLIT, type MaterialKey, type Part } from './pieces';
import type { EnvironmentDef, PropModelSpec } from './types';

export type { EnvironmentDef, PropModelSpec } from './types';
export { environmentFor, ENVIRONMENTS } from './data';

/** Per quality: point lights at candles and lanterns, Морок wisps, wisps per veiled hex, field size. */
const QUALITY: Record<GraphicsQuality, { lights: number; wisps: number; roomWisps: number; field: number; shadows: boolean }> = {
  low: { lights: 0, wisps: 0, roomWisps: 0, field: 112, shadows: false },
  medium: { lights: 2, wisps: 14, roomWisps: 0.3, field: 144, shadows: false },
  high: { lights: 4, wisps: 30, roomWisps: 0.55, field: 176, shadows: true },
};

const GROUND_EXTRA = 70;

/** Scenario obstacle models without a GLB yet → the location's piece standing in for them. */
const OBSTACLE_PIECES: Record<string, { piece: string; scale: number }> = {
  barrel: { piece: 'barrel', scale: 1.04 },
  crate: { piece: 'crate', scale: 1.3 },
  tree: { piece: 'obstacle-tree', scale: 1 },
  rock: { piece: 'boulder', scale: 1 },
  hut: { piece: 'hut', scale: 0.4 },
  pillar: { piece: 'pillar', scale: 1 },
  bed: { piece: 'bunk', scale: 1 },
  table: { piece: 'table', scale: 1 },
  // Scenario objects by `kind:state`.
  brazier: { piece: 'brazier', scale: 1 },
  'brazier:unlit': { piece: 'brazier', scale: 1 },
  'brazier:lit': { piece: 'brazier-lit', scale: 1 },
  lever: { piece: 'lever', scale: 1 },
  'lever:up': { piece: 'lever', scale: 1 },
  'lever:down': { piece: 'lever-down', scale: 1 },
  millstone: { piece: 'millstone', scale: 1 },
};

interface LightSpot {
  pos: THREE.Vector3;
  kind: 'flame' | 'lantern' | 'crystal' | 'window';
  room: string | null;
}

export interface EnvironmentStats {
  id: string;
  pieces: number;
  meshes: number;
  lights: number;
  wisps: number;
  kitPieces: string[];
  /** Pieces shown by a prop model (assets/models) instead of their procedural placeholder. */
  propModels: string[];
}

export class BoardEnvironment {
  readonly root = new THREE.Group();
  /** Called when something loaded later (a texture, a kit piece) changed the picture. */
  onChange: () => void = () => {};
  def: EnvironmentDef | null = null;
  layout: EnvLayout | null = null;
  private quality: GraphicsQuality;
  private scenarioId: string | null = null;
  private readonly uniforms: EnvUniforms = createUniforms();
  private field: Field | null = null;
  private fieldTex: THREE.DataTexture | null = null;
  private materials = new Map<MaterialKey | THREE.Material, THREE.Material>();
  private disposables: { dispose(): void }[] = [];
  private morok: Morok | null = null;
  private lights: { light: THREE.PointLight; base: number; phase: number; kind: LightSpot['kind']; room: string | null }[] = [];
  private placements: Placement[] = [];
  private kitParts = new Map<string, Part[]>();
  /** Prop models that loaded for pieces of this location, by piece id. */
  private propProtos = new Map<string, PropPrototype>();
  private readonly available = new Set(listModels());
  private blobTexture: THREE.Texture | null = null;
  private readonly veil = new Map<string, number>();
  private obstacleGeometries: THREE.BufferGeometry[] = [];
  private buildToken = 0;

  constructor(quality: GraphicsQuality) {
    this.quality = quality;
    this.root.name = 'environment';
  }

  /** Builds the location for a scenario (all its rooms); rooms in `revealed` are clear of the veil.
   *  Does nothing when the scenario and quality are the ones already built. */
  build(scenario: ScenarioDef, revealed: readonly string[]): void {
    if (this.scenarioId === scenario.id && this.layout) {
      this.setRevealed(revealed);
      return;
    }
    this.scenarioId = scenario.id;
    this.def = environmentFor(scenario.id);
    this.layout = buildLayout(scenario);
    this.veil.clear();
    for (const room of scenario.rooms) this.veil.set(room.id, revealed.includes(room.id) ? 0 : 1);
    this.kitParts.clear();
    this.propProtos.clear();
    this.rebuild();
    this.loadKit();
    this.loadPropModels();
  }

  setQuality(q: GraphicsQuality): void {
    if (q === this.quality) return;
    this.quality = q;
    if (!this.layout) return;
    this.propProtos.clear();
    this.rebuild();
    this.loadPropModels();
  }

  /**
   * The prop model that shows a scenario obstacle (`barrel`, `table`), an object look
   * (`brazier:lit`, `lever:down`, `rune`) or a tile thing (`chest`, `door`, `trap`), by the
   * location's table; null while no such model exists (the procedural stand-in stays).
   */
  propModel(key: string, defaultHeight: number): Required<PropModelSpec> | null {
    const stand = OBSTACLE_PIECES[key];
    const keys = [...new Set([key, stand?.piece, key.split(':')[0]].filter((k): k is string => !!k))];
    const meta = stand ? pieceMeta(stand.piece) : undefined;
    return propModelFor(this.def, keys, this.available, meta ? meta.height * stand!.scale : defaultHeight);
  }

  /** The glowing bits (flames, glow) of an obstacle's procedural piece, to keep on top of its prop
   *  model (a lit brazier), scaled to the model's height; null when the piece has none. */
  propGlow(key: string, height: number): THREE.Object3D | null {
    const stand = OBSTACLE_PIECES[key];
    const meta = stand ? pieceMeta(stand.piece) : undefined;
    if (!stand || !meta) return null;
    const group = new THREE.Group();
    for (const part of buildPiece(stand.piece, { height: meta.height })) {
      if (typeof part.material !== 'string' || !UNLIT.has(part.material) || part.material === 'shadow') {
        part.geometry.dispose();
        continue;
      }
      const g = part.geometry;
      if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
      const mesh = new THREE.Mesh(g, this.material(part.material));
      mesh.applyMatrix4(part.matrix);
      group.add(mesh);
      this.obstacleGeometries.push(g);
    }
    if (!group.children.length) return null;
    group.scale.setScalar(height / meta.height);
    return group;
  }

  /** Playable hexes of the whole map (every room), or null before a build. */
  get footprint(): ReadonlySet<HexKey> | null {
    return this.layout ? new Set(this.layout.footprint.keys()) : null;
  }

  /** Colour for the thin walls between rooms, matching the location. */
  get innerWallColor(): string | null {
    if (!this.def) return null;
    return this.def.walls?.inner ?? this.palette('stone');
  }

  /** A stand-in for a scenario obstacle model (tree, rock, pillar, bed, table, hut) or a scenario
   *  object (`brazier:lit`, `lever:down`, `millstone`) in the location's colours, standing on its
   *  own origin; null for what the tile layer draws itself. */
  makeObstacle(model: string): THREE.Object3D | null {
    const spec = OBSTACLE_PIECES[model];
    if (!spec || !this.def) return null;
    const group = new THREE.Group();
    group.name = `obstacle:${spec.piece}`;
    for (const part of this.kitParts.get(spec.piece) ?? buildPiece(spec.piece, { height: pieceMeta(spec.piece)?.height ?? 1 })) {
      if (this.quality === 'low' && part.detail) continue;
      const g = this.kitParts.has(spec.piece) ? part.geometry.clone() : part.geometry;
      const pos = g.getAttribute('position');
      if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
      const mesh = new THREE.Mesh(g, this.material(part.material));
      mesh.applyMatrix4(part.matrix);
      group.add(mesh);
      this.obstacleGeometries.push(g);
    }
    group.scale.setScalar(spec.scale);
    return group;
  }

  setRevealed(revealed: readonly string[]): void {
    let changed = false;
    for (const room of this.veil.keys()) {
      const v = revealed.includes(room) ? 0 : 1;
      if (this.veil.get(room) !== v) {
        this.veil.set(room, v);
        changed = true;
      }
    }
    if (changed) this.applyVeil();
  }

  /** A room coming out of the fog: k from 0 (veiled) to 1 (clear). */
  revealRoom(room: string, k: number): void {
    if (!this.veil.has(room)) return;
    this.veil.set(room, 1 - Math.min(1, Math.max(0, k)));
    this.applyVeil();
  }

  /** Sets the location's light, background and image-light strength on the board's scene. */
  applyLighting(scene: THREE.Scene, hemi: THREE.HemisphereLight, sun: THREE.DirectionalLight): void {
    const def = this.def;
    if (!def) return;
    hemi.color.set(def.light.sky);
    hemi.groundColor.set(def.light.ground);
    hemi.intensity = def.light.hemi;
    sun.color.set(def.light.sun);
    sun.intensity = def.light.sunIntensity;
    scene.environmentIntensity = def.light.env ?? 0.45;
    scene.background = new THREE.Color(def.fog.color);
  }

  /** Flickers flames and drifts the fog; `time` in seconds. */
  update(time: number): void {
    if (this.morok) this.morok.uniforms.uTime.value = time;
    for (const l of this.lights) {
      if (l.kind === 'crystal' || l.kind === 'window') continue;
      const f = 1 + 0.07 * Math.sin(time * 9.1 + l.phase) + 0.05 * Math.sin(time * 15.3 + l.phase * 2.1);
      l.light.intensity = l.base * f * (1 - 0.85 * (l.room ? (this.veil.get(l.room) ?? 0) : 0));
    }
  }

  /** Whether anything animates over time (the board may keep drawing slowly for it). */
  get animated(): boolean {
    return !!this.morok || this.lights.length > 0;
  }

  stats(): EnvironmentStats {
    let meshes = 0;
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    return {
      id: this.def?.id ?? '',
      pieces: this.placements.length,
      meshes,
      lights: this.lights.length,
      wisps: this.morok?.mesh.count ?? 0,
      kitPieces: [...this.kitParts.keys()],
      propModels: [...this.propProtos.keys()],
    };
  }

  /** Placements of the current build (for the dev page and tests). */
  pieces(): readonly Placement[] {
    return this.placements;
  }

  // ─── Building ────────────────────────────────────────────────────────────

  private palette(key: MaterialKey): string {
    return this.def?.palette?.[key] ?? PALETTE_DEFAULTS[key];
  }

  private clear(): void {
    this.root.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.materials.clear();
    this.morok = null;
    this.lights = [];
  }

  private rebuild(): void {
    const def = this.def!;
    const layout = this.layout!;
    const q = QUALITY[this.quality];
    this.buildToken++;
    this.clear();

    // Shared uniforms: field texture, fog colours.
    this.field = bakeField(layout, def, q.field);
    writeVeil(this.field, (room) => this.veil.get(room) ?? 0);
    this.fieldTex?.dispose();
    this.fieldTex = fieldTexture(this.field);
    const u = this.uniforms;
    u.uEnvField.value = this.fieldTex;
    u.uEnvRect.value.set(this.field.minX, this.field.minZ, 1 / this.field.size, 1 / this.field.size);
    outputColor(def.fog.color, u.uEnvFog.value);
    outputColor(def.fog.glow ?? def.fog.color, u.uEnvGlow.value);
    outputColor(mixHex(def.fog.color, def.fog.morok, 0.35), u.uEnvVeilColor.value);
    u.uEnvCentreZ.value = layout.centre.z;
    u.uEnvTexScale.value = 1 / (def.ground.scale ?? 2.6);

    this.buildGround(def);
    this.placements = planEnvironment(layout, def, this.quality);
    this.buildPieces(q.shadows);
    this.buildLights(q.lights);
    if (q.wisps > 0) {
      this.morok = new Morok(layout, { color: outputColor(def.fog.morok), opacity: def.fog.morokOpacity, edgeCount: q.wisps, roomDensity: q.roomWisps });
      for (const [room, v] of this.veil) this.morok.setRoomVeil(room, v);
      this.root.add(this.morok.mesh);
      this.disposables.push(this.morok);
    }
    this.onChange();
  }

  private buildGround(def: EnvironmentDef): void {
    const field = this.field!;
    const size = field.size + GROUND_EXTRA;
    const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(field.minX + field.size / 2, 0, field.minZ + field.size / 2);
    const fallback = noiseTexture(def.ground.tint);
    // Low quality: Lambert shading for everything around the board (the ground covers the screen).
    const mat = this.quality === 'low' ? new THREE.MeshLambertMaterial({ map: fallback, color: '#ffffff' }) : new THREE.MeshStandardMaterial({ map: fallback, color: '#ffffff', roughness: 0.95, metalness: 0 });
    patchMaterial(mat, this.uniforms, 'ground');
    this.disposables.push(geo, mat, fallback);
    const url = def.ground.texture ? textureUrl(def.ground.texture, this.quality) : undefined;
    if (url) {
      const token = this.buildToken;
      new THREE.TextureLoader().load(url, (tex) => {
        if (token !== this.buildToken) {
          tex.dispose();
          return;
        }
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.quality === 'low' ? 1 : 4;
        mat.map = tex;
        mat.color.set(def.ground.tint);
        mat.needsUpdate = true;
        this.disposables.push(tex);
        this.onChange();
      });
    }
    const ground = new THREE.Mesh(geo, mat);
    ground.name = 'env:ground';
    ground.receiveShadow = true;
    ground.renderOrder = -1;
    this.root.add(ground);

    if (field.hasWater) {
      const wGeo = new THREE.PlaneGeometry(field.size, field.size).rotateX(-Math.PI / 2).translate(field.minX + field.size / 2, 0.04, field.minZ + field.size / 2);
      const water = { color: def.ground.waterColor ?? '#5e8f9a', transparent: true, opacity: 0.82, depthWrite: false };
      const wMat = this.quality === 'low' ? new THREE.MeshLambertMaterial(water) : new THREE.MeshStandardMaterial({ ...water, roughness: 0.12, metalness: 0.15 });
      patchMaterial(wMat, this.uniforms, 'water');
      this.disposables.push(wGeo, wMat);
      const surface = new THREE.Mesh(wGeo, wMat);
      surface.name = 'env:water';
      surface.receiveShadow = true;
      this.root.add(surface);
    }
  }

  private material(key: MaterialKey | THREE.Material): THREE.Material {
    let m = this.materials.get(key);
    if (m) return m;
    if (typeof key !== 'string') {
      m = key.clone();
    } else if (UNLIT.has(key)) {
      m = new THREE.MeshBasicMaterial({ color: this.palette(key), vertexColors: true });
    } else {
      const lit =
        this.quality === 'low'
          ? new THREE.MeshLambertMaterial({ color: this.palette(key), flatShading: true, vertexColors: true })
          : new THREE.MeshStandardMaterial({ color: this.palette(key), roughness: 0.9, metalness: key === 'iron' ? 0.5 : 0, flatShading: true, vertexColors: true });
      if (key === 'crystal') lit.emissive.set(this.palette('crystal')).multiplyScalar(0.55);
      m = lit;
    }
    patchMaterial(m, this.uniforms, 'prop');
    this.materials.set(key, m);
    this.disposables.push(m);
    return m;
  }

  private partsFor(piece: string, height: number, cache: Map<string, Part[]>): Part[] {
    const kit = this.kitParts.get(piece);
    if (kit) return kit;
    const key = `${piece}@${height.toFixed(2)}`;
    let parts = cache.get(key);
    if (!parts) {
      parts = buildPiece(piece, { height });
      cache.set(key, parts);
    }
    return parts;
  }

  private buildPieces(shadows: boolean): void {
    const rnd = seededRandom(`colours:${this.scenarioId}`);
    const cache = new Map<string, Part[]>();
    const groups = new Map<MaterialKey | THREE.Material, THREE.BufferGeometry[]>();
    const low = this.quality === 'low';
    const place = new THREE.Matrix4();
    const full = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const modelled = new Map<PropPrototype, THREE.Matrix4[]>();
    const blobs: THREE.Matrix4[] = [];
    for (const p of this.placements) {
      const proto = this.propProtos.get(p.piece);
      const meta = pieceMeta(p.piece);
      place.compose(new THREE.Vector3(p.x, 0, p.z), q.setFromAxisAngle(up, p.rot), new THREE.Vector3(p.scale, p.scale, p.scale));
      // Props stand on a soft contact shadow (the far silhouettes in the fog do not need one).
      if (meta?.kind === 'prop' && p.band !== 'far') {
        const r = (proto?.radius ?? meta.radius) * p.scale * 2.5;
        blobs.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.012, p.z), q.setFromAxisAngle(up, p.rot), new THREE.Vector3(r, 1, r)));
      }
      if (proto) {
        let list = modelled.get(proto);
        if (!list) modelled.set(proto, (list = []));
        list.push(place.clone());
      }
      // A prop model keeps only the glowing bits of its placeholder (candle flames).
      const parts = this.partsFor(p.piece, p.height, cache).filter((part) => !proto || (typeof part.material === 'string' && UNLIT.has(part.material) && part.material !== 'shadow'));
      // A painted variation per piece and a darker foot (cheap baked occlusion).
      const tint = 0.86 + rnd() * 0.24;
      for (const part of parts) {
        if (low && part.detail) continue;
        const g = part.geometry.clone();
        g.applyMatrix4(full.multiplyMatrices(place, part.matrix));
        const pos = g.getAttribute('position');
        const colors = new Float32Array(pos.count * 3);
        const lit = typeof part.material !== 'string' || !UNLIT.has(part.material);
        for (let i = 0; i < pos.count; i++) {
          const foot = lit ? 0.6 + 0.4 * Math.min(1, Math.max(0, pos.getY(i) / 0.55)) : 1;
          const c = (lit ? tint : 1) * foot;
          colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
        let list = groups.get(part.material);
        if (!list) groups.set(part.material, (list = []));
        list.push(g);
      }
    }
    for (const parts of cache.values()) for (const part of parts) part.geometry.dispose();
    for (const [key, list] of groups) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.material(key));
      mesh.name = `env:${typeof key === 'string' ? key : key.name || 'kit'}`;
      const lit = typeof key !== 'string' || !UNLIT.has(key);
      mesh.castShadow = shadows && lit;
      mesh.receiveShadow = lit;
      this.disposables.push(merged);
      this.root.add(mesh);
    }
    this.buildModelled(modelled, shadows);
    this.buildBlobs(blobs);
  }

  /** Prop models drawn instanced: one draw call per mesh of each model, wherever it stands. */
  private buildModelled(modelled: Map<PropPrototype, THREE.Matrix4[]>, shadows: boolean): void {
    const m = new THREE.Matrix4();
    for (const [proto, places] of modelled) {
      for (const part of prototypeMeshes(proto)) {
        const mesh = new THREE.InstancedMesh(part.geometry, this.material(part.material), places.length);
        places.forEach((place, i) => mesh.setMatrixAt(i, m.multiplyMatrices(place, part.matrix)));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.name = `env:model:${proto.spec.model}`;
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        this.root.add(mesh);
        this.disposables.push({ dispose: () => mesh.dispose() });
      }
    }
  }

  /** Soft contact shadows under the props, all in one instanced draw call. */
  private buildBlobs(blobs: THREE.Matrix4[]): void {
    if (!blobs.length) return;
    this.blobTexture ??= blobShadowTexture();
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: this.blobTexture, color: '#000000', transparent: true, opacity: 0.55, depthWrite: false });
    patchMaterial(mat, this.uniforms, 'prop');
    const mesh = new THREE.InstancedMesh(geo, mat, blobs.length);
    blobs.forEach((b, i) => mesh.setMatrixAt(i, b));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = 'env:contact-shadows';
    mesh.renderOrder = 0;
    this.root.add(mesh);
    this.disposables.push(geo, mat, { dispose: () => mesh.dispose() });
  }

  /** Loads the prop models the location's table names for its pieces, then rebuilds with them. */
  private loadPropModels(): void {
    const def = this.def!;
    const wanted = new Map<string, Required<PropModelSpec>>();
    for (const p of this.placements) {
      if (wanted.has(p.piece)) continue;
      const meta = pieceMeta(p.piece);
      const spec = meta?.kind === 'prop' || meta?.kind === 'feature' ? propModelFor(def, [p.piece], this.available, meta.height) : null;
      if (spec && def.propModels?.[p.piece]) wanted.set(p.piece, spec);
    }
    if (!wanted.size) return;
    const token = this.buildToken;
    const quality = this.quality;
    void Promise.all([...wanted].map(async ([piece, spec]) => [piece, await loadPropPrototype(spec, quality)] as const)).then((loaded) => {
      if (token !== this.buildToken) return;
      for (const [piece, proto] of loaded) if (proto) this.propProtos.set(piece, proto);
      if (this.propProtos.size) this.rebuild();
    });
  }

  /** Point lights at the brightest-looking light spots, spread over the location. */
  private buildLights(count: number): void {
    const def = this.def!;
    if (count <= 0 || !def.light.point) return;
    const spots: LightSpot[] = [];
    const v = new THREE.Vector3();
    for (const p of this.placements) {
      const l = pieceMeta(p.piece)?.light;
      if (!l) continue;
      v.set(l.x * p.scale, l.y * p.scale, l.z * p.scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      spots.push({ pos: new THREE.Vector3(p.x + v.x, v.y, p.z + v.z), kind: l.kind, room: p.room });
    }
    if (!spots.length) return;
    const c = this.layout!.centre;
    const chosen: LightSpot[] = [];
    // Lanterns (the golden light of hope) first, then the spot nearest the board, then spread out.
    spots.sort((a, b) => (a.kind === 'lantern' ? -1 : 0) - (b.kind === 'lantern' ? -1 : 0) || a.pos.distanceTo(new THREE.Vector3(c.x, 0, c.z)) - b.pos.distanceTo(new THREE.Vector3(c.x, 0, c.z)));
    chosen.push(spots[0]!);
    while (chosen.length < Math.min(count, spots.length)) {
      let best: LightSpot | null = null;
      let bestD = -1;
      for (const s of spots) {
        if (chosen.includes(s)) continue;
        const d = Math.min(...chosen.map((o) => o.pos.distanceTo(s.pos)));
        if (d > bestD) {
          bestD = d;
          best = s;
        }
      }
      if (!best) break;
      chosen.push(best);
    }
    const point = def.light.point;
    chosen.forEach((s, i) => {
      const color = s.kind === 'crystal' ? this.palette('crystal') : s.kind === 'window' && def.edge === 'tower' ? this.palette('glowCold') : point.color;
      const base = point.intensity * (s.kind === 'lantern' ? 1.3 : s.kind === 'crystal' ? 0.7 : 1);
      const light = new THREE.PointLight(color, base, point.distance, 2);
      light.position.copy(s.pos).add(new THREE.Vector3(0, 0.15, 0));
      light.name = `env:light:${s.kind}`;
      this.root.add(light);
      this.lights.push({ light, base, phase: i * 1.7, kind: s.kind, room: s.room });
    });
    this.update(0);
  }

  private applyVeil(): void {
    if (this.field && this.fieldTex) {
      writeVeil(this.field, (room) => this.veil.get(room) ?? 0);
      this.fieldTex.needsUpdate = true;
    }
    if (this.morok) for (const [room, v] of this.veil) this.morok.setRoomVeil(room, v);
  }

  /** Swaps in art-kit pieces that exist for this location (none yet: all procedural). */
  private loadKit(): void {
    const def = this.def!;
    const ids = kitPieces(def.id);
    if (!ids.size) return;
    const token = this.buildToken;
    void Promise.all([...ids].map(async (id) => [id, await loadKitPiece(def.id, id)] as const)).then((loaded) => {
      if (token !== this.buildToken) return;
      for (const [id, parts] of loaded) if (parts?.length) this.kitParts.set(id, parts);
      if (this.kitParts.size) this.rebuild();
    });
  }

  dispose(): void {
    this.buildToken++;
    this.clear();
    this.blobTexture?.dispose();
    this.blobTexture = null;

    for (const g of this.obstacleGeometries) g.dispose();
    this.obstacleGeometries = [];
    this.fieldTex?.dispose();
    this.fieldTex = null;
  }
}

function mixHex(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}
