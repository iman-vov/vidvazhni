// Board geometry used by the engine and the AI: movement, line of sight, areas.
// Signatures may gain optional parameters but must stay compatible.
// Rules and conventions are documented in path.ts (movement), los.ts (line of sight) and area.ts.

export type { MoveOptions, PathResult } from './path';
export {
  /** Cheapest legal path from the figure's hex to `to`, or null. `to` = own hex → empty path. */
  findPath,
  /** Every hex the figure can end its move on with `move` points, with the path to each.
   *  The figure's own hex is not included. */
  reachableHexes,
  /** Validates a path chosen by a player: adjacent steps, cost within `move`, legal end hex. */
  validatePath,
} from './path';
/** Line of sight: at least one straight line between corners of the two hexes touches no wall. */
export { hasLineOfSight } from './los';
/** Hexes covered by an area attack. `anchor` = chosen target hex (or the performer for fromSelf
 *  shapes), `direction` = rotation 0–5. */
export { areaHexes } from './area';
