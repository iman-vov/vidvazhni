// Card budget (docs/design/missions.md «Бюджет карт»): the deck must outlast the mission.
// For every scenario, with the two-hero party of the replay tests on normal:
//   min = the fewest rounds the goal can take: the walk (steps / the party's mean move) plus the
//         fight (all monsters' hp, scenario events' spawns included, / the party's mean attack per
//         round); an estimate, not a bot run
//   max = the rounds of play the party's smallest hand allows, every rest costing a card
// Wanted: slack (max − min) / max ≥ 25%. Then the greedy bot plays a few seeds and counts the
// games lost to an empty deck (a hero exhausted for lack of cards, not hit points). The target is
// under 10%; where the bot still loses more (s3–s5, see docs/balance/sim-2026-10-24.md) the count
// may only not grow past the numbers measured with the balance pass of 2026-10-24 (KNOWN_DECK_LOSSES).

import { describe, expect, it } from 'vitest';
import type { Content, ScenarioDef } from '../../src/rules/content';
import { apply, createGame } from '../../src/rules/engine';
import { hexKey, type Hex } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { goalZone } from '../../src/rules/objectives';
import { availableCards, recommendedHand, revealRoom } from '../../src/rules/setup';
import type { GameSetup, GameState } from '../../src/rules/state';
import { scaleMonsterStats } from '../../src/rules/effects/context';
import { BASE_RULES } from '../../src/rules/variants';
import { stepsFrom } from '../../tools/map-editor/checks';
import { chooseAction } from './bot';

const SEEDS = [1, 2, 3, 4, 5, 6];
const MAX_ROUNDS = 40;
const MIN_SLACK = 0.25;
const MAX_DECK_LOSSES = 0.1;
/** Bot games (of SEEDS) lost to an empty deck after the balance pass of 2026-10-24; may not grow. */
const KNOWN_DECK_LOSSES: Record<string, number> = { s3: 2, s5: 4 };

const PARTIES: Record<string, [string, string]> = {
  s1: ['warden', 'wind-archer'],
  s2: ['warden', 'wind-archer'],
  s3: ['warden', 'herbalist'],
  s4: ['rogue', 'wind-archer'],
  s5: ['warden', 'elementalist'],
};

/** Rounds of play a hand of `cards` lasts: play pairs until the hand is empty, rest (lose a card), again. */
export function handRounds(cards: number): number {
  let rounds = 0;
  for (let c = cards; c >= 2; c--) rounds += Math.floor(c / 2);
  return rounds;
}

function setup(scenarioId: string, seed: number): GameSetup {
  const [a, b] = PARTIES[scenarioId] as [string, string];
  return {
    scenarioId,
    seed,
    heroes: [
      { classId: a, playerId: 'p1', level: 1 },
      { classId: b, playerId: 'p2', level: 1 },
    ],
    difficulty: 'normal',
    variants: { ...BASE_RULES },
  };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Mean value of a step type over the class's recommended hand (top halves for attacks, bottom for moves). */
function meanStep(content: Content, classId: string, half: 'top' | 'bottom', type: 'attack' | 'move'): number {
  const cls = content.heroes[classId]!;
  const hand = recommendedHand(cls, availableCards(cls, 1));
  const values = cls.cards.filter((card) => hand.includes(card.id)).flatMap((card) =>
    card[half].steps.flatMap((st) => (st.type === type && 'value' in st && typeof st.value === 'number' ? [st.value] : [])),
  );
  return mean(values);
}

/** Steps the goal needs on foot from the start hexes, every door open. */
function walk(s: ScenarioDef): number {
  const from = stepsFrom(s, s.startHexes);
  const at = (h: Hex) => from.get(hexKey(h)) ?? Infinity;
  const spawns = s.rooms.flatMap((r) => (r.spawns ?? []).filter((sp) => sp.by['2']));
  const goal = s.goal;
  switch (goal.type) {
    case 'reachExit':
      return Math.min(...goalZone(s).map(at));
    case 'carryItem': {
      const chest = s.rooms.flatMap((r) => r.chests ?? []).find((c) => c.loot?.questItem === goal.item);
      if (!chest) return Infinity;
      const back = stepsFrom(s, [chest.hex]);
      return at(chest.hex) + Math.min(...goalZone(s).map((h) => back.get(hexKey(h)) ?? Infinity));
    }
    case 'killBoss':
      return Math.max(...spawns.filter((sp) => sp.monster === goal.boss).map((sp) => at(sp.hex)));
    default:
      return Math.max(...spawns.map((sp) => at(sp.hex)));
  }
}

export interface Budget {
  walk: number;
  hp: number;
  min: number;
  max: number;
  slack: number;
}

export function cardBudget(id: string, content: Content): Budget {
  const scenario = content.scenarios[id]!;
  const party = PARTIES[id]!;
  const s = createGame(setup(id, 1), content);
  for (const room of scenario.rooms) revealRoom({ s, c: content, ev: [], out: [] }, scenario, room.id);
  const steps = walk(scenario);
  const move = mean(party.map((c) => meanStep(content, c, 'bottom', 'move')));
  const damage = party.reduce((n, c) => n + meanStep(content, c, 'top', 'attack'), 0);
  let hp = Object.values(s.figures).reduce((n, f) => n + (f.kind === 'monster' ? f.maxHp : 0), 0);
  // Every event fires (a call for help is not stopped); a repeating wave as often as the fight lasts.
  const span = Math.ceil(steps / move) + Math.ceil(hp / damage);
  for (const ev of scenario.events ?? []) {
    const t = ev.trigger;
    const times = t.type === 'round' && t.every ? 1 + Math.max(0, Math.floor((span - t.round) / t.every)) : 1;
    for (const a of ev.actions) {
      const rank = a.type === 'spawn' ? a.by['2'] : undefined;
      if (a.type !== 'spawn' || !rank) continue;
      const type = content.monsters[a.monster]!;
      hp += times * (a.count ?? 1) * scaleMonsterStats(rank === 'elite' ? type.elite : type.normal, s.level).hp;
    }
  }
  const min = Math.ceil(steps / move) + Math.ceil(hp / damage);
  const max = Math.min(...party.map((c) => handRounds(content.heroes[c]!.handSize)));
  return { walk: steps, hp, min, max, slack: (max - min) / max };
}

/** Plays to the end; the log is kept apart from the state so the bot's look-ahead clones stay small. */
function play(start: GameState, content: Content): GameState {
  let s = start;
  const log = [...s.log];
  while (s.phase !== 'won' && s.phase !== 'lost' && s.round <= MAX_ROUNDS) {
    const r = apply(s, chooseAction(s, content), content);
    if (!r.ok) throw new Error(`round ${s.round}: ${r.error}`);
    log.push(...r.events);
    s = { ...r.state, log: [] };
  }
  return { ...s, log };
}

describe('card budget: the deck outlasts the mission', () => {
  const content = loadContent();

  it('handRounds: play pairs, lose a card at each rest', () => {
    expect(handRounds(2)).toBe(1);
    expect(handRounds(4)).toBe(2 + 1 + 1);
    expect(handRounds(10)).toBe(25);
  });

  for (const id of Object.keys(PARTIES))
    it(`${id}: the hand outlasts the fewest rounds the goal takes by ≥${MIN_SLACK * 100}%`, () => {
      const b = cardBudget(id, content);
      console.log(
        `[budget] ${id}: walk ${b.walk} steps, monster hp ${b.hp} → min ${b.min} rounds; ` +
          `hand allows ${b.max}; slack ${Math.round(b.slack * 100)}%`,
      );
      expect(Number.isFinite(b.walk)).toBe(true);
      expect(b.slack).toBeGreaterThanOrEqual(MIN_SLACK);
    });

  for (const id of Object.keys(PARTIES))
    it(`${id}: bot games lost to an empty deck stay under ${MAX_DECK_LOSSES * 100}% (or the known count)`, () => {
      const won: number[] = [];
      let deckLosses = 0;
      for (const seed of SEEDS) {
        const s = play(createGame(setup(id, seed), content), content);
        if (s.phase === 'won') won.push(s.round);
        else if (s.log.some((e) => e.type === 'heroExhausted' && e.reason === 'cards')) deckLosses++;
      }
      console.log(
        `[budget] ${id}: bot won ${won.length}/${SEEDS.length}` +
          (won.length ? ` (rounds ${won.join(', ')})` : '') +
          `, lost to an empty deck ${deckLosses}/${SEEDS.length}`,
      );
      const allowed = Math.max(KNOWN_DECK_LOSSES[id] ?? 0, Math.ceil(MAX_DECK_LOSSES * SEEDS.length) - 1);
      expect(deckLosses).toBeLessThanOrEqual(allowed);
    }, 900_000);
});
