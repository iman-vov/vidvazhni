// The rules reference («Довідник»): a search field, topics grouped by theme, and one topic at a
// time with its icon, a small diagram, the text and links to related topics. Used as a page from the
// main menu and as a modal inside a scenario (then only the topics of the rules in play are listed).

import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { icon } from '../../ui/game/icons';
import { diagramSvg } from './diagrams';
import { richBody, richLine, searchText } from './texts';
import { topicById, TOPIC_GROUPS, visibleTopics, type HelpTopic } from './topics';
import './help.css';

export interface HelpRules {
  orbs: boolean;
  /** Any fork toggle on (follow-up, momentum, revive, intents…). */
  fork: boolean;
}

export interface HelpBrowserOptions {
  /** Rules of the running game; null = everything (main menu). */
  rules?: HelpRules | null;
  /** Open on this topic. */
  topic?: string | null;
  onClose: () => void;
  /** Inside a modal: a close button instead of the page back arrow. */
  modal?: boolean;
}

/** Topics matching a search query (title, short text and body; every word must match). */
export function searchTopics(query: string, topics: readonly HelpTopic[]): HelpTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...topics];
  const scored = topics
    .map((x) => {
      const title = searchText(`help.${x.id}.title`);
      const rest = `${searchText(`help.${x.id}.short`)} ${searchText(`help.${x.id}.body`)}`;
      if (!words.every((w) => title.includes(w) || rest.includes(w))) return null;
      return { x, score: words.filter((w) => title.includes(w)).length };
    })
    .filter((v): v is { x: HelpTopic; score: number } => !!v);
  return scored.sort((a, b) => b.score - a.score).map((v) => v.x);
}

export function helpBrowser(o: HelpBrowserOptions): HTMLElement {
  const topics = visibleTopics(o.rules ?? null);
  let current: string | null = o.topic && topicById(o.topic) ? o.topic : null;
  let query = '';
  const root = h('div', { class: `hhelp${o.modal ? ' is-modal' : ''}` });
  const body = h('div', { class: 'hhelp-body' });
  const input = h('input', {
    type: 'search',
    class: 'hhelp-search',
    placeholder: t('help.search'),
    'aria-label': t('help.search'),
    oninput: (e: Event) => {
      query = (e.target as HTMLInputElement).value;
      current = null;
      render();
    },
  });
  const head = h(
    'header',
    { class: 'hhelp-head' },
    o.modal ? null : h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.back'), onclick: o.onClose }, icon('left')),
    h('h1', null, icon('hint'), t('help.title')),
    input,
    o.modal ? h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('help.close'), onclick: o.onClose }, icon('close')) : null,
  );
  root.append(head, body);

  function open(id: string): void {
    current = id;
    render();
    body.scrollTop = 0;
  }

  function topicButton(x: HelpTopic): HTMLElement {
    return h(
      'button',
      { class: 'hhelp-item', 'data-topic': x.id, onclick: () => open(x.id) },
      h('span', { class: 'hhelp-icon' }, icon(x.icon)),
      h('span', { class: 'hhelp-item-text' }, h('b', null, t(`help.${x.id}.title`)), h('small', null, richLine(t(`help.${x.id}.short`)))),
    );
  }

  function list(): HTMLElement[] {
    if (query.trim()) {
      const found = searchTopics(query, topics);
      return found.length ? [h('div', { class: 'hhelp-grid' }, found.map(topicButton))] : [h('p', { class: 'hhelp-none' }, t('help.none'))];
    }
    return [
      h('p', { class: 'hhelp-lead' }, t('help.lead')),
      ...TOPIC_GROUPS.map((g) => {
        const inGroup = topics.filter((x) => x.group === g);
        return inGroup.length ? h('section', { class: 'hhelp-group' }, h('h2', null, t(`help.group.${g}`)), h('div', { class: 'hhelp-grid' }, inGroup.map(topicButton))) : null;
      }).filter((x): x is HTMLElement => !!x),
    ];
  }

  function topicView(x: HelpTopic): HTMLElement {
    const related = x.related.map((id) => topicById(id)).filter((r): r is HelpTopic => !!r && topics.includes(r));
    const art = h('div', { class: 'hhelp-diagram' });
    if (x.diagram) art.innerHTML = diagramSvg(x.diagram);
    return h(
      'article',
      { class: 'hhelp-topic', 'data-topic': x.id },
      h('button', { class: 'gbtn gbtn-small hhelp-back', onclick: () => ((current = null), render()) }, icon('left'), t('help.back')),
      h(
        'div',
        { class: 'hhelp-topic-head' },
        h('span', { class: 'hhelp-icon is-big' }, icon(x.icon)),
        h('div', null, h('h2', null, t(`help.${x.id}.title`)), x.rules ? h('span', { class: 'gtag' }, t(x.rules === 'fork' ? 'help.forkOnly' : 'help.baseOnly')) : null),
      ),
      h('p', { class: 'hhelp-short' }, richLine(t(`help.${x.id}.short`))),
      x.diagram ? art : null,
      h('div', { class: 'hhelp-text' }, richBody(t(`help.${x.id}.body`))),
      related.length ? h('div', { class: 'hhelp-related' }, h('h3', null, t('help.related')), h('div', { class: 'hhelp-chips' }, related.map((r) => h('button', { class: 'gbtn gbtn-chip', onclick: () => open(r.id) }, icon(r.icon), t(`help.${r.id}.title`))))) : null,
    );
  }

  function render(): void {
    const x = current ? topicById(current) : undefined;
    body.replaceChildren(...(x ? [topicView(x)] : list()));
  }

  render();
  return root;
}

/** The reference as a modal over the scenario screen (own layer, closes on the backdrop). */
export function openHelpModal(o: { rules: HelpRules | null; topic?: string | null; onClose?: () => void }): () => void {
  const layer = h('div', { class: 'hhelp-modal', role: 'dialog', 'aria-label': t('help.title') });
  const close = () => {
    layer.remove();
    o.onClose?.();
  };
  layer.addEventListener('click', (e) => e.target === layer && close());
  layer.append(helpBrowser({ rules: o.rules, topic: o.topic ?? null, onClose: close, modal: true }));
  document.body.append(layer);
  return close;
}
