// Shared plumbing for the engine: the mutable context of one `apply` call and figure lookups.
// `apply` works on a deep copy of the state, so helpers mutate `ctx.s` freely.

import type { Content, MonsterStats } from '../content';
import { distance, hexEquals, hexKey, type Hex } from '../hex';
import type { EngineTask, Figure, FigureId, GameEvent, GameState, HeroState, MonsterState, Tile } from '../state';

export interface Ctx {
  s: GameState;
  c: Content;
  /** Events produced by this apply call (also appended to `s.log`). */
  ev: GameEvent[];
  /** Tasks produced by the task being run; turn.ts moves them to the front of the queue. */
  out: EngineTask[];
}

export function emit(ctx: Ctx, event: GameEvent): void {
  ctx.ev.push(event);
  ctx.s.log.push(event);
}

/** Schedules work to run right after the current task (depth first, in the given order). */
export function schedule(ctx: Ctx, ...tasks: EngineTask[]): void {
  ctx.out.push(...tasks);
}

export function figure(s: GameState, id: FigureId): Figure | undefined {
  return s.figures[id];
}

export function hero(s: GameState, id: FigureId): HeroState {
  const f = s.figures[id];
  if (!f || f.kind !== 'hero') throw new Error(`not a hero: ${id}`);
  return f;
}

export function heroes(s: GameState): HeroState[] {
  return Object.values(s.figures).filter((f): f is HeroState => f.kind === 'hero');
}

export function activeHeroes(s: GameState): HeroState[] {
  return heroes(s).filter((h) => !h.exhausted);
}

export function monsters(s: GameState): MonsterState[] {
  return Object.values(s.figures).filter((f): f is MonsterState => f.kind === 'monster');
}

/** On the board and able to be affected: not exhausted, not dead. */
export function isPresent(f: Figure | undefined): f is Figure {
  return !!f && !(f.kind === 'hero' && (f.exhausted || f.downed)) && f.hp > 0;
}

/** Heroes and their summons are one side, monsters the other. */
export function side(f: Figure): 'heroes' | 'monsters' {
  return f.kind === 'monster' ? 'monsters' : 'heroes';
}

export function areEnemies(a: Figure, b: Figure): boolean {
  return side(a) !== side(b);
}

export function enemiesOf(s: GameState, f: Figure): Figure[] {
  return Object.values(s.figures).filter((o) => isPresent(o) && areEnemies(f, o));
}

export function alliesOf(s: GameState, f: Figure): Figure[] {
  return Object.values(s.figures).filter((o) => isPresent(o) && o.id !== f.id && !areEnemies(f, o));
}

export function figureAt(s: GameState, hex: Hex): Figure | undefined {
  return Object.values(s.figures).find((f) => isPresent(f) && hexEquals(f.hex, hex));
}

export function tileAt(s: GameState, hex: Hex): Tile | undefined {
  return s.board.tiles[hexKey(hex)];
}

/** A hex a figure may stand on: revealed, not an obstacle, nobody there. */
export function isFreeHex(s: GameState, hex: Hex, ignore?: FigureId): boolean {
  const tile = tileAt(s, hex);
  if (!tile || tile.obstacle) return false;
  const other = figureAt(s, hex);
  return !other || other.id === ignore;
}

export function wallBetween(s: GameState, a: Hex, b: Hex): boolean {
  const ka = hexKey(a);
  const kb = hexKey(b);
  const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  return s.board.walls.includes(key);
}

export function within(a: Figure, b: Figure, range: number): boolean {
  return distance(a.hex, b.hex) <= range;
}

// ─── Scenario level derived values ─────────────────────────────────────────

export function trapDamage(s: GameState): number {
  return 2 + s.level;
}

/** Hazardous terrain hurts half a trap, rounded down (at least 1), on every hex entered. */
export function hazardDamage(s: GameState): number {
  return Math.max(1, Math.floor(trapDamage(s) / 2));
}

/** Gold per coin: 2 at levels 0–1, +1 for every 2 levels after. */
export function coinValue(level: number): number {
  return 2 + Math.floor(Math.max(0, level) / 2);
}

/** Victory bonus XP: 4 + 2 × level. */
export function victoryXp(level: number): number {
  return 4 + 2 * level;
}

/** Monster stats for the scenario level: hp +25% of base per level above 1 (rounded up),
 *  attack +1 at levels 3 and 5, shield and retaliate +1 at level 4 (for monsters that have them). */
export function scaleMonsterStats(base: MonsterStats, level: number): MonsterStats {
  const out: MonsterStats = { ...base };
  out.hp = Math.max(1, Math.ceil(base.hp * (1 + 0.25 * (level - 1))));
  out.attack = base.attack + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);
  if (base.shield) out.shield = base.shield + (level >= 4 ? 1 : 0);
  if (base.retaliate) out.retaliate = base.retaliate + (level >= 4 ? 1 : 0);
  return out;
}

/** Current stats of a monster or boss (base stats of its rank at the scenario level). */
export function monsterStats(ctx: { s: GameState; c: Content }, m: MonsterState): MonsterStats {
  if (m.rank === 'boss') {
    const boss = ctx.c.bosses[m.typeId];
    if (!boss) throw new Error(`unknown boss ${m.typeId}`);
    const stats: MonsterStats = { hp: m.maxHp, move: boss.move, attack: boss.attack };
    if (boss.range !== undefined) stats.range = boss.range;
    if (boss.shield !== undefined) stats.shield = boss.shield;
    return stats;
  }
  const type = ctx.c.monsters[m.typeId];
  if (!type) throw new Error(`unknown monster ${m.typeId}`);
  return scaleMonsterStats(m.rank === 'elite' ? type.elite : type.normal, ctx.s.level);
}

export function behaviourDeckId(c: Content, typeId: string): string {
  const deck = c.monsters[typeId]?.deck ?? c.bosses[typeId]?.deck;
  if (!deck) throw new Error(`no behaviour deck for ${typeId}`);
  return deck;
}

/** Decks are shared per monster TYPE (two types on the same template have separate piles). */
export function behaviourKey(typeId: string): string {
  return typeId;
}
