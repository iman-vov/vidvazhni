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
import type { BoundaryKind, ScenarioDef } from '../../rules/content';
import { hexKey, parseHexKey, type HexKey } from '../../rules/hex';
import { noiseTexture, PLATE_HEIGHT, textureUrl, TEXTURE_WORLD_SIZE } from '../boardTiles';
import { blobShadowTexture } from '../contactShadow';
import { HEX_SIZE, hexToWorld, worldToHex } from '../hexLayout';
import { surfaceTexture } from '../surfaces';
import { listModels } from '../models';
import { loadPropPrototype, propModelFor, prototypeMeshes, type PropPrototype } from '../propModels';
import type { ColorGrade } from '../post';
import type { GraphicsQuality } from '../quality';
import { environmentFor } from './data';
import { bakeField, createUniforms, fieldTexture, outputColor, patchMaterial, sampleField, writeVeil, type EnvUniforms, type Field } from './field';
import { kitPieces, loadKitPiece, loadLocationKit, locationKits } from './kit';
import { buildLayout, seededRandom, type EnvLayout } from './layout';
import { Ambient, type DustVolume, type FireSpot, type FogPatch, type LightBeam, type Weather } from './ambient';
import { atmosphereFor } from './atmosphere';
import { buildAtmosphere, type AtmosphereBuild } from './decals';
import { Morok } from './morok';
import { fireflySpots, Life, lifeCounts, patchSway, patchWater, setWaterLook, SPIN, Spinner, swayFor, tickLife, type SwaySpec } from './life';
import { bakeReliefLight, reliefFromCanvas, reliefTexture } from './relief';
import { gapPartitions, partitions, type Partition } from './walls';
import { planEnvironment, type Placement } from './plan';
import { buildScatter, planScatter, scatterProfile } from './scatter';
import { buildPiece, PALETTE_DEFAULTS, pieceMeta, UNLIT, type MaterialKey, type Part } from './pieces';
import type { EdgeStyle, EnvironmentDef, PropModelSpec } from './types';

export type { EnvironmentDef, PropModelSpec } from './types';
export { environmentFor, ENVIRONMENTS } from './data';

/** Per quality: point lights at candles and lanterns, Морок wisps, wisps per veiled hex, field size. */
const QUALITY: Record<GraphicsQuality, { lights: number; wisps: number; roomWisps: number; field: number; shadows: boolean; flames: number; embers: number; dust: number; fog: number; beam: boolean }> = {
  low: { lights: 0, wisps: 0, roomWisps: 0, field: 112, shadows: false, flames: 4, embers: 1, dust: 0, fog: 0, beam: false },
  medium: { lights: 3, wisps: 14, roomWisps: 0.3, field: 144, shadows: false, flames: 6, embers: 2, dust: 36, fog: 0.45, beam: true },
  high: { lights: 5, wisps: 30, roomWisps: 0.55, field: 176, shadows: true, flames: 8, embers: 3, dust: 60, fog: 0.8, beam: true },
};
/** Share of a location's `weather` particles drawn per quality. */
const WEATHER_SHARE: Record<GraphicsQuality, number> = { low: 0.3, medium: 0.6, high: 1 };

const GROUND_EXTRA = 70;

/** The board's natural boundaries between rooms, by kind (pieces.ts ids; an art kit or a prop
 *  model in the location's `propModels` table can replace them by these ids). */
export const BOUNDARY_PIECES: Record<Exclude<BoundaryKind, 'walls'>, string> = { reeds: 'reed-fence', thicket: 'thicket-hedge', rocks: 'rock-pile', logs: 'log-wall' };
/** Default boundary between rooms for a location edge style. */
const EDGE_BOUNDARY: Record<EdgeStyle, BoundaryKind> = { stone: 'walls', tower: 'walls', timber: 'walls', forest: 'thicket', shore: 'reeds', cave: 'rocks', mine: 'walls', cliff: 'rocks', forge: 'walls' };
/** The map edge style a room boundary stands for (outdoor rooms close with plants, caves with rock). */
const BOUNDARY_EDGE: Record<Exclude<BoundaryKind, 'walls'>, EdgeStyle> = { reeds: 'shore', thicket: 'forest', logs: 'forest', rocks: 'cave' };

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
  rubble: { piece: 'rubble-heap', scale: 1 },
  'mine-cart:stuck': { piece: 'mine-cart', scale: 1 },
  'mine-cart:free': { piece: 'mine-cart', scale: 1 },
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
  private ambient: Ambient | null = null;
  /** Grime, wall dressing and pools of light (decals.ts). */
  private atmosphere: AtmosphereBuild | null = null;
  /** Modelled parts that turn (the mill wheel). */
  private spinners: Spinner[] = [];
  /** Fireflies and falling leaves (life.ts). */
  private life: Life | null = null;
  /** Materials bending in the wind, by base material and sway; the set marks them as built. */
  private swayMats = new Map<string, THREE.Material>();
  private swayed = new Set<THREE.Material>();
  /** Unlit flame and glow materials with their base colour (they flicker with the lights). */
  private flicker: { material: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  private lights: { light: THREE.PointLight; base: number; phase: number; kind: LightSpot['kind']; room: string | null }[] = [];
  private placements: Placement[] = [];
  /** Hexes with an obstacle, door, object or trap: the small-things layer keeps off them. */
  private busy = new Set<HexKey>();
  private kitParts = new Map<string, Part[]>();
  /** Prop models that loaded for pieces of this location, by piece id. */
  private propProtos = new Map<string, PropPrototype>();
  private readonly available = new Set(listModels());
  private blobTexture: THREE.Texture | null = null;
  private readonly veil = new Map<string, number>();
  private obstacleGeometries: THREE.BufferGeometry[] = [];
  /** Which set piece stands on each scenario obstacle hex (see `obstacles` in the location data). */
  private obstacleLooks = new Map<HexKey, string>();
  private partitionLines: Partition[] = [];
  private buildToken = 0;
  /** Bumped when the scenario or quality changes: kit and prop-model loads for an older one are dropped. */
  private loadToken = 0;

  constructor(quality: GraphicsQuality) {
    this.quality = quality;
    this.root.name = 'environment';
    // The location's floor is the board's floor: everything stands on the hexes' level.
    this.root.position.y = PLATE_HEIGHT;
  }

  /** Builds the location for a scenario (all its rooms); rooms in `revealed` are clear of the veil.
   *  Does nothing when the scenario and quality are the ones already built. */
  build(scenario: ScenarioDef, revealed: readonly string[]): void {
    if (this.scenarioId === scenario.id && this.layout) {
      this.setRevealed(revealed);
      return;
    }
    this.scenarioId = scenario.id;
    this.def = withRoomEdges(environmentFor(scenario.id), scenario);
    this.obstacleLooks = assignObstacleLooks(scenario, this.def);
    this.layout = buildLayout(scenario);
    this.busy = busyHexes(scenario);
    this.partitionLines = scenarioPartitions(this.layout, scenario);
    this.veil.clear();
    for (const room of scenario.rooms) this.veil.set(room.id, revealed.includes(room.id) ? 0 : 1);
    this.kitParts.clear();
    this.propProtos.clear();
    this.loadToken++;
    this.rebuild();
    this.loadKit();
    this.loadPropModels();
  }

  setQuality(q: GraphicsQuality): void {
    if (q === this.quality) return;
    this.quality = q;
    if (!this.layout) return;
    this.loadToken++;
    this.propProtos.clear();
    this.rebuild();
    this.loadKit();
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

  /** The walls between rooms as straight runs from outer wall to outer wall (see walls.ts). */
  partitions(): readonly Partition[] {
    return this.partitionLines;
  }

  /** The set piece shown on an obstacle hex: the location's pick for that hex, else the model. */
  obstacleLook(model: string, hex: HexKey): string {
    return this.obstacleLooks.get(hex) ?? model;
  }

  /** A stand-in for a scenario obstacle model (tree, rock, pillar, bed, table, hut) or a scenario
   *  object (`brazier:lit`, `lever:down`, `millstone`) in the location's colours, standing on its
   *  own origin; null for what the tile layer draws itself. */
  makeObstacle(model: string): THREE.Object3D | null {
    const spec = OBSTACLE_PIECES[model] ?? (pieceMeta(model)?.kind === 'prop' ? { piece: model, scale: 1 } : undefined);
    if (!spec || !this.def) return null;
    const group = this.makePiece(spec.piece);
    if (!group) return null;
    group.name = `obstacle:${spec.piece}`;
    group.scale.setScalar(spec.scale);
    return group;
  }

  /** A piece in the location's colours standing on its own origin, one mesh per part (so a door
   *  body can move its parts, rubble its stones); null for an unknown id. */
  makePiece(piece: string): THREE.Group | null {
    if (!this.def || !pieceMeta(piece)) return null;
    const group = new THREE.Group();
    group.name = `piece:${piece}`;
    for (const part of this.kitParts.get(piece) ?? buildPiece(piece, { height: pieceMeta(piece)?.height ?? 1 })) {
      if (this.quality === 'low' && part.detail) continue;
      const g = this.kitParts.has(piece) ? part.geometry.clone() : part.geometry;
      const pos = g.getAttribute('position');
      if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
      const mesh = new THREE.Mesh(g, this.material(part.material));
      mesh.applyMatrix4(part.matrix);
      group.add(mesh);
      this.obstacleGeometries.push(g);
    }
    return group;
  }

  /** How thin walls between rooms look where the room data does not say: the location's
   *  `boundary`, else masonry for walled edges, thicket, reeds or rock piles outdoors and in caves. */
  get defaultBoundary(): BoundaryKind {
    const def = this.def;
    if (def?.boundary) return def.boundary;
    return def ? EDGE_BOUNDARY[def.edge] : 'walls';
  }

  /**
   * A natural boundary (reeds, thicket, rocks, logs) standing on the given edge frames (origin on
   * the edge at plate height, X along it), merged into one mesh per material; `low` for the low
   * kerbs toward rooms not revealed yet. When the location maps the boundary's piece to a prop
   * model that exists, the model replaces it, instanced, once it loads. `dispose()` frees it.
   */
  boundary(kind: Exclude<BoundaryKind, 'walls'>, frames: THREE.Matrix4[], low: boolean): THREE.Object3D & { dispose(): void } {
    const piece = BOUNDARY_PIECES[kind];
    const meta = pieceMeta(piece)!;
    const owned: { dispose(): void }[] = [];
    const group = Object.assign(new THREE.Group(), { dispose: () => owned.forEach((d) => d.dispose()) });
    group.name = `boundary:${kind}${low ? ':low' : ''}`;
    const squash = new THREE.Matrix4().makeScale(1, low ? 0.45 : 1, 1);
    const groups = new Map<MaterialKey | THREE.Material, THREE.BufferGeometry[]>();
    const full = new THREE.Matrix4();
    const parts = this.kitParts.get(piece) ?? buildPiece(piece, { height: meta.height });
    frames.forEach((frame, i) => {
      // Turn every other segment round, so a run of them does not look stamped.
      const flip = new THREE.Matrix4().makeRotationY(i % 2 ? Math.PI : 0);
      for (const part of parts) {
        if (this.quality === 'low' && part.detail) continue;
        const g = part.geometry.clone();
        g.applyMatrix4(full.multiplyMatrices(frame, squash).multiply(flip).multiply(part.matrix));
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
        const n = g.getAttribute('position').count;
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.92 + 0.16 * ((i * 7) % 3) / 2), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        let list = groups.get(part.material);
        if (!list) groups.set(part.material, (list = []));
        list.push(g);
      }
    });
    if (!this.kitParts.has(piece)) for (const part of parts) part.geometry.dispose();
    for (const [key, list] of groups) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      owned.push(merged);
      const sway = swayFor(piece, key);
      const mesh = new THREE.Mesh(merged, sway ? this.swayMaterial(key, sway) : this.material(key));
      mesh.receiveShadow = true;
      mesh.castShadow = QUALITY[this.quality].shadows;
      group.add(mesh);
    }
    // A prop model for the boundary (a reed wall from the art kit) replaces it, stretched to the edge.
    const spec = this.def ? propModelFor(this.def, [piece], this.available, meta.height) : null;
    if (spec && this.def?.propModels?.[piece]) {
      void loadPropPrototype(spec, this.quality).then((proto) => {
        if (!proto || !group.parent) return;
        const fit = new THREE.Matrix4().makeScale(Math.min(3, 1.06 / Math.max(0.05, proto.radius * 2)), 1, 1);
        const m = new THREE.Matrix4();
        for (const c of [...group.children]) group.remove(c);
        for (const part of prototypeMeshes(proto)) {
          const mesh = new THREE.InstancedMesh(part.geometry, this.material(part.material), frames.length);
          frames.forEach((frame, i) => mesh.setMatrixAt(i, m.multiplyMatrices(frame, squash).multiply(fit).multiply(part.matrix)));
          mesh.computeBoundingSphere();
          mesh.receiveShadow = true;
          owned.push({ dispose: () => mesh.dispose() });
          group.add(mesh);
        }
        this.onChange();
      });
    }
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

  /** The location's colour grade and vignette (post.ts, medium and high). */
  get grade(): ColorGrade {
    return atmosphereFor(this.def?.id).grade;
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
    const life = tickLife(time);
    for (const s of this.spinners) s.update(life);
    this.life?.update(life);
    if (this.morok) this.morok.uniforms.uTime.value = time;
    this.ambient?.update(time);
    this.atmosphere?.update(time);
    const glow = 1 + 0.06 * Math.sin(time * 8.3) + 0.04 * Math.sin(time * 13.7 + 1.3);
    for (const f of this.flicker) f.material.color.copy(f.base).multiplyScalar(glow);
    for (const l of this.lights) {
      if (l.kind === 'crystal' || l.kind === 'window') continue;
      const f = 1 + 0.07 * Math.sin(time * 9.1 + l.phase) + 0.05 * Math.sin(time * 15.3 + l.phase * 2.1);
      l.light.intensity = l.base * f * (1 - 0.85 * (l.room ? (this.veil.get(l.room) ?? 0) : 0));
    }
  }

  /** Whether anything animates over time (the board may keep drawing slowly for it). */
  get animated(): boolean {
    return !!this.morok || this.lights.length > 0 || !!this.ambient || this.spinners.length > 0 || !!this.life;
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
    this.ambient = null;
    this.atmosphere = null;
    this.spinners = [];
    this.life = null;
    this.swayMats.clear();
    this.swayed.clear();
    this.flicker = [];
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
    u.uEnvTexScale.value = 1 / (def.surface ? TEXTURE_WORLD_SIZE : (def.ground.scale ?? 2.6));
    setWaterLook(outputColor(def.light.sky), waterFlow(layout), def.ground.waterFlow === 'flowing');

    this.buildGround(def);
    this.placements = planEnvironment(layout, def, this.quality, this.partitionLines.map((p) => p.points));
    this.buildPieces(q.shadows);
    this.buildScatter();
    this.buildLights(q.lights);
    this.buildAtmosphere();
    if (q.wisps > 0) {
      this.morok = new Morok(layout, { color: outputColor(def.fog.morok), opacity: def.fog.morokOpacity, edgeCount: q.wisps, roomDensity: q.roomWisps });
      for (const [room, v] of this.veil) this.morok.setRoomVeil(room, v);
      this.root.add(this.morok.mesh);
      this.disposables.push(this.morok);
    }
    this.buildAmbient();
    this.buildLife();
    this.onChange();
  }

  private buildGround(def: EnvironmentDef): void {
    const field = this.field!;
    const size = field.size + GROUND_EXTRA;
    const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(field.minX + field.size / 2, 0, field.minZ + field.size / 2);
    // One continuous floor: the location's hex surface (seamless, world UVs) runs from under the
    // grid to the walls; locations without one keep their own ground texture, tinted.
    // Its relief comes from the painted surface (relief.ts): normals, cavities and wear on medium and
    // high (parallax too on high); on low the light is baked into the colour instead.
    const low = this.quality === 'low';
    const token = this.buildToken;
    let relief: THREE.DataTexture | null = null;
    const onDraw = (canvas: HTMLCanvasElement) => {
      if (token !== this.buildToken) return;
      const r = reliefFromCanvas(canvas);
      if (low) return bakeReliefLight(canvas, r);
      relief?.dispose();
      relief = reliefTexture(r);
      this.uniforms.uEnvRelief.value = relief;
      this.uniforms.uEnvReliefStrength.value = 1.6;
    };
    const floor = def.surface ? surfaceTexture(def.surface, this.quality, textureUrl, () => this.onChange(), onDraw) : null;
    const fallback = floor ?? noiseTexture(def.ground.tint);
    // Low quality: Lambert shading for everything around the board (the ground covers the screen).
    const mat = low ? new THREE.MeshLambertMaterial({ map: fallback, color: '#ffffff' }) : new THREE.MeshStandardMaterial({ map: fallback, color: '#ffffff', roughness: 0.95, metalness: 0 });
    if (floor && !low) mat.defines = { ENV_RELIEF: '', ...(this.quality === 'high' ? { ENV_PARALLAX: '' } : {}) };
    patchMaterial(mat, this.uniforms, 'ground');
    this.disposables.push({ dispose: () => relief?.dispose() });
    this.disposables.push(geo, mat, fallback);
    const url = !floor && def.ground.texture ? textureUrl(def.ground.texture, this.quality) : undefined;
    if (url) {
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
      patchWater(wMat, 'env', this.quality !== 'low');
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
      const basic = new THREE.MeshBasicMaterial({ color: this.palette(key), vertexColors: true });
      if (key === 'flame' || key === 'glow' || key === 'ember') this.flicker.push({ material: basic, base: basic.color.clone() });
      m = basic;
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
    const euler = new THREE.Euler();
    const blobs: THREE.Matrix4[] = [];
    for (const p of this.placements) {
      const proto = this.propProtos.get(p.piece);
      const meta = pieceMeta(p.piece);
      q.setFromEuler(euler.set(p.tilt?.[0] ?? 0, p.rot, p.tilt?.[1] ?? 0, 'YXZ'));
      place.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), q, new THREE.Vector3(p.scale * (p.sx ?? 1), p.scale, p.scale));
      // Props stand on a soft contact shadow (not one stacked on another, nor the far silhouettes).
      if (meta?.kind === 'prop' && p.band !== 'far' && !p.y) {
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
        // Reeds, grass and banners bend in the wind: their parts go to a swaying material.
        const sway = swayFor(p.piece, part.material);
        const key = sway ? this.swayMaterial(part.material, sway) : part.material;
        let list = groups.get(key);
        if (!list) groups.set(key, (list = []));
        list.push(g);
      }
    }
    for (const parts of cache.values()) for (const part of parts) part.geometry.dispose();
    for (const [key, list] of groups) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, typeof key !== 'string' && this.swayed.has(key) ? key : this.material(key));
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

  /** A material bending in the wind (life.ts) for the swaying parts of plants and banners. */
  private swayMaterial(key: MaterialKey | THREE.Material, spec: SwaySpec): THREE.Material {
    const id = `${typeof key === 'string' ? key : key.uuid}|${spec.amp}|${spec.cloth ? 1 : 0}`;
    let m = this.swayMats.get(id);
    if (!m) {
      m = this.material(key).clone();
      patchMaterial(m, this.uniforms, 'prop');
      patchSway(m, spec);
      this.swayMats.set(id, m);
      this.swayed.add(m);
      this.disposables.push(m);
    }
    return m;
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
        const spin = SPIN[proto.spec.model];
        if (spin) this.spinners.push(new Spinner(mesh, places, part.matrix, spin));
        // Modelled props are few and instanced: they cast shadows wherever figures do.
        mesh.castShadow = shadows || this.quality !== 'low';
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
    const token = this.loadToken;
    const quality = this.quality;
    void Promise.all([...wanted].map(async ([piece, spec]) => [piece, await loadPropPrototype(spec, quality)] as const)).then((loaded) => {
      if (token !== this.loadToken) return;
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

  /** Pebbles, tufts, candle stubs, bones, ore… in clumps over the floor (see scatter.ts). */
  private buildScatter(): void {
    const def = this.def!;
    const spots = planScatter({
      layout: this.layout!,
      profile: scatterProfile(def.id, def.edge),
      quality: this.quality,
      busy: this.busy,
      placements: this.placements,
      partitions: this.partitionLines.map((p) => p.points),
    });
    const built = buildScatter(spots, (key, sway) => (sway ? this.swayMaterial(key, { amp: sway }) : this.material(key)));
    this.root.add(built.root);
    this.disposables.push(built);
  }

  /** Dirt on the floor, dressing on the walls, warm pools under the flames (see decals.ts). */
  private buildAtmosphere(): void {
    this.atmosphere = buildAtmosphere({
      layout: this.layout!,
      def: this.def!,
      quality: this.quality,
      placements: this.placements,
      partitions: this.partitionLines.map((p) => p.points),
      uniforms: this.uniforms,
      material: (key) => this.material(key),
    });
    this.root.add(this.atmosphere.root);
    this.disposables.push(this.atmosphere);
  }

  /** Fire over every flame, dust in the light of the point lights and the entrance beam, low fog
   *  along the walls (see ambient.ts); the amounts follow the quality. */
  private buildAmbient(): void {
    const def = this.def!;
    const layout = this.layout!;
    const q = QUALITY[this.quality];
    const up = new THREE.Vector3(0, 1, 0);
    const fires: FireSpot[] = [];
    let beam: LightBeam | null = null;
    for (const p of this.placements) {
      const l = pieceMeta(p.piece)?.light;
      if (l && (l.kind === 'flame' || l.kind === 'lantern')) {
        const v = new THREE.Vector3(l.x * p.scale, l.y * p.scale, l.z * p.scale).applyAxisAngle(up, p.rot);
        // A prop model's bowl may stand taller than the placeholder's: the fire burns on its rim.
        const proto = this.propProtos.get(p.piece);
        if (proto && l.kind === 'lantern') v.y = Math.max(v.y, proto.spec.height * p.scale - 0.06);
        fires.push({ pos: new THREE.Vector3(p.x + v.x, v.y, p.z + v.z), size: (l.fire ?? (l.kind === 'lantern' ? 1.3 : 0.8)) * p.scale, room: p.room });
      }
      if (q.beam && p.band === 'feature' && p.piece === 'stairs') {
        // Light from the tavern falls down the stairs onto the cellar floor.
        const dx = Math.sin(p.rot);
        const dz = Math.cos(p.rot);
        beam = { top: new THREE.Vector3(p.x - dx * 1.3, 3.4, p.z - dz * 1.3), bottom: new THREE.Vector3(p.x + dx * 0.7, 0, p.z + dz * 0.7), radius: 0.85 };
      }
    }
    const dust: DustVolume[] = this.lights.map((l) => ({ pos: l.light.position.clone().setY(Math.max(0.6, l.light.position.y - 0.2)), radius: 0.95, height: 1.1, count: q.dust, room: l.room }));
    if (beam) dust.push({ pos: beam.top.clone().lerp(beam.bottom, 0.6), radius: 0.5, height: 1.8, count: q.dust, room: null });
    const fog: FogPatch[] = [];
    if (q.fog > 0) {
      const rnd = seededRandom(`low-fog:${layout.scenarioId}`);
      for (const [k, room] of [...layout.ring].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (rnd() > q.fog) continue;
        const [hq, hr] = parseHexKey(k);
        const c = hexToWorld(hq, hr);
        fog.push({ x: c.x + (rnd() - 0.5) * 0.6, z: c.z + (rnd() - 0.5) * 0.6, size: 1.8 + rnd() * 1.2, room });
      }
    }
    let weather: Weather | null = null;
    if (def.weather) {
      const min = new THREE.Vector2(Infinity, Infinity);
      const max = new THREE.Vector2(-Infinity, -Infinity);
      for (const k of layout.footprint.keys()) {
        const [hq, hr] = parseHexKey(k);
        const c = hexToWorld(hq, hr);
        min.min(new THREE.Vector2(c.x, c.z));
        max.max(new THREE.Vector2(c.x, c.z));
      }
      const w = def.weather;
      weather = {
        kind: w.kind,
        count: Math.round(w.count * WEATHER_SHARE[this.quality]),
        color: outputColor(w.color),
        wind: w.wind,
        min: min.subScalar(2.5),
        max: max.addScalar(2.5),
        height: w.kind === 'dust' ? 2.2 : 3.2,
      };
    }
    const ambient = new Ambient({
      fires,
      flames: q.flames,
      embers: q.embers,
      dust,
      fog,
      beam,
      weather,
      fogColor: outputColor(mixHex(def.fog.morok, def.light.sun, 0.3)),
      rooms: [...this.veil.keys()],
    });
    if (ambient.empty) return;
    for (const [room, v] of this.veil) ambient.setRoomVeil(room, v);
    this.ambient = ambient;
    this.root.add(ambient.root);
    this.disposables.push(ambient);
  }

  /** Fireflies over the marsh (over the water, out of the fog) and leaves falling on the forest
   *  path, by location and quality (life.ts). */
  private buildLife(): void {
    const layout = this.layout!;
    const n = lifeCounts(this.def?.id, this.quality);
    if (!n.fireflies && !n.leaves) return;
    const min = new THREE.Vector2(layout.min.x - 3, layout.min.z - 3);
    const max = new THREE.Vector2(layout.max.x + 3, layout.max.z + 3);
    const field = this.field;
    const accept = (x: number, z: number): number => {
      if (!field) return 1;
      const clear = 1 - sampleField(field, x, z, 0);
      return field.hasWater ? clear * (0.2 + 0.8 * sampleField(field, x, z, 2)) : clear;
    };
    const life = new Life({
      fireflies: n.fireflies ? fireflySpots(n.fireflies, { min, max }, accept) : [],
      leaves: n.leaves ? { min: min.clone().addScalar(1), max: max.clone().subScalar(1), count: n.leaves } : null,
    });
    if (life.empty) return;
    this.life = life;
    this.root.add(life.root);
    this.disposables.push(life);
  }

  private applyVeil(): void {
    if (this.field && this.fieldTex) {
      writeVeil(this.field, (room) => this.veil.get(room) ?? 0);
      this.fieldTex.needsUpdate = true;
    }
    if (this.morok) for (const [room, v] of this.veil) this.morok.setRoomVeil(room, v);
    if (this.ambient) for (const [room, v] of this.veil) this.ambient.setRoomVeil(room, v);
  }

  /** Swaps in art-kit pieces that exist for this location (none yet: all procedural). */
  /** Swaps in art-kit pieces: the location's Blender kit (`env-<id>` model, plus kits it borrows
   *  from), then single-piece GLBs in assets/environment, which win. */
  private loadKit(): void {
    const def = this.def!;
    const ids = kitPieces(def.id);
    const kits = locationKits(def.id, def.kits);
    if (!ids.size && !kits.length) return;
    const token = this.loadToken;
    const quality = this.quality;
    void (async () => {
      const found = new Map<string, Part[]>();
      // Borrowed kits first, so the location's own pieces win where both have one.
      for (const kit of [...kits].reverse()) for (const [id, parts] of await loadLocationKit(kit, quality)) found.set(id, parts);
      for (const id of ids) {
        const parts = await loadKitPiece(def.id, id);
        if (parts?.length) found.set(id, parts);
      }
      if (token !== this.loadToken || !found.size) return;
      this.kitParts = found;
      this.rebuild();
      // Tile props built from pieces (obstacles, door bodies) pick the kit up on the next sync.
      this.onKit();
    })();
  }

  /** Called when kit pieces arrived (the board rebuilds its tile props from them). */
  onKit: () => void = () => {};

  dispose(): void {
    this.buildToken++;
    this.loadToken++;
    this.clear();
    this.blobTexture?.dispose();
    this.blobTexture = null;

    for (const g of this.obstacleGeometries) g.dispose();
    this.obstacleGeometries = [];
    this.fieldTex?.dispose();
    this.fieldTex = null;
  }
}

/**
 * The location with each room's map edge following the room's `boundary` where the location does
 * not set it: an outdoor room inside a walled location closes with reeds or thicket, an indoor room
 * (boundary `walls`) in an outdoor location with timber walls.
 */
export function withRoomEdges(def: EnvironmentDef, scenario: ScenarioDef): EnvironmentDef {
  const rooms: Record<string, { edge: EdgeStyle }> = {};
  const indoor = def.edge === 'stone' || def.edge === 'tower' || def.edge === 'timber' || def.edge === 'mine' || def.edge === 'forge';
  for (const room of scenario.rooms) {
    const b = room.boundary;
    if (!b || def.rooms?.[room.id]) continue;
    if (b === 'walls') {
      if (!indoor) rooms[room.id] = { edge: 'timber' };
    } else if (BOUNDARY_EDGE[b] !== def.edge) rooms[room.id] = { edge: BOUNDARY_EDGE[b] };
  }
  return Object.keys(rooms).length ? { ...def, rooms: { ...rooms, ...def.rooms } } : def;
}

/** The scenario's walls between rooms as partitions over the location's outline. */
/** Hexes that have something on them in the scenario data (obstacles, doors, objects, traps…). */
export function busyHexes(scenario: ScenarioDef): Set<HexKey> {
  const out = new Set<HexKey>();
  for (const room of scenario.rooms) {
    for (const value of Object.values(room)) {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        const hex = (item as { hex?: unknown } | null)?.hex;
        if (Array.isArray(hex) && hex.length === 2 && hex.every((n) => typeof n === 'number')) out.add(hexKey(hex as [number, number]));
      }
    }
  }
  return out;
}

export function scenarioPartitions(layout: EnvLayout, scenario: ScenarioDef): Partition[] {
  const walls = scenario.rooms.flatMap((room) =>
    (room.walls ?? []).map(([a, b]) => ({ a, b, rooms: [...new Set([room.id, layout.footprint.get(hexKey(a)), layout.footprint.get(hexKey(b))].filter((r): r is string => !!r))] })),
  );
  const centre = (q: number, r: number) => hexToWorld(q, r);
  const at = (x: number, z: number) => hexKey(worldToHex(x, z));
  const doors = scenario.rooms.flatMap((room) => (room.doors ?? []).map((d) => ({ hex: d.hex, room: room.id, to: d.to })));
  return [...partitions(layout, walls, centre, at, HEX_SIZE), ...gapPartitions(layout, doors, centre, at, HEX_SIZE)];
}

/**
 * A set piece for every scenario obstacle whose model the location lists (`obstacles`), by a seeded
 * random per hex, never the same as an obstacle within two hexes that already has one when the
 * list allows it.
 */
export function assignObstacleLooks(scenario: ScenarioDef, def: Pick<EnvironmentDef, 'id' | 'obstacles'>): Map<HexKey, string> {
  const out = new Map<HexKey, string>();
  if (!def.obstacles) return out;
  const all = scenario.rooms.flatMap((r) => r.obstacles ?? []).filter((o) => o.model && def.obstacles![o.model]?.length);
  all.sort((a, b) => a.hex[0] - b.hex[0] || a.hex[1] - b.hex[1]);
  for (const o of all) {
    const list = def.obstacles[o.model!]!;
    const rnd = seededRandom(`${def.id}:${scenario.id}:${o.hex[0]},${o.hex[1]}`);
    const order = list.map((look) => ({ look, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.look);
    const near = new Set<string>();
    for (const [k, look] of out) {
      const [q, r] = parseHexKey(k);
      const dq = q - o.hex[0];
      const dr = r - o.hex[1];
      if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= 2) near.add(look);
    }
    out.set(hexKey(o.hex), order.find((l) => !near.has(l)) ?? order[0]!);
  }
  return out;
}

function mixHex(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

/** Where flowing water drifts: from the entrance into the location (down a mill race), 0.12 units/s. */
function waterFlow(layout: EnvLayout): THREE.Vector2 {
  const e = layout.edges.find((x) => x.door === 'entrance');
  const v = e ? new THREE.Vector2(layout.centre.x - (e.ax + e.bx) / 2, layout.centre.z - (e.az + e.bz) / 2) : new THREE.Vector2(0.8, 0.4);
  return v.lengthSq() > 1e-6 ? v.normalize().multiplyScalar(0.12) : v.set(0.1, 0.05);
}
