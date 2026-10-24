// The tutorial around the scenario: the offer before a new game (recommended for new players), the
// page after it ends, and what the device remembers (done / «не пропонувати»).

import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { artButton, menuBackdrop } from '../screens/menu';
import { localStore, readJson, type KeyValueStore } from '../storage';

const KEY = 'vidvazhni.tutorial';

export interface TutorialProgress {
  done: boolean;
  /** The player asked not to be offered the tutorial again. */
  dismissed: boolean;
}

export function tutorialProgress(kv: KeyValueStore = localStore): TutorialProgress {
  const v = readJson<Partial<TutorialProgress>>(kv, KEY);
  return { done: !!v?.done, dismissed: !!v?.dismissed };
}

export function saveTutorialProgress(patch: Partial<TutorialProgress>, kv: KeyValueStore = localStore): void {
  kv.set(KEY, JSON.stringify({ ...tutorialProgress(kv), ...patch }));
}

/** Offer the tutorial before a new game until it was played or turned down for good. */
export function shouldOfferTutorial(kv: KeyValueStore = localStore): boolean {
  const p = tutorialProgress(kv);
  return !p.done && !p.dismissed;
}

export function tutorialOffer(o: { onStart: () => void; onSkip: () => void; onBack: () => void }): HTMLElement {
  return h(
    'div',
    { class: 'gpage is-art' },
    menuBackdrop(true),
    h(
      'div',
      { class: 'toffer' },
      h(
        'div',
        { class: 'toffer-box' },
        h('h1', null, t('tutorial.offer.title')),
        h('p', null, t('tutorial.offer.text')),
        h('span', { class: 'gtag is-gold' }, t('tutorial.offer.recommended')),
        artButton('play', t('tutorial.offer.start'), o.onStart, { cls: 'is-go' }),
        artButton('compass', t('tutorial.offer.skip'), o.onSkip),
        h(
          'button',
          {
            class: 'toffer-never',
            onclick: () => {
              saveTutorialProgress({ dismissed: true });
              o.onSkip();
            },
          },
          t('tutorial.offer.never'),
        ),
        h('button', { class: 'gbtn', onclick: o.onBack }, t('menu.back')),
      ),
    ),
  );
}

export function tutorialEnd(o: { won: boolean; onNewGame: () => void; onAgain: () => void; onHelp: () => void; onMenu: () => void }): HTMLElement {
  return h(
    'div',
    { class: 'gpage is-art' },
    menuBackdrop(true),
    h(
      'div',
      { class: 'toffer' },
      h(
        'div',
        { class: 'toffer-box' },
        h('h1', null, t(o.won ? 'tutorial.done.title' : 'tutorial.lost.title')),
        h('p', null, t(o.won ? 'tutorial.done.text' : 'tutorial.lost.text')),
        o.won ? artButton('compass', t('tutorial.done.newGame'), o.onNewGame, { cls: 'is-go' }) : artButton('play', t('tutorial.done.again'), o.onAgain, { cls: 'is-go' }),
        artButton('hint', t('tutorial.done.help'), o.onHelp),
        o.won ? artButton('play', t('tutorial.done.again'), o.onAgain) : artButton('compass', t('tutorial.done.newGame'), o.onNewGame),
        artButton(null, t('tutorial.done.menu'), o.onMenu),
      ),
    ),
  );
}
