// Helpers for the fork variant tests: a game on the small test map with some variants on.

import type { Content } from '../../../src/rules/content';
import { createGame } from '../../../src/rules/engine';
import type { GameSetup, GameState } from '../../../src/rules/state';
import { BASE_RULES, type Variants } from '../../../src/rules/variants';
import { setupFor } from '../../helpers/engineFixtures';

export function forkSetup(content: Content, variants: Partial<Variants>, heroIds?: string[], seed = 1): GameSetup {
  return { ...setupFor(content, heroIds, seed), variants: { ...BASE_RULES, ...variants } };
}

export function forkGame(content: Content, variants: Partial<Variants>, heroIds?: string[], seed = 1): GameState {
  return createGame(forkSetup(content, variants, heroIds, seed), content);
}
