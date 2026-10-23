// Monster fork cards «відступити на N від героїв» (`retreat{distance}`): the monster moves up to N
// hexes to where its nearest enemy is as far away as possible. Ranking: fewest traps and hazardous
// hexes entered, then the largest distance to the nearest enemy, then the least movement, then
// the lowest q, r. Staying is a candidate, so a monster that cannot get further away stays.

import { enemiesOf, monsterStats, schedule, tileAt } from '../effects/context';
import { reachableHexes } from '../geometry';
import { distance, type Hex } from '../hex';
import type { SpecialFn } from './index';

export const retreat: SpecialFn = (ctx, f, step) => {
  if (f.kind !== 'monster') return 'only monsters retreat';
  if (f.conditions.immobilize) return 'immobilized';
  const max = Number(step.params?.distance ?? 0);
  const enemies = enemiesOf(ctx.s, f);
  if (max <= 0 || enemies.length === 0) return () => {};
  const fly = !!monsterStats(ctx, f).flying;
  const nearest = (hex: Hex) => Math.min(...enemies.map((e) => distance(e.hex, hex)));
  const negatives = (path: Hex[]) =>
    fly ? 0 : path.filter((h) => { const t = tileAt(ctx.s, h); return !!t?.trap || t?.terrain === 'hazardous'; }).length;
  let best = { path: [] as Hex[], neg: 0, far: nearest(f.hex), cost: 0, hex: f.hex };
  const reach = reachableHexes(ctx.s, max, { figureId: f.id, avoidNegativeHexes: true, ...(fly ? { fly: true } : {}) });
  for (const [, r] of reach) {
    const hex = r.path[r.path.length - 1];
    if (!hex || tileAt(ctx.s, hex)?.door?.open === false) continue;
    const c = { path: r.path, neg: negatives(r.path), far: nearest(hex), cost: r.cost, hex };
    const better =
      c.neg - best.neg || best.far - c.far || c.cost - best.cost || c.hex[0] - best.hex[0] || c.hex[1] - best.hex[1];
    if (better < 0) best = c;
  }
  return () => {
    if (best.path.length > 0) schedule(ctx, { t: 'move', figureId: f.id, path: best.path, ...(fly ? { fly: true } : {}) });
  };
};
