// The tutorial scenario: the map from data/tutorial/s0-tutorial.json (a small yard and a cellar, three
// rats), one Вартовий, the full fork rules and a fixed seed whose draws are friendly. It is added to a
// copy of the content only for the tutorial game, so scenario lists, maps checks and the campaign
// never see it.

import tutorialMap from '../../../data/tutorial/s0-tutorial.json';
import type { ScenarioDef } from '../../rules/content';
import { loadContent, type LoadedContent } from '../../rules/load';
import { availableCards, recommendedHand } from '../../rules/setup';
import type { GameSetup } from '../../rules/state';
import { FULL_FORK } from '../../rules/variants';
import type { PlayerInfo } from '../game';
import { localStore, readJson, type GameStorage, type KeyValueStore, type SavedGame } from '../storage';

export const TUTORIAL_ID = 's0';
export const TUTORIAL_HERO = 'warden';
/** Checked by tests/app/tutorial.test.ts: with the suggested first turn the Earth strike draws +1 and
 *  kills a rat, the other rat bites for 1 (the «avoid damage» choice comes up once). */
export const TUTORIAL_SEED = 13;

let cached: LoadedContent | undefined;

export function tutorialContent(base: LoadedContent = loadContent()): LoadedContent {
  if (cached && base === loadContent()) return cached;
  const content = { ...base, scenarios: { ...base.scenarios, [TUTORIAL_ID]: tutorialMap as unknown as ScenarioDef } };
  if (base === loadContent()) cached = content;
  return content;
}

export function isTutorial(scenarioId: string | undefined): boolean {
  return scenarioId === TUTORIAL_ID;
}

/** The tutorial skips the hand choice: the hero starts with the recommended hand. */
export function tutorialSetup(seed = TUTORIAL_SEED): GameSetup {
  const cls = loadContent().heroes[TUTORIAL_HERO]!;
  return {
    scenarioId: TUTORIAL_ID,
    seed,
    heroes: [{ classId: TUTORIAL_HERO, playerId: 'p1', level: 1, hand: recommendedHand(cls, availableCards(cls, 1)) }],
    difficulty: 'easy',
    variants: { ...FULL_FORK },
  };
}

export function tutorialPlayers(name: string): PlayerInfo[] {
  return [{ id: 'p1', name }];
}

const GAME_KEY = 'vidvazhni.tutorialGame';

/** The tutorial autosaves under its own key, so a reload resumes it and the real game stays saved. */
export function tutorialStorage(kv: KeyValueStore = localStore): GameStorage {
  return {
    load() {
      const g = readJson<SavedGame>(kv, GAME_KEY);
      return g?.app === 'vidvazhni' && isTutorial(g.setup?.scenarioId) && Array.isArray(g.actions) ? g : null;
    },
    save: (game) => kv.set(GAME_KEY, JSON.stringify(game)),
    clear: () => kv.remove(GAME_KEY),
  };
}
