// Objective tests run on the real s2 map with its goal, zones or lose rules swapped.

import { selectAll } from '../../helpers/engineFixtures';
import type { Content, ScenarioDef } from '../../../src/rules/content';
import type { GameState } from '../../../src/rules/state';
import { content, twoCards } from '../scenarios/helpers';

/** The real content with s2 changed (goal, zones, secondary or lose rules). */
export function withS2(patch: Partial<ScenarioDef>): Content {
  const s2 = content.scenarios['s2'] as ScenarioDef;
  return { ...content, scenarios: { ...content.scenarios, s2: { ...s2, ...patch } } };
}

export function select(s: GameState, c: Content): GameState {
  return selectAll(s, c, { warden: twoCards(s, 'warden'), herbalist: twoCards(s, 'herbalist') });
}
