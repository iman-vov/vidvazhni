// What a figure standing on a given hex could hit with one attack step.

import { areaHexes, isFromSelf } from '../area';
import type { Step } from '../content';
import { distance, hexEquals, hexKey, hexesInRadius, type Hex, type HexKey } from '../hex';
import type { Figure } from '../state';

export type AttackStep = Extract<Step, { type: 'attack' }>;
export type MoveStep = Extract<Step, { type: 'move' }>;

/** Used to plan movement when the card has no attack (or the figure is disarmed). */
export const DEFAULT_MELEE: AttackStep = { type: 'attack', value: 0 };

/** One way to aim the attack: the enemies it can hit, and how many of them may be chosen. */
export interface Placement {
  hit: Figure[];
  max: number;
}

export interface TargetingView {
  exists(h: Hex): boolean;
  los(a: Hex, b: Hex): boolean;
  /** Enemies that may be targeted (on the board, not invisible). */
  enemies: Figure[];
  enemyAt(key: HexKey): Figure | undefined;
}

/** Ranged attacks against an adjacent target have disadvantage. Melee areas are never ranged. */
export function isRanged(step: AttackStep): boolean {
  return step.range !== undefined && !(step.area && isFromSelf(step.area));
}

/** Upper bound of the distance from the attacker to anything it can hit. */
export function maxReach(step: AttackStep): number {
  if (step.targetAll) return 1;
  if (step.area) {
    if (step.area.shape === 'line') return step.area.length;
    if (isFromSelf(step.area)) return 1;
    return (step.range ?? 1) + 1;
  }
  return step.range ?? 1;
}

export function placements(view: TargetingView, from: Hex, step: AttackStep): Placement[] {
  if (step.targetAll === 'adjacentEnemies') {
    return [{ hit: view.enemies.filter((e) => distance(from, e.hex) === 1 && view.los(from, e.hex)), max: Infinity }];
  }
  if (step.area) {
    const area = step.area;
    const anchors = isFromSelf(area)
      ? [from]
      : hexesInRadius(from, step.range ?? 1).filter((h) => !hexEquals(h, from) && view.exists(h) && view.los(from, h));
    const directions = area.shape === 'targetAndAdjacent' || area.shape === 'allAdjacent' ? [0] : [0, 1, 2, 3, 4, 5];
    const out: Placement[] = [];
    for (const anchor of anchors) {
      for (const d of directions) {
        const hit: Figure[] = [];
        for (const h of areaHexes(area, from, anchor, d)) {
          const e = view.enemyAt(hexKey(h));
          if (e && !hit.includes(e) && view.los(from, h)) hit.push(e);
        }
        if (hit.length > 0) out.push({ hit, max: Infinity });
      }
    }
    return out;
  }
  const range = step.range ?? 1;
  const hit = view.enemies.filter((e) => {
    const d = distance(from, e.hex);
    return d >= 1 && d <= range && view.los(from, e.hex);
  });
  return [{ hit, max: step.targets ?? 1 }];
}
