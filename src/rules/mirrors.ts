// Glass Town mirrors (docs/design/act3.md, «Нові правила» s16 and s19).
//
//   mirrorHexes (s16) A floor mirror (`objects[]` of kind `mirror` without `blocks`; `hp: 1` in the
//                     data, figures stand on it) gives:
//                     - a ranged attack on a figure standing on it has disadvantage;
//                     - an attack with Light (a consume bonus paid with Light) made from it reaches
//                       1 hex further;
//                     - a hero's area attack covering it breaks it: it stays on its hex as
//                       `broken` and does nothing more (secondary check `noMirrorBroken`).
//                     Monster and summon area attacks leave mirrors alone (their areas are planned
//                     by the AI, not chosen by the players).
//   beamMirrors (s19) Mirrors with `turns` (their states in order, each with where it sends the
//                     beam): an adjacent hero spends a top action to turn one to its next state
//                     (after the last, back to the first). The beam (`ScenarioDef.beam`) leaves the
//                     window `from` towards the object `aim`, then each mirror it reaches sends it
//                     on by its state's `aim`: another mirror, or `target` (the crystal door at
//                     `to`). Every leg needs line of sight. When it reaches `to`, the doors on
//                     `opens` open. The goal itself is `objectStates` over the mirrors.

import type { ScenarioDef, Step } from './content';
import { emit, tileAt, type Ctx } from './effects/context';
import { openDoor } from './effects/move';
import type { Hex } from './hex';
import { hasLineOfSight } from './geometry';
import { hasSpecial } from './scenarioRules';
import type { Figure, GameState, Tile } from './state';

export const MIRROR = 'mirror';
export const MIRROR_BROKEN = 'broken';
/** A mirror state's `aim` that sends the beam to `beam.to`. */
export const BEAM_TARGET = 'target';
/** «Атака зі Світлом з дзеркала»: range bonus. */
export const MIRROR_LIGHT_RANGE = 1;

type AttackStep = Extract<Step, { type: 'attack' }>;
type MirrorTile = Tile & { object: NonNullable<Tile['object']> };

function floorMirror(s: GameState, hex: Hex): MirrorTile | undefined {
  const tile = tileAt(s, hex);
  if (tile?.object?.kind !== MIRROR || tile.object.state === MIRROR_BROKEN || tile.obstacle) return undefined;
  return tile as MirrorTile;
}

/** s16: the hex holds a whole floor mirror. */
export function onMirror(ctx: Pick<Ctx, 's' | 'c'>, hex: Hex): boolean {
  return hasSpecial(ctx, 'mirrorHexes') && !!floorMirror(ctx.s, hex);
}

/** s16: a ranged attack on a figure standing on a mirror has disadvantage. */
export function mirrorDisadvantage(ctx: Pick<Ctx, 's' | 'c'>, target: Figure, ranged: boolean): boolean {
  return ranged && onMirror(ctx, target.hex);
}

/** s16: an attack paid with Light from a mirror reaches further (melee stays melee). */
export function withMirrorLight(ctx: Pick<Ctx, 's' | 'c'>, f: Figure, step: AttackStep): AttackStep {
  if (step.range === undefined || !onMirror(ctx, f.hex)) return step;
  return { ...step, range: step.range + MIRROR_LIGHT_RANGE };
}

/** s16: a hero's area attack breaks the mirrors it covers. */
export function breakMirrors(ctx: Ctx, byId: string, hexes: Hex[]): void {
  if (!hasSpecial(ctx, 'mirrorHexes')) return;
  for (const hex of hexes) {
    const tile = floorMirror(ctx.s, hex);
    if (!tile) continue;
    tile.object.state = MIRROR_BROKEN;
    (ctx.s.destroyedObjects ??= []).push(tile.object.id);
    emit(ctx, { type: 'objectChanged', objectId: tile.object.id, hex: [hex[0], hex[1]], state: MIRROR_BROKEN, byId });
  }
}

/** Secondary check «не розбито жодного дзеркала». */
export function mirrorBroken(s: GameState): boolean {
  return Object.values(s.board.tiles).some((t) => t.object?.kind === MIRROR && t.object.state === MIRROR_BROKEN);
}

// ─── The beam (s19) ────────────────────────────────────────────────────────

function objectDef(scenario: ScenarioDef, id: string) {
  return scenario.rooms.flatMap((r) => r.objects ?? []).find((o) => o.id === id);
}

/** The state a turning mirror goes to from `state` (from the first when `state` is not listed). */
export function nextTurn(turns: { state: string }[], state: string | undefined): string {
  const i = turns.findIndex((t) => t.state === state);
  return turns[(i + 1) % turns.length]!.state;
}

/** How many turns the mirror needs from `from` to `to` (0 = there; -1 = never). */
export function turnsBetween(turns: { state: string }[], from: string | undefined, to: string): number {
  const i = turns.findIndex((t) => t.state === from);
  const j = turns.findIndex((t) => t.state === to);
  if (j < 0) return -1;
  if (i < 0) return j + 1;
  return (j - i + turns.length) % turns.length;
}

export interface Beam {
  /** The hexes the beam passes through in order: the window, each mirror it reaches, and the
   *  target when it gets there. */
  hexes: Hex[];
  /** Mirrors the beam falls on. */
  lit: string[];
  reached: boolean;
}

/** Where the beam goes now. Mirrors in rooms not yet revealed stop it (no line of sight). */
export function beamPath(s: GameState, scenario: ScenarioDef | undefined): Beam | null {
  const beam = scenario?.beam;
  if (!scenario || !beam || !scenario.specials?.includes('beamMirrors')) return null;
  const out: Beam = { hexes: [[beam.from[0], beam.from[1]]], lit: [], reached: false };
  let at: Hex = beam.from;
  let aim: string | undefined = beam.aim;
  while (aim) {
    if (aim === BEAM_TARGET) {
      if (hasLineOfSight(s, at, beam.to)) {
        out.hexes.push([beam.to[0], beam.to[1]]);
        out.reached = true;
      }
      break;
    }
    if (out.lit.includes(aim)) break;
    const def = objectDef(scenario, aim);
    const tile = def && tileAt(s, def.hex);
    if (!def || tile?.object?.id !== aim || tile.object.state === MIRROR_BROKEN || !hasLineOfSight(s, at, def.hex)) break;
    out.hexes.push([def.hex[0], def.hex[1]]);
    out.lit.push(aim);
    at = def.hex;
    aim = def.turns?.find((t) => t.state === tile.object!.state)?.aim;
  }
  return out;
}

/** After a mirror turns (or a room opens): a beam on the target opens the crystal doors. */
export function checkBeam(ctx: Ctx): void {
  if (!hasSpecial(ctx, 'beamMirrors')) return;
  const scenario = ctx.c.scenarios[ctx.s.scenarioId];
  const beam = beamPath(ctx.s, scenario);
  if (!beam?.reached) return;
  for (const hex of scenario!.beam!.opens ?? []) openDoor(ctx, hex);
}

/** The turning rule of a mirror with `turns`: a top action, from its state to the next. */
export function turnRule(scenario: ScenarioDef | undefined, objectId: string, state: string | undefined): { kind: string; from: string; to: string } | undefined {
  const def = scenario && objectDef(scenario, objectId);
  if (!def?.turns?.length) return undefined;
  return { kind: def.kind, from: state ?? '', to: nextTurn(def.turns, state) };
}

/** Where a mirror sends the beam in `state`: the hex of its aim, for the board. */
export function mirrorAimHex(scenario: ScenarioDef | undefined, objectId: string, state: string | undefined): Hex | null {
  const def = scenario && objectDef(scenario, objectId);
  const aim = def?.turns?.find((t) => t.state === state)?.aim;
  if (!aim) return null;
  if (aim === BEAM_TARGET) return scenario!.beam?.to ?? null;
  return objectDef(scenario!, aim)?.hex ?? null;
}
