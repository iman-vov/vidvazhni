// The board's ground: the hex grid of revealed rooms drawn as thin lines over the location's one
// continuous floor (the environment's ground), floor patches where a room's surface differs, terrain
// painted over hexes, thin walls and low edge kerbs, and the
// things that stand on tiles (barrels, doors, traps, coins, chests, scenario objects). Each room is
// its own group, so a room being revealed can rise out of the dark. Props use the prop models from
// assets/models when they exist (by the location's `propModels` table: barrel, chest, bear-trap,
// dungeon-door, brazier, floor-lever, rune-stone…) and the location's painted pieces otherwise,
// turned and sized a little differently per hex, each standing on a soft contact shadow.

import * as THREE from 'three';
import type { BoundaryKind, Content, DoorKind, SurfaceId } from '../rules/content';
import { hexKey as rulesHexKey, neighbors, parseHexKey, type Hex, type HexKey } from '../rules/hex';
import type { GameState, Tile } from '../rules/state';
import { blobShadowTexture } from './contactShadow';
import { HEX_SIZE, hexToWorld } from './hexLayout';
import { listModels } from './models';
import { hexVariation, loadPropPrototype, propModelFor, type PropPrototype } from './propModels';
import type { GraphicsQuality } from './quality';
import type { PropModelSpec } from './environment/types';
import { surfaceOf, surfaceRoughness, surfaceTexture, terrainOverlayTexture } from './surfaces';

export const PLATE_HEIGHT = 0.22 * HEX_SIZE;
const WALL_HEIGHT = 0.62;
const WALL_THICK = 0.14;
const KERB_HEIGHT = 0.26;
const KERB_THICK = 0.2;
/** World units per texture repeat on the plate tops (UVs come from world XZ, so stones run across hexes). */
export const TEXTURE_WORLD_SIZE = 2.6;

type Overlay = 'difficult' | 'hazardous' | 'water';
const OVERLAYS: readonly Overlay[] = ['difficult', 'hazardous', 'water'];
/** Height of each terrain overlay above the plate's base (water lies a little under the others). */
const OVERLAY_Y: Record<Overlay, number> = { difficult: PLATE_HEIGHT + 0.004, hazardous: PLATE_HEIGHT + 0.005, water: PLATE_HEIGHT + 0.003 };
/** Floor patches (a room whose surface differs from the location's) and the grid lines above them. */
const PATCH_Y = PLATE_HEIGHT + 0.002;
const GRID_Y = PLATE_HEIGHT + 0.007;

/** A flat hex fan whose `aRim` runs from 0 at the centre to 1 on the rim (the hex distance from the
 *  centre), so the grid shader can draw the outline at an even width. */
function gridHexGeometry(radius: number): THREE.BufferGeometry {
  const pos = [0, 0, 0];
  const rim = [0];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    rim.push(1);
  }
  const index: number[] = [];
  for (let i = 0; i < 6; i++) index.push(0, 1 + ((i + 1) % 6), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRim', new THREE.Float32BufferAttribute(rim, 1));
  g.setIndex(index);
  return g;
}

/** The grid: crisp thin rim lines and a very faint fill, transparent over the floor. */
function gridMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color('#fff2d2') } },
    vertexShader: `
      attribute float aRim;
      varying float vRim;
      void main() {
        vRim = aRim;
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vRim;
      void main() {
        float w = fwidth(vRim);
        float line = smoothstep(1.0 - 0.03 - w, 1.0 - 0.03 + w * 0.5, vRim);
        float fill = 0.035 + 0.05 * pow(vRim, 6.0);
        gl_FragColor = vec4(uColor, max(line * 0.78, fill));
      }`,
  });
}

const TEXTURE_URLS = import.meta.glob<string>('/assets/textures/*.webp', { query: '?url', import: 'default', eager: true });

/** Prop heights in world units when a prop model is used and the location's table gives none. */
const PROP_HEIGHT: Record<string, number> = { barrel: 0.95, crate: 0.8, chest: 0.6, trap: 0.18, door: 0.98 };
/** Contact shadow radius under props that stand on a hex. */
const PROP_SHADOW_RADIUS: Record<string, number> = { obstacle: 0.48, object: 0.42, chest: 0.42 };

export function textureUrl(name: string, quality: GraphicsQuality): string | undefined {
  const size = quality === 'low' ? 512 : 1024;
  return TEXTURE_URLS[`/assets/textures/${name}.${size}.webp`] ?? TEXTURE_URLS[`/assets/textures/${name}.512.webp`];
}

/** A soft noise texture for when an image is missing (keeps the painted look, costs nothing). */
export function noiseTexture(color: string): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 3 + rnd() * 10;
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + rnd() * 0.06})`;
    for (const [dx, dy] of [[0, 0], [size, 0], [0, size], [-size, 0], [0, -size]] as const) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Three courses of dressed stone with mortar seams, light in the middle and darker at the edges,
 * for one wall face (a unit box's face UVs run 0..1 over each wall segment).
 */
function stoneBlockTexture(): THREE.Texture {
  const w = 256;
  const h = 160;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6e665e';
  ctx.fillRect(0, 0, w, h);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = 3;
  const rowH = h / rows;
  for (let row = 0; row < rows; row++) {
    let x = row % 2 ? -rnd() * 50 : -rnd() * 20;
    while (x < w) {
      const bw = 62 + rnd() * 40;
      const shade = 200 + Math.floor(rnd() * 45);
      const g = ctx.createLinearGradient(0, row * rowH, 0, (row + 1) * rowH);
      g.addColorStop(0, `rgb(${shade + 10},${shade + 8},${shade + 4})`);
      g.addColorStop(1, `rgb(${shade - 28},${shade - 30},${shade - 32})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x + 3, row * rowH + 3, bw - 6, rowH - 6, 6);
      ctx.fill();
      // A few chips and stains.
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '40,30,20'},0.08)`;
        ctx.beginPath();
        ctx.arc(x + 8 + rnd() * (bw - 16), row * rowH + 8 + rnd() * (rowH - 16), 3 + rnd() * 7, 0, Math.PI * 2);
        ctx.fill();
      }
      x += bw;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** MeshStandardMaterial that samples its map at world XZ instead of mesh UVs. */

function worldUvMaterial(map: THREE.Texture, tint: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBvUv;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 bvWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        bvWorld = instanceMatrix * bvWorld;
        #endif
        bvWorld = modelMatrix * bvWorld;
        vBvUv = bvWorld.xz * ${(1 / TEXTURE_WORLD_SIZE).toFixed(4)};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBvUv;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
        diffuseColor *= texture2D(map, vBvUv);
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'bv-world-uv';
  return m;
}

interface RoomView {
  id: string;
  group: THREE.Group;
  /** Floor patches by surface, the grid, then the terrain overlays (all flat, instanced by hex). */
  plates: THREE.InstancedMesh[];
  /** Per plate mesh: the hexes in instance order, its rest height and its material key. */
  plateHexes: Hex[][];
  plateY: number[];
  plateKeys: string[];
  /** Thin walls (or natural boundaries) and kerbs of the room, rebuilt when rooms change. */
  edges: THREE.Group | null;
  edgeDisposables: { dispose(): void }[];
  props: THREE.Group;
}

export interface PropView {
  key: string;
  object: THREE.Group;
  room: string;
  /** For doors: how it looks and opens, and whether it is open now. */
  doorKind?: DoorKind;
  open?: boolean;
  /** A door's swinging panel (door) or wings (gate). */
  panel?: THREE.Object3D;
  wings?: THREE.Object3D[];
  /** What moves when a barricade, brush, log, rubble or cart door opens (or a prop breaks). */
  body?: THREE.Group;
  /** For chests: the lid. */
  lid?: THREE.Object3D;
}

/** Door look where the scenario does not say: by the boundary of the rooms it joins. */
export const DOOR_FOR_BOUNDARY: Record<BoundaryKind, DoorKind> = { walls: 'door', reeds: 'barricade', thicket: 'brush', logs: 'log', rocks: 'rubble' };
/** The piece (pieces.ts id, also the art-kit / prop-model key) that a door body is made of. */
export const DOOR_PIECES: Partial<Record<DoorKind, string>> = { barricade: 'barricade', brush: 'brush-pile', log: 'fallen-log', rubble: 'rubble-heap', minecart: 'mine-cart' };
/** Seconds a door takes to open. */
export const DOOR_SECONDS: Record<DoorKind, number> = { door: 0.35, gate: 0.45, barricade: 0.6, brush: 0.5, log: 0.6, rubble: 0.7, minecart: 0.8 };

/**
 * A door's pose at t = 0 (closed) .. 1 (open): a door or gate swings, a barricade slides aside and
 * tips over, brush is shoved aside and flattened, a log swings round on its root, rubble crumbles
 * into a low scatter, a mine cart rolls away along its rails. Local X runs along the edge, +Z into
 * the room the door leads to.
 */
export function doorPose(p: Pick<PropView, 'doorKind' | 'panel' | 'wings' | 'body'>, t: number): void {
  const e = t * t * (3 - 2 * t);
  const body = p.body;
  switch (p.doorKind ?? 'door') {
    case 'door':
      if (p.panel) p.panel.rotation.y = e * THREE.MathUtils.degToRad(-105);
      return;
    case 'gate':
      p.wings?.forEach((w, i) => (w.rotation.y = (i ? 1 : -1) * e * THREE.MathUtils.degToRad(100)));
      return;
    case 'barricade':
      if (!body) return;
      body.position.x = 0.8 * e;
      body.rotation.z = -1.45 * Math.max(0, (e - 0.35) / 0.65) ** 2;
      return;
    case 'brush':
      if (!body) return;
      body.position.x = 0.75 * e;
      body.scale.set(1 + 0.2 * e, 1 - 0.55 * e, 1 + 0.1 * e);
      return;
    case 'log':
      if (!body) return;
      // The body pivots on the log's rooted left end.
      body.rotation.y = -1.3 * e;
      return;
    case 'rubble': {
      if (!body) return;
      const stones = (body.userData['stones'] as THREE.Object3D[] | undefined)?.filter((s) => s.parent?.parent === body);
      if (stones?.length) {
        for (const s of stones) {
          const base = s.userData['base'] as THREE.Vector3;
          s.position.set(base.x * (1 + 0.7 * e), base.y * (1 - 0.8 * e), base.z + (s.id % 2 ? 0.15 : -0.15) * e);
          s.scale.setScalar((s.userData['scale'] as number) * (1 - 0.3 * e));
        }
      } else body.scale.set(1 + 0.4 * e, 1 - 0.7 * e, 1 + 0.2 * e);
      return;
    }
    case 'minecart':
      if (body) body.position.x = 1.0 * e;
      return;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

export class TileLayer {
  readonly root = new THREE.Group();
  private readonly rooms = new Map<string, RoomView>();
  private readonly props = new Map<string, PropView>();
  private readonly plateGeometry: THREE.BufferGeometry;
  private readonly gridGeometry: THREE.BufferGeometry;
  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  /** Dressed stone blocks painted over the walls between rooms and the kerbs (multiplied by their colour). */
  private readonly blockTexture = stoneBlockTexture();
  private readonly wallMaterial = new THREE.MeshStandardMaterial({ color: '#8a7f72', map: this.blockTexture, roughness: 0.95, flatShading: true });
  private readonly kerbMaterial = new THREE.MeshStandardMaterial({ color: '#6a6058', map: this.blockTexture, roughness: 0.95, flatShading: true });
  /** Plate materials by `surface|terrain` and overlay materials by `overlay:<terrain>`, built lazily. */
  private materials = new Map<string, THREE.Material | THREE.Material[]>();
  private surfaceTextures = new Map<SurfaceId, THREE.Texture>();
  private textures: THREE.Texture[] = [];
  private readonly overlayGeometry: THREE.BufferGeometry;
  private quality: GraphicsQuality;
  /** Surface of each hex of the scenario (room data, per-hex overrides, the location's default). */
  private surfaceByHex = new Map<HexKey, SurfaceId>();
  private defaultSurface: SurfaceId = 'cobblestone';
  private roomBoundary = new Map<string, BoundaryKind>();
  private doorKinds = new Map<HexKey, DoorKind>();
  private defaultBoundary: BoundaryKind = 'walls';
  /** Natural boundaries (reeds, thicket, rocks, logs) on edge frames, from the environment. */
  boundaryFactory: ((kind: Exclude<BoundaryKind, 'walls'>, frames: THREE.Matrix4[], low: boolean) => THREE.Object3D & { dispose(): void }) | null = null;
  /** A piece in the location's colours (door bodies, rails), from the environment. */
  pieceFactory: ((piece: string) => THREE.Group | null) | null = null;
  private readonly propParts = new PropParts();
  private obstacleModels = new Map<HexKey, string>();
  private readonly available = new Set(listModels());
  /** Called when an async texture or prop model finished loading (the board redraws). */
  onChange: () => void = () => {};
  /** Shadow casting for props (none on the low preset). */
  castShadows = false;
  /** Every hex of the map when an environment surrounds it: no kerbs toward the outside then
   *  (the environment's floor and walls take over); kerbs stay toward rooms not yet revealed. */
  private footprint: ReadonlySet<HexKey> | null = null;

  /** The set piece the location puts on an obstacle hex (barrels here, a table there). */
  obstacleLook: ((model: string, k: HexKey) => string) | null = null;
  /** The location's stand-in for an obstacle model without a GLB (tree, rock, pillar…). */
  obstacleFactory: ((model: string) => THREE.Object3D | null) | null = null;
  /** The location's prop model for an obstacle model, object look or `chest`/`door`/`trap`. Without
   *  it, a model whose id equals the key is used when it exists. */
  propModel: ((key: string, defaultHeight: number) => Required<PropModelSpec> | null) | null = null;
  /** Glowing bits (a brazier's fire) to keep on top of a prop model of that key. */
  propGlow: ((key: string, height: number) => THREE.Object3D | null) | null = null;
  private readonly blobTexture = blobShadowTexture();
  private readonly blobGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly blobMaterial = new THREE.MeshBasicMaterial({ map: this.blobTexture, color: '#000000', transparent: true, opacity: 0.6, depthWrite: false });

  constructor(quality: GraphicsQuality) {
    this.quality = quality;
    // Patches overlap their neighbours a hair so a patched room has no seams.
    this.plateGeometry = new THREE.CircleGeometry(HEX_SIZE * 1.004, 6).rotateX(-Math.PI / 2);
    this.gridGeometry = gridHexGeometry(HEX_SIZE);
    // Terrain over a whole hex (flat-top: a corner at +X).
    this.overlayGeometry = new THREE.CircleGeometry(HEX_SIZE, 6).rotateX(-Math.PI / 2);
  }

  get revealed(): string[] {
    return [...this.rooms.keys()];
  }

  /** Rebuilds the surface materials for a quality level (texture size). */
  setLook(quality: GraphicsQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    const old = [...this.materials.values()].flat();
    const oldTextures = [...this.textures, ...this.surfaceTextures.values()];
    this.materials = new Map();
    this.surfaceTextures = new Map();
    this.textures = [];
    for (const room of this.rooms.values()) room.plates.forEach((mesh, i) => (mesh.material = this.material(room.plateKeys[i]!)));
    for (const m of old) m.dispose();
    for (const t of oldTextures) t.dispose();
  }

  /** Material for a key: `floor:<surface>` for floor patches, `grid`, `overlay:<terrain>`. */
  private material(key: string): THREE.Material | THREE.Material[] {
    let m = this.materials.get(key);
    if (m) return m;
    if (key === 'grid') {
      m = gridMaterial();
    } else if (key.startsWith('floor:')) {
      const surface = key.slice(6) as SurfaceId;
      let tex = this.surfaceTextures.get(surface);
      if (!tex) {
        tex = surfaceTexture(surface, this.quality, textureUrl, () => this.onChange());
        this.surfaceTextures.set(surface, tex);
      }
      const floor = worldUvMaterial(tex, '#ffffff');
      floor.roughness = surfaceRoughness(surface);
      Object.assign(floor, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      m = floor;
    } else if (key.startsWith('overlay:')) {
      const terrain = key.slice(8) as Overlay;
      if (terrain === 'water') {
        const fallback = noiseTexture('#5a8a96');
        this.textures.push(fallback);
        const water = worldUvMaterial(fallback, '#cfe6ea');
        Object.assign(water, { transparent: true, opacity: 0.72, depthWrite: false, roughness: 0.15, metalness: 0.1 });
        const url = textureUrl('shallow-water', this.quality);
        if (url) {
          new THREE.TextureLoader().load(url, (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.colorSpace = THREE.SRGBColorSpace;
            water.map = tex;
            water.needsUpdate = true;
            this.textures.push(tex);
            this.onChange();
          });
        }
        m = water;
      } else {
        const tex = terrainOverlayTexture(terrain, this.quality);
        this.textures.push(tex);
        const overlay = worldUvMaterial(tex, '#ffffff');
        Object.assign(overlay, { transparent: true, depthWrite: false, roughness: 0.9 });
        if (terrain === 'hazardous') {
          overlay.emissive.set('#ff5a20');
          overlay.emissiveIntensity = 0.55;
        }
        m = overlay;
      }
    }
    this.materials.set(key, m!);
    return m!;
  }

  /** Location settings from the environment: map footprint (kerbs), thin-wall colour, the hexes'
   *  default surface. */
  setSurroundings(footprint: ReadonlySet<HexKey> | null, wallColor: string | null, surface: SurfaceId | null, boundary: BoundaryKind = 'walls'): void {
    this.footprint = footprint;
    this.defaultBoundary = boundary;
    if (wallColor) {
      this.wallMaterial.color.set(wallColor);
      this.kerbMaterial.color.set(wallColor).multiplyScalar(0.78);
    }
    this.defaultSurface = surface ?? 'cobblestone';
  }

  /** Adds rooms that are revealed in `s` and not built yet; removes rooms that are not revealed
   *  (undo). Returns the ids of new rooms. Walls and kerbs are rebuilt for every room. */
  syncRooms(s: GameState, content: Content, only?: string): string[] {
    this.obstacleModels = new Map();
    this.surfaceByHex = new Map();
    this.roomBoundary = new Map();
    this.doorKinds = new Map();
    for (const room of content.scenarios[s.scenarioId]?.rooms ?? []) {
      if (room.boundary) this.roomBoundary.set(room.id, room.boundary);
      for (const d of room.doors ?? []) if (d.kind) this.doorKinds.set(rulesHexKey(d.hex), d.kind);
      for (const o of room.obstacles ?? []) if (o.model) this.obstacleModels.set(rulesHexKey(o.hex), o.model);
      for (const h of room.hexes) {
        const k = rulesHexKey(h);
        this.surfaceByHex.set(k, surfaceOf(k, room, this.defaultSurface));
      }
    }
    const wanted = only ? [...new Set([...this.rooms.keys(), only])] : s.board.revealedRooms;
    const added: string[] = [];
    for (const [id, room] of this.rooms) {
      if (wanted.includes(id)) continue;
      this.root.remove(room.group);
      for (const mesh of room.plates) mesh.dispose();
      for (const d of room.edgeDisposables) d.dispose();
      this.rooms.delete(id);
      for (const [k, p] of this.props) if (p.room === id) this.props.delete(k);
    }
    const byRoom = new Map<string, [HexKey, Tile][]>();
    for (const [k, tile] of Object.entries(s.board.tiles)) {
      if (!wanted.includes(tile.room)) continue;
      let list = byRoom.get(tile.room);
      if (!list) byRoom.set(tile.room, (list = []));
      list.push([k, tile]);
    }
    for (const id of wanted) {
      if (this.rooms.has(id)) continue;
      const tiles = byRoom.get(id);
      if (!tiles) continue;
      this.rooms.set(id, this.buildRoom(id, tiles));
      added.push(id);
    }
    this.buildWalls(s, wanted);
    return added;
  }

  private buildRoom(id: string, tiles: [HexKey, Tile][]): RoomView {
    const group = new THREE.Group();
    group.name = `room:${id}`;
    const room: RoomView = { id, group, plates: [], plateHexes: [], plateY: [], plateKeys: [], edges: null, edgeDisposables: [], props: new THREE.Group() };
    const m = new THREE.Matrix4();
    const add = (key: string, geometry: THREE.BufferGeometry, list: Hex[], y: number, order: number) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, this.material(key), list.length);
      list.forEach(([q, r], i) => {
        const { x, z } = hexToWorld(q, r);
        m.makeTranslation(x, y, z);
        mesh.setMatrixAt(i, m);
      });
      mesh.receiveShadow = true;
      mesh.name = `plates:${key}`;
      mesh.renderOrder = order;
      group.add(mesh);
      room.plates.push(mesh);
      room.plateHexes.push(list);
      room.plateY.push(y);
      room.plateKeys.push(key);
    };
    // The floor is the location's ground; hexes of another surface (a plank walkway in a stone
    // hall) get a patch of it, seamless across the hexes since its UVs are world XZ.
    const byKey = new Map<string, Hex[]>();
    for (const [k] of tiles) {
      const surface = this.surfaceByHex.get(k) ?? this.defaultSurface;
      if (surface === this.defaultSurface) continue;
      const key = `floor:${surface}`;
      let list = byKey.get(key);
      if (!list) byKey.set(key, (list = []));
      list.push(parseHexKey(k));
    }
    for (const [key, list] of byKey) add(key, this.plateGeometry, list, PATCH_Y, 0);
    // Terrain painted over the floor, then the grid lines over everything.
    for (const terrain of OVERLAYS) {
      add(`overlay:${terrain}`, this.overlayGeometry, tiles.filter(([, t]) => t.terrain === terrain).map(([k]) => parseHexKey(k)), OVERLAY_Y[terrain], 1);
    }
    add('grid', this.gridGeometry, tiles.map(([k]) => parseHexKey(k)), GRID_Y, 2);
    group.add(room.props);
    this.root.add(group);
    return room;
  }

  private boundaryOf(room: string): BoundaryKind {
    return this.roomBoundary.get(room) ?? this.defaultBoundary;
  }

  /** How a door looks: the scenario's `kind`, else masonry rooms get a door, outdoor rooms a
   *  barricade, brush, log or rubble by their boundary. */
  doorKindAt(k: HexKey, tile: Tile, s: GameState): DoorKind {
    const own = this.doorKinds.get(k);
    if (own) return own;
    const here = this.boundaryOf(tile.room);
    const there = tile.door ? this.boundaryOf(tile.door.to) : here;
    if (here === 'walls' || there === 'walls') return 'door';
    void s;
    return DOOR_FOR_BOUNDARY[here];
  }

  /** Thin walls from the state, plus low kerbs on every edge between a tile and the outside. Each
   *  room's walls look like its boundary: masonry, or reeds, thicket, rocks, logs outdoors (a wall
   *  next to an indoor room stays masonry). */
  private buildWalls(s: GameState, rooms: string[]): void {
    const wallSet = new Set(s.board.walls);
    type Lists = Map<BoundaryKind, { walls: THREE.Matrix4[]; kerbs: THREE.Matrix4[] }>;
    const perRoom = new Map<string, Lists>();
    const add = (room: string, kind: BoundaryKind, which: 'walls' | 'kerbs', mat: THREE.Matrix4) => {
      let lists = perRoom.get(room);
      if (!lists) perRoom.set(room, (lists = new Map()));
      let l = lists.get(kind);
      if (!l) lists.set(kind, (l = { walls: [], kerbs: [] }));
      l[which].push(mat);
    };
    const tiles = s.board.tiles;
    const inRooms = (k: HexKey) => {
      const t = tiles[k];
      return !!t && rooms.includes(t.room);
    };
    for (const w of wallSet) {
      const [ka, kb] = w.split('|') as [HexKey, HexKey];
      const owner = inRooms(ka) ? tiles[ka]!.room : inRooms(kb) ? tiles[kb]!.room : null;
      if (!owner) continue;
      const other = (inRooms(ka) ? tiles[kb]?.room : tiles[ka]?.room) ?? owner;
      const kind = this.boundaryOf(owner) === 'walls' || this.boundaryOf(other) === 'walls' ? 'walls' : this.boundaryOf(owner);
      const a = parseHexKey(ka);
      const b = parseHexKey(kb);
      add(owner, kind, 'walls', kind === 'walls' ? edgeMatrix(a, b, WALL_HEIGHT, WALL_THICK) : edgeFrame(a, b));
    }
    for (const [k, tile] of Object.entries(tiles)) {
      if (!rooms.includes(tile.room)) continue;
      const hex = parseHexKey(k);
      for (const n of neighbors(hex)) {
        const nk = rulesHexKey(n);
        if (inRooms(nk)) continue;
        const wk = k < nk ? `${k}|${nk}` : `${nk}|${k}`;
        if (wallSet.has(wk)) continue;
        // A door leads out of the room: no kerb in front of it.
        if (tile.door) continue;
        if (this.footprint && !this.footprint.has(nk)) continue;
        const kind = this.boundaryOf(tile.room);
        add(tile.room, kind, 'kerbs', kind === 'walls' ? edgeMatrix(hex, n, KERB_HEIGHT, KERB_THICK) : edgeFrame(hex, n));
      }
    }
    for (const room of this.rooms.values()) {
      if (room.edges) room.group.remove(room.edges);
      for (const d of room.edgeDisposables) d.dispose();
      room.edgeDisposables = [];
      room.edges = null;
      const lists = perRoom.get(room.id);
      if (!lists) continue;
      const edges = new THREE.Group();
      edges.name = 'edges';
      for (const [kind, l] of lists) {
        for (const which of ['walls', 'kerbs'] as const) {
          const list = l[which];
          if (!list.length) continue;
          const natural = kind !== 'walls' ? this.boundaryFactory?.(kind, list, which === 'kerbs') : null;
          if (natural) {
            edges.add(natural);
            room.edgeDisposables.push(natural);
            continue;
          }
          // Masonry, or boxes where no environment builds natural boundaries.
          const boxes = kind === 'walls' ? list : list.map((f) => f.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, (which === 'walls' ? WALL_HEIGHT : KERB_HEIGHT) / 2, 0), new THREE.Quaternion(), new THREE.Vector3(HEX_SIZE * 1.08, which === 'walls' ? WALL_HEIGHT : KERB_HEIGHT, which === 'walls' ? WALL_THICK : KERB_THICK))));
          const mesh = new THREE.InstancedMesh(this.boxGeometry, which === 'walls' ? this.wallMaterial : this.kerbMaterial, boxes.length);
          boxes.forEach((mat, i) => mesh.setMatrixAt(i, mat));
          mesh.receiveShadow = true;
          edges.add(mesh);
          room.edgeDisposables.push(mesh);
        }
      }
      edges.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = this.castShadows;
      });
      room.group.add(edges);
      room.edges = edges;
    }
  }

  /** Places, updates or removes props to match the tiles; `onlyRoom` limits it to one room and
   *  leaves the others alone (a room revealed in the middle of an animation queue). */
  syncProps(s: GameState, onlyRoom?: string): void {
    const seen = new Set<string>();
    for (const [k, tile] of Object.entries(s.board.tiles)) {
      if (onlyRoom && tile.room !== onlyRoom) continue;
      const room = this.rooms.get(tile.room);
      if (!room) continue;
      const hex = parseHexKey(k);
      const wanted: [string, () => PropView][] = [];
      // A blocking scenario object (brazier, lever) is drawn as the object, a blocking door (rubble,
      // a barricade) as the door, not as an obstacle too.
      if (tile.obstacle && !tile.object && !tile.door) wanted.push([`${k}:obstacle`, () => this.makeObstacle(k, hex, tile.room)]);
      if (tile.door) wanted.push([`${k}:door`, () => this.makeDoor(k, hex, tile, s)]);
      if (tile.trap) wanted.push([`${k}:trap`, () => this.makeSimple(`${k}:trap`, hex, tile.room, 'trap', this.propParts.trap())]);
      if (tile.coins) wanted.push([`${k}:coins`, () => this.makeSimple(`${k}:coins`, hex, tile.room, null, this.propParts.coins(tile.coins ?? 1))]);
      if (tile.chest) wanted.push([`${k}:chest`, () => this.makeChest(k, hex, tile.room)]);
      if (tile.object) {
        // The state is part of the key, so a lever pulled or a brazier lit is rebuilt in its new look.
        const look = tile.object.state ? `${tile.object.kind}:${tile.object.state}` : tile.object.kind;
        const key = `${k}:object:${look}`;
        wanted.push([key, () => this.makeSimple(key, hex, tile.room, look, (this.obstacleFactory?.(look) as THREE.Group | null) ?? this.propParts.rune(), 'object')]);
      }
      for (const [key, make] of wanted) {
        seen.add(key);
        let p = this.props.get(key);
        if (!p) {
          p = make();
          this.props.set(key, p);
          room.props.add(p.object);
        }
        if (p.panel && tile.door) this.setDoorOpen(p, tile.door.open, false);
      }
    }
    for (const [key, p] of this.props) {
      if (seen.has(key) || (onlyRoom && p.room !== onlyRoom)) continue;
      p.object.removeFromParent();
      this.props.delete(key);
    }
  }

  prop(key: string): PropView | undefined {
    return this.props.get(key);
  }

  /** World position of a prop's object, if it exists. */
  propPosition(key: string): THREE.Vector3 | null {
    const p = this.props.get(key);
    return p ? p.object.getWorldPosition(new THREE.Vector3()) : null;
  }

  removeProp(key: string): void {
    const p = this.props.get(key);
    if (!p) return;
    p.object.removeFromParent();
    this.props.delete(key);
  }

  /** Opens or closes a door (k = 0..1 when animating), in the way of its kind (doorPose). */
  setDoorOpen(p: PropView, open: boolean, animate: boolean, k = 1): void {
    if (!p.doorKind) return;
    if (!animate && p.open === open) return;
    const from = p.open ? 1 : 0;
    const to = open ? 1 : 0;
    doorPose(p, animate ? from + (to - from) * k : to);
    if (!animate || k >= 1) p.open = open;
  }

  /** Seconds a door takes to open. */
  doorSeconds(p: PropView): number {
    return DOOR_SECONDS[p.doorKind ?? 'door'];
  }

  /** Drops every prop so the next syncProps builds them again (new art-kit pieces arrived). */
  resetProps(): void {
    for (const p of this.props.values()) p.object.removeFromParent();
    this.props.clear();
  }

  /** Room rise: k from 0 (below the board) to 1 (in place); `origin` = where the reveal starts. */
  setRoomRise(roomId: string, k: number, origin: THREE.Vector3 | null): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    room.plates.forEach((mesh, i) => {
      const hexes = room.plateHexes[i]!;
      hexes.forEach(([hq, hr], j) => {
        const { x, z } = hexToWorld(hq, hr);
        const d = origin ? Math.hypot(x - origin.x, z - origin.z) : 0;
        const local = THREE.MathUtils.clamp(k * 1.8 - d * 0.12, 0, 1);
        const e = 1 - (1 - local) ** 3;
        // Flat on the floor: each hex spreads out from its centre.
        pos.set(x, room.plateY[i]!, z);
        scale.setScalar(Math.max(1e-3, e));
        m.compose(pos, q, scale);
        mesh.setMatrixAt(j, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
    const late = THREE.MathUtils.clamp((k - 0.55) / 0.45, 0, 1);
    for (const which of [room.edges, room.props]) {
      if (!which) continue;
      which.position.y = -(1 - late) * 1.2;
      which.visible = late > 0;
    }
  }

  private place(object: THREE.Object3D, hex: Hex): void {
    const { x, z } = hexToWorld(hex[0], hex[1]);
    object.position.set(x, PLATE_HEIGHT, z);
  }

  private shadow(o: THREE.Object3D): void {
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = this.castShadows;
        c.receiveShadow = true;
      }
    });
  }

  /** A prop on a hex: its placeholder now, swapped for the prop model of `modelKey` once that
   *  loads; `shadow` names the contact shadow under it (none for flat things). */
  private makeSimple(key: string, hex: Hex, room: string, modelKey: string | null, placeholder: THREE.Group, shadow?: keyof typeof PROP_SHADOW_RADIUS): PropView {
    const object = new THREE.Group();
    object.add(placeholder);
    this.place(object, hex);
    this.shadow(object);
    const view: PropView = { key, object, room };
    if (shadow) object.add(this.contactShadow(PROP_SHADOW_RADIUS[shadow]!));
    if (modelKey) this.swapInProp(view, placeholder, modelKey);
    return view;
  }

  private contactShadow(radius: number): THREE.Mesh {
    const blob = new THREE.Mesh(this.blobGeometry, this.blobMaterial);
    blob.scale.setScalar(radius * 2.4);
    blob.position.y = 0.005;
    blob.renderOrder = 1;
    blob.name = 'contact-shadow';
    return blob;
  }

  private makeObstacle(k: HexKey, hex: Hex, room: string): PropView {
    const base = this.obstacleModels.get(k) ?? 'barrel';
    const model = this.obstacleLook?.(base, k) ?? base;
    // Turned, sized, nudged off the centre and sometimes leaning a little, differently per hex, so
    // obstacles look set down rather than stamped (still clearly on their hex).
    const v = hexVariation(hex[0], hex[1]);
    const w = hexVariation(hex[1] * 3 + 11, hex[0] * 5 - 7);
    const part = (this.obstacleFactory?.(model) as THREE.Group | null) ?? (model === 'crate' ? this.propParts.crate() : this.propParts.barrel());
    part.rotation.y = v.rot;
    part.scale.multiplyScalar(v.scale);
    part.position.set(Math.cos(w.rot) * 0.12, 0, Math.sin(w.rot) * 0.12);
    if (w.scale > 1.02) part.rotation.z = (w.scale - 1.02) * 0.9;
    part.userData['variation'] = v.scale;
    return this.makeSimple(`${k}:obstacle`, hex, room, model, part, 'obstacle');
  }

  private makeChest(k: HexKey, hex: Hex, room: string): PropView {
    const { group, lid } = this.propParts.chest();
    group.rotation.y = (hexVariation(hex[0], hex[1]).rot - Math.PI) * 0.15; // roughly facing the camera
    const p = this.makeSimple(`${k}:chest`, hex, room, 'chest', group, 'chest');
    p.lid ??= lid;
    return p;
  }

  private makeDoor(k: HexKey, hex: Hex, tile: Tile, s: GameState): PropView {
    const dir = doorDirection(hex, tile, s);
    const kind = this.doorKindAt(k, tile, s);
    const object = new THREE.Group();
    const holder = new THREE.Group();
    // Stand the door on the hex edge it leads through: local X along the edge, +Z into the next room.
    holder.position.set(dir.x * 0.62, 0, dir.z * 0.62);
    holder.rotation.y = Math.atan2(dir.x, dir.z);
    object.add(holder);
    const p: PropView = { key: `${k}:door`, object, room: tile.room, doorKind: kind, open: false };
    if (kind === 'door') {
      const { frame, panel } = this.propParts.door();
      holder.add(frame, panel);
      p.panel = panel;
      this.swapDoorPanel(panel);
    } else if (kind === 'gate') {
      const { frame, wings } = this.propParts.gate();
      holder.add(frame, ...wings);
      p.wings = wings;
    } else {
      const pieceId = DOOR_PIECES[kind]!;
      const body = new THREE.Group();
      const piece = this.pieceFactory?.(pieceId) ?? this.propParts.crate();
      if (kind === 'log') {
        // Pivot on the rooted left end.
        body.position.x = -0.55;
        piece.position.x = 0.55;
      }
      if (kind === 'rubble') {
        const stones = [...piece.children];
        for (const st of stones) {
          st.userData['base'] = st.position.clone();
          st.userData['scale'] = st.scale.x;
        }
        body.userData['stones'] = stones;
      }
      if (kind === 'minecart') {
        const rails = this.pieceFactory?.('rails');
        if (rails) holder.add(rails);
      }
      body.add(piece);
      holder.add(body);
      p.body = body;
      this.swapInProp(p, piece, pieceId);
    }
    this.place(object, hex);
    this.shadow(object);
    this.setDoorOpen(p, !!tile.door?.open, false);
    return p;
  }

  private propSpec(key: string): Required<PropModelSpec> | null {
    const height = PROP_HEIGHT[key] ?? 0.9;
    return this.propModel ? this.propModel(key, height) : propModelFor(null, [key], this.available, height);
  }

  /** Replaces a placeholder with the prop model for `key` once it loads (if there is one). */
  private swapInProp(view: PropView, placeholder: THREE.Object3D, key: string): void {
    const spec = this.propSpec(key);
    if (!spec) return;
    void loadPropPrototype(spec, this.quality).then((proto) => {
      if (!proto || !placeholder.parent) return;
      const model = this.instance(proto);
      model.rotation.y += placeholder.rotation.y;
      model.rotation.z += placeholder.rotation.z;
      model.position.add(placeholder.position);
      model.scale.multiplyScalar((placeholder.userData['variation'] as number | undefined) ?? 1);

      placeholder.parent.add(model);
      placeholder.removeFromParent();
      const glow = this.propGlow?.(key, spec.height);
      if (glow) model.add(glow);
      // A modelled chest opens by vanishing (it has no lid of its own).
      if (view.lid) view.lid = undefined;
      this.shadow(view.object);
      this.onChange();
    });
  }

  /** The door panel turns into the prop model's door (the frame stays) once it loads. */
  private swapDoorPanel(panel: THREE.Group): void {
    const spec = this.propSpec('door');
    if (!spec) return;
    void loadPropPrototype(spec, this.quality).then((proto) => {
      if (!proto || !panel.parent) return;
      const model = this.instance(proto);
      // Fit the panel's opening (0.88 wide): hinge on the left post, centred in the frame.
      if (proto.radius * 2 > 0.95) model.scale.multiplyScalar(0.95 / (proto.radius * 2));
      model.position.x = 0.44;
      panel.clear();
      panel.add(model);
      this.shadow(panel);
      this.onChange();
    });
  }

  private instance(proto: PropPrototype): THREE.Object3D {
    const o = proto.object.clone();
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.receiveShadow = true;
    });
    return o;
  }

  setCastShadows(on: boolean): void {
    this.castShadows = on;
    this.root.traverse((c) => {
      if ((c as THREE.Mesh).isMesh && c.name !== 'contact-shadow' && !c.name.startsWith('plates:')) c.castShadow = on;
    });
  }

  /** Board extent of the built rooms (XZ, world units), or null when empty. */
  bounds(): THREE.Box2 | null {
    const b = new THREE.Box2(new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity));
    let any = false;
    for (const room of this.rooms.values()) {
      for (const list of room.plateHexes) {
        for (const [q, r] of list) {
          const { x, z } = hexToWorld(q, r);
          b.expandByPoint(new THREE.Vector2(x, z));
          any = true;
        }
      }
    }
    return any ? b : null;
  }

  /** Every hex key of the built rooms. */
  hexKeys(): Set<HexKey> {
    const out = new Set<HexKey>();
    for (const room of this.rooms.values()) for (const list of room.plateHexes) for (const h of list) out.add(rulesHexKey(h));
    return out;
  }

  dispose(): void {
    for (const room of this.rooms.values()) {
      for (const mesh of room.plates) mesh.dispose();
      for (const d of room.edgeDisposables) d.dispose();
    }
    this.rooms.clear();
    this.props.clear();
    this.root.clear();
    for (const m of [...this.materials.values()].flat()) m.dispose();
    for (const t of [...this.textures, ...this.surfaceTextures.values()]) t.dispose();
    this.plateGeometry.dispose();
    this.gridGeometry.dispose();
    this.overlayGeometry.dispose();
    this.boxGeometry.dispose();
    this.blockTexture.dispose();
    this.wallMaterial.dispose();
    this.kerbMaterial.dispose();
    this.propParts.dispose();
    this.blobTexture.dispose();
    this.blobGeometry.dispose();
    this.blobMaterial.dispose();

  }
}

/** Box matrix standing on the edge between two adjacent hexes. */
function edgeMatrix(a: Hex, b: Hex, height: number, thick: number): THREE.Matrix4 {
  const wa = hexToWorld(a[0], a[1]);
  const wb = hexToWorld(b[0], b[1]);
  const dx = wb.x - wa.x;
  const dz = wb.z - wa.z;
  const len = Math.hypot(dx, dz) || 1;
  // Edge runs perpendicular to the centre line; its length equals the hex size (plus overlap at corners).
  const angle = Math.atan2(dx / len, dz / len);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, angle);
  const pos = new THREE.Vector3((wa.x + wb.x) / 2, PLATE_HEIGHT + height / 2 - 0.02, (wa.z + wb.z) / 2);
  return new THREE.Matrix4().compose(pos, q, new THREE.Vector3(HEX_SIZE * 1.08, height, thick));
}

/** Frame on the edge between two adjacent hexes, at plate height: X along the edge, Z across it. */
function edgeFrame(a: Hex, b: Hex): THREE.Matrix4 {
  const wa = hexToWorld(a[0], a[1]);
  const wb = hexToWorld(b[0], b[1]);
  const angle = Math.atan2(wb.x - wa.x, wb.z - wa.z);
  return new THREE.Matrix4().compose(new THREE.Vector3((wa.x + wb.x) / 2, PLATE_HEIGHT - 0.02, (wa.z + wb.z) / 2), new THREE.Quaternion().setFromAxisAngle(UP, angle), new THREE.Vector3(1, 1, 1));
}

/** Unit vector from the door hex towards the room it leads to (or away from its own room). */
function doorDirection(hex: Hex, tile: Tile, s: GameState): THREE.Vector3 {
  const c = hexToWorld(hex[0], hex[1]);
  const acc = new THREE.Vector3();
  for (const n of neighbors(hex)) {
    const t = s.board.tiles[rulesHexKey(n)];
    if (t && t.room === tile.room) continue;
    const k1 = rulesHexKey(hex);
    const k2 = rulesHexKey(n);
    if (s.board.walls.includes(k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`)) continue;
    const w = hexToWorld(n[0], n[1]);
    acc.add(new THREE.Vector3(w.x - c.x, 0, w.z - c.z));
  }
  if (acc.lengthSq() < 1e-6) acc.set(0, 0, -1);
  return acc.normalize();
}

/** Shared placeholder geometry and materials for props (one set per board). */
class PropParts {
  private readonly disposables: { dispose(): void }[] = [];
  private readonly wood = this.keep(new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.85 }));
  private readonly darkWood = this.keep(new THREE.MeshStandardMaterial({ color: '#5e3c22', roughness: 0.9 }));
  private readonly lightWood = this.keep(new THREE.MeshStandardMaterial({ color: '#9a6a3e', roughness: 0.85 }));
  private readonly ringGeo = this.keep(new THREE.TorusGeometry(0.055, 0.012, 5, 12));

  private readonly iron = this.keep(new THREE.MeshStandardMaterial({ color: '#4a4c52', roughness: 0.55, metalness: 0.6 }));
  private readonly gold = this.keep(new THREE.MeshStandardMaterial({ color: '#f2c24a', roughness: 0.35, metalness: 0.7, emissive: '#3a2600' }));
  private readonly runeMat = this.keep(new THREE.MeshStandardMaterial({ color: '#6c6a8a', roughness: 0.8, emissive: '#2a1f55' }));
  private readonly barrelGeo = this.keep(
    new THREE.LatheGeometry(
      [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((y, i, a) => new THREE.Vector2(0.3 + 0.07 * Math.sin((i / (a.length - 1)) * Math.PI), y)),
      14,
    ),
  );
  private readonly barrelTop = this.keep(new THREE.CircleGeometry(0.3, 14).rotateX(-Math.PI / 2).translate(0, 0.9, 0));
  private readonly hoopGeo = this.keep(new THREE.TorusGeometry(0.36, 0.022, 5, 18).rotateX(Math.PI / 2));
  private readonly box = this.keep(new THREE.BoxGeometry(1, 1, 1));
  private readonly coinGeo = this.keep(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 14));
  private readonly lidGeo = this.keep(new THREE.CylinderGeometry(0.22, 0.22, 0.62, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2));
  private readonly trapRing = this.keep(new THREE.TorusGeometry(0.3, 0.04, 6, 20).rotateX(Math.PI / 2));
  private readonly toothGeo = this.keep(new THREE.ConeGeometry(0.035, 0.12, 4));
  private readonly runeGeo = this.keep(new THREE.DodecahedronGeometry(0.28));

  private keep<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  barrel(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.barrelGeo, this.wood), new THREE.Mesh(this.barrelTop, this.darkWood));
    for (const y of [0.18, 0.72]) {
      const hoop = new THREE.Mesh(this.hoopGeo, this.iron);
      hoop.position.y = y;
      hoop.scale.setScalar(y === 0.18 ? 0.98 : 0.98);
      g.add(hoop);
    }
    return g;
  }

  crate(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.box, this.wood);
    m.scale.set(0.75, 0.7, 0.75);
    m.position.y = 0.35;
    g.add(m);
    return g;
  }

  coins(n: number): THREE.Group {
    const g = new THREE.Group();
    const count = Math.min(4, Math.max(1, n) + 1);
    for (let i = 0; i < count; i++) {
      const c = new THREE.Mesh(this.coinGeo, this.gold);
      c.position.set(Math.sin(i * 2.4) * 0.06, 0.02 + i * 0.042, Math.cos(i * 2.4) * 0.06);
      c.rotation.set(0.08 * Math.sin(i), 0, 0.08 * Math.cos(i));
      g.add(c);
    }
    return g;
  }

  chest(): { group: THREE.Group; lid: THREE.Object3D } {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.box, this.wood);
    body.scale.set(0.62, 0.36, 0.44);
    body.position.y = 0.18;
    const band = new THREE.Mesh(this.box, this.gold);
    band.scale.set(0.64, 0.05, 0.46);
    band.position.y = 0.33;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.36, -0.22);
    const lid = new THREE.Mesh(this.lidGeo, this.darkWood);
    lid.position.set(0, 0, 0.22);
    lid.scale.set(1, 0.6, 1);
    const lock = new THREE.Mesh(this.box, this.gold);
    lock.scale.set(0.08, 0.1, 0.04);
    lock.position.set(0, 0.28, 0.23);
    lidPivot.add(lid);
    g.add(body, band, lidPivot, lock);
    return { group: g, lid: lidPivot };
  }

  door(): { frame: THREE.Group; panel: THREE.Group } {
    const frame = new THREE.Group();
    for (const x of [-0.5, 0.5]) {
      const post = new THREE.Mesh(this.box, this.darkWood);
      post.scale.set(0.12, 1.05, 0.16);
      post.position.set(x, 0.525, 0);
      frame.add(post);
    }
    const lintel = new THREE.Mesh(this.box, this.darkWood);
    lintel.scale.set(1.12, 0.12, 0.18);
    lintel.position.set(0, 1.08, 0);
    frame.add(lintel);
    // The panel hinges on the left post: four planks with dark gaps, iron straps, a ring pull.
    const panel = new THREE.Group();
    panel.position.set(-0.44, 0, 0);
    const back = new THREE.Mesh(this.box, this.darkWood);
    back.scale.set(0.86, 0.96, 0.04);
    back.position.set(0.44, 0.5, -0.012);
    panel.add(back);
    for (let i = 0; i < 4; i++) {
      const plank = new THREE.Mesh(this.box, i % 2 ? this.wood : this.lightWood);
      plank.scale.set(0.205, 0.97 - (i % 2) * 0.02, 0.06);
      plank.position.set(0.44 + (i - 1.5) * 0.22, 0.5, 0);
      panel.add(plank);
    }
    for (const y of [0.22, 0.78]) {
      const strap = new THREE.Mesh(this.box, this.iron);
      strap.scale.set(0.8, 0.06, 0.09);
      strap.position.set(0.44, y, 0);
      panel.add(strap);
    }
    const ring = new THREE.Mesh(this.ringGeo, this.iron);
    ring.position.set(0.74, 0.5, 0.06);
    panel.add(ring);
    return { frame, panel };
  }

  /** A two-wing timber gate in a frame; each wing hinges on its post. */
  gate(): { frame: THREE.Group; wings: THREE.Group[] } {
    const frame = new THREE.Group();
    for (const x of [-0.52, 0.52]) {
      const post = new THREE.Mesh(this.box, this.darkWood);
      post.scale.set(0.14, 1.15, 0.16);
      post.position.set(x, 0.575, 0);
      frame.add(post);
    }
    const wings = [-1, 1].map((side) => {
      const wing = new THREE.Group();
      wing.position.set(side * 0.45, 0, 0);
      for (let i = 0; i < 3; i++) {
        const plank = new THREE.Mesh(this.box, i % 2 ? this.wood : this.lightWood);
        plank.scale.set(0.14, 0.9 - i * 0.04, 0.05);
        plank.position.set(-side * (0.08 + i * 0.15), 0.5, 0);
        wing.add(plank);
      }
      for (const y of [0.25, 0.75]) {
        const rail = new THREE.Mesh(this.box, this.iron);
        rail.scale.set(0.44, 0.06, 0.07);
        rail.position.set(-side * 0.23, y, 0);
        wing.add(rail);
      }
      const brace = new THREE.Mesh(this.box, this.darkWood);
      brace.scale.set(0.06, 0.6, 0.04);
      brace.position.set(-side * 0.23, 0.5, 0.03);
      brace.rotation.z = side * 0.75;
      wing.add(brace);
      return wing;
    });
    return { frame, wings };
  }

  trap(): THREE.Group {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(this.trapRing, this.iron);
    ring.position.y = 0.04;
    g.add(ring);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const t = new THREE.Mesh(this.toothGeo, this.iron);
      t.position.set(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3);
      t.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      g.add(t);
    }
    const plate = new THREE.Mesh(this.box, this.gold);
    plate.scale.set(0.16, 0.03, 0.16);
    plate.position.y = 0.03;
    g.add(plate);
    return g;
  }

  rune(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.runeGeo, this.runeMat);
    m.position.y = 0.28;
    m.scale.set(0.8, 1.2, 0.8);
    g.add(m);
    return g;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
