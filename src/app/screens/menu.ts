// Main menu: continue the saved game, new game, settings; the debug overlay stays reachable.

import type { LoadedContent } from '../../rules/load';
import { replay } from '../../rules/engine';
import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import type { SavedGame } from '../storage';

export interface MenuOptions {
  content: LoadedContent;
  saved: SavedGame | null;
  onContinue: () => void;
  onNewGame: () => void;
  onSettings: () => void;
}

export function menuScreen(o: MenuOptions): HTMLElement {
  return h(
    'div',
    { class: 'gmenu' },
    h('h1', { class: 'gmenu-title' }, t('ui.title')),
    h('p', { class: 'gmenu-sub' }, t('menu.subtitle')),
    h(
      'div',
      { class: 'gmenu-buttons' },
      o.saved
        ? h('button', { class: 'gbtn gbtn-primary gbtn-big', onclick: o.onContinue }, h('span', null, t('ui.continue')), h('small', null, savedSummary(o.saved, o.content)))
        : null,
      h('button', { class: `gbtn gbtn-big${o.saved ? '' : ' gbtn-primary'}`, onclick: o.onNewGame }, t('ui.newGame')),
      h('button', { class: 'gbtn gbtn-big', onclick: o.onSettings }, t('ui.settings')),
    ),
    h('a', { class: 'gmenu-debug', href: '?debug' }, t('ui.debug')),
  );
}

function savedSummary(saved: SavedGame, content: LoadedContent): string {
  const heroes = saved.setup.heroes.map((x) => t(`class.${x.classId}`)).join(', ');
  let round = '';
  try {
    round = t('ui.round', { round: replay(saved.setup, saved.actions, content).round });
  } catch {
    round = '';
  }
  return [t(`scenario.${saved.setup.scenarioId}`), round, heroes].filter(Boolean).join(' · ');
}
