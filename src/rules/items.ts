// Items (minimal): a hero carries items from `content.items`; a `spent` item comes back with a long
// rest, a `lost` one is gone for the scenario, a `passive` one always applies. Items are used on
// the hero's own turn (action `useItem`); their effects are steps performed at once on the hero.
// Reactions (outside the own turn):
//   damage window (`avoidDamage` pending of attack damage) — items with a self shield step
//     (Кольчуга, Баклер): the shield goes on and lowers the incoming damage before it resolves;
//   `beforeAttacked` window (a monster attacks the hero, before the modifier) — Шолом: this
//     attack has disadvantage. Action `passReaction` closes it unused.
// Bonuses to «your attack / your move» apply to the pending attack or move step:
//   meleeAttackBonus{value}  — Кинджал: +value to a pending melee attack
//   moveBonus{value}         — Чоботи: +value to a pending move
//   jumpOnMove               — Мотузка з гаком: the pending move becomes a jump
//   nextAttackAgainstSelfDisadvantage — Шолом: the next attack against the hero this round has disadvantage
// Passive specials read where they apply: rangedRangeBonus (attack.ts), movePenalty (move.ts);
// a passive `shield … persistent` is put on the hero when the game starts.

import type { ItemDef, Step } from './content';
import { addCondition } from './conditions';
import { emit, hero, type Ctx } from './effects/context';
import { performStep } from './effects/index';
import type { EngineTask, HeroState } from './state';

type SpecialStep = Extract<Step, { type: 'special' }>;

/** Item specials that change the pending step instead of doing something on their own. */
export const STEP_ITEM_SPECIALS: readonly string[] = ['meleeAttackBonus', 'moveBonus', 'jumpOnMove'];

/** Suffix of an upgraded (★) item id: `dagger+`. */
export const UPGRADED = '+';

/** The item, or for `<id>+` its ★ version: the base item with the upgrade's effect. */
export function itemDef(ctx: { c: Ctx['c'] }, id: string): ItemDef | undefined {
  if (!id.endsWith(UPGRADED)) return ctx.c.items?.[id];
  const base = ctx.c.items?.[id.slice(0, -UPGRADED.length)];
  if (!base?.upgrade) return undefined;
  const { upgrade, ...rest } = base;
  return { ...rest, id, effect: upgrade.effect, forkEffect: upgrade.forkEffect };
}

/** i18n key of the item's name: `item.<id>`, `item.<id>.plus` for the ★ version. */
export function itemNameKey(id: string): string {
  return id.endsWith(UPGRADED) ? `item.${id.slice(0, -UPGRADED.length)}.plus` : `item.${id}`;
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

type DamageTask = Extract<EngineTask, { t: 'damage' }>;
type AttackTask = Extract<EngineTask, { t: 'attackTarget' }>;

/** The item gives its carrier a shield (Кольчуга, Баклер): usable in the damage window (avoidDamage). */
export function isShieldItem(ctx: Pick<Ctx, 's'>, def: ItemDef): boolean {
  return def.use !== 'passive' && itemEffect(ctx, def).some((st) => st.type === 'shield' && st.target === 'self');
}

/** The item gives the next attack against its carrier disadvantage (Шкіряний шолом). */
export function isAttackedItem(ctx: Pick<Ctx, 's'>, def: ItemDef): boolean {
  return (
    def.use !== 'passive' && itemEffect(ctx, def).some((st) => st.type === 'special' && st.name === 'nextAttackAgainstSelfDisadvantage')
  );
}

/** Ready items of the hero that pass `test` (reaction windows); none while stunned. */
export function readyItems(ctx: Pick<Ctx, 's' | 'c'>, h: HeroState, test: (def: ItemDef) => boolean): string[] {
  if (h.conditions.stun) return [];
  return (h.items ?? [])
    .filter((it) => {
      const def = it.state === 'ready' ? itemDef(ctx, it.id) : undefined;
      return !!def && test(def);
    })
    .map((it) => it.id);
}

/** The damage task waiting in the hero's damage window, when it is attack damage. */
function attackDamageTask(ctx: Ctx, heroId: string): DamageTask | undefined {
  const task = ctx.s.queue?.[0];
  return task?.t === 'damage' && task.targetId === heroId && task.attack ? task : undefined;
}

function attackTask(ctx: Ctx, heroId: string): AttackTask | undefined {
  const task = ctx.s.queue?.[0];
  return task?.t === 'attackTarget' && task.targetId === heroId ? task : undefined;
}

/** Why the item cannot be used now, or null. */
export function itemUseError(ctx: Ctx, heroId: string, itemId: string): string | null {
  const p = ctx.s.pending;
  const own = (p?.kind === 'heroTurn' && p.heroId === heroId) || (p?.kind === 'stepChoice' && p.heroId === heroId);
  const damageWindow = p?.kind === 'avoidDamage' && p.heroId === heroId;
  const attackedWindow = p?.kind === 'beforeAttacked' && p.heroId === heroId;
  if (!own && !damageWindow && !attackedWindow) return 'items are used on your own turn';
  const h = hero(ctx.s, heroId);
  if (h.conditions.stun) return 'stunned';
  const it = h.items?.find((x) => x.id === itemId);
  if (!it) return 'item not carried';
  if (it.state !== 'ready') return `item is ${it.state}`;
  const def = itemDef(ctx, itemId);
  if (!def) return 'unknown item';
  if (def.use === 'passive') return 'passive items always apply';
  if (damageWindow) {
    if (!isShieldItem(ctx, def)) return 'only a shield item helps against this damage';
    return attackDamageTask(ctx, heroId) ? null : 'a shield only helps against attack damage';
  }
  if (attackedWindow) return isAttackedItem(ctx, def) && attackTask(ctx, heroId) ? null : 'this item does not help against the attack';
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
  const kind = ctx.s.pending?.kind;
  const shieldBefore = shieldTotal(h);
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
  if (kind === 'avoidDamage') shieldReaction(ctx, h, itemId, shieldTotal(h) - shieldBefore);
  if (kind === 'beforeAttacked') attackedReaction(ctx, h, itemId);
  return null;
}

function shieldTotal(h: HeroState): number {
  return h.shields.reduce((sum, x) => sum + x.value, 0);
}

/** Damage window: the new shield lowers the waiting attack damage; at 0 the damage is gone. */
function shieldReaction(ctx: Ctx, h: HeroState, itemId: string, added: number): void {
  const task = attackDamageTask(ctx, h.id);
  const p = ctx.s.pending;
  if (!task?.attack || p?.kind !== 'avoidDamage') return;
  const before = p.amount;
  task.attack.shield += added;
  task.amount = Math.max(0, task.attack.value - Math.max(0, task.attack.shield - task.attack.pierce));
  p.amount = Math.min(before, task.amount);
  emit(ctx, { type: 'itemReaction', heroId: h.id, itemId, window: 'damage', shield: added, damageBefore: before, damage: p.amount });
  if (p.amount > 0) return;
  // Fully absorbed: the damage task ends here (its conditions still land).
  ctx.s.queue?.shift();
  ctx.s.pending = null;
  for (const c of task.conditions ?? []) addCondition(ctx, h, c);
}

/** Before-attacked window: the waiting attack gets disadvantage; the window closes. */
function attackedReaction(ctx: Ctx, h: HeroState, itemId: string): void {
  const task = attackTask(ctx, h.id);
  if (!task) return;
  task.spec = { ...task.spec, disadvantage: true };
  task.reacted = true;
  ctx.s.pending = null;
  emit(ctx, { type: 'itemReaction', heroId: h.id, itemId, window: 'beforeAttacked', disadvantage: true, attackerId: task.attackerId });
}

/** Closes the before-attacked window without using an item. */
export function passReaction(ctx: Ctx, heroId: string): string | null {
  const p = ctx.s.pending;
  const task = attackTask(ctx, heroId);
  if (p?.kind !== 'beforeAttacked' || p.heroId !== heroId || !task) return 'nothing to react to';
  task.reacted = true;
  ctx.s.pending = null;
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
