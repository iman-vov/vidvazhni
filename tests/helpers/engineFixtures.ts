// Small inline content and helpers for engine tests: a 7×5 room (plus a second room behind a
// door), a configurable test hero class and two monster types.

import { expect } from 'vitest';
import type {
  BehaviourDeck,
  Content,
  HeroCard,
  HeroClass,
  MonsterCard,
  MonsterType,
  RoomDef,
  ScenarioDef,
  ScenarioGoal,
  Step,
} from '../../src/rules/content';
import { apply, createGame } from '../../src/rules/engine';
import type { Hex } from '../../src/rules/hex';
import type { Action, GameEvent, GameSetup, GameState, HeroState, MonsterState, StepChoice } from '../../src/rules/state';
import { BASE_RULES } from '../../src/rules/variants';

/** Parallelogram room q 0..6, r 0..4. */
export function roomHexes(q0 = 0, q1 = 6, r0 = 0, r1 = 4): Hex[] {
  const out: Hex[] = [];
  for (let q = q0; q <= q1; q++) for (let r = r0; r <= r1; r++) out.push([q, r]);
  return out;
}

export function card(id: string, initiative: number, top: Step[], bottom: Step[], extra: Partial<HeroCard> = {}): HeroCard {
  return { id, level: 1, initiative, top: { steps: top }, bottom: { steps: bottom }, ...extra };
}

/** Ten plain cards: `c1`…`c10`, initiative 10…100 → top Атака 2, bottom Рух 2. */
export function fillerCards(prefix: string, count = 10): HeroCard[] {
  return Array.from({ length: count }, (_, i) =>
    card(`${prefix}.c${i + 1}`, Math.min(99, 10 * (i + 1)), [{ type: 'attack', value: 2 }], [{ type: 'move', value: 2 }]),
  );
}

export function heroClass(id: string, cards: HeroCard[], extra: Partial<HeroClass> = {}): HeroClass {
  return {
    id,
    complexity: 'simple',
    color: '#3B6FB6',
    hpByLevel: [10, 12, 14],
    handSize: cards.length,
    classElement: 'earth',
    classOrb: 'earth',
    cards,
    surge: [],
    ...extra,
  };
}

export const MELEE_CARDS: MonsterCard[] = [
  { id: 'tmelee.50', initiative: 50, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] },
  { id: 'tmelee.60', initiative: 60, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] },
];

export function monsterType(id: string, deck: string, extra: Partial<MonsterType> = {}): MonsterType {
  return {
    id,
    deck,
    initiativeOffset: 0,
    normal: { hp: 5, move: 2, attack: 2 },
    elite: { hp: 8, move: 2, attack: 3 },
    ...extra,
  };
}

export interface FixtureOptions {
  heroes?: Record<string, HeroCard[]>;
  heroExtra?: Record<string, Partial<HeroClass>>;
  monsters?: MonsterType[];
  decks?: BehaviourDeck[];
  /** Spawns in the start room: monster, hex, rank (for every party size). */
  spawns?: { monster: string; hex: Hex; rank?: 'normal' | 'elite' }[];
  room?: Partial<RoomDef>;
  secondRoom?: Partial<RoomDef> | false;
  goal?: ScenarioGoal;
  startHexes?: Hex[];
}

/** Content with scenario `test`: room `r1` (q 0..6, r 0..4); room `r2` (q 7..9) behind a door at [6, 2]. */
export function makeContent(opts: FixtureOptions = {}): Content {
  const heroCards = opts.heroes ?? { alpha: fillerCards('alpha'), beta: fillerCards('beta') };
  const heroes: Record<string, HeroClass> = {};
  for (const [id, cards] of Object.entries(heroCards)) heroes[id] = heroClass(id, cards, opts.heroExtra?.[id]);
  const monsterList = opts.monsters ?? [monsterType('rat', 'tmelee')];
  const decks = opts.decks ?? [{ id: 'tmelee', cards: MELEE_CARDS }];
  const r1: RoomDef = {
    id: 'r1',
    hexes: roomHexes(),
    spawns: (opts.spawns ?? []).map((s) => ({
      monster: s.monster,
      hex: s.hex,
      by: { '2': s.rank ?? 'normal', '3': s.rank ?? 'normal', '4': s.rank ?? 'normal' },
    })),
    ...(opts.secondRoom === false ? {} : { doors: [{ hex: [6, 2] as Hex, to: 'r2' }] }),
    ...opts.room,
  };
  const rooms: RoomDef[] = [r1];
  if (opts.secondRoom !== false) rooms.push({ id: 'r2', hexes: roomHexes(7, 9, 0, 4), ...(opts.secondRoom ?? {}) });
  const scenario: ScenarioDef = {
    id: 'test',
    number: 0,
    goal: opts.goal ?? { type: 'killAll' },
    startRoom: 'r1',
    startHexes: opts.startHexes ?? [
      [0, 2],
      [0, 3],
      [0, 1],
      [0, 4],
    ],
    rooms,
    introduces: [],
    reward: { goldEach: 0 },
  };
  return {
    heroes,
    monsters: Object.fromEntries(monsterList.map((m) => [m.id, m])),
    bosses: {},
    decks: Object.fromEntries(decks.map((d) => [d.id, d])),
    scenarios: { test: scenario },
  };
}

export function setupFor(content: Content, heroIds?: string[], seed = 1, level = 1): GameSetup {
  return {
    scenarioId: 'test',
    seed,
    heroes: (heroIds ?? Object.keys(content.heroes)).map((classId, i) => ({ classId, playerId: `p${i}`, level })),
    difficulty: 'normal',
    variants: { ...BASE_RULES },
  };
}

export function newGame(content: Content, heroIds?: string[], seed = 1): GameState {
  return createGame(setupFor(content, heroIds, seed), content);
}

/** Applies an action, failing the test with the engine's error when it is rejected. */
export function act(state: GameState, content: Content, action: Action): GameState {
  const r = apply(state, action, content);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return r.state;
}

export function actEvents(state: GameState, content: Content, action: Action): { state: GameState; events: GameEvent[] } {
  const r = apply(state, action, content);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return { state: r.state, events: r.events };
}

export function rejects(state: GameState, content: Content, action: Action): string {
  const r = apply(state, action, content);
  expect(r.ok, `expected ${action.type} to be rejected`).toBe(false);
  return r.ok ? '' : r.error;
}

export function heroOf(state: GameState, id: string): HeroState {
  return state.figures[`hero:${id}`] as HeroState;
}

export function monsterAt(state: GameState, hex: Hex): MonsterState | undefined {
  return Object.values(state.figures).find((f): f is MonsterState => f.kind === 'monster' && f.hex[0] === hex[0] && f.hex[1] === hex[1]);
}

/** Puts these cards on top of a modifier deck (`monsters` or a hero id like `alpha`). */
export function stackModifiers(state: GameState, owner: string, cards: string[]): void {
  const deck = owner === 'monsters' ? state.monsterDeck : heroOf(state, owner).modifierDeck;
  deck.draw = [...cards, ...deck.draw];
}

/** Puts behaviour cards on top of a monster type's deck. */
export function stackBehaviour(state: GameState, typeId: string, cardIds: string[]): void {
  const deck = state.behaviourDecks[typeId];
  if (!deck) throw new Error(`no deck for ${typeId}`);
  deck.draw = [...cardIds, ...deck.draw.filter((c) => !cardIds.includes(c))];
}

/** Every hero selects cards (`[a, b]`, first is leading) or `'rest'` for a long rest. */
export function selectAll(state: GameState, content: Content, picks: Record<string, [string, string] | 'rest'>): GameState {
  let s = state;
  for (const [id, pick] of Object.entries(picks)) {
    s =
      pick === 'rest'
        ? act(s, content, { type: 'declareLongRest', heroId: `hero:${id}` })
        : act(s, content, { type: 'selectCards', heroId: `hero:${id}`, cards: pick, leading: pick[0] });
  }
  return s;
}

/** Plays one half with one choice per step (`null` = skip). */
export function playHalf(
  state: GameState,
  content: Content,
  heroId: string,
  cardId: string,
  half: 'top' | 'bottom',
  choices: (StepChoice | null)[],
  basic = false,
): GameState {
  let s = act(state, content, { type: 'startHalf', heroId: `hero:${heroId}`, cardId, half, ...(basic ? { basic: true } : {}) });
  for (const c of choices) {
    if (s.pending?.kind !== 'stepChoice') break;
    s = c ? act(s, content, { type: 'resolveStep', choice: c }) : act(s, content, { type: 'skipStep' });
    s = takeAllDamage(s, content);
  }
  return s;
}

export function endTurn(state: GameState, content: Content, heroId: string): GameState {
  return takeAllDamage(act(state, content, { type: 'endTurn', heroId: `hero:${heroId}` }), content);
}

/** Answers every pending «уникнути шкоди» with «take the damage». */
export function takeAllDamage(state: GameState, content: Content): GameState {
  let s = state;
  while (s.pending?.kind === 'avoidDamage') {
    s = act(s, content, { type: 'avoidDamage', heroId: s.pending.heroId, choice: { kind: 'take' } });
  }
  return s;
}

/** Declines every short rest at the end of the round. */
export function declineRests(state: GameState, content: Content): GameState {
  let s = state;
  while (s.pending?.kind === 'endOfRound') {
    const id = s.pending.heroIds[0] as string;
    s = act(s, content, { type: 'shortRest', heroId: id, rest: false });
  }
  return s;
}

/** Ends every hero turn without playing until the round is over (short rests declined). */
export function finishRound(state: GameState, content: Content): GameState {
  let s = takeAllDamage(state, content);
  for (let i = 0; i < 20 && s.pending?.kind === 'heroTurn'; i++) {
    s = endTurn(s, content, s.pending.heroId.slice(5));
  }
  return declineRests(takeAllDamage(s, content), content);
}

export function eventsOf<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}
