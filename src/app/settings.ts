// Device settings: volumes and per-hero hint levels live here; language and graphics quality are
// owned by ui/i18n.ts and render/quality.ts and only re-exported for the settings screen.

import { FULL_FORK, type Variants } from '../rules/variants';
import { localStore, readJson, type KeyValueStore } from './storage';

/** 0 = off, 1 = explanations, 2 = monster intents, 3 = advice (placeholder in phase 2). */
export type HintLevel = 0 | 1 | 2 | 3;
export const HINT_LEVELS: readonly HintLevel[] = [0, 1, 2, 3];

export interface Volumes {
  music: number;
  sound: number;
  voice: number;
}

export interface Settings {
  volume: Volumes;
  /** Board animation speed: 1× or 2×. */
  speed: number;
  /** By hero class id; absent = 0. */
  hints: Record<string, HintLevel>;
  /** Rules for new games: the fork by default; Settings → «Правила» switches mechanics off. */
  variants: Variants;
}

const KEY = 'vidvazhni.settings';

export function defaultSettings(): Settings {
  return { volume: { music: 0.6, sound: 0.8, voice: 0.8 }, speed: 1, hints: {}, variants: { ...FULL_FORK } };
}

export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor(private readonly kv: KeyValueStore = localStore) {
    const stored = readJson<Partial<Settings>>(kv, KEY);
    const d = defaultSettings();
    this.value = { volume: { ...d.volume, ...stored?.volume }, speed: stored?.speed === 2 ? 2 : 1, hints: { ...stored?.hints }, variants: { ...FULL_FORK, ...stored?.variants } };
  }

  get(): Settings {
    return this.value;
  }

  hintLevel(classId: string): HintLevel {
    return this.value.hints[classId] ?? 0;
  }

  setHint(classId: string, level: HintLevel): void {
    this.update({ hints: { ...this.value.hints, [classId]: level } });
  }

  setVolume(kind: keyof Volumes, v: number): void {
    this.update({ volume: { ...this.value.volume, [kind]: Math.min(1, Math.max(0, v)) } });
  }

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    this.kv.set(KEY, JSON.stringify(this.value));
    for (const cb of this.listeners) cb(this.value);
  }

  onChange(cb: (s: Settings) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

export const settings = new SettingsStore();
