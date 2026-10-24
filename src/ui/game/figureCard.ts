// The small stat card of a figure or a monster type: shown on hover (PC) or tap (tablet) over a
// portrait in the initiative ribbon or a figure on the board. «Більше» opens the full details.

import type { MonsterStats, Step } from '../../rules/content';
import type { LoadedContent } from '../../rules/load';
import { behaviourCard, monsterInitiative } from '../../rules/round';
import type { Figure, FigureId, GameState, HeroState, MonsterState } from '../../rules/state';
import { stepText } from '../debug/format';
import { h } from '../dom';
import { t } from '../i18n';
import { icon, type IconName } from './icons';
import { MONSTER_RING, portrait, statusRow, type Explain } from './panels';
import { cardName, figureName, monsterTypeName } from './text';

export interface FigureCardOptions {
  s: GameState;
  content: LoadedContent;
  /** A figure on the board, or a monster type from the ribbon (`typeId`). */
  figureId?: FigureId;
  typeId?: string;
  colorOf: (heroId: FigureId) => string;
  explain: Explain;
  onMore: () => void;
  onClose: () => void;
}

export function figureCard(o: FigureCardOptions): HTMLElement | null {
  const s = o.s;
  const f = o.figureId ? s.figures[o.figureId] : undefined;
  const typeId = o.typeId ?? (f?.kind === 'monster' ? f.typeId : undefined);
  if (!f && !typeId) return null;
  const body: (HTMLElement | null)[] = [];
  let title: string;
  let ring: string;
  let tag: string | null = null;
  if (f?.kind === 'hero') {
    title = figureName(f.id);
    ring = o.colorOf(f.id);
    body.push(hpRow(f), heroStats(s, f), statusRow(s, f, o.explain), heroCards(s, f));
  } else if (f?.kind === 'summon') {
    title = figureName(f.id, s);
    ring = '#3cc8c8';
    body.push(hpRow(f), statLine([['move', t('stat.move'), f.move], ['attack', t('stat.attack'), f.attack], ...(f.range ? ([['range', t('stat.range'), f.range]] as Stat[]) : [])]), statusRow(s, f, o.explain));
  } else {
    const type = typeId as string;
    title = f ? figureName(f.id, s) : monsterTypeName(type);
    ring = MONSTER_RING;
    const m = f as MonsterState | undefined;
    if (m?.rank === 'elite') tag = t('rank.elite');
    if (m?.rank === 'boss' || o.content.bosses[type]) tag = t('rank.boss');
    if (m) body.push(hpRow(m));
    body.push(monsterStats(o.content, type, m), m ? statusRow(s, m, o.explain) : groupHp(s, type), intentLines(s, o.content, type));
  }
  const card = h(
    'div',
    { class: 'gfig', role: 'dialog', 'aria-label': title },
    h(
      'div',
      { class: 'gfig-head' },
      portrait(f?.id ?? `monster:${typeId}`, ring, 'md', f ? undefined : typeId),
      h('div', { class: 'gfig-title' }, h('b', null, title), tag ? h('span', { class: 'gtag is-gold' }, tag) : null),
      h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('game.close'), onclick: o.onClose }, icon('close')),
    ),
    body,
    h('button', { class: 'gbtn gfig-more', onclick: o.onMore }, icon('hint'), t('game.figure.more')),
  );
  return card;
}

type Stat = [IconName, string, number | string];

function statLine(stats: Stat[]): HTMLElement {
  return h(
    'div',
    { class: 'gfig-stats' },
    stats.map(([ic, label, v]) => h('span', { class: 'gfig-stat', title: label }, icon(ic), h('b', null, v), h('small', null, label))),
  );
}

function hpRow(f: Figure): HTMLElement {
  const pct = Math.max(0, Math.min(100, (100 * f.hp) / Math.max(1, f.maxHp)));
  return h(
    'div',
    { class: 'gfig-hp' },
    icon('hp'),
    h('b', null, `${f.hp}/${f.maxHp}`),
    h('div', { class: 'ghp-bar' }, h('div', { class: `ghp-fill${pct <= 34 ? ' is-low' : ''}`, style: { width: `${pct}%` } })),
  );
}

function heroStats(s: GameState, f: HeroState): HTMLElement {
  const stats: Stat[] = [];
  if (f.initiative !== null && s.phase !== 'selectCards') stats.push(['initiative', t('ui.initiative'), f.selection?.kind === 'longRest' ? 99 : f.initiative]);
  const shield = f.shields.reduce((n, x) => n + x.value, 0);
  if (shield) stats.push(['shield', t('stat.shield'), shield]);
  const ret = f.retaliates.reduce((n, x) => n + x.value, 0);
  if (ret) stats.push(['retaliate', t('stat.retaliate'), ret]);
  stats.push(['hand', t('ui.hand'), f.hand.length], ['discard', t('ui.discard'), f.discard.length], ['loss', t('ui.lost'), f.lost.length]);
  if (s.variants.momentum) stats.push(['momentum', t('ui.momentum'), `${f.momentum}/3`]);
  return statLine(stats);
}

/** The two cards of the round once revealed, and the active ones. */
function heroCards(s: GameState, f: HeroState): HTMLElement | null {
  const lines: string[] = [];
  if (s.phase !== 'selectCards' && f.selection?.kind === 'cards') lines.push(`${t('game.figure.cards')}: ${f.selection.cards.map(cardName).join(', ')}`);
  if (f.selection?.kind === 'longRest' && s.phase !== 'selectCards') lines.push(t('ui.longRest'));
  if (f.active.length) lines.push(`${t('ui.activeCards')}: ${f.active.map((a) => cardName(a.cardId)).join(', ')}`);
  return lines.length ? h('div', { class: 'gfig-lines' }, lines.map((l) => h('p', null, l))) : null;
}

function statsOf(content: LoadedContent, typeId: string, rank: 'normal' | 'elite' | 'boss'): MonsterStats | null {
  const m = content.monsters[typeId];
  if (m) return rank === 'elite' ? m.elite : m.normal;
  const b = content.bosses[typeId];
  return b ? { hp: 0, move: b.move, attack: b.attack, ...(b.range ? { range: b.range } : {}), ...(b.shield ? { shield: b.shield } : {}) } : null;
}

function monsterStats(content: LoadedContent, typeId: string, m: MonsterState | undefined): HTMLElement | null {
  const st = statsOf(content, typeId, m?.rank ?? 'normal');
  if (!st) return null;
  const stats: Stat[] = [['move', t('stat.move'), st.move], ['attack', t('stat.attack'), st.attack]];
  if (st.range) stats.push(['range', t('stat.range'), st.range]);
  const shield = m ? m.shields.reduce((n, x) => n + x.value, 0) : (st.shield ?? 0);
  if (shield) stats.push(['shield', t('stat.shield'), shield]);
  const ret = m ? m.retaliates.reduce((n, x) => n + x.value, 0) : (st.retaliate ?? 0);
  if (ret) stats.push(['retaliate', t('stat.retaliate'), ret]);
  if (st.flying) stats.push(['fly', t('step.fly'), '']);
  return statLine(stats);
}

function groupHp(s: GameState, typeId: string): HTMLElement | null {
  const list = Object.values(s.figures).filter((f): f is MonsterState => f.kind === 'monster' && f.typeId === typeId);
  if (!list.length) return null;
  return h(
    'div',
    { class: 'gfig-lines' },
    list
      .sort((a, b) => a.number - b.number)
      .map((f) => h('p', null, `${figureName(f.id, s)}: ${f.hp}/${f.maxHp}`)),
  );
}

/** This round's behaviour card, or the three possible ones (fork «Три можливі наміри»). */
function intentLines(s: GameState, content: LoadedContent, typeId: string): HTMLElement {
  const deck = s.behaviourDecks[typeId];
  const ids = deck?.current ? [deck.current] : s.variants.threeIntents ? (deck?.intents ?? []) : [];
  const ctx = { s, c: content };
  const relative = !content.bosses[typeId];
  const text = (steps: Step[]) => steps.map((st) => stepText(st, s.variants.orbs, relative)).join('; ');
  return h(
    'div',
    { class: 'gfig-intents' },
    h('small', null, ids.length ? (deck?.current ? t('game.monster.card') : t('game.monster.intents')) : t('game.monster.unknown')),
    ids.map((id) => {
      const card = behaviourCard(ctx, typeId, id);
      return h(
        'div',
        { class: 'gmcard' },
        h('span', { class: 'gcard-ini' }, monsterInitiative(ctx, typeId, card)),
        h('span', null, card.if ? `${t(`game.if.${card.if}`)}: ` : '', text(card.steps), card.otherwise ? ` | ${t('game.otherwise')}: ${text(card.otherwise)}` : ''),
      );
    }),
  );
}
