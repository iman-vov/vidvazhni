// Main menu over the town at dusk: the localized logo with the shared Lantern, the four art buttons
// (continue, new game, campaign, settings), the version in the corner. The debug overlay stays
// reachable through a small link.

import pkg from '../../../package.json';
import type { LoadedContent } from '../../rules/load';
import { replay } from '../../rules/engine';
import { h } from '../../ui/dom';
import { getLang, t } from '../../ui/i18n';
import { icon, type IconName } from '../../ui/icons';
import { installUiArt, logoOf } from '../../ui/game/uiArt';
import type { SavedGame } from '../storage';

export interface MenuOptions {
  content: LoadedContent;
  saved: SavedGame | null;
  onContinue: () => void;
  onNewGame: () => void;
  onSettings: () => void;
  /** Rules reference and tutorial (src/app/help, src/app/tutorial): one row of two buttons. */
  onHelp?: () => void;
  onTutorial?: () => void;
}

export const VERSION = pkg.version.replace(/\.0$/, '');

/** A menu button on the button art: icon, label, optional second line. */
export function artButton(iconName: IconName | null, label: string, onclick: () => void, extra: { note?: string; cls?: string; disabled?: boolean } = {}): HTMLButtonElement {
  installUiArt();
  return h(
    'button',
    { class: `ubtn${extra.cls ? ` ${extra.cls}` : ''}`, onclick, disabled: extra.disabled },
    iconName ? h('span', { class: 'ubtn-icon' }, icon(iconName, { title: false })) : null,
    h('span', { class: 'ubtn-text' }, h('span', { class: 'ubtn-label' }, label), extra.note ? h('small', null, extra.note) : null),
  );
}

/** The menu backdrop (also behind the other pages): the town with a breathing Lantern and fog. */
export function menuBackdrop(dim = false): HTMLElement {
  return h('div', { class: `mbg${dim ? ' is-dim' : ''}`, 'aria-hidden': 'true' }, h('div', { class: 'mbg-art' }, h('div', { class: 'mbg-glow' }), h('div', { class: 'mbg-fog' })));
}

export function menuScreen(o: MenuOptions): HTMLElement {
  installUiArt();
  const logo = logoOf(getLang());
  const notice = h('p', { class: 'mmenu-notice', role: 'status' });
  const campaign = artButton('map', t('menu.campaign'), () => (notice.textContent = t('menu.campaign.soon')), { cls: 'is-soon' });
  return h(
    'div',
    { class: 'mmenu' },
    menuBackdrop(),
    h(
      'main',
      { class: 'mmenu-main' },
      h('h1', { class: 'mmenu-logo' }, h('img', { src: logo.url, width: logo.width, height: logo.height, alt: t('ui.title'), draggable: 'false' })),
      h(
        'nav',
        { class: 'mmenu-buttons' },
        o.saved ? artButton('play', t('ui.continue'), o.onContinue, { note: savedSummary(o.saved, o.content) }) : null,
        artButton('compass', t('ui.newGame'), o.onNewGame),
        campaign,
        o.onHelp || o.onTutorial
          ? h('div', { class: 'mmenu-pair' }, o.onTutorial ? artButton('play', t('tutorial.menu'), o.onTutorial) : null, o.onHelp ? artButton('hint', t('help.menu'), o.onHelp) : null)
          : null,
        artButton('gear', t('ui.settings'), o.onSettings),
        notice,
      ),
    ),
    h('a', { class: 'mmenu-debug', href: '?debug' }, t('ui.debug')),
    h('span', { class: 'mmenu-version', title: t('menu.version', { version: VERSION }) }, `v${VERSION}`),
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
