// «Як було?» after each scenario: three buttons and a comment, kept on the device so they can go
// into the campaign export later (design doc, «Живі плейтести»).

import type { Variants } from '../rules/variants';
import { localStore, readJson, type KeyValueStore } from './storage';

export type FeedbackRating = 'easy' | 'right' | 'hard';

export interface FeedbackEntry {
  scenarioId: string;
  won: boolean;
  rating: FeedbackRating;
  comment: string;
  rounds: number;
  heroes: string[];
  difficulty: string;
  variants: Variants;
  at: string;
}

const KEY = 'vidvazhni.feedback';

export function readFeedback(kv: KeyValueStore = localStore): FeedbackEntry[] {
  return readJson<FeedbackEntry[]>(kv, KEY) ?? [];
}

export function addFeedback(entry: FeedbackEntry, kv: KeyValueStore = localStore): void {
  kv.set(KEY, JSON.stringify([...readFeedback(kv), entry]));
}
