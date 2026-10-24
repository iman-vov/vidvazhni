// Local persistence behind small interfaces, so phase 3 can swap localStorage for IndexedDB
// without touching the screens. Everything stored is plain JSON.

import type { Action, GameSetup } from '../rules/state';
import type { GameMeta } from './game';

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
