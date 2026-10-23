// Map editor model: pure edits on a ScenarioDef (no DOM). Every edit mutates the scenario in place;
// the UI snapshots it before each edit for undo. Used by the editor page and by the scenario tests.

import type { RoomDef, ScenarioDef } from '../../src/rules/content';
import { DIRECTIONS, add, areAdjacent, hexEquals, hexKey, parseHexKey, type Hex } from '../../src/rules/hex';

export type HeroKey = '2' | '3' | '4';
export const HERO_KEYS: readonly HeroKey[] = ['2', '3', '4'];

/** Object kinds the editor knows; any other string is allowed too. */
export const OBJECT_KINDS: readonly { kind: string; blocks: boolean; state?: string }[] = [
  { kind: 'lever', blocks: true, state: 'up' },
  { kind: 'brazier', blocks: true, state: 'unlit' },
  { kind: 'rune', blocks: false },
  { kind: 'millstone', blocks: true },
];

export function emptyScenario(id = 's9', number = 9): ScenarioDef {
  return {
    id,
    number,
    draft: true,
    goal: { type: 'killAll' },
    startRoom: `${id}.a`,
    startHexes: [],
    introduces: [],
    rooms: [{ id: `${id}.a`, hexes: [] }],
    reward: { goldEach: 10 },
  };
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** hex key → id of the room that owns it. */
export function hexOwners(s: ScenarioDef): Map<string, string> {
  const out = new Map<string, string>();
  for (const room of s.rooms) for (const h of room.hexes) out.set(hexKey(h), room.id);
  return out;
}

export function roomOf(s: ScenarioDef, hex: Hex): RoomDef | undefined {
  return s.rooms.find((r) => r.hexes.some((h) => hexEquals(h, hex)));
}

export function roomById(s: ScenarioDef, id: string): RoomDef | undefined {
  return s.rooms.find((r) => r.id === id);
}

// ─── Hex-keyed lists of a room ──────────────────────────────────────────

/** Room lists whose entries sit on one hex. `coins` holds bare hexes. */
export type HexList = 'obstacles' | 'terrain' | 'traps' | 'doors' | 'spawns' | 'chests' | 'objects' | 'coins';
export const HEX_LISTS: readonly HexList[] = ['spawns', 'doors', 'chests', 'objects', 'obstacles', 'traps', 'coins', 'terrain'];

function entryHex(list: HexList, entry: unknown): Hex {
  return list === 'coins' ? (entry as Hex) : (entry as { hex: Hex }).hex;
}

function listOf(room: RoomDef, list: HexList): unknown[] | undefined {
  return room[list] as unknown[] | undefined;
}

/** Index of the entry of `list` on `hex`, or -1. */
export function findAt(room: RoomDef, list: HexList, hex: Hex): number {
  return (listOf(room, list) ?? []).findIndex((e) => hexEquals(entryHex(list, e), hex));
}

export function entryAt<T = unknown>(room: RoomDef, list: HexList, hex: Hex): T | undefined {
  const i = findAt(room, list, hex);
  return i < 0 ? undefined : (listOf(room, list)?.[i] as T);
}

export function removeAt(room: RoomDef, list: HexList, hex: Hex): boolean {
  const items = listOf(room, list);
  if (!items) return false;
  const i = findAt(room, list, hex);
  if (i < 0) return false;
  items.splice(i, 1);
  if (items.length === 0) delete room[list];
  return true;
}

/** Replaces (or adds) the entry of `list` on the entry's hex. */
export function putAt(room: RoomDef, list: HexList, entry: unknown): void {
  const hex = entryHex(list, entry);
  const items = (listOf(room, list) ?? []) as unknown[];
  const i = items.findIndex((e) => hexEquals(entryHex(list, e), hex));
  if (i >= 0) items[i] = entry;
  else items.push(entry);
  (room as unknown as Record<string, unknown>)[list] = items;
}

/** Things that occupy a hex exclusively (cross-check: no two on one hex). */
const EXCLUSIVE: readonly HexList[] = ['obstacles', 'doors', 'spawns', 'chests', 'objects', 'traps'];

/** Clears every exclusive thing on the hex, so a new one can be placed there. */
export function clearExclusive(room: RoomDef, hex: Hex): void {
  for (const list of EXCLUSIVE) removeAt(room, list, hex);
}

// ─── Hexes ───────────────────────────────────────────────────────────────

/** Adds the hex to `roomId`; a hex owned by another room moves over together with its contents. */
export function paintHex(s: ScenarioDef, hex: Hex, roomId: string): boolean {
  const target = roomById(s, roomId);
  if (!target) return false;
  const from = roomOf(s, hex);
  if (from === target) return false;
  if (from) {
    from.hexes = from.hexes.filter((h) => !hexEquals(h, hex));
    for (const list of HEX_LISTS) {
      const e = entryAt(from, list, hex);
      if (e !== undefined) {
        removeAt(from, list, hex);
        putAt(target, list, e);
      }
    }
  }
  target.hexes.push([hex[0], hex[1]]);
  return true;
}

/** Removes the hex and everything that refers to it. */
export function eraseHex(s: ScenarioDef, hex: Hex): boolean {
  const room = roomOf(s, hex);
  if (!room) return false;
  room.hexes = room.hexes.filter((h) => !hexEquals(h, hex));
  for (const list of HEX_LISTS) removeAt(room, list, hex);
  for (const r of s.rooms) {
    if (!r.walls) continue;
    r.walls = r.walls.filter(([a, b]) => !hexEquals(a, hex) && !hexEquals(b, hex));
    if (r.walls.length === 0) delete r.walls;
  }
  s.startHexes = s.startHexes.filter((h) => !hexEquals(h, hex));
  const g = s.goal;
  if (g.type === 'reachExit') g.hexes = g.hexes.filter((h) => !hexEquals(h, hex));
  if (g.type === 'carryItem') g.to = g.to.filter((h) => !hexEquals(h, hex));
  for (const o of s.forkOrbs?.atStart ?? []) if (o.hex && hexEquals(o.hex, hex)) delete o.hex;
  return true;
}

// ─── Walls ───────────────────────────────────────────────────────────────

export function wallIndexOf(s: ScenarioDef, a: Hex, b: Hex): { room: RoomDef; index: number } | undefined {
  for (const room of s.rooms) {
    const index = (room.walls ?? []).findIndex(
      ([x, y]) => (hexEquals(x, a) && hexEquals(y, b)) || (hexEquals(x, b) && hexEquals(y, a)),
    );
    if (index >= 0) return { room, index };
  }
  return undefined;
}

/** Toggles the thin wall between two adjacent existing hexes; it is stored on the room of `a`. */
export function toggleWall(s: ScenarioDef, a: Hex, b: Hex): boolean {
  if (!areAdjacent(a, b)) return false;
  const found = wallIndexOf(s, a, b);
  if (found) {
    found.room.walls?.splice(found.index, 1);
    if (found.room.walls?.length === 0) delete found.room.walls;
    return true;
  }
  const room = roomOf(s, a);
  if (!room || !roomOf(s, b)) return false;
  (room.walls ??= []).push([
    [a[0], a[1]],
    [b[0], b[1]],
  ]);
  return true;
}

/**
 * Walls every border between two rooms except next to a door hex, the convention the engine and
 * the cross-checks expect (a door is the only way between rooms). Returns how many walls it added.
 */
export function sealRooms(s: ScenarioDef): number {
  const owners = hexOwners(s);
  const doors = new Set(s.rooms.flatMap((r) => (r.doors ?? []).map((d) => hexKey(d.hex))));
  let added = 0;
  for (const room of s.rooms)
    for (const h of room.hexes) {
      if (doors.has(hexKey(h))) continue;
      for (const d of DIRECTIONS) {
        const n = add(h, d);
        const other = owners.get(hexKey(n));
        if (!other || other === room.id || doors.has(hexKey(n))) continue;
        if (wallIndexOf(s, h, n)) continue;
        (room.walls ??= []).push([
          [h[0], h[1]],
          [n[0], n[1]],
        ]);
        added++;
      }
    }
  return added;
}

/** The neighbour of `hex` whose shared edge is closest to a point given relative to the hex centre
 *  (world units of hexLayout: +x right, +z down). */
export function neighbourToward(hex: Hex, dx: number, dz: number): Hex {
  let best = DIRECTIONS[0]!;
  let bestDot = -Infinity;
  for (const d of DIRECTIONS) {
    const wx = 1.5 * d[0];
    const wz = Math.sqrt(3) * (d[1] + d[0] / 2);
    const dot = wx * dx + wz * dz;
    if (dot > bestDot) {
      bestDot = dot;
      best = d;
    }
  }
  return add(hex, best);
}

// ─── Hex lists of the scenario ──────────────────────────────────────────

export function toggleStart(s: ScenarioDef, hex: Hex): void {
  const i = s.startHexes.findIndex((h) => hexEquals(h, hex));
  if (i >= 0) s.startHexes.splice(i, 1);
  else s.startHexes.push([hex[0], hex[1]]);
}

/** Exit hexes (reachExit) or delivery hexes (carryItem); false when the goal has none. */
export function toggleGoalHex(s: ScenarioDef, hex: Hex): boolean {
  const g = s.goal;
  const list = g.type === 'reachExit' ? g.hexes : g.type === 'carryItem' ? g.to : undefined;
  if (!list) return false;
  const i = list.findIndex((h) => hexEquals(h, hex));
  if (i >= 0) list.splice(i, 1);
  else list.push([hex[0], hex[1]]);
  return true;
}

export function goalHexes(s: ScenarioDef): Hex[] {
  const g = s.goal;
  return g.type === 'reachExit' ? g.hexes : g.type === 'carryItem' ? g.to : [];
}

/** Renames a room and every reference to it (doors, start room, ids prefix kept by the caller). */
export function renameRoom(s: ScenarioDef, from: string, to: string): boolean {
  if (from === to || roomById(s, to)) return false;
  const room = roomById(s, from);
  if (!room) return false;
  room.id = to;
  for (const r of s.rooms) for (const d of r.doors ?? []) if (d.to === from) d.to = to;
  if (s.startRoom === from) s.startRoom = to;
  return true;
}

export function deleteRoom(s: ScenarioDef, id: string): void {
  const room = roomById(s, id);
  if (!room) return;
  for (const h of [...room.hexes]) eraseHex(s, h);
  s.rooms = s.rooms.filter((r) => r !== room);
  for (const r of s.rooms) {
    if (!r.doors) continue;
    r.doors = r.doors.filter((d) => d.to !== id);
    if (r.doors.length === 0) delete r.doors;
  }
}

/** Hexes sorted by column then row, the order used in saved files. */
export function sortHexes(hexes: Hex[]): Hex[] {
  return [...hexes].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Offset (column, row) → axial, the "odd-q" layout of hexLayout.rectangleHexes. */
export function offsetToAxial(col: number, row: number): Hex {
  return [col, row - Math.floor(col / 2)];
}

export function axialToOffset([q, r]: Hex): [number, number] {
  return [q, r + Math.floor(q / 2)];
}

// ─── Saving ──────────────────────────────────────────────────────────────

/** Canonical key order of a scenario file (the order of s1.json). */
const SCENARIO_KEYS = [
  'id', 'number', 'draft', 'goal', 'startRoom', 'startHexes', 'introduces', 'specials', 'forkOrbs', 'rooms', 'reward',
];
const ROOM_KEYS = [
  'id', 'hexes', 'walls', 'terrain', 'obstacles', 'traps', 'doors', 'spawns', 'drops', 'coins', 'chests', 'objects',
];

function ordered<T extends object>(obj: T, keys: readonly string[]): T {
  const src = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  for (const k of Object.keys(src)) if (!(k in out) && src[k] !== undefined) out[k] = src[k];
  return out as T;
}

/** Drops empty optional lists and sorts room hexes, so files diff cleanly. */
export function normalize(s: ScenarioDef): ScenarioDef {
  const out = ordered(clone(s), SCENARIO_KEYS);
  if (out.specials?.length === 0) delete out.specials;
  if (out.forkOrbs) {
    if (out.forkOrbs.atStart?.length === 0) delete out.forkOrbs.atStart;
    if (out.forkOrbs.eachRound?.length === 0) delete out.forkOrbs.eachRound;
    if (!out.forkOrbs.atStart && !out.forkOrbs.eachRound) delete out.forkOrbs;
  }
  if (out.reward.items?.length === 0) delete out.reward.items;
  if (out.reward.unlock?.length === 0) delete out.reward.unlock;
  out.rooms = out.rooms.map((room) => {
    const r = ordered(room, ROOM_KEYS);
    r.hexes = sortHexes(r.hexes);
    for (const k of ROOM_KEYS.slice(2)) {
      const v = (r as unknown as Record<string, unknown>)[k];
      if (Array.isArray(v) && v.length === 0) delete (r as unknown as Record<string, unknown>)[k];
    }
    return r;
  });
  return out;
}

/** JSON in the style of s1.json: short objects and hex lists stay on one line. */
export function formatScenario(s: ScenarioDef): string {
  return `${fmt(normalize(s), 0)}\n`;
}

const WIDTH = 110;
const HEXES_PER_LINE = 8;

function compact(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(compact).join(', ')}]`;
  if (v && typeof v === 'object') {
    const parts = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`);
    return parts.length ? `{ ${parts.join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}

function isHex(v: unknown): boolean {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number');
}

/** `used` = columns already taken on the line where the value starts. */
function fmt(v: unknown, indent: number, used = indent): string {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const one = compact(v);
  if (v === null || typeof v !== 'object' || used + one.length <= WIDTH) return one;
  if (Array.isArray(v)) {
    // Lists of hexes wrap every 8 hexes.
    if (v.every(isHex)) {
      const lines: string[] = [];
      let line = '';
      let count = 0;
      for (const h of v) {
        const c = compact(h);
        if (count === HEXES_PER_LINE) {
          lines.push(line);
          line = '';
          count = 0;
        }
        line += (line ? ', ' : '') + c;
        count++;
      }
      if (line) lines.push(line);
      return `[\n${lines.map((l, i) => inner + l + (i < lines.length - 1 ? ',' : '')).join('\n')}\n${pad}]`;
    }
    return `[\n${v.map((x) => inner + fmt(x, indent + 2)).join(',\n')}\n${pad}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  const lines = entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, indent + 2, indent + k.length + 6)}`);
  return `{\n${lines.join(',\n')}\n${pad}}`;
}

export { hexKey, parseHexKey };
