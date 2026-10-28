// Glass Town allies (docs/design/act3.md, «Нові правила» s17 and s20).
//
//   automatonHelpers (s17) A hero turning a wind-up key (an object of kind `wind-up-key` with its
//                   own `interact`) winds the sleeping monster nearest to it, within 2 hexes, onto
//                   the heroes' side: it becomes an allied NPC under the same id that walks and hits
//                   the nearest monster like a hero's summon, on its own initiative. Every other
//                   sleeper within 2 hexes of the key wakes up as an enemy (sleep.ts).
//
//   allyPhase (s20) When a boss falls to half health it stops being an enemy: it turns, on the
//                   spot and under the same id, into an allied NPC (`SummonState.npc.fights`) that
//                   never walks and hits the monster next to it on its own initiative; its
//                   behaviour deck is set aside. Its death does not lose. While the goal is
//                   `protect {object}`, every monster goes for that object instead of the heroes:
//                   it walks (or flies) next to it and each of its attacks takes 1 hp off the
//                   object (secondary check `objectIntact`). Heroes never hit an object a
//                   `protect` goal keeps, now or after a switch, not even with an area. The goal switch itself is the data's `bossHalfHp` event with
//                   `setGoal`, which fires first.

import type { ScenarioDef, ScenarioGoal, Step } from './content';
import { emit, monsterStats, tileAt, wallBetween, type Ctx } from './effects/context';
import { areAdjacent, hexKey, neighbors, parseHexKey, type Hex } from './hex';
import { activeGoal } from './objectives';
import { hitObstacle } from './obstacles';
import { hasSpecial, scenarioOf } from './scenarioRules';
import { sleepersNear, wake } from './sleep';
import type { Figure, GameState, MonsterState, SummonState } from './state';

/** What a monster's attack takes off the protected object. */
export const HEART_HIT = 1;

/** A wind-up key reaches the sleeping automatons this close. */
export const WIND_UP_REACH = 2;
/** The object kind a hero turns to wind an automaton up (`interact` in the data). */
export const WIND_UP_KEY = 'wind-up-key';

/** An ally's initiative when the data gives none: after most monster cards of the round. */
export const ALLY_INITIATIVE = 50;

/** `allyPhase`: the boss `m` (just at half health) becomes an allied NPC in place. */
export function becomeAlly(ctx: Ctx, m: MonsterState): void {
  if (hasSpecial(ctx, 'allyPhase')) turnAlly(ctx, m, 0);
}

/** The monster `m` becomes an allied NPC under the same id, with its attack and `move`; it keeps
 *  its hp and its own shield and loses its conditions. */
export function turnAlly(ctx: Ctx, m: MonsterState, move: number): void {
  const typeId = m.typeId;
  const stats = monsterStats(ctx, m);
  const old = m as unknown as Record<string, unknown>;
  for (const k of ['typeId', 'rank', 'number', 'summonedRound', 'attackedBy', 'summonerId', 'room', 'drops', 'bossPhase', 'tag', 'asleep']) delete old[k];
  const ally: Partial<SummonState> = {
    kind: 'summon',
    ownerId: m.id,
    summonId: typeId,
    monsterType: typeId,
    npc: { initiative: ALLY_INITIATIVE, fights: true },
    move,
    attack: stats.attack,
    ...(stats.range !== undefined ? { range: stats.range } : {}),
    shields: m.shields.filter((sh) => sh.source === 'stats'),
    conditions: {},
  };
  Object.assign(old, ally);
  emit(ctx, { type: 'allyJoined', figureId: m.id });
}

/** `automatonHelpers` (s17): turning a wind-up key winds the sleeping monster nearest to it
 *  (within `WIND_UP_REACH`) onto the heroes' side; every other sleeper that near wakes as an enemy. */
export function windUpKey(ctx: Ctx, hex: Hex): void {
  if (!hasSpecial(ctx, 'automatonHelpers')) return;
  const [helper, ...rest] = sleepersNear(ctx, hex, WIND_UP_REACH);
  if (!helper) return;
  for (const m of rest) wake(ctx, m);
  turnAlly(ctx, helper, monsterStats(ctx, helper).move);
}

/** The hex of the object every monster goes for (`allyPhase` with a `protect` goal), or null. */
export function allyTargetHex(ctx: Pick<Ctx, 's' | 'c'>): Hex | null {
  const scenario = scenarioOf(ctx);
  if (!scenario || !hasSpecial(ctx, 'allyPhase')) return null;
  const goal = activeGoal(ctx.s, scenario);
  if (goal.type !== 'protect') return null;
  return objectHex(ctx.s, goal.object);
}

/** Where a monster walks to hit the protected object: the open hexes next to it. */
export function allyTargetGoal(ctx: Pick<Ctx, 's' | 'c'>): Hex[] | null {
  const at = allyTargetHex(ctx);
  if (!at) return null;
  return neighbors(at).filter((n) => tileAt(ctx.s, n) && !wallBetween(ctx.s, n, at));
}

/** A monster's attack on the protected object: from next to it, it chips off `HEART_HIT` hp
 *  whatever its attack (like a firefly in s13), so the heart outlasts a round of moths. */
export function hitTarget(ctx: Ctx, f: Figure, at: Hex, step: Step): void {
  if (step.type !== 'attack' || f.conditions.disarm) return;
  if (!areAdjacent(f.hex, at) || wallBetween(ctx.s, f.hex, at)) return;
  hitObstacle(ctx, f.id, at, HEART_HIT);
}

/** The objects a `protect` goal keeps, the scenario's own or one an event switches to (s20's
 *  heart): heroes do not hit them, not even with an area. */
export function keptObjects(scenario: ScenarioDef | undefined): Set<string> {
  const out = new Set<string>();
  const add = (g: ScenarioGoal) => g.type === 'protect' && out.add(g.object);
  if (!scenario) return out;
  add(scenario.goal);
  for (const ev of scenario.events ?? []) for (const a of ev.actions) if (a.type === 'setGoal') add(a.goal);
  return out;
}

export function objectHex(s: GameState, id: string): Hex | null {
  for (const [k, t] of Object.entries(s.board.tiles)) if (t.object?.id === id) return parseHexKey(k);
  return null;
}

/** Secondary `objectIntact {object}`: the object stands with every hit point it started with. */
export function objectIntact(s: GameState, id: string): boolean {
  const at = objectHex(s, id);
  if (!at) return false;
  const b = s.board.tiles[hexKey(at)]?.breakable;
  return !b || b.hp >= b.maxHp;
}
