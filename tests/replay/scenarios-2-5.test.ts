// The greedy bot plays scenarios 2–5 headless with two heroes, under the base rules and with every
// fork variant on. Each game must end (won or lost) within 30 rounds without engine errors and
// replay to the same state from seed + actions. Winning is not required yet: the outcomes are
// printed for the balance work that comes later.

import { describe, expect, it } from 'vitest';
import { apply, createGame, replay } from '../../src/rules/engine';
import { loadContent } from '../../src/rules/load';
import type { Action, GameSetup, GameState } from '../../src/rules/state';
import { BASE_RULES, FULL_FORK, type Variants } from '../../src/rules/variants';
import { chooseAction } from './bot';

const MAX_ROUNDS = 30;

const PARTIES: Record<string, [string, string]> = {
  s2: ['warden', 'wind-archer'],
  s3: ['warden', 'herbalist'],
  s4: ['rogue', 'wind-archer'],
  s5: ['warden', 'elementalist'],
};

function setup(scenarioId: string, variants: Variants, seed = 1): GameSetup {
  const [a, b] = PARTIES[scenarioId] as [string, string];
  return {
    scenarioId,
    seed,
    heroes: [
      { classId: a, playerId: 'p1', level: 1 },
      { classId: b, playerId: 'p2', level: 1 },
    ],
    difficulty: 'normal',
    variants: { ...variants },
  };
}

function playToEnd(start: GameState): { state: GameState; actions: Action[] } {
  const content = loadContent();
  let s = start;
  const actions: Action[] = [];
  while (s.phase !== 'won' && s.phase !== 'lost' && s.round <= MAX_ROUNDS) {
    const a = chooseAction(s, content);
    const r = apply(s, a, content);
    if (!r.ok) throw new Error(`round ${s.round}: bot chose an illegal action ${JSON.stringify(a)}: ${r.error}`);
    actions.push(a);
    s = r.state;
  }
  return { state: s, actions };
}

const RULES: [string, Variants][] = [
  ['base', BASE_RULES],
  ['fork', FULL_FORK],
];

describe('scenarios 2–5 played by the bot', () => {
  const content = loadContent();

  for (const id of ['s2', 's3', 's4', 's5'])
    for (const [name, variants] of RULES)
      it(`${id} (${name}) ends within ${MAX_ROUNDS} rounds and replays deterministically`, () => {
        const { state, actions } = playToEnd(createGame(setup(id, variants), content));
        const heroes = Object.values(state.figures).filter((f) => f.kind === 'hero');
        console.log(
          `[balance] ${id} ${name}: ${state.phase} in round ${state.round}; ` +
            heroes.map((h) => `${h.id} hp ${h.hp}${h.kind === 'hero' && h.exhausted ? ' exhausted' : ''}`).join(', ') +
            `; rooms ${state.board.revealedRooms.length}`,
        );
        expect(['won', 'lost']).toContain(state.phase);
        expect(replay(setup(id, variants), actions, content)).toEqual(state);
      }, 120_000);
});
