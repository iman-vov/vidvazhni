// Story scene: the intro before a scenario and Marta's epilogue in the camp. One line at a time
// with the speaker's portrait and name; a tap shows the next line, «Пропустити все» ends it.
// Also the speaker helpers (portrait, name) the battle bubbles and the end screen use.

import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { figureName } from '../../ui/game/text';
import { campHeroUrl, portraitUrl } from '../../ui/game/uiArt';
import { isHeroSpeaker, NPC_FIGURES, type StoryLine } from '../story';
import martaUrl from '../../ui/game/assets/camp-marta.webp';
import './story.css';

/** A neutral head-and-shoulders silhouette for NPCs without a portrait yet. */
const SILHOUETTE = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="38" r="20" fill="currentColor"/><path d="M14 100c2-24 17-36 36-36s34 12 36 36z" fill="currentColor"/></svg>`;

export function speakerName(speaker: string): string {
  if (isHeroSpeaker(speaker)) return figureName(`hero:${speaker}`);
  if (speaker === 'marta') return t('camp.marta');
  const boss = NPC_FIGURES[speaker];
  return boss ? t(`boss.${boss}`) : t(`story.speaker.${speaker}`);
}

/** Round portrait of a speaker: the hero's or boss's token, else the silhouette; none for the narrator. */
export function speakerBadge(speaker: string, cls = 'gstory-badge'): HTMLElement | null {
  if (speaker === 'narrator') return null;
  const url = portraitUrl(isHeroSpeaker(speaker) ? speaker : (NPC_FIGURES[speaker] ?? ''));
  const el = h('span', { class: `${cls}${url ? '' : ' is-silhouette'}`, 'aria-hidden': 'true' });
  if (url) el.append(h('img', { src: url, alt: '', draggable: 'false' }));
  else el.innerHTML = SILHOUETTE;
  return el;
}

/** The big portrait of the scene: a hero's or Marta's waist-up camp art, else the round badge. */
function scenePortrait(speaker: string): HTMLElement | null {
  const url = isHeroSpeaker(speaker) ? campHeroUrl(speaker) : speaker === 'marta' ? martaUrl : undefined;
  if (url) return h('div', { class: 'gstory-portrait is-hero' }, h('img', { src: url, alt: '', draggable: 'false' }));
  const badge = speakerBadge(speaker, 'gstory-portrait');
  return badge;
}

/** One line as a small row (the end screen's outro). */
export function storyLineRow(line: StoryLine): HTMLElement {
  return h(
    'p',
    { class: `gstory-row${line.speaker === 'narrator' ? ' is-narrator' : ''}` },
    speakerBadge(line.speaker),
    h('span', null, line.speaker === 'narrator' ? null : h('b', null, speakerName(line.speaker)), line.text),
  );
}

export interface StorySceneOptions {
  lines: StoryLine[];
  /** Label of the last line's button (default «Далі»). */
  doneLabel?: string;
  onDone: () => void;
}

/** A full-screen scene; `onDone` after the last line or «Пропустити все». Removes nothing itself. */
export function storyScene(o: StorySceneOptions): HTMLElement {
  let i = 0;
  let finished = false;
  const root = h('div', { class: 'gstory', role: 'dialog', 'aria-modal': 'true' });
  const finish = () => {
    if (finished) return;
    finished = true;
    o.onDone();
  };
  const next = () => {
    if (i >= o.lines.length - 1) return finish();
    i++;
    render();
  };
  root.addEventListener('click', next);

  function render(): void {
    const line = o.lines[i];
    if (!line) return void queueMicrotask(finish);
    const last = i === o.lines.length - 1;
    const narrator = line.speaker === 'narrator';
    root.replaceChildren(
      h(
        'button',
        { class: 'gbtn gstory-skip', onclick: (e: Event) => (e.stopPropagation(), finish()) },
        t('story.skip'),
      ),
      h(
        'div',
        { class: `gstory-stage${narrator ? ' is-narrator' : ''}` },
        scenePortrait(line.speaker),
        h(
          'div',
          { class: 'gstory-box' },
          narrator ? null : h('div', { class: 'gstory-name' }, speakerName(line.speaker)),
          h('p', { class: 'gstory-text' }, line.text),
          h(
            'div',
            { class: 'gstory-foot' },
            h('span', { class: 'gstory-dots', 'aria-hidden': 'true' }, o.lines.map((_, k) => h('i', { class: k === i ? 'is-on' : '' }))),
            h('button', { class: 'gbtn gstory-next', onclick: (e: Event) => (e.stopPropagation(), next()) }, last ? (o.doneLabel ?? t('story.next')) : t('story.next')),
          ),
        ),
      ),
    );
  }

  render();
  return root;
}
