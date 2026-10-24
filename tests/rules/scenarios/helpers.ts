// Helpers for the scenario tests: real content, a game of Вартовий + Травниця (both take all
// their cards, so no hand choice), and direct board edits for setting up a situation.

import { act, endTurn } from '../../helpers/engineFixtures';
import { createGame } from '../../../src/rules/engine';
import type { Ctx } from '../../../src/rules/effects/context';
import type { Hex } from '../../../src/rules/hex';
import { loadContent } from '../../../src/rules/load';
import { revealRoom } from '../../../src/rules/setup';
import type { GameState, HeroState, MonsterState } from '../../../src/rules/state';
import { BASE_RULES, type Variants } from '../../../src/rules/variants';

export const content = loadContent();

export function game(scenarioId: string, variants: Partial<Variants> = {}, heroes = ['warden', 'herbalist'], level = 1, seed = 1): GameState {
  return createGame(
    {
      scenarioId,
      seed,
      heroes: heroes.map((classId, i) => ({ classId, playerId: `p${i}`, level })),
      difficulty: 'normal',
      variants: { ...BASE_RULES, ...variants },
    },
    content,
  );
}

export function ctxOf(s: GameState): Ctx {
  return { s, c: content, ev: [], out: [] };
}

/** Reveals rooms in place (as if their doors were opened), spawning their monsters. */
export function reveal(s: GameState, ...roomIds: string[]): GameState {
  const ctx = ctxOf(s);
  const scenario = content.scenarios[s.scenarioId];
  if (!scenario) throw new Error('no scenario');
  for (const id of roomIds) revealRoom(ctx, scenario, id);
  return s;
}

export function monstersOf(s: GameState, typeId?: string): MonsterState[] {
  return Object.values(s.figures).filter((f): f is MonsterState => f.kind === 'monster' && (!typeId || f.typeId === typeId));
}

/** Removes monsters (all, or of the given types) from the board. */
export function clearMonsters(s: GameState, ...typeIds: string[]): GameState {
  for (const m of monstersOf(s)) if (typeIds.length === 0 || typeIds.includes(m.typeId)) delete s.figures[m.id];
  return s;
}

export function place(s: GameState, figureId: string, hex: Hex): GameState {
  const f = s.figures[figureId];
  if (!f) throw new Error(`no figure ${figureId}`);
  f.hex = [hex[0], hex[1]];
  return s;
}

export function hero(s: GameState, classId: string): HeroState {
  return s.figures[`hero:${classId}`] as HeroState;
}

export function tile(s: GameState, hex: Hex) {
  const t = s.board.tiles[`${hex[0]},${hex[1]}`];
  if (!t) throw new Error(`no tile ${hex}`);
  return t;
}

/** The first two cards of a hero's hand, the first one leading. */
export function twoCards(s: GameState, classId: string): [string, string] {
  const h = hero(s, classId);
  return [h.hand[0] as string, h.hand[1] as string];
}

/** The two cards the hero selected this round. */
export function selected(s: GameState, classId: string): [string, string] {
  const sel = hero(s, classId).selection;
  if (sel?.kind !== 'cards') throw new Error(`${classId} selected no cards`);
  return sel.cards;
}

/** Ends the other heroes' turns until it is `classId`'s turn. */
export function untilTurn(s: GameState, classId: string): GameState {
  let t = s;
  while (t.pending?.kind === 'heroTurn' && t.pending.heroId !== `hero:${classId}`) t = endTurn(t, content, t.pending.heroId.slice(5));
  return t;
}

/** The hero's two lowest-initiative cards in hand (so the hero acts early). */
export function earlyCards(s: GameState, classId: string): [string, string] {
  const h = hero(s, classId);
  const ini = (id: string) => content.heroes[h.classId]?.cards.find((c) => c.id === id)?.initiative ?? 99;
  const [a, b] = [...h.hand].sort((x, y) => ini(x) - ini(y));
  return [a as string, b as string];
}

/** Every hero in play selects its two earliest cards. */
export function selectEarly(s: GameState): GameState {
  let t = s;
  for (const h of Object.values(t.figures)) {
    if (h.kind !== 'hero' || h.exhausted) continue;
    const cards = earlyCards(t, h.classId);
    t = act(t, content, { type: 'selectCards', heroId: h.id, cards, leading: cards[0] });
  }
  return t;
}
