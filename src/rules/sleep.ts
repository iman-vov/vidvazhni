// Sleeping monsters (docs/design/act3.md: `asleep`, the automatons in s17 and the ghosts in s18).
//
//   A monster spawned with `asleep` (room `spawns[]` or an event's `spawn`) skips its turns. It
//   wakes for good when it takes damage, when a wind-up key near it is turned (allies.ts) or when
//   an event wakes it (`wake`, s18's alarm).

import { emit, monsters, type Ctx } from './effects/context';
import { distance, type Hex } from './hex';
import type { MonsterState } from './state';

export function wake(ctx: Ctx, m: MonsterState): void {
  if (!m.asleep) return;
  delete m.asleep;
  emit(ctx, { type: 'monsterWoke', figureId: m.id });
}

/** The sleeping monsters within `radius` of `hex` (all of them without a hex), nearest first. */
export function sleepersNear(ctx: Pick<Ctx, 's'>, hex?: Hex, radius = Infinity): MonsterState[] {
  return monsters(ctx.s)
    .filter((m) => m.asleep && (!hex || distance(m.hex, hex) <= radius))
    .sort((a, b) => (hex ? distance(a.hex, hex) - distance(b.hex, hex) : 0) || a.id.localeCompare(b.id));
}
