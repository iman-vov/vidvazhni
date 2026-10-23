// Six elements (base rules). Infused elements become strong at the end of the infusing figure's
// turn; at the end of the round strong → waning → inert. Consuming needs strong or waning.
// Fork «Три стихії-сфери» (variants.orbs) replaces this module's behaviour; its hook points are
// `infuse`, `canConsume`, `consume`, `endTurnInfusions` and `decayAtEndOfRound`.

import type { ElementId } from './content';
import { emit, type Ctx } from './effects/context';
import type { ElementLevel } from './state';

export const ELEMENTS: readonly ElementId[] = ['fire', 'ice', 'air', 'earth', 'light', 'dark'];

export function initialElements(): Record<ElementId, ElementLevel> {
  return { fire: 'inert', ice: 'inert', air: 'inert', earth: 'inert', light: 'inert', dark: 'inert' };
}

function setLevel(ctx: Ctx, e: ElementId, level: ElementLevel): void {
  if (ctx.s.elements[e] === level) return;
  ctx.s.elements[e] = level;
  emit(ctx, { type: 'elementChanged', element: e, level });
}

export function infuse(ctx: Ctx, e: ElementId): void {
  if (!ctx.s.pendingInfusions.includes(e)) ctx.s.pendingInfusions.push(e);
}

export function canConsume(ctx: Ctx, e: ElementId): boolean {
  return ctx.s.elements[e] !== 'inert';
}

export function consume(ctx: Ctx, e: ElementId): boolean {
  if (!canConsume(ctx, e)) return false;
  setLevel(ctx, e, 'inert');
  return true;
}

/** Elements that can be consumed right now. */
export function availableElements(ctx: Ctx): ElementId[] {
  return ELEMENTS.filter((e) => canConsume(ctx, e));
}

export function endTurnInfusions(ctx: Ctx): void {
  for (const e of ctx.s.pendingInfusions) setLevel(ctx, e, 'strong');
  ctx.s.pendingInfusions = [];
}

export function decayAtEndOfRound(ctx: Ctx): void {
  for (const e of ELEMENTS) {
    const level = ctx.s.elements[e];
    if (level === 'strong') setLevel(ctx, e, 'waning');
    else if (level === 'waning') setLevel(ctx, e, 'inert');
  }
}
