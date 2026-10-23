// Items (minimal): a hero carries items from `content.items`; a `spent` item comes back with a long
// rest, a `lost` one is gone for the scenario, a `passive` one always applies. Items are used on
// the hero's own turn (action `useItem`); their effects are steps performed at once on the hero.
// Bonuses to «your attack / your move» apply to the pending attack or move step:
//   meleeAttackBonus{value}  — Кинджал: +value to a pending melee attack
//   moveBonus{value}         — Чоботи: +value to a pending move
//   jumpOnMove               — Мотузка з гаком: the pending move becomes a jump
//   nextAttackAgainstSelfDisadvantage — Шолом: the next attack against the hero this round has disadvantage
// Passive specials read where they apply: rangedRangeBonus (attack.ts), movePenalty (move.ts);
// a passive `shield … persistent` is put on the hero when the game starts.

import type { ItemDef, Step } from './content';
import { emit, hero, type Ctx } from './effects/context';
import { performStep } from './effects/index';
import type { HeroState } from './state';

type SpecialStep = Extract<Step, { type: 'special' }>;

/** Item specials that change the pending step instead of doing something on their own. */
export const STEP_ITEM_SPECIALS: readonly string[] = ['meleeAttackBonus', 'moveBonus', 'jumpOnMove'];

export function itemDef(ctx: { c: Ctx['c'] }, id: string): ItemDef | undefined {
  return ctx.c.items?.[id];
}

/** The item's effect under these rules (`forkEffect` with the orbs fork). */
export function itemEffect(ctx: { s: Ctx['s'] }, def: ItemDef): Step[] {
  return ctx.s.variants.orbs && def.forkEffect ? def.forkEffect : def.effect;
}

function numberParam(step: SpecialStep, name: string): number {
  const v = step.params?.[name];
  return typeof v === 'number' ? v : 0;
}

/** Sum of a passive item special's `value` over the hero's ready passive items. */
export function passiveItemValue(ctx: Pick<Ctx, 's' | 'c'>, h: HeroState, name: string): number {
  let total = 0;
  for (const it of h.items ?? []) {
    const def = it.state === 'ready' ? itemDef(ctx, it.id) : undefined;
    if (def?.use !== 'passive') continue;
    for (const st of itemEffect(ctx, def)) if (st.type === 'special' && st.name === name) total += numberParam(st, 'value');
  }
  return total;
}

/** Game start: the carried items, with passive persistent shields put on the hero. */
export function setupItems(ctx: Ctx, h: HeroState, ids: string[]): void {
  if (ids.length === 0) return;
  h.items = ids.map((id) => {
    const def = itemDef(ctx, id);
    if (!def) throw new Error(`unknown item ${id}`);
    if (def.use === 'passive') {
      for (const st of itemEffect(ctx, def)) {
        if (st.type === 'shield' && st.target === 'self') h.shields.push({ value: st.value, source: `item:${id}`, until: 'scenario' });
      }
    }
    return { id, state: 'ready' };
  });
}

/** Why the item cannot be used now, or null. */
export function itemUseError(ctx: Ctx, heroId: string, itemId: string): string | null {
  const p = ctx.s.pending;
  const own = (p?.kind === 'heroTurn' && p.heroId === heroId) || (p?.kind === 'stepChoice' && p.heroId === heroId);
  if (!own) return 'items are used on your own turn';
  const h = hero(ctx.s, heroId);
  if (h.conditions.stun) return 'stunned';
  const it = h.items?.find((x) => x.id === itemId);
  if (!it) return 'item not carried';
  if (it.state !== 'ready') return `item is ${it.state}`;
  const def = itemDef(ctx, itemId);
  if (!def) return 'unknown item';
  if (def.use === 'passive') return 'passive items always apply';
  for (const st of itemEffect(ctx, def)) {
    if (st.type === 'special' && STEP_ITEM_SPECIALS.includes(st.name)) {
      const err = pendingStepError(ctx, st);
      if (err) return err;
    }
  }
  return null;
}

function pendingStepError(ctx: Ctx, st: SpecialStep): string | null {
  const p = ctx.s.pending;
  const step = p?.kind === 'stepChoice' ? p.step : undefined;
  if (st.name === 'meleeAttackBonus') return step?.type === 'attack' && step.range === undefined ? null : 'use during a melee attack';
  if (!step || step.type !== 'move') return 'use during a move';
  if (st.name === 'jumpOnMove' && step.jump) return 'the move is already a jump';
  return null;
}

/** The item bonus folded into the pending step. */
function changePendingStep(ctx: Ctx, st: SpecialStep): void {
  const p = ctx.s.pending;
  const half = ctx.s.half;
  if (p?.kind !== 'stepChoice' || !half) return;
  const step = structuredClone(p.step);
  if (st.name === 'meleeAttackBonus' && step.type === 'attack') step.value += numberParam(st, 'value');
  if (st.name === 'moveBonus' && step.type === 'move') step.value += numberParam(st, 'value');
  if (st.name === 'jumpOnMove' && step.type === 'move') step.jump = true;
  half.steps[half.stepIndex] = step;
  p.step = step;
}

export function useItem(ctx: Ctx, heroId: string, itemId: string): string | null {
  const err = itemUseError(ctx, heroId, itemId);
  if (err) return err;
  const h = hero(ctx.s, heroId);
  const def = itemDef(ctx, itemId) as ItemDef;
  for (const st of itemEffect(ctx, def)) {
    if (st.type === 'special' && STEP_ITEM_SPECIALS.includes(st.name)) changePendingStep(ctx, st);
    else if (st.type === 'special' && st.name === 'nextAttackAgainstSelfDisadvantage') h.attackedDisadvantage = true;
    else {
      const stepErr = performStep(ctx, h, st, {});
      if (stepErr) return stepErr;
    }
  }
  const it = h.items?.find((x) => x.id === itemId);
  const to = def.use === 'lost' ? 'lost' : 'spent';
  if (it) it.state = to;
  emit(ctx, { type: 'itemUsed', heroId, itemId, to });
  return null;
}

/** Long rest: spent items are ready again. */
export function refreshSpentItems(ctx: Ctx, h: HeroState): void {
  const ids: string[] = [];
  for (const it of h.items ?? []) {
    if (it.state !== 'spent') continue;
    it.state = 'ready';
    ids.push(it.id);
  }
  if (ids.length > 0) emit(ctx, { type: 'itemsRefreshed', heroId: h.id, itemIds: ids });
}
