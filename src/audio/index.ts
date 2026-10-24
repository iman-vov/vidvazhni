// The game's audio: one engine for the page, volumes from Settings, unlock on the first tap, a click
// for every button, silence while the tab is hidden. Screens call setMusic / play / cue.

import { settings } from '../app/settings';
import type { AnimStep } from '../render/animPlan';
import type { FigureId, GameEvent } from '../rules/state';
import { AUDIO, eventCues, locationAmbient, locationTrack, stepCues, uiSound, type Cue, type UiSound } from './cues';
import { AudioEngine } from './engine';

export const audio = new AudioEngine(`${import.meta.env.BASE_URL}audio/`);

let installed = false;

export function installAudio(root: Document = document): void {
  if (installed) return;
  installed = true;
  audio.setVolumes(settings.get().volume);
  settings.onChange((s) => audio.setVolumes(s.volume));
  const unlock = () => {
    if (!audio.unlocked) audio.unlock();
  };
  root.addEventListener('pointerdown', unlock, { capture: true });
  root.addEventListener('keydown', unlock, { capture: true });
  root.addEventListener('visibilitychange', () => audio.setHidden(root.visibilityState === 'hidden'));
  // Every button clicks, unless it makes a sound of its own (data-sound="none" or another UI sound).
  root.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, [role="button"], summary');
      if (!el || (el as HTMLButtonElement).disabled) return;
      const own = (el as HTMLElement).dataset.sound;
      if (own === 'none') return;
      playUi((own as UiSound | undefined) ?? 'click');
    },
    { capture: true },
  );
  root.addEventListener(
    'input',
    (e) => {
      if ((e.target as HTMLInputElement | null)?.type === 'range') playUi('click');
    },
    { capture: true },
  );
}

export function playUi(kind: UiSound): void {
  const id = uiSound(kind);
  if (id) audio.play(id);
}

function playCues(cues: Cue[]): void {
  for (const c of cues) audio.play(c.sound, c.delay);
}

/** Sounds for the engine events the board does not animate. */
export function playEvents(events: GameEvent[]): void {
  for (const e of events) playCues(eventCues(e));
}

/** A board step listener: sounds in time with the animation. */
export function stepSounds(): (step: AnimStep, speed: number) => void {
  let hitTarget: FigureId | null = null;
  return (step, speed) => {
    playCues(stepCues(step, speed, hitTarget));
    if (step.kind === 'attack') hitTarget = step.damage > 0 ? step.targetId : null;
    else if (step.kind === 'damage') hitTarget = null;
  };
}

/** Music of a screen outside the board (menu, camp, map, story); the menu and the camp open with
 *  the Lantern theme when their track was not already playing. No ambient bed off the board. */
export function screenMusic(screen: string): void {
  const track = AUDIO.screens[screen];
  if (!track) return;
  audio.setAmbient(null);
  audio.setMusic(track, AUDIO.intros[screen]);
}

/** The board: the location's track (the battle track while a boss is up) over its ambient bed;
 *  `intensity` 0..1 (awake monsters, a boss) colours the bed. */
export function boardMusic(environmentId: string, boss = false, intensity = 0): void {
  audio.setMusic(boss ? AUDIO.battle : locationTrack(environmentId));
  audio.setAmbient(locationAmbient(environmentId), environmentId);
  audio.setIntensity(boss ? 1 : intensity);
}

export function endStinger(won: boolean): void {
  audio.stinger(won ? AUDIO.stingers.victory : AUDIO.stingers.defeat);
}
