// Damage, «уникнути шкоди», death of monsters and summons, exhaustion of heroes, scenario loss.

import { addCondition, removeCondition } from './conditions';
import type { ConditionId, HeroCard } from './content';
import { activeHeroes, emit, hero, isPresent, type Ctx } from './effects/context';
import { isShieldItem, readyItems } from './items';
import { adjustDamage, checkBossPhase, onHeroExhausted, onMonsterDied } from './scenarioRules';
import type { CardId, EngineTask, Figure, HeroState } from './state';
import type { Variants } from './variants';

type DamageTask = Extract<EngineTask, { t: 'damage' }>;

/** The card as played under these rules: with the orbs fork its `fork` initiative and halves
 *  replace the base ones (a half absent from `fork` stays as it is). */
export function effectiveCard(card: HeroCard, variants: Variants): HeroCard {
  if (!variants.orbs || !card.fork) return card;
  const f = card.fork;
  if (f.initiative === undefined && !f.top && !f.bottom) return card;
  return { ...card, initiative: f.initiative ?? card.initiative, top: f.top ?? card.top, bottom: f.bottom ?? card.bottom };
}

export function findCard(ctx: Ctx, h: HeroState, cardId: CardId): HeroCard {
  const card = ctx.c.heroes[h.classId]?.cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`unknown card ${cardId}`);
  return effectiveCard(card, ctx.s.variants);
}

/** A hero may cancel one source of damage by losing 1 card from hand or 2 from the discard. */
export function canAvoidDamage(h: HeroState): boolean {
  return h.hand.length >= 1 || h.discard.length >= 2;
}

/** Runs a damage task. Returns false when the engine must wait for the hero's avoid-damage choice
 *  (the task then stays at the front of the queue). */
export function runDamage(ctx: Ctx, task: DamageTask): boolean {
  const target = ctx.s.figures[task.targetId];
  // Scenario rules may reduce the damage (s5: Тінерук while the braziers are not all lit).
  const amount = isPresent(target) ? adjustDamage(ctx, target, task.amount) : 0;
  if (!isPresent(target) || amount <= 0) {
    if (isPresent(target)) applyConditions(ctx, target, task.conditions);
    return true;
  }
  // The window also opens for attack damage when the hero carries a ready shield item.
  const shieldItem = !!task.attack && target.kind === 'hero' && readyItems(ctx, target, (d) => isShieldItem(ctx, d)).length > 0;
  if (target.kind === 'hero' && task.avoidable && (canAvoidDamage(target) || shieldItem)) {
    // Sources are a figure id, 'trap', 'hazard' or 'condition' (wound).
    ctx.s.pending = { kind: 'avoidDamage', heroId: target.id, amount, source: task.source };
    return false;
  }
  takeDamage(ctx, target, amount, task.source);
  if (isPresent(target)) applyConditions(ctx, target, task.conditions);
  return true;
}

function applyConditions(ctx: Ctx, f: Figure, conditions: ConditionId[] | undefined): void {
  for (const c of conditions ?? []) addCondition(ctx, f, c);
}

/** Resolves the pending avoid-damage choice for the task at the front of the queue. */
export function resolveAvoidDamage(
  ctx: Ctx,
  heroId: string,
  choice: { kind: 'take' } | { kind: 'loseHand'; cardId: CardId } | { kind: 'loseDiscard'; cardIds: [CardId, CardId] },
): string | null {
  const task = ctx.s.queue?.[0];
  if (!task || task.t !== 'damage' || task.targetId !== heroId) return 'no damage to avoid';
  const h = hero(ctx.s, heroId);
  let lost: CardId[] = [];
  if (choice.kind !== 'take' && !canAvoidDamage(h)) return 'not enough cards to avoid damage';
  if (choice.kind === 'loseHand') {
    if (!h.hand.includes(choice.cardId)) return 'card not in hand';
    lost = [choice.cardId];
    h.hand = h.hand.filter((c) => c !== choice.cardId);
  } else if (choice.kind === 'loseDiscard') {
    const [a, b] = choice.cardIds;
    if (a === b || !h.discard.includes(a) || !h.discard.includes(b)) return 'need two different discarded cards';
    lost = [a, b];
    h.discard = h.discard.filter((c) => c !== a && c !== b);
  }
  ctx.s.queue?.shift();
  ctx.s.pending = null;
  if (choice.kind === 'take') {
    takeDamage(ctx, h, task.amount, task.source);
  } else {
    h.lost.push(...lost);
    for (const cardId of lost) emit(ctx, { type: 'cardMoved', heroId, cardId, to: 'lost' });
    emit(ctx, { type: 'damageAvoided', heroId, amount: task.amount, lost });
  }
  if (isPresent(h)) applyConditions(ctx, h, task.conditions);
  return null;
}

export function takeDamage(ctx: Ctx, f: Figure, amount: number, source: string): void {
  if (amount <= 0) return;
  const dealt = Math.min(amount, f.hp);
  const above = f.hp * 2 > f.maxHp;
  f.hp -= dealt;
  emit(ctx, { type: 'damaged', figureId: f.id, amount: dealt, source });
  if (f.hp > 0) {
    // Story beats only: a boss crossing half health (again after a heal), for every boss.
    if (f.kind === 'monster' && f.rank === 'boss' && above && f.hp * 2 <= f.maxHp) emit(ctx, { type: 'bossHalfHp', figureId: f.id });
    if (f.kind === 'monster') checkBossPhase(ctx, f);
    return;
  }
  if (f.kind === 'hero') heroAtZero(ctx, f);
  else killFigure(ctx, f);
}

/** At 0 hp a hero is exhausted. Fork «Підняти друга»: a hero never raised before is downed
 *  instead — stays on its hex, skips turns, cannot be targeted; the second fall exhausts. */
function heroAtZero(ctx: Ctx, h: HeroState): void {
  if (!ctx.s.variants.reviveAlly || h.revived || h.downed) return exhaust(ctx, h, 'damage');
  h.downed = true;
  h.hp = 0;
  h.provokeRadius = null;
  for (const c of Object.keys(h.conditions) as ConditionId[]) removeCondition(ctx, h, c);
  emit(ctx, { type: 'heroDowned', heroId: h.id });
  if (activeHeroes(ctx.s).length === 0) loseScenario(ctx);
}

export function killFigure(ctx: Ctx, f: Figure): void {
  if (f.kind === 'hero') return exhaust(ctx, f, 'damage');
  delete ctx.s.figures[f.id];
  emit(ctx, { type: 'figureDied', figureId: f.id });
  if (f.kind === 'monster') onMonsterDied(ctx, f);
  if (f.kind === 'summon' && f.npc) return loseScenario(ctx);
  if (f.kind === 'summon') {
    // The persistent card that keeps the summon goes to the lost pile.
    const owner = ctx.s.figures[f.ownerId];
    if (owner?.kind === 'hero') {
      const idx = owner.active.findIndex((a) =>
        findCard(ctx, owner, a.cardId)[a.half].steps.some((s) => s.type === 'summon'),
      );
      const entry = idx >= 0 ? owner.active[idx] : undefined;
      if (entry) {
        owner.active.splice(idx, 1);
        owner.lost.push(entry.cardId);
        emit(ctx, { type: 'cardMoved', heroId: owner.id, cardId: entry.cardId, to: 'lost' });
      }
    }
  }
}

export function exhaust(ctx: Ctx, h: HeroState, reason: 'damage' | 'cards'): void {
  if (h.exhausted) return;
  h.exhausted = true;
  h.hp = 0;
  h.provokeRadius = null;
  emit(ctx, { type: 'heroExhausted', heroId: h.id, reason });
  onHeroExhausted(ctx, h);
  for (const f of Object.values(ctx.s.figures)) {
    if (f.kind === 'summon' && f.ownerId === h.id) {
      delete ctx.s.figures[f.id];
      emit(ctx, { type: 'figureDied', figureId: f.id });
    }
  }
  if (activeHeroes(ctx.s).length === 0) loseScenario(ctx);
}

export function loseScenario(ctx: Ctx): void {
  if (ctx.s.phase === 'lost' || ctx.s.phase === 'won') return;
  ctx.s.phase = 'lost';
  ctx.s.pending = null;
  ctx.s.queue = [];
  ctx.out.length = 0;
  ctx.s.half = null;
  emit(ctx, { type: 'scenarioLost' });
}
