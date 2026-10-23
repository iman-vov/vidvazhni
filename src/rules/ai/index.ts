// Monster AI: focus, movement and target choice. Deterministic: no randomness, no questions to players.
// Contract only; implemented by the geometry/AI work package.

import type { Step } from '../content';
import type { Hex } from '../hex';
import type { FigureId, GameState } from '../state';

export interface MonsterPlan {
  /** Chosen focus, or null when no enemy can be focused (then only non-attack steps run). */
  focusId: FigureId | null;
  /** Hexes the figure moves through (empty = stays). */
  path: Hex[];
  /** Targets per attack step of `steps`, in step order. */
  attackTargets: FigureId[][];
}

/**
 * Plans one monster's (or hero summon's) turn for the given behaviour steps.
 * `steps` already have absolute values (base stats + card deltas, conditions applied:
 * immobilize → no move, disarm → no attack).
 * Summons focus monsters; monsters focus heroes and summons.
 */
export function planTurn(_state: GameState, _figureId: FigureId, _steps: Step[]): MonsterPlan {
  throw new Error('ai.planTurn: not implemented yet');
}
