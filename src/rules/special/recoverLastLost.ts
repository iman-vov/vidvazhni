// Майстер, «Ремонтна майстерня», top: the last card the hero lost (not this one) returns to the hand.

import { emit } from '../effects/context';
import type { SpecialFn } from './index';

export const recoverLastLost: SpecialFn = (ctx, f, _step, _choice, src) => {
  if (f.kind !== 'hero') return 'only heroes have lost cards';
  return () => {
    const cardId = f.lost.filter((c) => c !== src.cardId).at(-1);
    if (!cardId) return;
    f.lost = f.lost.filter((c) => c !== cardId);
    f.hand.push(cardId);
    emit(ctx, { type: 'cardMoved', heroId: f.id, cardId, to: 'hand' });
  };
};
