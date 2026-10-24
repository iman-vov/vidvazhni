// The X die (docs/design/dice.md §3–4): a d6 with faces 1 1 2 2 3 4, rolled through the seeded RNG.
// Hero steps with `x` roll when they come into play (`dieCards`); monster cards with `x` steps roll
// when the card is revealed, as an intent or as the drawn card (`monsterDieAbilities`).

import type { Step } from './content';
import { emit, type Ctx } from './effects/context';
import { nextInt } from './rng';
import type { Figure } from './state';
import { X_DIE_FACES } from './variants';

export function rollX(ctx: Pick<Ctx, 's'>): number {
  return X_DIE_FACES[nextInt(ctx.s.rng, X_DIE_FACES.length)] ?? 1;
}

/** The hero step comes into play: with `dieCards` a step with `x` gets its roll (value = x + X). */
export function rollStepX(ctx: Ctx, f: Figure, step: Step): Step {
  if (!ctx.s.variants.dieCards || step.x === undefined || step.xRoll !== undefined || !('value' in step)) return step;
  const roll = rollX(ctx);
  const out = { ...step, value: step.x + roll, xRoll: roll } as Step;
  emit(ctx, { type: 'dieRolled', figureId: f.id, roll, value: step.x + roll });
  return out;
}

/** Rolls X again for a step that already has its roll and keeps the better one (Вітер on
 *  Ризикований удар, Щаслива кістка, Зілля удачі). The step is changed in place. */
export function rerollStepX(ctx: Ctx, f: Figure, step: Step, itemId?: string): void {
  if (step.x === undefined || step.xRoll === undefined || !('value' in step)) return;
  const previous = step.xRoll;
  const roll = Math.max(previous, rollX(ctx));
  const bonus = step.value - (step.x + previous);
  step.xRoll = roll;
  step.value = step.x + roll + bonus;
  emit(ctx, { type: 'dieRolled', figureId: f.id, roll, value: step.value, previous, ...(itemId ? { itemId } : {}) });
}

/** A monster card's steps carry `x`. */
export function cardHasX(steps: Step[] | undefined): boolean {
  return (steps ?? []).some((st) => st.x !== undefined);
}
