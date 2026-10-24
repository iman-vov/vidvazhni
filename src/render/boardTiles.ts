// The board's ground: hex plates of revealed rooms by terrain, thin walls and low edge kerbs, and the
// things that stand on tiles (barrels, doors, traps, coins, chests, scenario objects). Each room is
// its own group, so a room being revealed can rise out of the dark. Props use the prop models from
// assets/models when they exist (by the location's `propModels` table: barrel, chest, bear-trap,
// dungeon-door, brazier, floor-lever, rune-stone…) and the location's painted pieces otherwise,
// turned and sized a little differently per hex, each standing on a soft contact shadow.

import * as THREE from 'three';
import type { Content, SurfaceId } from '../rules/content';
import { hexKey as rulesHexKey, neighbors, parseHexKey, type Hex, type HexKey } from '../rules/hex';
import type { GameState, Tile } from '../rules/state';
import { blobShadowTexture } from './contactShadow';
import { HEX_SIZE, hexToWorld } from './hexLayout';
import { listModels } from './models';
import { hexVariation, loadPropPrototype, propModelFor, type PropPrototype } from './propModels';
import type { GraphicsQuality } from './quality';
import type { PropModelSpec } from './environment/types';
import { surfaceOf, surfaceRoughness, surfaceSide, surfaceTexture, TERRAIN_TINT, terrainOverlayTexture, WATER_DROP } from './surfaces';

export const PLATE_HEIGHT = 0.22 * HEX_SIZE;
const PLATE_RADIUS = 0.96 * HEX_SIZE;
const WALL_HEIGHT = 0.62;
const WALL_THICK = 0.14;
const KERB_HEIGHT = 0.26;
const KERB_THICK = 0.2;
/** World units per texture repeat on the plate tops (UVs come from world XZ, so stones run across hexes). */
const TEXTURE_WORLD_SIZE = 2.6;

type Terrain = Tile['terrain'];
type Overlay = 'difficult' | 'hazardous' | 'water';
const OVERLAYS: readonly Overlay[] = ['difficult', 'hazardous', 'water'];
/** Height of each terrain overlay above the plate's base (water lies a little under the others). */
const OVERLAY_Y: Record<Overlay, number> = { difficult: PLATE_HEIGHT + 0.004, hazardous: PLATE_HEIGHT + 0.006, water: PLATE_HEIGHT - WATER_DROP * 0.35 };

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
  /** Plates by surface and terrain, then the terrain overlays on top of them. */
  plates: THREE.InstancedMesh[];
  /** Per plate mesh: the hexes in instance order, its rest height and its material key. */
  plateHexes: Hex[][];
  plateY: number[];
  plateKeys: string[];
  walls: THREE.InstancedMesh | null;
  kerbs: THREE.InstancedMesh | null;
  props: THREE.Group;
}

interface PropView {
  key: string;
  object: THREE.Group;
  room: string;
  /** For doors: the swinging panel and whether it is open now. */
  panel?: THREE.Object3D;
  open?: boolean;
  /** For chests: the lid. */
  lid?: THREE.Object3D;
}

const UP = new THREE.Vector3(0, 1, 0);

export class TileLayer {
  readonly root = new THREE.Group();
  private readonly rooms = new Map<string, RoomView>();
  private readonly props = new Map<string, PropView>();
  private readonly plateGeometry: THREE.CylinderGeometry;
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
    this.plateGeometry = new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS * 0.97, PLATE_HEIGHT, 6, 1, false, Math.PI / 2);
    this.plateGeometry.translate(0, PLATE_HEIGHT / 2, 0);
    // A flat hex just inside the plate's top (flat-top: a corner at +X).
    this.overlayGeometry = new THREE.CircleGeometry(PLATE_RADIUS * 0.985, 6).rotateX(-Math.PI / 2);
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

  /** Material for a key: `surface|terrain` for plates (sides and top), `overlay:<terrain>`. */
  private material(key: string): THREE.Material | THREE.Material[] {
    let m = this.materials.get(key);
    if (m) return m;
    if (key.startsWith('overlay:')) {
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
    } else {
      const [surface, terrain] = key.split('|') as [SurfaceId, Terrain];
      let tex = this.surfaceTextures.get(surface);
      if (!tex) {
        tex = surfaceTexture(surface, this.quality, textureUrl, () => this.onChange());
        this.surfaceTextures.set(surface, tex);
      }
      const top = worldUvMaterial(tex, TERRAIN_TINT[terrain]);
      top.roughness = surfaceRoughness(surface);
      if (terrain === 'water') top.roughness = 0.4;
      if (terrain === 'hazardous') top.emissive.set('#2a0a04');
      const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(surfaceSide(surface)).multiply(new THREE.Color(TERRAIN_TINT[terrain])), roughness: 1, flatShading: true });
      m = [side, top, side];
    }
    this.materials.set(key, m);
    return m;
  }

  /** Location settings from the environment: map footprint (kerbs), thin-wall colour, the hexes'
   *  default surface. */
  setSurroundings(footprint: ReadonlySet<HexKey> | null, wallColor: string | null, surface: SurfaceId | null): void {
    this.footprint = footprint;
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
    for (const room of content.scenarios[s.scenarioId]?.rooms ?? []) {
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
      room.walls?.dispose();
      room.kerbs?.dispose();
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
    const room: RoomView = { id, group, plates: [], plateHexes: [], plateY: [], plateKeys: [], walls: null, kerbs: null, props: new THREE.Group() };
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    const add = (key: string, geometry: THREE.BufferGeometry, list: Hex[], y: number, vary: boolean) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, this.material(key), list.length);
      list.forEach(([q, r], i) => {
        const { x, z } = hexToWorld(q, r);
        m.makeTranslation(x, y, z);
        mesh.setMatrixAt(i, m);
        // Small brightness variation so neighbouring plates read as separate painted tiles.
        if (vary) mesh.setColorAt(i, color.setScalar(0.9 + (0.1 * ((((q * 7 + r * 13) % 5) + 5) % 5)) / 4));
      });
      mesh.receiveShadow = true;
      mesh.name = `plates:${key}`;
      if (!vary) mesh.renderOrder = 1;
      group.add(mesh);
      room.plates.push(mesh);
      room.plateHexes.push(list);
      room.plateY.push(y);
      room.plateKeys.push(key);
    };
    // Plates by surface and terrain.
    const byKey = new Map<string, Hex[]>();
    for (const [k, t] of tiles) {
      const key = `${this.surfaceByHex.get(k) ?? this.defaultSurface}|${t.terrain}`;
      let list = byKey.get(key);
      if (!list) byKey.set(key, (list = []));
      list.push(parseHexKey(k));
    }
    for (const [key, list] of byKey) add(key, this.plateGeometry, list, key.endsWith('|water') ? -WATER_DROP : 0, true);
    // Terrain painted over the surface.
    for (const terrain of OVERLAYS) {
      add(`overlay:${terrain}`, this.overlayGeometry, tiles.filter(([, t]) => t.terrain === terrain).map(([k]) => parseHexKey(k)), OVERLAY_Y[terrain], false);
    }
    group.add(room.props);
    this.root.add(group);
    return room;
  }

  /** Thin walls from the state, plus low kerbs on every edge between a tile and the outside. */
  private buildWalls(s: GameState, rooms: string[]): void {
    const wallSet = new Set(s.board.walls);
    const perRoomWalls = new Map<string, THREE.Matrix4[]>();
    const perRoomKerbs = new Map<string, THREE.Matrix4[]>();
    const add = (map: Map<string, THREE.Matrix4[]>, room: string, mat: THREE.Matrix4) => {
      let list = map.get(room);
      if (!list) map.set(room, (list = []));
      list.push(mat);
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
      add(perRoomWalls, owner, edgeMatrix(parseHexKey(ka), parseHexKey(kb), WALL_HEIGHT, WALL_THICK));
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
        add(perRoomKerbs, tile.room, edgeMatrix(hex, n, KERB_HEIGHT, KERB_THICK));
      }
    }
    for (const room of this.rooms.values()) {
      for (const which of ['walls', 'kerbs'] as const) {
        const old = room[which];
        if (old) {
          room.group.remove(old);
          old.dispose();
        }
        const list = (which === 'walls' ? perRoomWalls : perRoomKerbs).get(room.id) ?? [];
        if (!list.length) {
          room[which] = null;
          continue;
        }
        const mesh = new THREE.InstancedMesh(this.boxGeometry, which === 'walls' ? this.wallMaterial : this.kerbMaterial, list.length);
        list.forEach((mat, i) => mesh.setMatrixAt(i, mat));
        mesh.castShadow = this.castShadows;
        mesh.receiveShadow = true;
        room.group.add(mesh);
        room[which] = mesh;
      }
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
      // A blocking scenario object (brazier, lever) is drawn as the object, not as an obstacle too.
      if (tile.obstacle && !tile.object) wanted.push([`${k}:obstacle`, () => this.makeObstacle(k, hex, tile.room)]);
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

  /** Door panel: swings open (k = 0..1 when animating). */
  setDoorOpen(p: PropView, open: boolean, animate: boolean, k = 1): void {
    if (!p.panel) return;
    if (!animate && p.open === open) return;
    const from = p.open ? 1 : 0;
    const to = open ? 1 : 0;
    const t = animate ? from + (to - from) * k : to;
    p.panel.rotation.y = t * THREE.MathUtils.degToRad(-105);
    if (!animate || k >= 1) p.open = open;
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
        pos.set(x, room.plateY[i]! - (1 - e) * 1.4, z);
        scale.setScalar(0.55 + 0.45 * e);
        m.compose(pos, q, scale);
        mesh.setMatrixAt(j, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
    const late = THREE.MathUtils.clamp((k - 0.55) / 0.45, 0, 1);
    for (const which of [room.walls, room.kerbs, room.props]) {
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
    const model = this.obstacleModels.get(k) ?? 'barrel';
    // Turned and sized a little differently per hex, so a row of barrels does not look stamped.
    const v = hexVariation(hex[0], hex[1]);
    const part = (this.obstacleFactory?.(model) as THREE.Group | null) ?? (model === 'crate' ? this.propParts.crate() : this.propParts.barrel());
    part.rotation.y = v.rot;
    part.scale.multiplyScalar(v.scale);
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
    const object = new THREE.Group();
    const { frame, panel } = this.propParts.door();
    const holder = new THREE.Group();
    holder.add(frame, panel);
    // Stand the frame on the hex edge the door leads through.
    holder.position.set(dir.x * 0.62, 0, dir.z * 0.62);
    holder.rotation.y = Math.atan2(dir.x, dir.z);
    object.add(holder);
    this.place(object, hex);
    this.shadow(object);
    const p: PropView = { key: `${k}:door`, object, room: tile.room, panel, open: false };
    this.setDoorOpen(p, !!tile.door?.open, false);
    this.swapDoorPanel(panel);
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
      if ((c as THREE.Mesh).isMesh && !(c as THREE.InstancedMesh).isInstancedMesh) c.castShadow = on;
    });
    for (const room of this.rooms.values()) {
      if (room.walls) room.walls.castShadow = on;
      if (room.kerbs) room.kerbs.castShadow = on;
    }
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
      room.walls?.dispose();
      room.kerbs?.dispose();
    }
    this.rooms.clear();
    this.props.clear();
    this.root.clear();
    for (const m of [...this.materials.values()].flat()) m.dispose();
    for (const t of [...this.textures, ...this.surfaceTextures.values()]) t.dispose();
    this.plateGeometry.dispose();
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
