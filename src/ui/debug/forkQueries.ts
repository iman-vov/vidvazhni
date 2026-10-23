// Optional engine queries for the fork variants («Прогноз раунду», orb hints, «Предмети-кнопки»).
// They are looked up at run time, so the overlay works (and type-checks) whether or not the
// engine provides them yet; the shapes below are what the overlay reads.

import type { Content } from '../../rules/content';
import * as queries from '../../rules/queries';
import type { GameState } from '../../rules/state';

export interface ForecastView {
  initiative: number;
  position: number;
  order: ({ kind: 'hero'; figureId: string; initiative: number; self?: true } | { kind: 'monsterIntent'; typeId: string; cardId: string; initiative: number })[];
  monsters: { typeId: string; intents: { cardId: string; initiative: number; heroFirst: boolean }[] | null }[];
}

export interface OrbBonusView {
  cardId: string;
  half: 'top' | 'bottom';
  stepIndex: number;
  element: string;
  count: number;
  available: boolean;
  now: boolean;
  from: string[];
  value?: number;
  boosted?: number;
}

export interface UsableItemView {
  itemId: string;
  nameKey: string;
}

export interface AttackPromptView extends UsableItemView {
  value: number;
  boosted: number;
  advantage: boolean;
}

interface ForkQueries {
  forecastInitiative(s: GameState, c: Content, heroId: string, leadingCardId: string): ForecastView | null;
  orbBonusPreview(s: GameState, c: Content, heroId: string): OrbBonusView[];
  usableItems(s: GameState, c: Content, heroId: string, context?: 'attack' | 'move'): UsableItemView[];
  attackPrompts(s: GameState, c: Content, heroId: string, targetId: string): AttackPromptView[];
}

const q = queries as unknown as Partial<ForkQueries>;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function forecast(s: GameState, c: Content, heroId: string, leading: string): ForecastView | null {
  const fn = q.forecastInitiative;
  return fn ? safe(() => fn(s, c, heroId, leading), null) : null;
}

export function orbBonuses(s: GameState, c: Content, heroId: string): OrbBonusView[] {
  const fn = q.orbBonusPreview;
  return fn ? safe(() => fn(s, c, heroId), []) : [];
}

export function usableItems(s: GameState, c: Content, heroId: string, context?: 'attack' | 'move'): UsableItemView[] {
  const fn = q.usableItems;
  return fn ? safe(() => fn(s, c, heroId, context), []) : [];
}

export function attackPrompts(s: GameState, c: Content, heroId: string, targetId: string): AttackPromptView[] {
  const fn = q.attackPrompts;
  return fn ? safe(() => fn(s, c, heroId, targetId), []) : [];
}

export const hasItemQueries = (): boolean => typeof q.usableItems === 'function';

/** Items a hero carries (fork engine field; absent in older states). */
export function heroItems(hero: object): { id: string; state: string }[] {
  return (hero as { items?: { id: string; state: string }[] }).items ?? [];
}
