// Board geometry used by the engine and the AI: movement, line of sight, areas.
// Contract only; implemented by the geometry/AI work package. Signatures may gain optional
// parameters but must stay compatible.

import type { AreaShape } from './content';
import type { Hex } from './hex';
import type { FigureId, GameState } from './state';

export interface MoveOptions {
  /** The moving figure: allies can be passed through, enemies block. */
  figureId: FigureId;
  jump?: boolean;
  fly?: boolean;
  /** Monsters avoid traps and hazardous terrain when another path exists. */
  avoidNegativeHexes?: boolean;
}

export interface PathResult {
  path: Hex[]; // excludes the start hex
  cost: number; // movement points spent (difficult terrain = 2, except jump/fly)
}

/** Cheapest legal path from the figure's hex to `to`, or null. */
export function findPath(_state: GameState, _to: Hex, _opts: MoveOptions): PathResult | null {
  throw new Error('geometry.findPath: not implemented yet');
}

/** Every hex the figure can end its move on with `move` points, with the path to each. */
export function reachableHexes(_state: GameState, _move: number, _opts: MoveOptions): Map<string, PathResult> {
  throw new Error('geometry.reachableHexes: not implemented yet');
}

/** Validates a path chosen by a player: adjacent steps, cost within `move`, legal end hex. */
export function validatePath(_state: GameState, _path: Hex[], _move: number, _opts: MoveOptions): PathResult | null {
  throw new Error('geometry.validatePath: not implemented yet');
}

/** Line of sight: at least one straight line between corners of the two hexes crosses no wall. */
export function hasLineOfSight(_state: GameState, _a: Hex, _b: Hex): boolean {
  throw new Error('geometry.hasLineOfSight: not implemented yet');
}

/** Hexes covered by an area attack. `anchor` = chosen target hex (or the performer for fromSelf
 *  shapes), `direction` = rotation 0–5. */
export function areaHexes(_shape: AreaShape, _performer: Hex, _anchor: Hex, _direction: number): Hex[] {
  throw new Error('geometry.areaHexes: not implemented yet');
}
