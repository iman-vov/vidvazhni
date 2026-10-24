// The damage prompt with the defence options (docs/design/defense.md): the incoming damage as a big
// number, «Прийняти», «Ухилитися» (d12, with its chances in real numbers), «Прикрий друга», shield
// items, and losing cards as the last resort. Every button answers with an action from
// `defenseOptions`, so the prompt shows only what the engine accepts now.

import type { Content } from '../../rules/content';
import { dodgeItemRolls } from '../../rules/defense';
import { itemDef } from '../../rules/items';
import type { DefenseOption } from '../../rules/queries';
import type { Action, CardId, GameState, HeroState } from '../../rules/state';
import { h } from '../dom';
import { t } from '../i18n';
import { icon } from './icons';
import { cardName, figureName } from './text';

export interface DefensePanelOptions {
  s: GameState;
  content: Content;
  options: DefenseOption[];
  act: (a: Action) => void;
  /** Two discard cards picked for «Втратити 2 карти зі скиду». */
  discardPick: CardId[];
  onDiscardPick: (cards: CardId[]) => void;
  /** «Ухилитися» with a dice item: the item picked, or null for a plain roll. */
  dodgeItem: string | null;
  onDodgeItem: (itemId: string | null) => void;
  /** Extra rows under the title (the shield already counted). */
  extra?: (HTMLElement | null)[];
}

const pct = (x: number) => `${Math.round(x * 100)}`;

export function defensePanel(o: DefensePanelOptions): HTMLElement {
  const { s, options } = o;
  const p = s.pending;
  if (p?.kind !== 'avoidDamage') return h('div');
  const hero = s.figures[p.heroId] as HeroState;
  const source = p.source.includes(':') ? figureName(p.source, s) : t(`game.source.${p.source}`);
  const of = (kind: DefenseOption['kind']) => options.filter((x) => x.kind === kind);
  const take = of('take')[0];
  const hpAfter = (after: number) => h('span', { class: 'gdef-hp' }, icon('hp'), String(hero.hp), icon('arrow'), String(Math.max(0, hero.hp - after)));

  const rows: (HTMLElement | null)[] = [];
  // After a dodge the window stays open with the new damage: show the roll.
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i]!;
    if (e.type === 'attacked') break;
    if (e.type === 'dodgeRolled' && e.heroId === hero.id) {
      rows.push(h('p', { class: 'gdef-head' }, icon('dice'), h('b', null, t(`game.ev.dodge.${e.result}`, { name: figureName(hero.id, s), roll: e.roll, damage: e.damage }))));
      break;
    }
  }
  if (take) {
    rows.push(h('div', { class: 'grow gdef-row' }, h('button', { class: 'gbtn gbtn-primary', onclick: () => o.act(take.action) }, t('defense.take', { damage: p.amount })), hpAfter(p.amount)));
  }

  // «Ухилитися»: pay with a hand card or a Наснага charge; a dice item adds rolls.
  const dodges = of('dodge');
  if (dodges.length) {
    const items = [...new Set(dodges.map((d) => d.itemId).filter((x): x is string => !!x))];
    const item = o.dodgeItem && items.includes(o.dodgeItem) ? o.dodgeItem : null;
    const mine = dodges.filter((d) => (d.itemId ?? null) === item);
    const first = mine[0];
    const chances = first?.chances;
    const byCard = mine.filter((d) => d.cardId);
    const byMomentum = mine.find((d) => !d.cardId);
    rows.push(
      h(
        'div',
        { class: 'gdef-block' },
        h('p', { class: 'gdef-head' }, icon('dice'), h('b', null, t('variant.dodgeDie')), chances ? h('small', null, t('defense.dodgeEffect', { full: pct(chances.full), half: first?.halfDamage ?? 0, halfChance: pct(chances.half) })) : null),
        items.length
          ? h(
              'div',
              { class: 'grow' },
              items.map((id) => {
                const def = itemDef({ c: o.content }, id);
                const rolls = 1 + (def ? dodgeItemRolls({ s }, def) : 0);
                return h(
                  'button',
                  { class: 'gbtn gbtn-small gbtn-toggle', 'aria-pressed': String(item === id), onclick: () => o.onDodgeItem(item === id ? null : id) },
                  icon('item'),
                  t('defense.dodgeItem', { item: t(`item.${id}`), rolls }),
                );
              }),
            )
          : null,
        byCard.length
          ? h('div', { class: 'grow' }, h('small', null, t('defense.dodge')), byCard.map((d) => h('button', { class: 'gbtn gbtn-small', onclick: () => o.act(d.action) }, icon('discard'), cardName(d.cardId ?? ''))))
          : null,
        byMomentum ? h('div', { class: 'grow' }, h('button', { class: 'gbtn gbtn-small', onclick: () => o.act(byMomentum.action) }, icon('momentum'), t('defense.dodgeMomentum'))) : null,
      ),
    );
  }

  // «Прикрий друга»: the ally decides, so name them.
  for (const c of of('cover')) {
    rows.push(
      h(
        'div',
        { class: 'gdef-block' },
        h('p', { class: 'gdef-head' }, icon('shield'), h('b', null, t('defense.cover', { ally: figureName(c.deciderId, s), target: figureName(c.targetId, s) }))),
        h(
          'div',
          { class: 'grow gdef-row' },
          h('button', { class: 'gbtn', onclick: () => o.act(c.action) }, icon('hero'), t('defense.coverEffect', { ally: figureName(c.deciderId, s), after: c.after ?? p.amount })),
          h('small', null, t('defense.decides', { name: figureName(c.deciderId, s) })),
        ),
      ),
    );
  }

  for (const it of of('item')) {
    rows.push(h('div', { class: 'grow gdef-row' }, h('button', { class: 'gbtn gbtn-glow', onclick: () => o.act(it.action) }, icon('item'), t('defense.item', { item: t(`item.${it.itemId}`), after: it.after ?? p.amount })), hpAfter(it.after ?? p.amount)));
  }

  // Losing cards: the last resort, folded under its own label.
  const loseHand = of('loseCard').filter((x) => x.cardId);
  const loseDiscard = of('loseCard').some((x) => x.cardIds);
  if (loseHand.length || loseDiscard) {
    const [d1, d2] = o.discardPick;
    rows.push(
      h(
        'details',
        { class: 'gdef-block is-last', ...(o.discardPick.length ? { open: '' } : {}) },
        h('summary', { class: 'gdef-head' }, icon('loss'), h('b', null, t('defense.lastResort'))),
        loseHand.length ? h('div', { class: 'grow' }, h('small', null, t('defense.loseHand')), loseHand.map((x) => h('button', { class: 'gbtn gbtn-small', onclick: () => o.act(x.action) }, icon('loss'), cardName(x.cardId ?? '')))) : null,
        loseDiscard
          ? h(
              'div',
              { class: 'grow' },
              h('small', null, t('defense.loseDiscard')),
              hero.discard.map((c) =>
                h(
                  'button',
                  {
                    class: 'gbtn gbtn-small gbtn-toggle',
                    'aria-pressed': String(o.discardPick.includes(c)),
                    onclick: () => o.onDiscardPick(o.discardPick.includes(c) ? o.discardPick.filter((x) => x !== c) : [...o.discardPick, c].slice(-2)),
                  },
                  cardName(c),
                ),
              ),
              h('button', { class: 'gbtn', disabled: !(d1 && d2), onclick: () => d1 && d2 && o.act({ type: 'avoidDamage', heroId: hero.id, choice: { kind: 'loseDiscard', cardIds: [d1, d2] } }) }, icon('loss'), t('game.avoid.loseTwo')),
            )
          : null,
      ),
    );
  }

  return h(
    'div',
    { class: 'gsheet gdef' },
    h('p', { class: 'gsheet-title' }, icon('hp'), h('span', null, t('game.avoid.title', { name: figureName(hero.id, s), amount: p.amount, source })), h('b', { class: 'gdef-dmg', 'aria-hidden': 'true' }, String(p.amount))),
    ...(o.extra ?? []),
    ...rows,
  );
}

