// Turns the engine's events into a list of animation steps for the board. Pure: it follows the
// figures' hexes through the events itself, so a move's path starts where the figure stands and an
// attack knows whether it is ranged. The board plays the steps one after another; `wait` is how
// long (seconds at 1× speed) a step holds the queue before the next one starts, `duration` how long
// it keeps animating in total (steps may overlap: a damage number floats while the next attack starts).

import type { ConditionId, ElementId, OrbId } from '../rules/content';
import { distance, type Hex } from '../rules/hex';
import type { ElementLevel, FigureId, GameEvent } from '../rules/state';

export const TIMING = {
  walkPerHex: 0.3,
  jumpBase: 0.6,
  jumpPerHex: 0.12,
  slidePerHex: 0.26,
  turn: 0.15,
  attackWindup: 0.42, // from the start of the attack clip to the moment of the hit / release
  attack: 0.95,
  projectilePerHex: 0.09,
  hit: 0.5,
  floatLabel: 1.1,
  damage: 0.25,
  death: 1.3,
  condition: 0.35,
  shield: 0.35,
  orb: 0.45,
  element: 0.35,
  room: 1.1,
  spawn: 0.5,
  loot: 0.7,
  trap: 0.35,
  revive: 0.9,
} as const;

export type AttackLabel = 'miss' | 'x2' | null;

export type AnimStep = { wait: number; duration: number } & (
  | { kind: 'walk'; figureId: FigureId; path: Hex[] }
  | { kind: 'jump'; figureId: FigureId; path: Hex[]; fly: boolean }
  | { kind: 'slide'; figureId: FigureId; path: Hex[]; pull: boolean }
  | {
      kind: 'attack';
      attackerId: FigureId;
      targetId: FigureId;
      ranged: boolean;
      /** Hexes between attacker and target at the time of the attack. */
      range: number;
      label: AttackLabel;
      shield: number;
      damage: number;
      /** Seconds from the step start to the hit (and the projectile's arrival). */
      impact: number;
    }
  | { kind: 'damage'; figureId: FigureId; amount: number; source: string }
  | { kind: 'heal'; figureId: FigureId; amount: number; removed: ConditionId[] }
  | { kind: 'condition'; figureId: FigureId; condition: ConditionId; added: boolean }
  | { kind: 'shield'; figureId: FigureId; value: number }
  | { kind: 'retaliate'; figureId: FigureId; targetId: FigureId; damage: number }
  /** `fog`: a monster or summon dispersing; heroes are exhausted instead (fade, no puff). */
  | { kind: 'death'; figureId: FigureId; fog: boolean }
  | { kind: 'downed'; figureId: FigureId }
  | { kind: 'revived'; figureId: FigureId; byId: FigureId }
  | { kind: 'element'; element: ElementId; level: ElementLevel; actorId: FigureId | null }
  | { kind: 'orb'; orb: OrbId; change: 'infused' | 'consumed' | 'dimmed' | 'expired'; ownerId?: FigureId; byId?: FigureId }
  | { kind: 'room'; roomId: string }
  | { kind: 'spawn'; figureId: FigureId }
  | { kind: 'loot'; heroId: FigureId; coins: number; chest?: string }
  | { kind: 'trap'; figureId: FigureId }
  | { kind: 'trapPlaced'; hex: Hex }
);

export type AnimKind = AnimStep['kind'];

export interface PlanOptions {
  /** Hex of a figure spawned during the events (read from the state after them). */
  spawnHex?: (id: FigureId) => Hex | undefined;
  /** Attackers that always use a projectile, even next to their target. */
  isRanged?: (id: FigureId) => boolean;
  /** Seconds from the start of an attacker's attack clip to the blow (default TIMING.attackWindup). */
  windup?: (id: FigureId) => number;
}

/**
 * Maps events to animation steps. `positions` = each figure's hex before the events; it is not
 * modified. Events without a picture on the board (cards, decks, rounds, xp) map to nothing.
 */
export function planAnimation(events: readonly GameEvent[], positions: Readonly<Record<FigureId, Hex>>, opts: PlanOptions = {}): AnimStep[] {
  const at: Record<FigureId, Hex> = { ...positions };
  const steps: AnimStep[] = [];
  let actor: FigureId | null = null;
  const push = (s: AnimStep) => steps.push(s);

  for (const e of events) {
    switch (e.type) {
      case 'turnStarted':
        actor = e.figureId;
        break;
      case 'moved': {
        if (e.path.length === 0) break;
        const start = at[e.figureId];
        const path = start ? [start, ...e.path] : [...e.path];
        at[e.figureId] = e.path[e.path.length - 1] as Hex;
        const hexes = path.length - 1;
        if (e.jump || e.fly) {
          const d = TIMING.jumpBase + TIMING.jumpPerHex * hexes;
          push({ kind: 'jump', figureId: e.figureId, path, fly: !!e.fly, wait: d, duration: d });
        } else {
          const d = TIMING.walkPerHex * hexes;
          push({ kind: 'walk', figureId: e.figureId, path, wait: d, duration: d + 0.2 });
        }
        break;
      }
      case 'pushed': {
        if (e.path.length === 0) break;
        const start = at[e.figureId];
        const path = start ? [start, ...e.path] : [...e.path];
        at[e.figureId] = e.path[e.path.length - 1] as Hex;
        const d = TIMING.slidePerHex * (path.length - 1);
        push({ kind: 'slide', figureId: e.figureId, path, pull: !!e.pull, wait: d, duration: d });
        break;
      }
      case 'attacked': {
        const a = at[e.attackerId];
        const t = at[e.targetId];
        const range = a && t ? distance(a, t) : 1;
        const ranged = range > 1 || !!opts.isRanged?.(e.attackerId);
        const flight = ranged ? Math.max(0.2, TIMING.projectilePerHex * range) : 0;
        const impact = TIMING.turn + (opts.windup?.(e.attackerId) ?? TIMING.attackWindup) + flight;
        const label: AttackLabel = e.chosen === 'miss' ? 'miss' : e.chosen === 'x2' ? 'x2' : null;
        push({
          kind: 'attack',
          attackerId: e.attackerId,
          targetId: e.targetId,
          ranged,
          range,
          label,
          shield: e.shield,
          damage: e.damage,
          impact,
          wait: impact + 0.15,
          duration: Math.max(TIMING.turn + TIMING.attack, impact + TIMING.hit),
        });
        break;
      }
      case 'damaged':
        push({ kind: 'damage', figureId: e.figureId, amount: e.amount, source: e.source, wait: TIMING.damage, duration: TIMING.floatLabel });
        break;
      case 'healed':
        push({ kind: 'heal', figureId: e.figureId, amount: e.amount, removed: e.removed, wait: TIMING.damage + 0.15, duration: TIMING.floatLabel });
        break;
      case 'conditionAdded':
      case 'conditionRemoved':
        push({
          kind: 'condition',
          figureId: e.figureId,
          condition: e.condition,
          added: e.type === 'conditionAdded',
          wait: TIMING.condition,
          duration: TIMING.condition + 0.3,
        });
        break;
      case 'shieldAdded':
        push({ kind: 'shield', figureId: e.figureId, value: e.value, wait: TIMING.shield, duration: TIMING.floatLabel });
        break;
      case 'retaliated':
        push({ kind: 'retaliate', figureId: e.figureId, targetId: e.targetId, damage: e.damage, wait: 0.35, duration: TIMING.floatLabel });
        break;
      case 'figureDied':
        push({ kind: 'death', figureId: e.figureId, fog: !e.figureId.startsWith('hero:'), wait: TIMING.death, duration: TIMING.death + 0.6 });
        delete at[e.figureId];
        break;
      case 'heroExhausted':
        push({ kind: 'death', figureId: e.heroId, fog: false, wait: TIMING.death, duration: TIMING.death + 0.6 });
        delete at[e.heroId];
        break;
      case 'heroDowned':
        push({ kind: 'downed', figureId: e.heroId, wait: TIMING.death, duration: TIMING.death });
        break;
      case 'heroRevived':
        push({ kind: 'revived', figureId: e.heroId, byId: e.byId, wait: TIMING.revive, duration: TIMING.revive });
        break;
      case 'elementChanged':
        // Only a new infusion has a picture (a burst at the figure acting); waning is shown by the UI.
        if (e.level === 'strong') push({ kind: 'element', element: e.element, level: e.level, actorId: actor, wait: TIMING.element, duration: 0.9 });
        break;
      case 'orbInfused':
        push({ kind: 'orb', orb: e.orb, change: 'infused', ownerId: e.ownerId, wait: TIMING.orb, duration: TIMING.orb });
        break;
      case 'orbConsumed':
        push({ kind: 'orb', orb: e.orb, change: 'consumed', ownerId: e.fromId, byId: e.byId, wait: TIMING.orb, duration: TIMING.orb + 0.2 });
        break;
      case 'orbDimmed':
        push({ kind: 'orb', orb: e.orb, change: 'dimmed', wait: 0.15, duration: 0.3 });
        break;
      case 'orbExpired':
        push({ kind: 'orb', orb: e.orb, change: 'expired', wait: 0.2, duration: 0.4 });
        break;
      case 'roomRevealed':
        push({ kind: 'room', roomId: e.roomId, wait: TIMING.room, duration: TIMING.room });
        break;
      case 'figureSpawned': {
        const hex = opts.spawnHex?.(e.figureId);
        if (hex) at[e.figureId] = hex;
        push({ kind: 'spawn', figureId: e.figureId, wait: 0.12, duration: TIMING.spawn });
        break;
      }
      case 'looted':
        push({ kind: 'loot', heroId: e.heroId, coins: e.coins, ...(e.chest ? { chest: e.chest } : {}), wait: TIMING.loot, duration: TIMING.loot + 0.5 });
        break;
      case 'trapTriggered':
        push({ kind: 'trap', figureId: e.figureId, wait: TIMING.trap, duration: TIMING.trap });
        break;
      case 'trapPlaced':
        push({ kind: 'trapPlaced', hex: e.hex, wait: 0.3, duration: 0.4 });
        break;
      default:
        break;
    }
  }
  return steps;
}

/** Total seconds the plan holds the queue at speed 1 (the sum of waits plus the last step's tail). */
export function planLength(steps: readonly AnimStep[]): number {
  let t = 0;
  let end = 0;
  for (const s of steps) {
    end = Math.max(end, t + s.duration);
    t += s.wait;
  }
  return Math.max(t, end);
}
