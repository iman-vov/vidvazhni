// Keyword links: a tap on an icon on an enlarged card, a figure card or a modal of the scenario
// screen opens a small explanation (the topic's short text) with «Детальніше», which opens the
// reference on that topic. Installed once on the overlay; the screens need no change for it.

import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { icon, type IconName } from '../../ui/game/icons';
import { richLine } from './texts';
import { topicById, topicForIcon } from './topics';

/** Where a tap on an icon explains it (buttons keep their own meaning). */
const ZONES = '.gdetail, .gfig, .gmodal-box, .hpop';

export interface KeywordLinkOptions {
  orbs: () => boolean;
  openTopic: (topicId: string) => void;
}

let openPop: HTMLElement | null = null;

export function closeKeywordPopover(): void {
  openPop?.remove();
  openPop = null;
}

/** The small explanation next to a point on screen. */
export function showKeywordPopover(topicId: string, at: { x: number; y: number }, onMore: (id: string) => void): HTMLElement | null {
  const topic = topicById(topicId);
  if (!topic) return null;
  closeKeywordPopover();
  const pop = h(
    'div',
    { class: 'hpop', role: 'dialog', 'aria-label': t(`help.${topicId}.title`) },
    h('div', { class: 'hpop-head' }, icon(topic.icon as IconName), h('b', null, t(`help.${topicId}.title`)), h('button', { class: 'gbtn gbtn-icon gbtn-small', 'aria-label': t('help.close'), onclick: closeKeywordPopover }, icon('close'))),
    h('p', null, richLine(t(`help.${topicId}.short`))),
    h(
      'button',
      {
        class: 'gbtn gbtn-small gbtn-primary',
        onclick: () => {
          closeKeywordPopover();
          onMore(topicId);
        },
      },
      t('help.more'),
    ),
  );
  document.body.append(pop);
  const w = Math.min(320, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  const left = Math.max(12, Math.min(window.innerWidth - w - 12, at.x - w / 2));
  const below = at.y + 16;
  pop.style.left = `${left}px`;
  const height = pop.offsetHeight || 140;
  pop.style.top = `${below + height < window.innerHeight - 8 ? below : Math.max(8, at.y - height - 16)}px`;
  openPop = pop;
  return pop;
}

/** Icon name of a `.gi-<name>` span or a `.vi-<name>` svg. */
export function iconNameOf(el: Element): string | null {
  for (const c of el.classList) {
    if (c.startsWith('gi-') || c.startsWith('vi-')) return c.slice(3);
  }
  return null;
}

export function installKeywordLinks(root: HTMLElement, o: KeywordLinkOptions): () => void {
  const onClick = (e: Event) => {
    const target = e.target as Element | null;
    if (!target?.closest) return;
    if (openPop && !openPop.contains(target)) closeKeywordPopover();
    const zone = target.closest(ZONES);
    if (!zone || target.closest('button, input, a')) return;
    const iconEl = target.closest('.gi, svg.vi');
    if (!iconEl || !zone.contains(iconEl)) return;
    const name = iconNameOf(iconEl);
    const topic = name ? topicForIcon(name, o.orbs()) : null;
    if (!topic) return;
    e.stopPropagation();
    const r = iconEl.getBoundingClientRect();
    showKeywordPopover(topic, { x: r.left + r.width / 2, y: r.bottom }, o.openTopic);
  };
  root.addEventListener('click', onClick, true);
  return () => {
    root.removeEventListener('click', onClick, true);
    closeKeywordPopover();
  };
}
