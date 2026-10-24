// Local persistence behind small interfaces, so phase 3 can swap localStorage for IndexedDB
// without touching the screens. Everything stored is plain JSON.

import type { Action, GameSetup } from '../rules/state';
import { CAMPAIGN_VERSION, type CampaignState } from '../rules/campaign';
import type { GameMeta, PlayerInfo } from './game';

/** A synchronous string key–value store (localStorage, or memory in tests). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** localStorage with every access guarded: private windows and blocked storage just forget. */
export const localStore: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage full or blocked: nothing to do
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}

export function readJson<T>(kv: KeyValueStore, key: string): T | null {
  const raw = kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** A game in progress: enough to rebuild the state with `replay(setup, actions)`. */
export interface SavedGame {
  app: 'vidvazhni';
  version: 1;
  setup: GameSetup;
  actions: Action[];
  meta: GameMeta;
  savedAt: number;
}

export interface GameStorage {
  load(): SavedGame | null;
  save(game: SavedGame): void;
  clear(): void;
}

export const GAME_KEY = 'vidvazhni.game';

export function gameStorage(kv: KeyValueStore = localStore): GameStorage {
  return {
    load() {
      const g = readJson<SavedGame>(kv, GAME_KEY);
      return g?.app === 'vidvazhni' && g.version === 1 && Array.isArray(g.actions) ? g : null;
    },
    save: (game) => kv.set(GAME_KEY, JSON.stringify(game)),
    clear: () => kv.remove(GAME_KEY),
  };
}

/** The campaign between scenarios (src/rules/campaign.ts), kept apart from the game in progress. */
export interface SavedCampaign {
  app: 'vidvazhni';
  version: number;
  campaign: CampaignState;
  /** Names for `CampaignHero.playerId`. */
  players: PlayerInfo[];
  savedAt: number;
}

export interface CampaignStorage {
  load(): SavedCampaign | null;
  save(campaign: CampaignState, players: PlayerInfo[]): void;
  clear(): void;
}

export const CAMPAIGN_KEY = 'vidvazhni.campaign';

/** A save of another version is ignored (no migrations yet). */
export function campaignStorage(kv: KeyValueStore = localStore): CampaignStorage {
  return {
    load() {
      const c = readJson<SavedCampaign>(kv, CAMPAIGN_KEY);
      const ok = c?.app === 'vidvazhni' && c.version === CAMPAIGN_VERSION && c.campaign?.version === CAMPAIGN_VERSION && Array.isArray(c.campaign.heroes) && Array.isArray(c.players);
      return ok ? c : null;
    },
    save: (campaign, players) => kv.set(CAMPAIGN_KEY, JSON.stringify({ app: 'vidvazhni', version: CAMPAIGN_VERSION, campaign, players, savedAt: Date.now() } satisfies SavedCampaign)),
    clear: () => kv.remove(CAMPAIGN_KEY),
  };
}
