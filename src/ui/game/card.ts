// A hero ability card rendered from data: name, initiative, the top and bottom halves as readable
// lines with icons, loss / active / XP marks, the «Наснага» lightning, and orb/element bonuses that
// will be payable glowing as «Атака 3 → 5» (orbBonusPreview).

import type { CardHalf } from '../../rules/content';
import type { LoadedContent } from '../../rules/load';
import type { OrbBonusPreview } from '../../rules/queries';
import type { GameState, HeroState } from '../../rules/state';
import { h } from '../dom';
import { t } from '../i18n';
import { icon } from './icons';
import { bonusText, cardName, hasMomentumMark, playedCard, stepParts } from './text';

export type Half = 'top' | 'bottom';

export interface CardOptions {
  s: GameState;
  content: LoadedContent;
  hero: HeroState;
  cardId: string;
  bonuses?: OrbBonusPreview[];
  picked?: boolean;
  leading?: boolean;
  /** Halves already played this turn (shown crossed out). */
  playedHalves?: Half[];
  /** Turn play: each half is a button. */
  onHalf?: (half: Half) => void;
  /** Halves that can be played now (others are disabled). */
  playable?: Half[];
  /** A small extra row under the card (basic action buttons). */
  footer?: HTMLElement | null;
  big?: boolean;
}

export function cardView(o: CardOptions): HTMLElement {
  const card = playedCard(o.content, o.hero.classId, o.cardId, o.s.variants);
  const orbs = o.s.variants.orbs;
  const classes = ['gcard'];
  if (o.big) classes.push('is-big');
  if (o.picked) classes.push('is-picked');
  if (o.leading) classes.push('is-leading');
  if (!card) return h('div', { class: classes.join(' ') }, cardName(o.cardId));
  const momentum = hasMomentumMark(o.content, o.hero.classId, o.cardId, o.s.variants);
  const head = h(
    'div',
    { class: 'gcard-head' },
    h('b', { class: 'gcard-name' }, cardName(o.cardId)),
    momentum ? icon('momentum', 'gcard-momentum', t('ui.momentum')) : null,
    o.leading ? h('span', { class: 'gcard-leadtag', title: t('game.leading') }, icon('initiative')) : null,
    h('span', { class: 'gcard-ini', title: t('ui.initiative') }, card.initiative),
  );
  const half = (which: Half, data: CardHalf) => {
    const lines = data.steps.map((step, i) => {
      const p = stepParts(step, orbs);
      const bonus = o.bonuses?.find((b) => b.half === which && b.stepIndex === i);
      return h(
        'div',
        { class: 'gstep' },
        h('div', { class: 'gstep-main' }, icon(p.icon), h('span', null, p.main), p.xp ? h('span', { class: 'gmark gmark-xp', title: t('ui.xp') }, icon('xp'), p.xp) : null),
        p.consume
          ? h('div', { class: 'gstep-consume' }, icon(p.consumeElement && p.consumeElement !== 'any' ? p.consumeElement : 'any', `el-${p.consumeElement ?? 'any'}`), h('span', null, p.consume))
          : null,
        bonus && bonus.value !== undefined && bonus.boosted !== undefined && bonus.value !== bonus.boosted
          ? h(
              'div',
              { class: `gbonus${bonus.available ? ' is-on' : ''}${bonus.now ? ' is-now' : ''}`, title: t(bonus.now ? 'game.bonus.now' : bonus.available ? 'game.bonus.later' : 'game.bonus.no') },
              icon(bonus.element === 'any' ? 'any' : bonus.element),
              bonusText(bonus.stepType, bonus.value, bonus.boosted),
            )
          : null,
      );
    });
    const marks = h(
      'div',
      { class: 'gcard-marks' },
      data.loss ? h('span', { class: 'gmark gmark-loss', title: t('game.card.loss') }, icon('loss'), o.big ? t('game.card.loss') : null) : null,
      data.active ? h('span', { class: 'gmark gmark-active', title: t('game.card.active') }, icon('active'), o.big ? t('game.card.active') : null) : null,
    );
    const played = o.playedHalves?.includes(which);
    const cls = `gcard-half gcard-${which}${played ? ' is-played' : ''}`;
    if (o.onHalf) {
      const enabled = o.playable ? o.playable.includes(which) : true;
      return h(
        'button',
        { class: `${cls} is-button`, disabled: !enabled, 'aria-label': `${cardName(o.cardId)}: ${t(which === 'top' ? 'ui.playTop' : 'ui.playBottom')}`, onclick: () => o.onHalf?.(which) },
        lines,
        marks,
      );
    }
    return h('div', { class: cls }, lines, marks);
  };
  return h(
    'div',
    { class: classes.join(' '), 'data-card': o.cardId },
    head,
    half('top', card.top),
    h('div', { class: 'gcard-divider' }),
    half('bottom', card.bottom),
    o.footer ?? null,
  );
}
