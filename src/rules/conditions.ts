// Conditions: adding with immunities, expiry «до кінця наступного ходу цілі», queries.

import type { ConditionId } from './content';
import { emit, type Ctx } from './effects/context';
import type { Figure } from './state';

/** Conditions that last until healed. Everything else ends after the target's next turn. */
const UNTIL_HEALED: readonly ConditionId[] = ['poison', 'wound'];

export function hasCondition(f: Figure, c: ConditionId): boolean {
  return f.conditions[c] !== undefined;
}

export function immunities(ctx: Ctx, f: Figure): ConditionId[] {
  if (f.kind !== 'monster') return [];
  if (f.rank === 'boss') return ctx.c.bosses[f.typeId]?.immune ?? [];
  const traits = ctx.c.monsters[f.typeId]?.traits ?? [];
  return traits.flatMap((t) => (t.trait === 'immune' ? t.conditions : []));
}

/** Applies a condition. Timed conditions end at the end of the target's next turn: if the target is
 *  acting right now that is its following turn, otherwise its coming one. Either way that turn's
 *  number is `turnCount + 1`. Re-applying refreshes the expiry. */
export function addCondition(ctx: Ctx, f: Figure, c: ConditionId): boolean {
  if (immunities(ctx, f).includes(c)) return false;
  f.conditions[c] = UNTIL_HEALED.includes(c) ? {} : { expiresAfterTurn: f.turnCount + 1 };
  emit(ctx, { type: 'conditionAdded', figureId: f.id, condition: c });
  return true;
}

export function removeCondition(ctx: Ctx, f: Figure, c: ConditionId): boolean {
  if (!hasCondition(f, c)) return false;
  delete f.conditions[c];
  emit(ctx, { type: 'conditionRemoved', figureId: f.id, condition: c });
  return true;
}

/** End of a figure's turn: timed conditions whose last turn this was are removed. */
export function expireConditions(ctx: Ctx, f: Figure): void {
  for (const [c, st] of Object.entries(f.conditions) as [ConditionId, { expiresAfterTurn?: number }][]) {
    if (st.expiresAfterTurn !== undefined && st.expiresAfterTurn <= f.turnCount) removeCondition(ctx, f, c);
  }
}
