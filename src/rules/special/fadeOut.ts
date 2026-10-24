// Тінерук «Згасання» (`fadeOut{damage}`): every hero in play, in hero order, chooses to lose 1
// random card from the discard or to take the damage. The damage is the alternative to the card,
// so it cannot be avoided by «уникнути шкоди». A hero with an empty discard takes the damage.

import { takeDamage } from '../damage';
import { activeHeroes, emit, hero, isPresent, schedule, type Ctx } from '../effects/context';
import { nextInt } from '../rng';
import type { EngineTask } from '../state';
import type { SpecialFn } from './index';

type FadeOutTask = Extract<EngineTask, { t: 'fadeOut' }>;

export const fadeOut: SpecialFn = (ctx, f, step) => {
  const damage = Number(step.params?.damage ?? 0);
  return () => schedule(ctx, { t: 'fadeOut', sourceId: f.id, damage });
};

/** Task: asks each hero in turn. Returns false while waiting for a hero's choice. */
export function runFadeOut(ctx: Ctx, task: FadeOutTask): boolean {
  task.heroIds ??= activeHeroes(ctx.s).map((h) => h.id);
  while (task.heroIds.length > 0) {
    const id = task.heroIds[0] as string;
    const h = ctx.s.figures[id];
    if (!h || h.kind !== 'hero' || !isPresent(h)) {
      task.heroIds.shift();
      continue;
    }
    if (h.discard.length === 0) {
      task.heroIds.shift();
      emit(ctx, { type: 'fadeOutResolved', heroId: h.id });
      takeDamage(ctx, h, task.damage, task.sourceId);
      if (ctx.s.phase === 'lost') return true;
      continue;
    }
    ctx.s.pending = { kind: 'fadeOut', heroId: h.id, damage: task.damage, sourceId: task.sourceId };
    return false;
  }
  if (ctx.s.pending?.kind === 'fadeOut') ctx.s.pending = null;
  return true;
}

/** The hero's answer to «Згасання». */
export function resolveFadeOut(ctx: Ctx, heroId: string, choice: 'loseCard' | 'damage'): string | null {
  const task = ctx.s.queue?.[0];
  const p = ctx.s.pending;
  if (task?.t !== 'fadeOut' || p?.kind !== 'fadeOut' || p.heroId !== heroId) return 'no «Згасання» to answer';
  const h = hero(ctx.s, heroId);
  if (choice === 'loseCard' && h.discard.length === 0) return 'no discarded card to lose';
  task.heroIds = (task.heroIds ?? []).filter((id) => id !== heroId);
  ctx.s.pending = null;
  if (choice === 'loseCard') {
    const [cardId] = h.discard.splice(nextInt(ctx.s.rng, h.discard.length), 1) as [string];
    h.lost.push(cardId);
    emit(ctx, { type: 'cardMoved', heroId, cardId, to: 'lost' });
    emit(ctx, { type: 'fadeOutResolved', heroId, lost: cardId });
  } else {
    emit(ctx, { type: 'fadeOutResolved', heroId });
    takeDamage(ctx, h, task.damage, task.sourceId);
  }
  return null;
}
