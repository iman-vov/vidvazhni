// Стихійник, «Сфера стихій», fork top: an orb on the board becomes another kind with a fresh life,
// above the Стихійник. Choice: `elements: [from, to]`, or `element: to` when only one orb exists.
// If an orb of the new kind already exists it is refreshed instead (one orb per kind).

import type { OrbId } from '../content';
import { emit } from '../effects/context';
import { isOrb, ORBS, putOrb } from '../elements';
import type { SpecialFn } from './index';

export const transmuteOrb: SpecialFn = (ctx, f, _step, choice) => {
  if (!ctx.s.variants.orbs) return 'only with the orbs fork';
  const present = ORBS.filter((o) => ctx.s.orbs[o]);
  let from: OrbId | undefined;
  let to: string | undefined;
  if (choice.elements?.length === 2) [from, to] = choice.elements as [OrbId, string];
  else if (present.length === 1) [from, to] = [present[0], choice.element];
  else return present.length === 0 ? 'no orb to transmute' : 'choose the orb and its new kind';
  if (!from || !ctx.s.orbs[from]) return 'no such orb';
  if (!to || !isOrb(to) || to === from) return 'choose another kind';
  const target = to;
  const source = from;
  return () => {
    delete ctx.s.orbs[source];
    emit(ctx, { type: 'orbExpired', orb: source });
    putOrb(ctx, target, f.id);
  };
};
