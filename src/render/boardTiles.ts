// The board's ground: hex plates of revealed rooms by terrain, thin walls and low edge kerbs, and the
// things that stand on tiles (barrels, doors, traps, coins, chests, scenario objects). Each room is
// its own group, so a room being revealed can rise out of the dark. Props use the prop models from
// assets/models when they exist (barrel, chest, bear-trap, dungeon-door) and simple painted
// geometry otherwise.

import * as THREE from 'three';
import type { Content } from '../rules/content';
import { hexKey as rulesHexKey, neighbors, parseHexKey, type Hex, type HexKey } from '../rules/hex';
import type { GameState, Tile } from '../rules/state';
import { HEX_SIZE, hexToWorld } from './hexLayout';
import { listModels, loadModel } from './models';
import type { GraphicsQuality } from './quality';

export const PLATE_HEIGHT = 0.22 * HEX_SIZE;
const PLATE_RADIUS = 0.96 * HEX_SIZE;
const WALL_HEIGHT = 0.62;
const WALL_THICK = 0.14;
const KERB_HEIGHT = 0.26;
const KERB_THICK = 0.2;
/** World units per texture repeat on the plate tops (UVs come from world XZ, so stones run across hexes). */
const TEXTURE_WORLD_SIZE = 2.6;

type Terrain = Tile['terrain'];
const TERRAINS: Terrain[] = ['normal', 'difficult', 'hazardous', 'water'];

const TEXTURE_URLS = import.meta.glob<string>('/assets/textures/*.webp', { query: '?url', import: 'default', eager: true });

/** Texture per terrain; `normal` depends on the scenario's look (s1 is a cellar). */
const THEME_NORMAL: Record<string, string> = { s1: 'cobblestone', s2: 'forest-floor', s3: 'tavern-planks', s4: 'cobblestone', s5: 'cave-rock' };
const TERRAIN_TEXTURE: Record<Exclude<Terrain, 'normal'>, string> = { difficult: 'swamp-mud', hazardous: 'cave-rock', water: 'shallow-water' };
/** Multiplied over the texture: hazardous ground glows a little, the side of a plate is darker. */
const TERRAIN_TINT: Record<Terrain, string> = { normal: '#ffffff', difficult: '#f0e6d0', hazardous: '#ffb8a0', water: '#e8f6ff' };
const TERRAIN_SIDE: Record<Terrain, string> = { normal: '#5c5048', difficult: '#4e4030', hazardous: '#5a3a3a', water: '#3c5a66' };
const TERRAIN_FALLBACK: Record<Terrain, string> = { normal: '#9a948a', difficult: '#7a6a48', hazardous: '#8a4a48', water: '#5aa8c0' };

/** Prop heights in world units when a prop model is used. */
const PROP_HEIGHT: Record<string, number> = { barrel: 0.95, crate: 0.8, chest: 0.6, 'bear-trap': 0.18, 'dungeon-door': 1.25 };

function textureUrl(name: string, quality: GraphicsQuality): string | undefined {
  const size = quality === 'low' ? 512 : 1024;
  return TEXTURE_URLS[`/assets/textures/${name}.${size}.webp`] ?? TEXTURE_URLS[`/assets/textures/${name}.512.webp`];
}

/** A soft noise texture for when an image is missing (keeps the painted look, costs nothing). */
function noiseTexture(color: string): THREE.Texture {
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
  plates: THREE.InstancedMesh[];
  /** Per plate mesh: the hexes in instance order. */
  plateHexes: Hex[][];
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
  private readonly wallMaterial = new THREE.MeshStandardMaterial({ color: '#8a7f72', roughness: 0.95, flatShading: true });
  private readonly kerbMaterial = new THREE.MeshStandardMaterial({ color: '#6a6058', roughness: 0.95, flatShading: true });
  private materials = new Map<Terrain, THREE.Material[]>();
  private textures: THREE.Texture[] = [];
  private theme = 'cobblestone';
  private quality: GraphicsQuality;
  private readonly propParts = new PropParts();
  private obstacleModels = new Map<HexKey, string>();
  private readonly available = new Set(listModels());
  /** Called when an async texture or prop model finished loading (the board redraws). */
  onChange: () => void = () => {};
  /** Shadow casting for props (none on the low preset). */
  castShadows = false;

  constructor(quality: GraphicsQuality) {
    this.quality = quality;
    this.plateGeometry = new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS * 0.97, PLATE_HEIGHT, 6, 1, false, Math.PI / 2);
    this.plateGeometry.translate(0, PLATE_HEIGHT / 2, 0);
  }

  get revealed(): string[] {
    return [...this.rooms.keys()];
  }

  /** Rebuilds the terrain materials for a quality level (texture size) and scenario look. */
  setLook(quality: GraphicsQuality, scenarioId: string): void {
    const theme = THEME_NORMAL[scenarioId] ?? 'cobblestone';
    if (this.materials.size && quality === this.quality && theme === this.theme) return;
    this.quality = quality;
    this.theme = theme;
    const old = [...this.materials.values()].flat();
    const oldTextures = this.textures;
    this.materials = new Map();
    this.textures = [];
    const loader = new THREE.TextureLoader();
    for (const terrain of TERRAINS) {
      const name = terrain === 'normal' ? theme : TERRAIN_TEXTURE[terrain];
      const url = textureUrl(name, quality);
      const fallback = noiseTexture(TERRAIN_FALLBACK[terrain]);
      const top = worldUvMaterial(fallback, url ? '#ffffff' : TERRAIN_TINT[terrain]);
      this.textures.push(fallback);
      if (url) {
        loader.load(url, (tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = quality === 'low' ? 1 : 4;
          top.map = tex;
          top.color.set(TERRAIN_TINT[terrain]);
          top.needsUpdate = true;
          this.textures.push(tex);
          this.onChange();
        });
      }
      if (terrain === 'water') {
        top.roughness = 0.35;
        top.metalness = 0.05;
      }
      if (terrain === 'hazardous') top.emissive.set('#3a0d08');
      const side = new THREE.MeshStandardMaterial({ color: TERRAIN_SIDE[terrain], roughness: 1, flatShading: true });
      this.materials.set(terrain, [side, top, side]);
    }
    for (const room of this.rooms.values()) room.plates.forEach((mesh, i) => (mesh.material = this.materials.get(TERRAINS[i]!)!));
    for (const m of old) m.dispose();
    for (const t of oldTextures) t.dispose();
  }

  /** Adds rooms that are revealed in `s` and not built yet; removes rooms that are not revealed
   *  (undo). Returns the ids of new rooms. Walls and kerbs are rebuilt for every room. */
  syncRooms(s: GameState, content: Content, only?: string): string[] {
    this.setLook(this.quality, s.scenarioId);
    this.obstacleModels = new Map();
    for (const room of content.scenarios[s.scenarioId]?.rooms ?? []) {
      for (const o of room.obstacles ?? []) if (o.model) this.obstacleModels.set(rulesHexKey(o.hex), o.model);
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
    const plates: THREE.InstancedMesh[] = [];
    const plateHexes: Hex[][] = [];
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    for (const terrain of TERRAINS) {
      const list = tiles.filter(([, t]) => t.terrain === terrain).map(([k]) => parseHexKey(k));
      const mesh = new THREE.InstancedMesh(this.plateGeometry, this.materials.get(terrain)!, Math.max(1, list.length));
      mesh.count = list.length;
      list.forEach(([q, r], i) => {
        const { x, z } = hexToWorld(q, r);
        m.makeTranslation(x, terrain === 'water' ? -0.05 : 0, z);
        mesh.setMatrixAt(i, m);
        // Small brightness variation so neighbouring plates read as separate painted tiles.
        const v = 0.9 + 0.1 * (((q * 7 + r * 13) % 5 + 5) % 5) / 4;
        mesh.setColorAt(i, color.setScalar(v));
      });
      mesh.receiveShadow = true;
      mesh.name = `plates:${terrain}`;
      group.add(mesh);
      plates.push(mesh);
      plateHexes.push(list);
    }
    const props = new THREE.Group();
    group.add(props);
    this.root.add(group);
    return { id, group, plates, plateHexes, walls: null, kerbs: null, props };
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
      if (tile.obstacle) wanted.push([`${k}:obstacle`, () => this.makeObstacle(k, hex, tile.room)]);
      if (tile.door) wanted.push([`${k}:door`, () => this.makeDoor(k, hex, tile, s)]);
      if (tile.trap) wanted.push([`${k}:trap`, () => this.makeSimple(`${k}:trap`, hex, tile.room, 'bear-trap', this.propParts.trap())]);
      if (tile.coins) wanted.push([`${k}:coins`, () => this.makeSimple(`${k}:coins`, hex, tile.room, null, this.propParts.coins(tile.coins ?? 1))]);
      if (tile.chest) wanted.push([`${k}:chest`, () => this.makeChest(k, hex, tile.room)]);
      if (tile.object) wanted.push([`${k}:object`, () => this.makeSimple(`${k}:object`, hex, tile.room, tile.object!.kind, this.propParts.rune())]);
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
        pos.set(x, (TERRAINS[i] === 'water' ? -0.05 : 0) - (1 - e) * 1.4, z);
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

  private makeSimple(key: string, hex: Hex, room: string, modelId: string | null, placeholder: THREE.Group): PropView {
    const object = new THREE.Group();
    object.add(placeholder);
    this.place(object, hex);
    this.shadow(object);
    if (modelId) this.swapInModel(object, placeholder, modelId);
    return { key, object, room };
  }

  private makeObstacle(k: HexKey, hex: Hex, room: string): PropView {
    const model = this.obstacleModels.get(k) ?? 'barrel';
    const part = model === 'crate' ? this.propParts.crate() : this.propParts.barrel();
    // Barrels lean a little differently so a row of them does not look stamped.
    part.rotation.y = ((hex[0] * 37 + hex[1] * 61) % 360) * (Math.PI / 180);
    return this.makeSimple(`${k}:obstacle`, hex, room, model, part);
  }

  private makeChest(k: HexKey, hex: Hex, room: string): PropView {
    const { group, lid } = this.propParts.chest();
    const p = this.makeSimple(`${k}:chest`, hex, room, null, group);
    p.lid = lid;
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
    return p;
  }

  /** Replaces a placeholder with a prop model once it loads (if the build has one). */
  private swapInModel(object: THREE.Group, placeholder: THREE.Object3D, modelId: string): void {
    if (!this.available.has(modelId)) return;
    loadModel(modelId, { quality: this.quality })
      .then((model) => {
        if (!placeholder.parent) return;
        const box = new THREE.Box3().setFromObject(model.scene);
        const h = box.max.y - box.min.y;
        model.scene.scale.setScalar(h > 0 ? (PROP_HEIGHT[modelId] ?? 0.8) / h : 1);
        model.scene.rotation.y = placeholder.rotation.y;
        object.remove(placeholder);
        object.add(model.scene);
        this.shadow(object);
        this.onChange();
      })
      .catch(() => {
        // Keep the placeholder.
      });
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
    for (const t of this.textures) t.dispose();
    this.plateGeometry.dispose();
    this.boxGeometry.dispose();
    this.wallMaterial.dispose();
    this.kerbMaterial.dispose();
    this.propParts.dispose();
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
    // The panel hinges on the left post.
    const panel = new THREE.Group();
    panel.position.set(-0.44, 0, 0);
    const boards = new THREE.Mesh(this.box, this.wood);
    boards.scale.set(0.88, 0.98, 0.07);
    boards.position.set(0.44, 0.5, 0);
    panel.add(boards);
    for (const y of [0.22, 0.78]) {
      const strap = new THREE.Mesh(this.box, this.iron);
      strap.scale.set(0.8, 0.06, 0.09);
      strap.position.set(0.44, y, 0);
      panel.add(strap);
    }
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
