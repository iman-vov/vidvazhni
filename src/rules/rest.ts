// Short rest (end of round) and long rest (a whole turn at initiative 99).

import { takeDamage } from './damage';
import { activeHeroes, emit, hero, schedule, type Ctx } from './effects/context';
import { healFigure } from './effects/support';
import { refreshSpentItems } from './items';
import { nextInt } from './rng';
import type { CardId, EngineTask, HeroState } from './state';

export const LONG_REST_HEAL = 2;

type ShortRestTask = Extract<EngineTask, { t: 'shortRests' }>;

/** Task: offer a short rest to every hero with at least 2 discarded cards.
 *  Returns false while waiting for the players. */
export function runShortRests(ctx: Ctx, task: ShortRestTask): boolean {
  task.heroIds ??= activeHeroes(ctx.s)
    .filter((h) => h.discard.length >= 2)
    .map((h) => h.id);
  task.heroIds = task.heroIds.filter((id) => {
    const h = ctx.s.figures[id];
    return h?.kind === 'hero' && !h.exhausted;
  });
  if (task.heroIds.length === 0) {
    if (ctx.s.pending?.kind === 'endOfRound' || ctx.s.pending?.kind === 'shortRestReroll') ctx.s.pending = null;
    return true;
  }
  if (ctx.s.pending?.kind !== 'shortRestReroll') ctx.s.pending = { kind: 'endOfRound', heroIds: [...task.heroIds] };
  return false;
}

function currentTask(ctx: Ctx): ShortRestTask | null {
  const task = ctx.s.queue?.[0];
  return task?.t === 'shortRests' ? task : null;
}

export function shortRest(ctx: Ctx, heroId: string, rest: boolean): string | null {
  const task = currentTask(ctx);
  const p = ctx.s.pending;
  if (!task || p?.kind !== 'endOfRound' || !p.heroIds.includes(heroId)) return 'no short rest offered';
  const h = hero(ctx.s, heroId);
  if (!rest) {
    task.heroIds = (task.heroIds ?? []).filter((id) => id !== heroId);
    ctx.s.pending = null;
    return null;
  }
  const lostCard = h.discard[nextInt(ctx.s.rng, h.discard.length)] as CardId;
  ctx.s.pending = { kind: 'shortRestReroll', heroId, lostCard };
  return null;
}

/** Once per short rest the hero may take 1 damage to lose a different random card instead. */
export function shortRestReroll(ctx: Ctx, heroId: string, reroll: boolean): string | null {
  const task = currentTask(ctx);
  const p = ctx.s.pending;
  if (!task || p?.kind !== 'shortRestReroll' || p.heroId !== heroId) return 'no short rest in progress';
  const h = hero(ctx.s, heroId);
  let lost = p.lostCard;
  ctx.s.pending = null;
  task.heroIds = (task.heroIds ?? []).filter((id) => id !== heroId);
  if (reroll) {
    takeDamage(ctx, h, 1, 'shortRest');
    if (h.exhausted) return null;
    const others = h.discard.filter((c) => c !== p.lostCard);
    lost = others[nextInt(ctx.s.rng, others.length)] ?? p.lostCard;
  }
  finishRest(ctx, h, lost, 'short');
  return null;
}

function finishRest(ctx: Ctx, h: HeroState, lost: CardId, kind: 'short' | 'long'): void {
  const back = h.discard.filter((c) => c !== lost);
  h.discard = [];
  h.lost.push(lost);
  emit(ctx, { type: 'cardMoved', heroId: h.id, cardId: lost, to: 'lost' });
  for (const cardId of back) {
    h.hand.push(cardId);
    emit(ctx, { type: 'cardMoved', heroId: h.id, cardId, to: 'hand' });
  }
  emit(ctx, { type: 'rested', heroId: h.id, kind, lost });
}

/** The long-resting hero picks the card to lose; heals 2, refreshes spent items, discard → hand. */
export function longRestLoss(ctx: Ctx, heroId: string, cardId: CardId): string | null {
  const p = ctx.s.pending;
  if (p?.kind !== 'longRestLoss' || p.heroId !== heroId) return 'not long resting now';
  const h = hero(ctx.s, heroId);
  if (!h.discard.includes(cardId)) return 'card not in discard';
  ctx.s.pending = null;
  finishRest(ctx, h, cardId, 'long');
  healFigure(ctx, h, LONG_REST_HEAL);
  refreshSpentItems(ctx, h);
  schedule(ctx, { t: 'endFigureTurn', figureId: h.id }, { t: 'nextTurn' });
  return null;
}
