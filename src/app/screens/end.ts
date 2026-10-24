// Scenario end: victory or defeat, XP and gold per hero, and «Як було?» (easy / just right / hard
// plus a comment), stored on the device.

import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { icon } from '../../ui/game/icons';
import { figureName } from '../../ui/game/text';
import { addFeedback, type FeedbackRating } from '../feedback';
import type { GameController } from '../game';

export interface EndOptions {
  game: GameController;
  onMenu: () => void;
  onAgain: () => void;
}

export function endScreen(o: EndOptions): HTMLElement {
  const g = o.game;
  const s = g.state;
  const won = s.phase === 'won';
  let rating: FeedbackRating | null = null;
  let comment = '';
  let sent = false;
  const root = h('div', { class: `gpage gend-screen ${won ? 'is-win' : 'is-loss'}` });

  function send(): void {
    if (!rating) return;
    addFeedback({
      scenarioId: s.scenarioId,
      won,
      rating,
      comment: comment.trim(),
      rounds: s.round,
      heroes: g.heroes().map((x) => x.classId),
      difficulty: s.difficulty,
      variants: s.variants,
      at: new Date().toISOString(),
    });
    sent = true;
    render();
  }

  function render(): void {
    root.replaceChildren(
      h('h1', { class: 'gend-title' }, won ? t('ui.victory') : t('ui.defeat')),
      h('p', { class: 'gintro' }, won ? t(`scenario.${s.scenarioId}.outro`) : t('game.end.lossText')),
      h('p', { class: 'gside-hint' }, t('game.end.rounds', { rounds: s.round })),
      h(
        'table',
        { class: 'grewards' },
        h('thead', null, h('tr', null, h('th', null, t('ui.hero')), h('th', null, t('ui.xp')), h('th', null, t('ui.coins')), h('th', null, t('ui.gold')))),
        h(
          'tbody',
          null,
          g.rewards().map((r) => h('tr', null, h('td', null, figureName(r.heroId)), h('td', null, icon('xp'), r.xp), h('td', null, icon('coin'), r.coins), h('td', null, r.gold))),
        ),
      ),
      h(
        'section',
        { class: 'gsection gfeedback' },
        h('h2', null, t('game.feedback.title')),
        sent
          ? h('p', null, icon('check'), t('game.feedback.thanks'))
          : [
              h(
                'div',
                { class: 'gseg' },
                (['easy', 'right', 'hard'] as const).map((r) => h('button', { class: 'gbtn gbtn-chip', 'aria-pressed': String(rating === r), onclick: () => ((rating = r), render()) }, t(`game.feedback.${r}`))),
              ),
              h('textarea', { class: 'ginput', rows: 3, placeholder: t('game.feedback.comment'), value: comment, oninput: (e: Event) => (comment = (e.target as HTMLTextAreaElement).value) }),
              h('button', { class: 'gbtn', disabled: !rating, onclick: send }, t('game.feedback.send')),
            ],
      ),
      h('footer', { class: 'gpage-foot' }, h('button', { class: 'gbtn', onclick: o.onAgain }, t('game.end.again')), h('button', { class: 'gbtn gbtn-primary gbtn-big', onclick: o.onMenu }, t('game.toMenu'))),
    );
  }

  render();
  return root;
}
