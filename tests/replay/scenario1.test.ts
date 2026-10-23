import { describe, expect, it } from 'vitest';
import { createGame, replay } from '../../src/rules/engine';
import { loadContent } from '../../src/rules/load';
import { legalActions } from '../../src/rules/queries';
import type { GameSetup, HeroState } from '../../src/rules/state';
import { BASE_RULES } from '../../src/rules/variants';
import { playOut } from './bot';

function setup(seed: number): GameSetup {
  return {
    scenarioId: 's1',
    seed,
    heroes: [
      { classId: 'warden', playerId: 'p1', level: 1 },
      { classId: 'wind-archer', playerId: 'p2', level: 1 },
    ],
    difficulty: 'normal',
    variants: { ...BASE_RULES },
  };
}

describe('scenario 1 «Підвал Ситого Гусака» with Вартовий and Лучниця Вітру', () => {
  const content = loadContent();

  it('a greedy bot wins through legalActions; seed + action log replays to the same state', () => {
    const { state, actions } = playOut(createGame(setup(1), content), content);
    expect(state.phase).toBe('won');
    expect(state.board.revealedRooms).toEqual(['s1.pantry', 's1.wine-cellar']);
    expect(Object.values(state.figures).filter((f) => f.kind === 'monster')).toEqual([]);
    for (const h of Object.values(state.figures).filter((f): f is HeroState => f.kind === 'hero')) {
      expect(h.xp).toBeGreaterThanOrEqual(4 + 2 * state.level);
    }
    expect(legalActions(state, content)).toEqual([]);

    expect(replay(setup(1), actions, content)).toEqual(state);
    // Reconnecting mid-game: a prefix of the log rebuilds the same intermediate state.
    const half = Math.floor(actions.length / 2);
    const a = replay(setup(1), actions.slice(0, half), content);
    const b = replay(setup(1), actions.slice(0, half), content);
    expect(a).toEqual(b);
    expect(a.phase).not.toBe('won');
  }, 60_000);

  it('the bot also wins with another seed (different shuffles, different game)', () => {
    const one = playOut(createGame(setup(1), content), content);
    const two = playOut(createGame(setup(7), content), content);
    expect(two.state.phase).toBe('won');
    expect(two.actions).not.toEqual(one.actions);
  }, 60_000);
});
