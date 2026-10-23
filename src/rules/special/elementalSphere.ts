// Стихійник, «Сфера стихій», bottom: every lost card returns to the hand; this card is lost
// (see LOSS_SPECIALS), so it never comes back by its own effect.

import { emit } from '../effects/context';
import type { SpecialFn } from './index';

export const elementalSphere: SpecialFn = (ctx, f, _step, _choice, src) => {
  if (f.kind !== 'hero') return 'only heroes have lost cards';
  return () => {
    const back = f.lost.filter((c) => c !== src.cardId);
    f.lost = f.lost.filter((c) => c === src.cardId);
    for (const cardId of back) {
      f.hand.push(cardId);
      emit(ctx, { type: 'cardMoved', heroId: f.id, cardId, to: 'hand' });
    }
  };
};
