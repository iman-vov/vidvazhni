// Floor details: how many small things (pebbles, chips, leaves, tufts) lie on the floor and on the
// free hexes (environment/scatter.ts). Off / few / many; until the player chooses, the level
// follows the graphics quality (low = few, medium and high = many). Stored in localStorage like
// the quality; a change rebuilds only the small-things layer, the scenario stays as it is.

import type { GraphicsQuality } from './quality';

export type FloorDetail = 'off' | 'few' | 'many';
export const FLOOR_DETAILS: readonly FloorDetail[] = ['off', 'few', 'many'];

const DEFAULT: Record<GraphicsQuality, FloorDetail> = { low: 'few', medium: 'many', high: 'many' };

const STORAGE_KEY = 'vidvazhni.floorDetail';
const listeners = new Set<() => void>();
/** The choice when storage is unavailable (lasts until reload). */
let fallback: FloorDetail | null = null;

function isDetail(value: unknown): value is FloorDetail {
  return typeof value === 'string' && (FLOOR_DETAILS as readonly string[]).includes(value);
}

/** The player's stored choice, or null if they follow the quality. */
export function storedFloorDetail(): FloorDetail | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isDetail(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** The level in effect for a quality: the stored choice, else the quality's default. */
export function floorDetail(quality: GraphicsQuality): FloorDetail {
  return storedFloorDetail() ?? DEFAULT[quality];
}

/** Stores the choice (null returns to following the quality) and notifies listeners. */
export function setFloorDetail(detail: FloorDetail | null): void {
  fallback = detail;
  try {
    if (detail) localStorage.setItem(STORAGE_KEY, detail);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the fallback holds it.
  }
  for (const cb of listeners) cb();
}

/** Calls cb whenever the choice changes. Returns an unsubscribe function. */
export function onFloorDetailChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
