// Story beats in battle: short lines one after another, as a bubble over the speaking figure or,
// for the narrator and voices not on the board, as a banner at the top. They never take input
// and hide by themselves.

import type { BoardView } from '../render/view';
import type { FigureId, GameState } from '../rules/state';
import { h } from '../ui/dom';
import { isHeroSpeaker, NPC_FIGURES, type StoryLine } from './story';
import { speakerBadge, speakerName } from './screens/storyScene';

/** Story talk in battle is off: the board keeps only the goal (the talk is in the intro and the
 *  end screen). The beats still fire and are marked, so turning this on brings them back. */
export const BATTLE_SPEECH = false;

const BASE_MS = 2600;
const PER_CHAR_MS = 45;
const MAX_MS = 9000;
const GAP_MS = 250;

export const lineMs = (text: string): number => Math.min(MAX_MS, BASE_MS + PER_CHAR_MS * text.length);

/** The figure that says the line, if it stands on the board. */
export function speakerFigure(s: GameState, speaker: string): FigureId | null {
  if (isHeroSpeaker(speaker)) {
    const f = s.figures[`hero:${speaker}`];
    return f?.kind === 'hero' && !f.exhausted ? f.id : null;
  }
  const typeId = NPC_FIGURES[speaker];
  if (!typeId) return null;
  return Object.values(s.figures).find((f) => f.kind === 'monster' && f.typeId === typeId)?.id ?? null;
}

export interface Speech {
  say(lines: StoryLine[]): void;
  dispose(): void;
}

export function createSpeech(o: { root: HTMLElement; board: BoardView; state: () => GameState }): Speech {
  const queue: StoryLine[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hide: (() => void) | null = null;
  let disposed = false;

  function show(line: StoryLine): void {
    const figure = o.board.pin ? speakerFigure(o.state(), line.speaker) : null;
    if (figure && o.board.pin) {
      const el = h('div', { class: 'gspeech-bubble', 'aria-live': 'polite' }, h('div', null, h('b', null, speakerName(line.speaker)), line.text));
      hide = o.board.pin(figure, el);
    } else {
      const narrator = line.speaker === 'narrator';
      const el = h(
        'div',
        { class: `gspeech-banner${narrator ? ' is-narrator' : ''}`, 'aria-live': 'polite' },
        speakerBadge(line.speaker),
        h('span', null, narrator ? null : h('b', null, speakerName(line.speaker)), line.text),
      );
      o.root.append(el);
      hide = () => el.remove();
    }
    timer = setTimeout(() => {
      hide?.();
      hide = null;
      timer = setTimeout(next, GAP_MS);
    }, lineMs(line.text));
  }

  function next(): void {
    timer = null;
    if (disposed) return;
    const line = queue.shift();
    if (line) show(line);
  }

  return {
    say(lines) {
      if (!BATTLE_SPEECH) return;
      queue.push(...lines);
      if (!timer && !hide) next();
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      hide?.();
      queue.length = 0;
    },
  };
}
