// Мірошник-Болотяник «Потоп» (`flood{damage, condition}`): every hero standing on water takes the
// damage and the condition. Does nothing once the sluice lever is down (s3 `millSluice`).

import type { ConditionId } from '../content';
import { heroes, isPresent, schedule, tileAt } from '../effects/context';
import { sluiceLowered } from '../scenarioRules';
import type { SpecialFn } from './index';

export const flood: SpecialFn = (ctx, f, step) => {
  const damage = Number(step.params?.damage ?? 0);
  const condition = step.params?.condition as ConditionId | undefined;
  return () => {
    if (sluiceLowered(ctx)) return;
    for (const h of heroes(ctx.s)) {
      if (!isPresent(h) || tileAt(ctx.s, h.hex)?.terrain !== 'water') continue;
      schedule(ctx, { t: 'damage', targetId: h.id, amount: damage, source: f.id, avoidable: true, ...(condition ? { conditions: [condition] } : {}) });
    }
  };
};
