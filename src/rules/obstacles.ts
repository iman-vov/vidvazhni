// Breakable and movable obstacles (`breakable: { hp }` / `movable: true` on a room's obstacle or
// door). Only heroes break or move them; monsters path around them like any other obstacle.
// A breakable or movable door blocks like an obstacle until it is broken or pushed aside, then it
// opens like a door and reveals the room behind (rubble in a cave, a barricade outdoors).
// Breaking: a hero's attack step names obstacle hexes in `choice.obstacles` (with or instead of
// figure targets, within the step's target count), or an area covers them. No modifier is drawn:
// the obstacle takes the step's value (card, item, element and range bonuses folded in); bonuses
// that depend on a figure target, poison, conditions, push and pull do not apply.
// Moving: a hero spends a move step (`choice.moveObstacle`) on an adjacent movable obstacle; it is
// pushed aside (off the board). Immobilized heroes cannot.

import { areAdjacent, hexKey, type Hex } from './hex';
import { emit, tileAt, wallBetween, type Ctx } from './effects/context';
import { inRangeWithSight } from './effects/support';
import { openDoor } from './effects/move';
import { keptObjects } from './allies';
import { onObjectDestroyed, scenarioOf } from './scenarioRules';
import type { Figure, GameState, Tile } from './state';

/** The hit points of a breakable obstacle or closed breakable door on the tile. */
export function breakableOf(tile: Tile | undefined): { hp: number; maxHp: number } | undefined {
  if (!tile) return undefined;
  if (tile.door) return tile.door.open ? undefined : tile.door.breakable;
  return tile.obstacle ? tile.breakable : undefined;
}

/** A movable obstacle or a closed movable door. */
export function isMovable(tile: Tile | undefined): boolean {
  if (!tile) return false;
  if (tile.door) return !tile.door.open && !!tile.door.movable;
  return !!tile.obstacle && !!tile.movable;
}

/** Why the hero cannot hit the obstacle at `hex` with an attack of this range, or null. */
export function obstacleTargetError(ctx: Ctx, f: Figure, hex: Hex, range: number): string | null {
  if (f.kind !== 'hero') return 'only heroes break obstacles';
  if (!breakableOf(tileAt(ctx.s, hex))) return `nothing to break at ${hexKey(hex)}`;
  if (keptObjects(scenarioOf(ctx)).has(tileAt(ctx.s, hex)?.object?.id ?? '')) return `the heroes keep the object at ${hexKey(hex)}`;
  return inRangeWithSight(ctx, f.hex, hex, range) ? null : `obstacle at ${hexKey(hex)} out of range`;
}

/** Why the hero cannot push the obstacle at `hex` aside, or null. */
export function moveObstacleError(ctx: Ctx, f: Figure, hex: Hex): string | null {
  if (f.kind !== 'hero') return 'only heroes move obstacles';
  if (f.conditions.immobilize) return 'immobilized';
  if (!isMovable(tileAt(ctx.s, hex))) return `nothing to move at ${hexKey(hex)}`;
  if (!areAdjacent(f.hex, hex) || wallBetween(ctx.s, f.hex, hex)) return 'the obstacle must be adjacent';
  return null;
}

/** Deals `amount` to a breakable obstacle; at 0 it is gone (a door opens). */
export function hitObstacle(ctx: Ctx, byId: string, hex: Hex, amount: number): void {
  const tile = tileAt(ctx.s, hex);
  const b = breakableOf(tile);
  if (!tile || !b || amount <= 0) return;
  const dealt = Math.min(amount, b.hp);
  b.hp -= dealt;
  const at: Hex = [hex[0], hex[1]];
  if (b.hp > 0) {
    emit(ctx, { type: 'obstacleDamaged', hex: at, damage: dealt, hp: b.hp, byId });
    return;
  }
  delete tile.obstacle;
  if (tile.door) {
    delete tile.door.breakable;
    emit(ctx, { type: 'obstacleDestroyed', hex: at, byId, door: true });
    openDoor(ctx, at);
  } else {
    delete tile.breakable;
    emit(ctx, { type: 'obstacleDestroyed', hex: at, byId });
    if (tile.object) {
      // A totem or a nest: gone for good, counted for the `destroy` goal.
      (ctx.s.destroyedObjects ??= []).push(tile.object.id);
      emit(ctx, { type: 'objectChanged', objectId: tile.object.id, hex: at, state: 'destroyed', byId });
      onObjectDestroyed(ctx, tile.object.id);
      delete tile.object;
    }
  }
}

/** Pushes a movable obstacle aside (a door opens). */
export function pushObstacleAside(ctx: Ctx, byId: string, hex: Hex): void {
  const tile = tileAt(ctx.s, hex);
  if (!tile || !isMovable(tile)) return;
  delete tile.obstacle;
  const at: Hex = [hex[0], hex[1]];
  if (tile.door) {
    delete tile.door.movable;
    emit(ctx, { type: 'obstacleMoved', hex: at, byId, door: true });
    openDoor(ctx, at);
  } else {
    delete tile.movable;
    emit(ctx, { type: 'obstacleMoved', hex: at, byId });
  }
}

/** Obstacles and closed doors heroes can break or move, for the UI and bots. */
export function interactiveObstacles(s: GameState): { hex: Hex; door: boolean; breakable?: { hp: number; maxHp: number }; movable?: true }[] {
  const out: { hex: Hex; door: boolean; breakable?: { hp: number; maxHp: number }; movable?: true }[] = [];
  for (const [key, tile] of Object.entries(s.board.tiles)) {
    const b = breakableOf(tile);
    const m = isMovable(tile);
    if (!b && !m) continue;
    const [q, r] = key.split(',').map(Number) as [number, number];
    out.push({ hex: [q, r], door: !!tile.door, ...(b ? { breakable: { ...b } } : {}), ...(m ? { movable: true as const } : {}) });
  }
  return out;
}
