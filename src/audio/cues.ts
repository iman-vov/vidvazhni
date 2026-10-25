// Which sound goes with what: data/audio.json maps engine events, board animation steps and UI
// actions to sound ids, and locations and screens to music. Pure (no WebAudio), tested in node.

import { TIMING, type AnimStep } from '../render/animPlan';
import type { FigureId, GameEvent } from '../rules/state';
import table from '../../data/audio.json';
import type { AmbientDef } from './ambient';
import type { MotifVariant } from './motif';

export interface SoundDef {
  /** Recorded files (one picked at random), or `synth`: a recipe made in code (src/audio/synth.ts). */
  files?: string[];
  synth?: string;
  /** 0..1, multiplied with the SFX volume. */
  volume?: number;
  /** Random playback-rate spread (±), so repeats do not sound the same. */
  pitch?: number;
}

export interface MusicDef {
  file: string;
  /** `seamless`: the file loops as is; `crossfade`: the next pass fades in over the end; `none`: once. */
  loop: 'seamless' | 'crossfade' | 'none';
  volume?: number;
}

export interface AudioTable {
  sounds: Record<string, SoundDef>;
  events: Record<string, string>;
  ui: Record<string, string>;
  sizes: { default: string; small: string[]; large: string[] };
  music: Record<string, MusicDef>;
  screens: Record<string, string>;
  /** The Lantern theme played before a screen's track starts (src/audio/motif.ts). */
  intros: Record<string, MotifVariant>;
  /** Code-made beds under the music, by environment id (src/audio/ambient.ts). */
  ambient: Record<string, AmbientDef>;
  locations: Record<string, string>;
  battle: string;
  /** A music id, or `motif:<variant>` for the Lantern theme. */
  stingers: { victory: string; defeat: string };
}

export const AUDIO = table as AudioTable;

/** A sound to start `delay` seconds from now. */
export interface Cue {
  sound: string;
  delay: number;
}

export type UiSound = 'click' | 'back' | 'open' | 'error' | 'cardPick' | 'levelUp' | 'coins';

/** The location's ambient bed (by environment id). */
export function locationAmbient(environmentId: string, t: AudioTable = AUDIO): AmbientDef | undefined {
  return t.ambient[environmentId] ?? t.ambient.default;
}

export function uiSound(kind: UiSound, t: AudioTable = AUDIO): string | undefined {
  return t.ui[kind];
}

/** small / medium / large by monster type; heroes are medium. */
export function sizeOf(figureId: FigureId, t: AudioTable = AUDIO): string {
  const typeId = figureId.startsWith('hero:') ? '' : (figureId.split(':')[1] ?? '');
  if (t.sizes.small.includes(typeId)) return 'small';
  if (t.sizes.large.includes(typeId)) return 'large';
  return t.sizes.default;
}

function cue(t: AudioTable, key: string, delay = 0): Cue[] {
  const sound = t.events[key];
  return sound ? [{ sound, delay }] : [];
}

/** Events the board does not animate (dice, cards, levers, goals): sounds right away. The rest
 *  sound with their animation step (stepCues). */
export function eventCues(e: GameEvent, t: AudioTable = AUDIO): Cue[] {
  switch (e.type) {
    case 'initiativeRolled':
    case 'dieRolled':
    case 'cardsRevealed':
    case 'deckShuffled':
    case 'secondaryGoalMet':
    case 'roundStarted':
    case 'momentumGained':
    case 'surgeUsed':
    case 'obstacleDestroyed':
    case 'itemFound':
      return cue(t, e.type);
    case 'objectChanged':
      return cue(t, e.state === 'destroyed' ? 'objectChanged.destroyed' : 'objectChanged');
    default:
      return [];
  }
}

/** Sounds of one board animation step; delays are in real seconds at the given speed. `hitTarget`
 *  is the figure the previous attack step hit (its damage step stays quiet: the hit was heard). */
export function stepCues(step: AnimStep, speed = 1, hitTarget: FigureId | null = null, t: AudioTable = AUDIO): Cue[] {
  const k = 1 / Math.max(0.25, speed);
  switch (step.kind) {
    case 'walk':
    case 'slide': {
      const hexes = Math.min(6, step.path.length - 1);
      // A walk's wait is its length: slower figures (src/render/gait.ts) step slower.
      const per = (step.kind === 'walk' ? step.wait / Math.max(1, step.path.length - 1) : TIMING.slidePerHex) * k;
      const key = step.kind === 'walk' ? 'moved' : 'pushed';
      return Array.from({ length: hexes }, (_, i) => cue(t, key, i * per + per * 0.4)).flat();
    }
    case 'jump':
      return cue(t, 'moved', step.duration * k * 0.9);
    case 'attack': {
      const key = step.label === 'miss' || (step.damage === 0 && step.shield === 0) ? 'attacked.miss' : step.damage === 0 ? 'attacked.blocked' : 'attacked.hit';
      return cue(t, key, step.impact * k);
    }
    case 'damage':
      return step.amount > 0 && step.figureId !== hitTarget ? cue(t, 'damaged') : [];
    case 'heal':
      return cue(t, 'healed');
    case 'shield':
      return cue(t, 'shieldAdded');
    case 'death':
      return cue(t, `figureDied.${sizeOf(step.figureId, t)}`, 0.15 * k);
    case 'downed':
      return cue(t, 'heroDowned');
    case 'orb':
      return step.change === 'infused' ? cue(t, 'orbInfused') : step.change === 'consumed' ? cue(t, 'orbConsumed') : [];
    case 'room':
      return cue(t, 'roomRevealed');
    case 'loot':
      return [...(step.chest ? cue(t, 'looted.chest') : []), ...(step.coins > 0 ? cue(t, 'looted.coins', step.chest ? 0.35 * k : 0) : [])];
    case 'trap':
      return cue(t, 'trapTriggered');
    default:
      return [];
  }
}

/** The location's music track (by environment id). */
export function locationTrack(environmentId: string, t: AudioTable = AUDIO): string {
  return t.locations[environmentId] ?? t.locations.default ?? '';
}
