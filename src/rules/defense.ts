// Our own damage defence (docs/design/defense.md), in the damage window (`avoidDamage`) of attack damage:
//   «Ухилитися» (variant `dodgeDie`) — pay a card from hand to the discard or 1 Наснага charge, roll a d12:
//     8–12 no damage, 4–7 half (rounded down), 1–3 nothing. Once per attack; Зілля удачі / Щаслива
//     кістка add rolls and the best one is kept.
//   «Прикрий друга» (variant `coverAlly`) — an adjacent ally hero takes the hit with their own shield,
//     once per round per covering hero; conditions, push and retaliate follow the hit.
// Losing a card (damage.ts) stays as the last resort and works against any damage.

import type { ItemDef, Step } from './content';
import { emit, hero, isPresent, type Ctx } from './effects/context';
import { performStep } from './effects/index';
import { shieldOf } from './effects/attack';
import { areAdjacent } from './hex';
import { itemDef, itemEffect } from './items';
import { nextInt } from './rng';
import type { CardId, EngineTask, FigureId, HeroState } from './state';
import { DODGE_DIE_SIDES, DODGE_FULL_AT, DODGE_HALF_AT } from './variants';

type DamageTask = Extract<EngineTask, { t: 'damage' }>;
type SpecialStep = Extract<Step, { type: 'special' }>;

export type DodgePay = { kind: 'card'; cardId: CardId } | { kind: 'momentum' };
export type DodgeResult = 'full' | 'half' | 'none';

/** Damage of an attack after the shield (minus pierce), halved by a half dodge. */
export function attackDamage(attack: NonNullable<DamageTask['attack']>): number {
  const dmg = Math.max(0, attack.value - Math.max(0, attack.shield - attack.pierce));
  return attack.halved ? Math.floor(dmg / 2) : dmg;
}

export function dodgeResult(roll: number): DodgeResult {
  return roll >= DODGE_FULL_AT ? 'full' : roll >= DODGE_HALF_AT ? 'half' : 'none';
}

/** Chances of each result when the best of `rolls` d12 is kept. */
export function dodgeChances(rolls = 1): Record<DodgeResult, number> {
  const below = (n: number) => ((n - 1) / DODGE_DIE_SIDES) ** rolls;
  const none = below(DODGE_HALF_AT);
  const full = 1 - below(DODGE_FULL_AT);
  return { full, half: 1 - full - none, none };
}

/** The attack damage task waiting in the hero's damage window (avoidDamage). */
function windowTask(ctx: Pick<Ctx, 's'>, heroId: FigureId): DamageTask | undefined {
  const p = ctx.s.pending;
  const task = ctx.s.queue?.[0];
  if (p?.kind !== 'avoidDamage' || p.heroId !== heroId) return undefined;
  return task?.t === 'damage' && task.targetId === heroId && task.attack ? task : undefined;
}

/** Extra d12 a dice item gives the dodge: Зілля удачі 1, Щаслива кістка and Перлина туману `rolls`
 *  (★ 2); 0 = not one. */
export function dodgeItemRolls(ctx: Pick<Ctx, 's'>, def: ItemDef): number {
  const st = itemEffect(ctx, def).find(
    (x): x is SpecialStep => x.type === 'special' && ['dieRerollBest', 'xRerollBest', 'dodgeRerollBest'].includes(x.name),
  );
  if (!st) return 0;
  const rolls = st.params?.rolls;
  return st.name !== 'dieRerollBest' && typeof rolls === 'number' ? rolls : 1;
}

/** Whether the hero could dodge this attack damage at all (opens the window). */
export function canDodge(ctx: Pick<Ctx, 's'>, h: HeroState, task: DamageTask): boolean {
  if (!ctx.s.variants.dodgeDie || !task.attack || task.dodged) return false;
  if (h.conditions.stun || h.conditions.immobilize) return false;
  return h.hand.length > 0 || (ctx.s.variants.momentum && h.momentum > 0);
}

export function dodgeError(ctx: Ctx, heroId: FigureId, pay: DodgePay, itemId?: string): string | null {
  if (!ctx.s.variants.dodgeDie) return 'variant «Ухилитися» is off';
  const task = windowTask(ctx, heroId);
  if (!task) return 'no attack damage to dodge';
  const h = hero(ctx.s, heroId);
  if (task.dodged) return 'already dodged this attack';
  if (h.conditions.stun) return 'stunned';
  if (h.conditions.immobilize) return 'immobilized';
  if (pay.kind === 'card' && !h.hand.includes(pay.cardId)) return 'card not in hand';
  if (pay.kind === 'momentum' && (!ctx.s.variants.momentum || h.momentum < 1)) return 'no Наснага charge';
  if (itemId !== undefined) {
    if (!ctx.s.variants.diceGear) return 'dice items are off';
    const it = h.items?.find((x) => x.id === itemId);
    const def = it?.state === 'ready' ? itemDef(ctx, itemId) : undefined;
    if (!def || dodgeItemRolls(ctx, def) === 0) return 'this item does not help the dodge';
  }
  return null;
}

/** «Ухилитися»: pays, rolls the d12 (the best of several with a dice item) and lowers the damage. */
export function dodge(ctx: Ctx, heroId: FigureId, pay: DodgePay, itemId?: string): string | null {
  const err = dodgeError(ctx, heroId, pay, itemId);
  if (err) return err;
  const h = hero(ctx.s, heroId);
  const task = windowTask(ctx, heroId) as DamageTask;
  const p = ctx.s.pending as Extract<NonNullable<Ctx['s']['pending']>, { kind: 'avoidDamage' }>;
  if (pay.kind === 'card') {
    h.hand = h.hand.filter((c) => c !== pay.cardId);
    h.discard.push(pay.cardId);
    emit(ctx, { type: 'cardMoved', heroId, cardId: pay.cardId, to: 'discard' });
  } else {
    h.momentum--;
  }
  const def = itemId !== undefined ? (itemDef(ctx, itemId) as ItemDef) : undefined;
  const rolls: number[] = [];
  for (let i = 0; i < 1 + (def ? dodgeItemRolls(ctx, def) : 0); i++) rolls.push(1 + nextInt(ctx.s.rng, DODGE_DIE_SIDES));
  const roll = Math.max(...rolls);
  const result = dodgeResult(roll);
  if (def && itemId !== undefined) spendItem(ctx, h, def, itemId);
  task.dodged = true;
  const before = p.amount;
  if (result === 'full') task.amount = 0;
  if (result === 'half' && task.attack) {
    task.attack.halved = true;
    task.amount = Math.min(task.amount, Math.floor(task.amount / 2));
  }
  p.amount = task.amount;
  emit(ctx, {
    type: 'dodgeRolled',
    heroId,
    rolls,
    roll,
    result,
    damageBefore: before,
    damage: p.amount,
    pay: pay.kind,
    ...(itemId !== undefined ? { itemId } : {}),
  });
  if (p.amount > 0) return null;
  // Nothing left: the damage task ends here (its conditions still land, like a shield's).
  ctx.s.queue?.shift();
  ctx.s.pending = null;
  return null;
}

function spendItem(ctx: Ctx, h: HeroState, def: ItemDef, itemId: string): void {
  // Other steps of a dice item (★: Лікування 2, Щит 1) happen after the die.
  for (const st of itemEffect(ctx, def)) {
    if (st.type === 'special' && (st.name === 'dieRerollBest' || st.name === 'xRerollBest')) continue;
    performStep(ctx, h, st, {});
  }
  const it = h.items?.find((x) => x.id === itemId);
  const to = def.use === 'lost' ? 'lost' : 'spent';
  if (it) it.state = to;
  emit(ctx, { type: 'itemUsed', heroId: h.id, itemId, to });
}

/** Heroes who may take this attack instead of its target («Прикрий друга»). */
export function coverAllies(ctx: Pick<Ctx, 's'>, task: DamageTask): HeroState[] {
  if (!ctx.s.variants.coverAlly || !task.attack || task.covered || task.dodged) return [];
  const target = ctx.s.figures[task.targetId];
  if (target?.kind !== 'hero') return [];
  return Object.values(ctx.s.figures).filter(
    (f): f is HeroState =>
      f.kind === 'hero' &&
      f.id !== target.id &&
      isPresent(f) &&
      !f.downed &&
      !f.coverUsed &&
      !f.conditions.stun &&
      areAdjacent(f.hex, target.hex),
  );
}

export function coverError(ctx: Ctx, heroId: FigureId, targetId: FigureId): string | null {
  if (!ctx.s.variants.coverAlly) return 'variant «Прикрий друга» is off';
  const task = windowTask(ctx, targetId);
  if (!task) return 'no attack to take';
  if (!coverAllies(ctx, task).some((a) => a.id === heroId)) return 'this hero cannot cover now';
  return null;
}

/** «Прикрий друга»: the ally becomes the target of the damage and of the rest of the hit; the damage
 *  is counted again with the ally's shield and runs through the ally's own damage window (avoidDamage). */
export function coverAlly(ctx: Ctx, heroId: FigureId, targetId: FigureId): string | null {
  const err = coverError(ctx, heroId, targetId);
  if (err) return err;
  const ally = hero(ctx.s, heroId);
  const task = windowTask(ctx, targetId) as DamageTask;
  const attack = task.attack as NonNullable<DamageTask['attack']>;
  const before = (ctx.s.pending as { amount: number }).amount;
  ally.coverUsed = true;
  attack.shield = shieldOf(ally, ctx);
  task.targetId = heroId;
  task.covered = true;
  task.amount = attackDamage(attack);
  const afterHit = ctx.s.queue?.find((t) => t.t === 'afterHit' && t.targetId === targetId && t.attackerId === task.source);
  if (afterHit?.t === 'afterHit') afterHit.targetId = heroId;
  ctx.s.pending = null;
  emit(ctx, { type: 'allyCovered', heroId, targetId, attackerId: task.source, damageBefore: before, damage: task.amount });
  // The task stays at the front: runDamage opens the ally's own window (or deals the damage).
  return null;
}
