// The Sleepy Marsh rules (docs/design/act3.md, «Нові правила» s11–s15).
//
//   fogLooms (s15) While at least one loom (`objects[]` of kind `loom`, breakable with `hp`)
//                  stands, ranged attacks on the boss have disadvantage. Each loom calls its moth
//                  at the start of a round through its own `spawn` (scenarioRules.objectSpawns).
//                  Secondary check `loomsBrokenBeforeHalf`: no loom stood when the boss fell to
//                  half health (and it did).

import type { Ctx } from './effects/context';
import { boardObjects, hasSpecial } from './scenarioRules';
import type { Figure, GameState } from './state';

export const LOOM = 'loom';

export function loomsStanding(s: GameState): number {
  return boardObjects(s).filter((o) => o.tile.object.kind === LOOM).length;
}

/** `fogLooms`: a ranged attack on the boss while a loom stands has disadvantage. */
export function loomDisadvantage(ctx: Pick<Ctx, 's' | 'c'>, target: Figure, ranged: boolean): boolean {
  return ranged && target.kind === 'monster' && target.rank === 'boss' && hasSpecial(ctx, 'fogLooms') && loomsStanding(ctx.s) > 0;
}

/** The boss just fell to half health: remember how many looms stood. */
export function noteLoomsAtHalf(ctx: Pick<Ctx, 's' | 'c'>): void {
  if (hasSpecial(ctx, 'fogLooms') && ctx.s.loomsAtHalf === undefined) ctx.s.loomsAtHalf = loomsStanding(ctx.s);
}
