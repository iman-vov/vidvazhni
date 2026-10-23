// Public API of the rules engine. Pure: (state, action) → new state + events.
// Contract only; implemented by the core-engine work package.

import type { Content } from './content';
import type { Action, ApplyResult, GameSetup, GameState } from './state';

/** Builds the initial state: start room revealed, monsters spawned, decks shuffled with the seed,
 *  phase `selectCards` (or `chooseHandBeforeScenario` when a hand is smaller than the deck). */
export function createGame(_setup: GameSetup, _content: Content): GameState {
  throw new Error('engine.createGame: not implemented yet');
}

/** Applies one player action. Monster turns between hero turns resolve automatically inside. */
export function apply(_state: GameState, _action: Action, _content: Content): ApplyResult {
  throw new Error('engine.apply: not implemented yet');
}

/** Replays a game from setup + action log; used for reconnection and determinism tests. */
export function replay(setup: GameSetup, actions: Action[], content: Content): GameState {
  let state = createGame(setup, content);
  for (const action of actions) {
    const result = apply(state, action, content);
    if (!result.ok) throw new Error(`replay: ${result.error}`);
    state = result.state;
  }
  return state;
}
