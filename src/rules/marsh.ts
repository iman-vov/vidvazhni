// The Sleepy Marsh rules (docs/design/act3.md, «Нові правила» s11–s15).
//
//   fogLooms (s15) While at least one loom (`objects[]` of kind `loom`, breakable with `hp`)
//                  stands, ranged attacks on the boss have disadvantage. Each loom calls its moth
//                  at the start of a round through its own `spawn` (scenarioRules.objectSpawns).
//                  Secondary check `loomsBrokenBeforeHalf`: no loom stood when the boss fell to
//                  half health (and it did).
//   deepWater (s11) A figure that walks or is pushed into deep water (terrain `deep`) stops there
//                  and moves 1 less on its next turn. Flying and jumping pass over it.

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

/** Deep water: the figure's next turn moves 1 less. */
export function soak(f: Figure): void {
  f.soakedTurn = f.turnCount + 1;
}

/** What deep water takes off this turn's move. */
export function soakPenalty(f: Figure): number {
  return f.soakedTurn === f.turnCount ? 1 : 0;
}
