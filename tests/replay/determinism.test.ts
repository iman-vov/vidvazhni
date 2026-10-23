import { describe, expect, it } from 'vitest';
import { createGame, replay } from '../../src/rules/engine';
import { setupFor, makeContent } from '../helpers/engineFixtures';
import { playOut } from './bot';

describe('determinism on the small test map', () => {
  const content = makeContent({
    spawns: [
      { monster: 'rat', hex: [3, 1] },
      { monster: 'rat', hex: [4, 3], rank: 'elite' },
    ],
    secondRoom: { spawns: [{ monster: 'rat', hex: [8, 2], by: { '2': 'normal' } }] },
  });

  it('the same seed and actions always give the same state and events', () => {
    const setup = setupFor(content, ['alpha', 'beta'], 99);
    const first = playOut(createGame(setup, content), content, 400);
    const second = playOut(createGame(setup, content), content, 400);
    expect(second.actions).toEqual(first.actions);
    expect(second.state).toEqual(first.state);
    expect(replay(setup, first.actions, content)).toEqual(first.state);
    expect(first.state.log.length).toBeGreaterThan(20);
  }, 60_000);

  it('the state is plain JSON', () => {
    const setup = setupFor(content, ['alpha', 'beta'], 5);
    const { state } = playOut(createGame(setup, content), content, 60);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  }, 60_000);
});
