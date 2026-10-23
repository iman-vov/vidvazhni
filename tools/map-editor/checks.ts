// Map editor checks: the scenario JSON schema, the shared cross-checks of tests/data/crossref.ts and
// a few more that only matter for maps (keys and quest items that must come from somewhere,
// hexes nobody can walk to). Also the spawn summary and the line-of-sight preview.

import Ajv from 'ajv';
import type { Content, ScenarioDef } from '../../src/rules/content';
import { DIRECTIONS, add, hexKey, type Hex } from '../../src/rules/hex';
import { lineOfSight, wallIndex } from '../../src/rules/los';
import type { BoardState, Tile } from '../../src/rules/state';
import schema from '../../data/schema/scenarios.schema.json';
import { checkScenario } from '../../tests/data/crossref';
import { HERO_KEYS, goalHexes, hexOwners, type HeroKey } from './model';

export interface Issue {
  level: 'error' | 'warning';
  msg: string;
}

const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

export function schemaErrors(s: unknown): string[] {
  if (validate(s)) return [];
  return (validate.errors ?? []).map((e) => `schema: ${e.instancePath || '/'} ${e.message ?? ''}`.trim());
}

/** Story items the scenario makes available: chest quest items and monster drops. */
export function questItems(s: ScenarioDef): Set<string> {
  const out = new Set<string>();
  for (const room of s.rooms) {
    for (const c of room.chests ?? []) if (c.loot?.questItem) out.add(c.loot.questItem);
    for (const d of room.drops ?? []) out.add(d.questItem);
  }
  return out;
}

/** Hexes a walking figure can never enter: obstacles and blocking objects. */
export function blockedHexes(s: ScenarioDef): Set<string> {
  const out = new Set<string>();
  for (const room of s.rooms) {
    for (const o of room.obstacles ?? []) out.add(hexKey(o.hex));
    for (const o of room.objects ?? []) if (o.blocks) out.add(hexKey(o.hex));
  }
  return out;
}

/** Hexes reachable on foot from the start hexes with every door open (thin walls block). */
export function walkable(s: ScenarioDef): Set<string> {
  const owners = hexOwners(s);
  const blocked = blockedHexes(s);
  const walls = new Set<string>();
  for (const room of s.rooms)
    for (const [a, b] of room.walls ?? []) {
      walls.add(`${hexKey(a)}|${hexKey(b)}`);
      walls.add(`${hexKey(b)}|${hexKey(a)}`);
    }
  const seen = new Set<string>();
  const queue: Hex[] = s.startHexes.filter((h) => owners.has(hexKey(h)));
  for (const h of queue) seen.add(hexKey(h));
  while (queue.length) {
    const h = queue.shift() as Hex;
    for (const d of DIRECTIONS) {
      const n = add(h, d);
      const k = hexKey(n);
      if (seen.has(k) || !owners.has(k) || blocked.has(k) || walls.has(`${hexKey(h)}|${k}`)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen;
}

/** Checks that only matter for maps, on top of `checkScenario`. */
export function mapIssues(s: ScenarioDef, content: Content): Issue[] {
  const out: Issue[] = [];
  const error = (msg: string) => out.push({ level: 'error', msg });
  const warn = (msg: string) => out.push({ level: 'warning', msg });
  const owners = hexOwners(s);
  const items = questItems(s);
  const blocked = blockedHexes(s);

  for (const room of s.rooms) {
    for (const d of room.doors ?? [])
      if (d.key && !items.has(d.key)) error(`door at ${hexKey(d.hex)} needs key ${d.key}, but no chest or drop gives it`);
    for (const d of room.drops ?? []) {
      if (!(room.spawns ?? []).some((sp) => sp.monster === d.monster))
        error(`drop ${d.questItem}: no ${d.monster} spawns in ${room.id}`);
    }
    for (const sp of room.spawns ?? []) if (Object.keys(sp.by).length === 0) warn(`spawn ${sp.monster} at ${hexKey(sp.hex)} never appears`);
    for (const t of room.terrain ?? []) if (t.terrain === 'normal') warn(`terrain at ${hexKey(t.hex)} is "normal" (can be dropped)`);
  }

  const g = s.goal;
  if (g.type === 'killBoss' && !s.rooms.some((r) => (r.spawns ?? []).some((sp) => sp.monster === g.boss)))
    error(`goal boss ${g.boss} is never spawned`);
  if (g.type === 'carryItem' && !items.has(g.item)) error(`goal item ${g.item}: no chest or drop gives it`);
  for (const h of goalHexes(s)) if (blocked.has(hexKey(h))) error(`goal hex ${hexKey(h)} is blocked`);

  const sources = new Set(s.rooms.flatMap((r) => (r.objects ?? []).map((o) => o.id)));
  for (const o of s.forkOrbs?.eachRound ?? [])
    if (!sources.has(o.source)) warn(`orb ${o.orb} each round: source ${o.source} is not an object id`);
  for (const o of s.forkOrbs?.atStart ?? [])
    if (o.hex && !owners.has(hexKey(o.hex))) error(`orb ${o.orb} at start: hex ${hexKey(o.hex)} is outside every room`);

  // Everything that matters must be reachable on foot from the start (doors open).
  const reach = walkable(s);
  const must: [Hex, string][] = [];
  for (const room of s.rooms) {
    for (const sp of room.spawns ?? []) must.push([sp.hex, `spawn ${sp.monster}`]);
    for (const c of room.chests ?? []) must.push([c.hex, `chest ${c.id}`]);
    for (const d of room.doors ?? []) must.push([d.hex, `door to ${d.to}`]);
    for (const c of room.coins ?? []) must.push([c, 'coins']);
  }
  for (const h of goalHexes(s)) must.push([h, 'goal hex']);
  for (const [h, what] of must) if (!reach.has(hexKey(h))) error(`${what} at ${hexKey(h)} cannot be reached on foot`);
  const stranded = [...owners.keys()].filter((k) => !reach.has(k) && !blocked.has(k));
  if (stranded.length) warn(`${stranded.length} hex(es) cannot be reached on foot: ${stranded.slice(0, 6).join(' ')}`);

  // Objects next to which a hero must stand (levers, braziers) need a free neighbour.
  for (const room of s.rooms)
    for (const o of room.objects ?? []) {
      if (!o.blocks) continue;
      if (!DIRECTIONS.some((d) => reach.has(hexKey(add(o.hex, d))))) error(`object ${o.id} has no reachable neighbour`);
    }
  return out;
}

/** Schema, shared cross-checks and map checks, errors first. */
export function checkAll(s: ScenarioDef, content: Content): Issue[] {
  const schema = schemaErrors(s);
  if (schema.length) return schema.map((msg) => ({ level: 'error', msg }));
  const issues: Issue[] = [
    ...checkScenario(s, content).map((msg): Issue => ({ level: 'error', msg: msg.replace(`${s.id}: `, '') })),
    ...mapIssues(s, content),
  ];
  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}

/** room → monster → [normal, elite] for each hero count. */
export type SpawnSummary = Record<string, Record<string, Record<HeroKey, [number, number]>>>;

export function spawnSummary(s: ScenarioDef): SpawnSummary {
  const out: SpawnSummary = {};
  for (const room of s.rooms)
    for (const sp of room.spawns ?? []) {
      const byMonster = (out[room.id] ??= {});
      const counts = (byMonster[sp.monster] ??= { '2': [0, 0], '3': [0, 0], '4': [0, 0] });
      for (const k of HERO_KEYS) {
        const rank = sp.by[k];
        if (rank) counts[k][rank === 'elite' ? 1 : 0]++;
      }
    }
  return out;
}

/** "2+0 / 2+1 / 3+1", the notation of the design doc tables. */
export function formatCounts(c: Record<HeroKey, [number, number]>): string {
  return HERO_KEYS.map((k) => `${c[k][0]}+${c[k][1]}`).join(' / ');
}

/** Line of sight with every room revealed, by the engine's own rule (src/rules/los.ts). */
export function sightLine(s: ScenarioDef, a: Hex, b: Hex): boolean {
  const tiles: Record<string, Tile> = {};
  for (const room of s.rooms) for (const h of room.hexes) tiles[hexKey(h)] = { room: room.id, terrain: 'normal' } as Tile;
  const walls: string[] = [];
  for (const room of s.rooms)
    for (const [x, y] of room.walls ?? []) {
      const kx = hexKey(x);
      const ky = hexKey(y);
      walls.push(kx < ky ? `${kx}|${ky}` : `${ky}|${kx}`);
    }
  const board: BoardState = { tiles, walls, revealedRooms: s.rooms.map((r) => r.id) } as BoardState;
  return lineOfSight(wallIndex(board), a, b);
}

export function hexCount(s: ScenarioDef): number {
  return s.rooms.reduce((n, r) => n + r.hexes.length, 0);
}
