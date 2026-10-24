// Six elements (base rules). Infused elements become strong at the end of the infusing figure's
// turn; at the end of the round strong → waning → inert. Consuming needs strong or waning.
//
// Fork «Три стихії-сфери» (variants.orbs) replaces this behaviour behind the same functions:
// only fire, earth and air exist; an infusion puts the orb above the infuser at once (one orb per
// kind; infusing it again refreshes it and moves it to the new infuser); any figure's step may
// consume it from anywhere; at the end of the round it was created in it dims, at the end of the
// next round it goes out. Monsters never infuse or consume orbs (turn.ts drops those steps).

import type { ElementId, OrbId } from './content';
import { emit, type Ctx } from './effects/context';
import type { Hex } from './hex';
import type { ElementLevel, FigureId, GameState } from './state';

export const ELEMENTS: readonly ElementId[] = ['fire', 'ice', 'air', 'earth', 'light', 'dark'];
export const ORBS: readonly OrbId[] = ['fire', 'earth', 'air'];

export function isOrb(e: string): e is OrbId {
  return (ORBS as readonly string[]).includes(e);
}

/** The elements that exist under the state's rules (six, or the three orbs). */
export function elementIds(s: GameState): readonly ElementId[] {
  return s.variants.orbs ? ORBS : ELEMENTS;
}

export function initialElements(): Record<ElementId, ElementLevel> {
  return { fire: 'inert', ice: 'inert', air: 'inert', earth: 'inert', light: 'inert', dark: 'inert' };
}

function setLevel(ctx: Ctx, e: ElementId, level: ElementLevel): void {
  if (ctx.s.elements[e] === level) return;
  ctx.s.elements[e] = level;
  emit(ctx, { type: 'elementChanged', element: e, level });
}

/** Infuses an element. `byId` = the infusing figure (the orb's owner with the orbs fork);
 *  with orbs, an element that is not an orb (ice, light, dark) does nothing. */
export function infuse(ctx: Ctx, e: ElementId, byId?: FigureId, hex?: Hex): void {
  if (ctx.s.variants.orbs) {
    if (!isOrb(e)) return;
    putOrb(ctx, e, byId ?? 'scenario', hex);
    return;
  }
  if (!ctx.s.pendingInfusions.includes(e)) ctx.s.pendingInfusions.push(e);
}

/** Orbs: creates or refreshes the orb above `ownerId` (a figure, or a scenario source). */
export function putOrb(ctx: Ctx, orb: OrbId, ownerId: FigureId, hex?: Hex): void {
  ctx.s.orbs[orb] = { ownerId, age: 0, ...(hex ? { hex: [hex[0], hex[1]] as Hex } : {}) };
  emit(ctx, { type: 'orbInfused', orb, ownerId });
}

export function canConsume(ctx: Ctx, e: ElementId): boolean {
  if (ctx.s.variants.orbs) return isOrb(e) && !!ctx.s.orbs[e];
  return ctx.s.elements[e] !== 'inert';
}

/** Consumes an element (orb) for `byId`. Returns false when it is not available. */
export function consume(ctx: Ctx, e: ElementId, byId?: FigureId): boolean {
  if (!canConsume(ctx, e)) return false;
  if (ctx.s.variants.orbs) {
    const orb = ctx.s.orbs[e as OrbId];
    delete ctx.s.orbs[e as OrbId];
    emit(ctx, { type: 'orbConsumed', orb: e as OrbId, byId: byId ?? 'scenario', fromId: orb?.ownerId ?? 'scenario' });
    return true;
  }
  setLevel(ctx, e, 'inert');
  return true;
}

/** Elements that can be consumed right now. */
export function availableElements(ctx: Ctx): ElementId[] {
  return elementIds(ctx.s).filter((e) => canConsume(ctx, e));
}

export function endTurnInfusions(ctx: Ctx): void {
  for (const e of ctx.s.pendingInfusions) setLevel(ctx, e, 'strong');
  ctx.s.pendingInfusions = [];
}

export function decayAtEndOfRound(ctx: Ctx): void {
  if (ctx.s.variants.orbs) {
    for (const orb of ORBS) {
      const st = ctx.s.orbs[orb];
      if (!st) continue;
      if (st.age === 0) {
        st.age = 1;
        emit(ctx, { type: 'orbDimmed', orb });
      } else {
        delete ctx.s.orbs[orb];
        emit(ctx, { type: 'orbExpired', orb });
      }
    }
    return;
  }
  for (const e of ELEMENTS) {
    const level = ctx.s.elements[e];
    if (level === 'strong') setLevel(ctx, e, 'waning');
    else if (level === 'waning') setLevel(ctx, e, 'inert');
  }
}

/** Orbs: the scenario's orbs at the start (`atStart`) or at the start of every round (`eachRound`). */
export function scenarioOrbs(ctx: Ctx, when: 'atStart' | 'eachRound'): void {
  if (!ctx.s.variants.orbs) return;
  const fork = ctx.c.scenarios[ctx.s.scenarioId]?.forkOrbs;
  if (when === 'atStart') for (const o of fork?.atStart ?? []) putOrb(ctx, o.orb, 'scenario', o.hex);
  else for (const o of fork?.eachRound ?? []) {
    // A source that is a scenario object (s3 millstones) gives its orb only once its room is
    // revealed; the orb sits on the object's hex.
    const room = ctx.c.scenarios[ctx.s.scenarioId]?.rooms.find((r) => r.objects?.some((x) => x.id === o.source));
    const object = room?.objects?.find((x) => x.id === o.source);
    if (room && !ctx.s.board.revealedRooms.includes(room.id)) continue;
    putOrb(ctx, o.orb, o.source, object?.hex);
  }
}
