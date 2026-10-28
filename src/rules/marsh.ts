// The Sleepy Marsh rules (docs/design/act3.md, «Нові правила» s11–s15).
//
//   fogLooms (s15) While at least one loom (`objects[]` of kind `loom`, breakable with `hp`)
//                  stands, ranged attacks on the boss have disadvantage. Each loom calls its moth
//                  at the start of a round through its own `spawn` (scenarioRules.objectSpawns).
//                  Secondary check `loomsBrokenBeforeHalf`: no loom stood when the boss fell to
//                  half health (and it did).
//   deepWater (s11) A figure that walks or is pushed into deep water (terrain `deep`) stops there
//                  and moves 1 less on its next turn. Flying and jumping pass over it.
//   fogBanks (s12) Terrain `fog`: no line of sight into, out of or through it, only neighbours
//                  can attack a figure in it (los.ts). A figure that makes Fire or Air (an infusion
//                  or an orb) clears the fog on and next to its hex through the next round.
//   risingWater (s14) `ScenarioDef.rising {from, every, rows}`: at the start of round `from`, then
//                  every `every` rounds, the next row turns to water and the row before it to deep
//                  water (the last row deepens one step after it floods). Rooms not revealed yet
//                  flood all the same once their tiles exist: a flooded row is applied to the tiles
//                  on the board each time.

import { emit, tileAt, type Ctx } from './effects/context';
import { neighbors, type Hex } from './hex';
import { boardObjects, hasSpecial, scenarioOf } from './scenarioRules';
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

/** How many rows are under water (`deep` = one fewer) at round `round`. */
export function floodedRows(rising: { from: number; every: number; rows: Hex[][] }, round: number): number {
  if (round < rising.from) return 0;
  return Math.min(rising.rows.length + 1, 1 + Math.floor((round - rising.from) / rising.every));
}

/** Start of a round (`risingWater`): the rows due turn to water, the rows before them to deep. */
export function riseWater(ctx: Ctx): void {
  const rising = scenarioOf(ctx)?.rising;
  if (!rising || !hasSpecial(ctx, 'risingWater')) return;
  const n = floodedRows(rising, ctx.s.round);
  rising.rows.forEach((row, i) => {
    if (i >= n) return;
    const terrain = i < n - 1 ? 'deep' : 'water';
    const changed = row.filter((h) => {
      const t = tileAt(ctx.s, h);
      if (!t || t.terrain === terrain || t.terrain === 'deep') return false;
      t.terrain = terrain;
      return true;
    });
    if (changed.length) emit(ctx, { type: 'terrainChanged', hexes: changed.map((h) => [h[0], h[1]] as Hex), terrain });
  });
}

/** Fire or Air made by `byId`: the fog on and next to it clears through the next round. */
export function clearFog(ctx: Ctx, byId?: string): void {
  const f = byId ? ctx.s.figures[byId] : undefined;
  if (!f) return;
  const cleared: Hex[] = [];
  for (const h of [f.hex, ...neighbors(f.hex)]) {
    const t = tileAt(ctx.s, h);
    if (t?.terrain !== 'fog') continue;
    t.fogClearedUntil = ctx.s.round + 1;
    cleared.push([h[0], h[1]]);
  }
  if (cleared.length) emit(ctx, { type: 'fogCleared', hexes: cleared, until: ctx.s.round + 1 });
}
