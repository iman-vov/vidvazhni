// «Предмети кубика» (docs/design/dice.md §2, variant `diceGear`): items that change a die.
// Initiative items are used in the `initiativeItems` window, opened right after the initiative roll
// and before the first turn; the order is rebuilt when every hero in it has passed:
//   initiativeReroll{times}  — Пісочний годинник: reroll the own initiative die, the new roll stands
//                              (★ `times: 2`: twice in a round)
//   initiativeDieOne         — Зілля спритності: the own initiative die is 1 this round
//   initiativeSwap           — Свисток напарника: swap the total initiative with an ally (`targetId`)
//   initiativeShift{value}   — Тихі черевики: the leading card's initiative ±value (`shift`), not
//                              below 1; the die stays the same, so this equals turning it before the roll
//   dieRerollBest            — Зілля удачі: reroll the initiative die and keep the better (lower) one,
//                              or, on the own turn, the X of the pending step (the higher one is kept)
//   xRerollBest{rolls}       — Щаслива кістка: the X die only (★ `rolls: 2`: the best of three)
//   partyInitiativeReroll    — Дзвоник дзвонаря: every hero who rolled rerolls the initiative die once
//                              and keeps the better (lower) roll
//   dieMirror{times}         — Кришталева кістка: the own initiative die becomes 13 − x (3 → 10);
//                              ★ `times: 2`: twice a scenario before it is spent
//   dodgeRerollBest{rolls}   — Перлина туману: only for «Ухилитися» (defense.ts): `rolls` extra d12,
//                              the best is kept (★ `rolls: 2`)
// Other steps of a dice item (★: Лікування 2, Щит 1) are performed on the hero after the die.

import type { ItemDef, Step } from './content';
import { rerollStepX } from './dice';
import { activeHeroes, emit, hero, type Ctx } from './effects/context';
import { itemDef, itemEffect } from './items';
import { nextInt } from './rng';
import { buildTurnOrder, rolledInitiative, startTurns } from './round';
import type { FigureId, HeroState } from './state';
import { INITIATIVE_DIE_SIDES, INITIATIVE_MIN } from './variants';

type SpecialStep = Extract<Step, { type: 'special' }>;

export const DICE_ITEM_SPECIALS: readonly string[] = [
  'initiativeReroll',
  'initiativeDieOne',
  'initiativeSwap',
  'initiativeShift',
  'dieRerollBest',
  'xRerollBest',
  'partyInitiativeReroll',
  'dieMirror',
  'dodgeRerollBest',
];

export interface DiceItemOptions {
  targetId?: FigureId;
  shift?: 1 | -1;
}

function diceStep(ctx: Pick<Ctx, 's'>, def: ItemDef): SpecialStep | undefined {
  return itemEffect(ctx, def).find((st): st is SpecialStep => st.type === 'special' && DICE_ITEM_SPECIALS.includes(st.name));
}

function param(st: SpecialStep, name: string): number | string | boolean | undefined {
  return st.params?.[name];
}

export function isDiceItem(ctx: Pick<Ctx, 's'>, def: ItemDef): boolean {
  return !!diceStep(ctx, def);
}

/** The shop's test: a dice item (its plain effect is enough). */
export function isDiceItemDef(def: ItemDef): boolean {
  return def.effect.some((st) => st.type === 'special' && DICE_ITEM_SPECIALS.includes(st.name));
}

/** Used right after the initiative roll. */
export function isInitiativeItem(ctx: Pick<Ctx, 's'>, def: ItemDef): boolean {
  const st = diceStep(ctx, def);
  return !!st && st.name !== 'xRerollBest' && st.name !== 'dodgeRerollBest';
}

/** Used on the own turn, on the X of the pending step. */
export function isXItem(ctx: Pick<Ctx, 's'>, def: ItemDef): boolean {
  const st = diceStep(ctx, def);
  return st?.name === 'dieRerollBest' || st?.name === 'xRerollBest';
}

/** This round's card initiative (under the die). */
function cardInitiative(h: HeroState): number {
  return h.initiativeCard ?? (h.initiative ?? 0) - (h.initiativeRoll ?? 0);
}

function setInitiative(h: HeroState, card: number, roll: number | undefined): void {
  h.initiativeCard = card;
  if (roll === undefined) delete h.initiativeRoll;
  else h.initiativeRoll = roll;
  h.initiative = roll === undefined ? card : rolledInitiative(card, roll);
}

function playsCards(h: HeroState | undefined): h is HeroState {
  return !!h && h.kind === 'hero' && !h.exhausted && !h.downed && h.selection?.kind === 'cards' && h.initiative !== null;
}

/** Why the initiative item cannot be used in the window, or null. */
export function initiativeItemError(ctx: Ctx, h: HeroState, def: ItemDef, opts: DiceItemOptions): string | null {
  const st = diceStep(ctx, def);
  if (!st || !isInitiativeItem(ctx, def)) return 'this item does not change initiative';
  if (!playsCards(h)) return 'only a hero who played cards';
  if (st.name !== 'initiativeSwap' && opts.targetId !== undefined) return 'this item needs no ally';
  if (st.name !== 'initiativeShift' && opts.shift !== undefined) return 'this item needs no direction';
  switch (st.name) {
    case 'initiativeReroll':
    case 'initiativeDieOne':
    case 'dieRerollBest':
    case 'dieMirror':
      return h.initiativeRoll === undefined ? 'no initiative die was rolled' : null;
    case 'partyInitiativeReroll':
      return activeHeroes(ctx.s).some((a) => playsCards(a) && a.initiativeRoll !== undefined) ? null : 'no initiative die was rolled';
    case 'initiativeSwap': {
      const ally = opts.targetId ? ctx.s.figures[opts.targetId] : undefined;
      if (!ally || ally.id === h.id) return 'choose an ally to swap with';
      return ally.kind === 'hero' && playsCards(ally) ? null : 'the ally must have played cards';
    }
    case 'initiativeShift':
      return opts.shift === 1 || opts.shift === -1 ? null : 'choose earlier or later';
  }
  return 'unknown dice item';
}

/** Applies an initiative item. Returns true when the item stays ready (Пісочний годинник ★). */
export function applyInitiativeItem(ctx: Ctx, h: HeroState, def: ItemDef, itemId: string, opts: DiceItemOptions): boolean {
  const st = diceStep(ctx, def) as SpecialStep;
  const d12 = () => 1 + nextInt(ctx.s.rng, INITIATIVE_DIE_SIDES);
  let keep = false;
  if (st.name === 'initiativeReroll') {
    setInitiative(h, cardInitiative(h), d12());
    h.initiativeRerolls = (h.initiativeRerolls ?? 0) + 1;
    const times = param(st, 'times');
    keep = typeof times === 'number' && h.initiativeRerolls < times;
  } else if (st.name === 'initiativeDieOne') {
    setInitiative(h, cardInitiative(h), 1);
  } else if (st.name === 'dieRerollBest') {
    setInitiative(h, cardInitiative(h), Math.min(h.initiativeRoll ?? 1, d12()));
  } else if (st.name === 'dieMirror') {
    setInitiative(h, cardInitiative(h), INITIATIVE_DIE_SIDES + 1 - (h.initiativeRoll ?? 1));
    h.dieMirrors = (h.dieMirrors ?? 0) + 1;
    const times = param(st, 'times');
    keep = typeof times === 'number' && h.dieMirrors < times;
  } else if (st.name === 'partyInitiativeReroll') {
    for (const ally of activeHeroes(ctx.s)) {
      if (ally.id === h.id || !playsCards(ally) || ally.initiativeRoll === undefined) continue;
      setInitiative(ally, cardInitiative(ally), Math.min(ally.initiativeRoll, d12()));
      emit(ctx, { type: 'initiativeChanged', heroId: ally.id, itemId, card: cardInitiative(ally), roll: ally.initiativeRoll ?? 0, initiative: ally.initiative as number });
    }
    if (h.initiativeRoll !== undefined) setInitiative(h, cardInitiative(h), Math.min(h.initiativeRoll, d12()));
  } else if (st.name === 'initiativeShift') {
    const value = typeof param(st, 'value') === 'number' ? (param(st, 'value') as number) : 0;
    setInitiative(h, Math.max(INITIATIVE_MIN, cardInitiative(h) + (opts.shift ?? 0) * value), h.initiativeRoll);
  } else if (st.name === 'initiativeSwap') {
    const ally = hero(ctx.s, opts.targetId as string);
    const mine = { card: cardInitiative(h), roll: h.initiativeRoll, total: h.initiative as number };
    const theirs = { card: cardInitiative(ally), roll: ally.initiativeRoll, total: ally.initiative as number };
    swapTotals(h, theirs);
    swapTotals(ally, mine);
    emit(ctx, { type: 'initiativeChanged', heroId: ally.id, itemId, card: cardInitiative(ally), roll: ally.initiativeRoll ?? 0, initiative: ally.initiative as number });
  }
  emit(ctx, { type: 'initiativeChanged', heroId: h.id, itemId, card: cardInitiative(h), roll: h.initiativeRoll ?? 0, initiative: h.initiative as number });
  ctx.s.turnOrder = buildTurnOrder(ctx);
  return keep;
}

function swapTotals(h: HeroState, to: { card: number; roll: number | undefined; total: number }): void {
  h.initiativeCard = to.card;
  if (to.roll === undefined) delete h.initiativeRoll;
  else h.initiativeRoll = to.roll;
  h.initiative = to.total;
}

/** Why the X item cannot be used on the pending step, or null. */
export function xItemError(ctx: Ctx, heroId: FigureId, def: ItemDef): string | null {
  if (!isXItem(ctx, def)) return 'use it right after the initiative roll';
  const p = ctx.s.pending;
  if (p?.kind !== 'stepChoice' || p.heroId !== heroId || p.step.xRoll === undefined) return 'use it on a step with a rolled X';
  return null;
}

/** Rerolls the X of the pending step, keeping the better result. */
export function applyXItem(ctx: Ctx, h: HeroState, def: ItemDef, itemId: string): void {
  const p = ctx.s.pending;
  const half = ctx.s.half;
  if (p?.kind !== 'stepChoice' || !half) return;
  const step = structuredClone(p.step);
  const rolls = diceStep(ctx, def)?.params?.rolls;
  for (let i = 0; i < (typeof rolls === 'number' ? rolls : 1); i++) rerollStepX(ctx, h, step, itemId);
  half.steps[half.stepIndex] = step;
  p.step = step;
}

/** Whether the hero still has an initiative item that would work now. */
function canStillAct(ctx: Ctx, h: HeroState): boolean {
  for (const it of h.items ?? []) {
    if (it.state !== 'ready' || h.conditions.stun) continue;
    const def = itemDef(ctx, it.id);
    if (!def || !isInitiativeItem(ctx, def)) continue;
    const tries: DiceItemOptions[] = [{}, { shift: -1 }, ...activeHeroes(ctx.s).filter((a) => a.id !== h.id).map((a) => ({ targetId: a.id }))];
    if (tries.some((o) => initiativeItemError(ctx, h, def, o) === null)) return true;
  }
  return false;
}

/** After the initiative roll: opens the window when a hero has an initiative item that works. */
export function openInitiativeWindow(ctx: Ctx): boolean {
  if (!ctx.s.variants.diceGear) return false;
  const heroIds = activeHeroes(ctx.s)
    .filter((h) => canStillAct(ctx, h))
    .map((h) => h.id);
  if (heroIds.length === 0) return false;
  ctx.s.pending = { kind: 'initiativeItems', heroIds };
  return true;
}

/** The hero is done with the window (passed, or nothing left to use); the last one starts the turns. */
export function leaveInitiativeWindow(ctx: Ctx, heroId: FigureId, force: boolean): void {
  const p = ctx.s.pending;
  if (p?.kind !== 'initiativeItems') return;
  if (force || !canStillAct(ctx, hero(ctx.s, heroId))) p.heroIds = p.heroIds.filter((id) => id !== heroId);
  if (p.heroIds.length > 0) return;
  ctx.s.pending = null;
  startTurns(ctx);
}
