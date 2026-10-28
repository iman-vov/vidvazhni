// Living books (docs/design/act3.md, «Нові правила» s18).
//
//   livingBooks (s18) A bookshelf (`objects[]` of kind `bookshelf`) in the state `asleep` is a
//                     living one; any other state (`still`) is plain furniture. A hero who ends its
//                     turn next to a sleeping shelf, not invisible (the «Тиша» of the design: the
//                     rogue's invisibility), wakes it: the shelf turns `awake` and raises the alarm.
//                     The alarm is the event trigger `alarm` (that shelf's, or any shelf's): the
//                     data spawns the ghost and wakes the room (`wake`). The round of the first
//                     alarm is kept (secondary check `noAlarm`).

import { emit, wallBetween, type Ctx } from './effects/context';
import { onAlarm } from './events';
import { areAdjacent } from './hex';
import { boardObjects, hasSpecial } from './scenarioRules';
import type { GameState, HeroState } from './state';

export const BOOKSHELF = 'bookshelf';
export const SHELF_ASLEEP = 'asleep';
export const SHELF_AWAKE = 'awake';

/** End of a hero's turn: the sleeping shelves next to it wake. */
export function wakeShelves(ctx: Ctx, h: HeroState): void {
  if (!hasSpecial(ctx, 'livingBooks') || h.conditions.invisible || h.exhausted) return;
  for (const o of boardObjects(ctx.s)) {
    const obj = o.tile.object;
    if (obj.kind !== BOOKSHELF || obj.state !== SHELF_ASLEEP) continue;
    if (!areAdjacent(o.hex, h.hex) || wallBetween(ctx.s, o.hex, h.hex)) continue;
    obj.state = SHELF_AWAKE;
    emit(ctx, { type: 'objectChanged', objectId: obj.id, hex: [o.hex[0], o.hex[1]], state: SHELF_AWAKE, byId: h.id });
    ctx.s.alarmRound ??= ctx.s.round;
    emit(ctx, { type: 'alarm', objectId: obj.id });
    onAlarm(ctx, obj.id, o.hex);
  }
}

/** Secondary `noAlarm {rounds?}`: no alarm yet, or none before the end of round `rounds`. */
export function noAlarm(s: GameState, rounds?: number): boolean {
  return s.alarmRound === undefined || (rounds !== undefined && s.alarmRound > rounds);
}
