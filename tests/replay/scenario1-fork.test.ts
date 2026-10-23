import { describe, expect, it } from 'vitest';
import { createGame, replay } from '../../src/rules/engine';
import { loadContent } from '../../src/rules/load';
import { legalActions } from '../../src/rules/queries';
import type { GameEvent, GameSetup } from '../../src/rules/state';
import { FULL_FORK } from '../../src/rules/variants';
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
    variants: { ...FULL_FORK },
  };
}

const count = (log: GameEvent[], type: GameEvent['type']) => log.filter((e) => e.type === type).length;

describe('scenario 1 with every fork variant on (FULL_FORK)', () => {
  const content = loadContent();

  it('the greedy bot wins; seed + action log replays to the same state', () => {
    const { state, actions } = playOut(createGame(setup(1), content), content);
    expect(state.phase).toBe('won');
    expect(Object.values(state.figures).filter((f) => f.kind === 'monster')).toEqual([]);
    expect(legalActions(state, content)).toEqual([]);
    // The fork rules were in play: intents every round, charges and Порив, orbs instead of elements.
    expect(count(state.log, 'intentsDrawn')).toBeGreaterThanOrEqual(state.round);
    expect(count(state.log, 'momentumGained')).toBeGreaterThan(0);
    expect(count(state.log, 'surgeUsed')).toBeGreaterThan(0);
    expect(count(state.log, 'orbInfused')).toBeGreaterThan(0);
    expect(count(state.log, 'elementChanged')).toBe(0);
    expect(count(state.log, 'behaviourDrawn')).toBeGreaterThan(0);

    expect(replay(setup(1), actions, content)).toEqual(state);
    const half = Math.floor(actions.length / 2);
    expect(replay(setup(1), actions.slice(0, half), content)).toEqual(replay(setup(1), actions.slice(0, half), content));
  }, 120_000);
});
