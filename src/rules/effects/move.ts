// Movement: player paths, walking hex by hex (traps, hazardous terrain, doors), push and pull.

import type { Step } from '../content';
import { validatePath } from '../geometry';
import { DIRECTIONS, add, areAdjacent, distance, hexEquals, type Hex } from '../hex';
import { passiveItemValue } from '../items';
import { moveObstacleError, pushObstacleAside } from '../obstacles';
import { onHeroEnters } from '../events';
import { addNewGroupsToOrder } from '../round';
import { doorLocked } from '../scenarioRules';
import { soak, soakPenalty } from '../marsh';
import { revealRoom } from '../setup';
import type { EngineTask, Figure, FigureId, StepChoice } from '../state';
import { emit, hazardDamage, isFreeHex, isPresent, schedule, tileAt, wallBetween, type Ctx } from './context';
import type { StepResult } from './support';

type S<T extends Step['type']> = Extract<Step, { type: T }>;
type MoveTask = Extract<EngineTask, { t: 'move' }>;

/** A hero's chosen move. A closed door may only be the last hex of the path. Instead of a path the
 *  hero may spend the move pushing an adjacent movable obstacle aside (`choice.moveObstacle`). */
export function performMove(ctx: Ctx, f: Figure, step: S<'move'>, choice: StepChoice, bonus = 0): StepResult {
  if (f.conditions.immobilize) return 'immobilized';
  if (choice.moveObstacle) {
    if (choice.path?.length) return 'either move or push an obstacle aside';
    const hex = choice.moveObstacle;
    const err = moveObstacleError(ctx, f, hex);
    if (err) return err;
    return () => pushObstacleAside(ctx, f.id, hex);
  }
  const path = choice.path ?? [];
  if (path.length === 0) return 'choose a path';
  const penalty = (f.kind === 'hero' ? passiveItemValue(ctx, f, 'movePenalty') : 0) + soakPenalty(f);
  const result = validatePath(ctx.s, path, Math.max(0, step.value + bonus - penalty), {
    figureId: f.id,
    ...(step.jump ? { jump: true } : {}),
    ...(step.fly ? { fly: true } : {}),
  });
  if (!result) return 'illegal path';
  const doorAt = path.findIndex((h) => tileAt(ctx.s, h)?.door?.open === false);
  if (doorAt >= 0 && doorAt !== path.length - 1) return 'a closed door ends the move';
  if (doorAt >= 0 && doorLocked(ctx.s, tileAt(ctx.s, path[doorAt] as Hex))) return 'the door is locked';
  if (step.straightLine && !isStraightLine(f.hex, path)) return 'move must be in a straight line';
  return () =>
    schedule(ctx, {
      t: 'move',
      figureId: f.id,
      path: path.map((h) => [h[0], h[1]] as Hex),
      ...(step.jump ? { jump: true } : {}),
      ...(step.fly ? { fly: true } : {}),
    });
}

function isStraightLine(start: Hex, path: Hex[]): boolean {
  const first = path[0];
  if (!first) return true;
  const dir: Hex = [first[0] - start[0], first[1] - start[1]];
  let prev = start;
  for (const h of path) {
    if (!hexEquals(add(prev, dir), h)) return false;
    prev = h;
  }
  return true;
}

/** Task: walk the path. Stops after a hex that deals damage, so the damage (and a hero's choice to
 *  avoid it) resolves before the rest of the path. Flying ignores traps and terrain; jumping
 *  ignores everything but the landing hex. */
export function runMove(ctx: Ctx, task: MoveTask): void {
  const f = ctx.s.figures[task.figureId];
  if (!isPresent(f)) return;
  const walked: Hex[] = [];
  for (let i = 0; i < task.path.length; i++) {
    const hex = task.path[i] as Hex;
    f.hex = [hex[0], hex[1]];
    walked.push(f.hex);
    const last = i === task.path.length - 1;
    const touches = !task.fly && (!task.jump || last);
    const tile = tileAt(ctx.s, hex);
    let damage: EngineTask | null = null;
    if (touches && tile?.trap) {
      const trap = tile.trap;
      delete tile.trap;
      emit(ctx, { type: 'trapTriggered', figureId: f.id, damage: trap.damage });
      damage = { t: 'damage', targetId: f.id, amount: trap.damage, source: 'trap', avoidable: true, conditions: trap.conditions };
    } else if (touches && tile?.terrain === 'hazardous') {
      damage = { t: 'damage', targetId: f.id, amount: hazardDamage(ctx.s), source: 'hazard', avoidable: true };
    }
    // Deep water (s11): the move ends here, pushed or walking, and the next turn is 1 shorter.
    if (touches && tile?.terrain === 'deep') {
      soak(f);
      emit(ctx, moved(f.id, walked, task));
      if (damage) schedule(ctx, damage);
      return;
    }
    if (f.kind === 'hero' && !task.forced && tile?.door && !tile.door.open) {
      emit(ctx, moved(f.id, walked, task));
      openDoor(ctx, hex);
      return;
    }
    // An ambush (scenario event `heroEnters`) stops the move on the hex that sprang it.
    if (f.kind === 'hero' && onHeroEnters(ctx, f)) {
      emit(ctx, moved(f.id, walked, task));
      if (damage) schedule(ctx, damage);
      return;
    }
    if (damage) {
      emit(ctx, moved(f.id, walked, task));
      schedule(ctx, damage);
      const rest = task.path.slice(i + 1);
      if (rest.length > 0) schedule(ctx, { ...task, path: rest });
      return;
    }
  }
  if (walked.length > 0) emit(ctx, moved(f.id, walked, task));
}

function moved(figureId: FigureId, path: Hex[], task: MoveTask) {
  if (task.forced) return { type: 'pushed' as const, figureId, path: [...path], ...(task.forced === 'pull' ? { pull: true } : {}) };
  return {
    type: 'moved' as const,
    figureId,
    path: [...path],
    ...(task.jump ? { jump: true } : {}),
    ...(task.fly ? { fly: true } : {}),
  };
}

/** Opening a door reveals the room behind it; the half can no longer be undone. */
export function openDoor(ctx: Ctx, hex: Hex): void {
  const tile = tileAt(ctx.s, hex);
  if (!tile?.door || tile.door.open) return;
  tile.door.open = true;
  if (ctx.s.half) ctx.s.half.committed = true;
  ctx.s.undoPoint = null;
  const scenario = ctx.c.scenarios[ctx.s.scenarioId];
  if (scenario) revealRoom(ctx, scenario, tile.door.to);
  addNewGroupsToOrder(ctx);
}

// ─── Push and pull ─────────────────────────────────────────────────────────

/** Validates a push (away from `from`) or pull (towards it) path of at most `value` hexes. */
export function validForcedPath(ctx: Ctx, target: Figure, from: Hex, path: Hex[], value: number, kind: 'push' | 'pull'): boolean {
  if (path.length > value) return false;
  let prev = target.hex;
  for (const hex of path) {
    if (!areAdjacent(prev, hex) || wallBetween(ctx.s, prev, hex) || !isFreeHex(ctx.s, hex, target.id)) return false;
    if (tileAt(ctx.s, hex)?.door?.open === false) return false;
    const before = distance(from, prev);
    const after = distance(from, hex);
    if (kind === 'push' ? after <= before : after >= before) return false;
    prev = hex;
  }
  return true;
}

/** Deterministic forced path for automatic pushes/pulls: each hex is the first (in direction
 *  order) free neighbour that moves the target the right way. */
export function autoForcedPath(ctx: Ctx, target: Figure, from: Hex, value: number, kind: 'push' | 'pull'): Hex[] {
  const path: Hex[] = [];
  let prev = target.hex;
  for (let i = 0; i < value; i++) {
    const options = DIRECTIONS.map((d) => add(prev, d)).filter((hex) => validForcedPath(ctx, { ...target, hex: prev }, from, [hex], 1, kind));
    // Prefer the hex that changes the distance the most, then direction order.
    const best = options.sort((a, b) => (kind === 'push' ? distance(from, b) - distance(from, a) : distance(from, a) - distance(from, b)))[0];
    if (!best || path.some((p) => hexEquals(p, best))) break;
    path.push(best);
    prev = best;
  }
  return path;
}

export function forcedMove(ctx: Ctx, target: Figure, path: Hex[], kind: 'push' | 'pull'): void {
  if (path.length === 0) return;
  schedule(ctx, { t: 'move', figureId: target.id, path, forced: kind });
}
