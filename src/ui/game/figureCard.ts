// The small stat card of a figure or a monster type: shown on hover (PC) or tap (tablet) over a
// portrait in the initiative ribbon or a figure on the board. «Більше» opens the full details.

import type { MonsterStats, Step } from '../../rules/content';
import type { LoadedContent } from '../../rules/load';
import { planRun, planTurn } from '../../rules/ai/index';
import type { Ctx } from '../../rules/effects/context';
import { runnerGoal } from '../../rules/events';
import type { Hex } from '../../rules/hex';
import { upcomingEvents } from '../../rules/queries';
import { behaviourCard, monsterInitiative } from '../../rules/round';
import { figureSteps } from '../../rules/turn';
import type { Figure, FigureId, GameState, HeroState, MonsterState } from '../../rules/state';
import { stepText } from '../debug/format';
import { h } from '../dom';
import { t } from '../i18n';
import { icon, type IconName } from './icons';
import { MONSTER_RING, portrait, statusRow, type Explain } from './panels';
import { cardName, eventWarningIcon, eventWarningText, figureName, monsterTypeName } from './text';

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
    body.push(h('div', { class: 'gfig-base', title: t('game.monster.base') }, h('small', null, t('game.monster.base')), monsterStats(o.content, type, m)), m ? statusRow(s, m, o.explain) : groupHp(s, type), intentLines(s, o.content, type, m));
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
  return b ? { hp: 0, move: b.move, attack: b.attack, ...(b.range ? { range: b.range } : {}), ...(b.shield ? { shield: b.shield } : {}), ...(b.flying ? { flying: true } : {}) } : null;
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
  if (st.jumps) stats.push(['jump', t('step.jump'), '']);
  if (st.tonguePull) stats.push(['pull', t('monster.tonguePull'), '']);
  if (st.windUp) stats.push(['gear', t('monster.windUp'), '']);
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

/** The steps a monster figure would really perform with this behaviour card: the card's deltas on
 *  top of its own stats, consume bonuses, immobilize / disarm folded in (the engine's figureSteps). */
export function resolvedSteps(s: GameState, content: LoadedContent, figure: MonsterState, cardId: string): Step[] {
  const deck = s.behaviourDecks[figure.typeId];
  const clone: GameState = deck && deck.current !== cardId ? { ...s, behaviourDecks: { ...s.behaviourDecks, [figure.typeId]: { ...deck, current: cardId } } } : s;
  const ctx: Ctx = { s: clone, c: content, ev: [], out: [] };
  try {
    return figureSteps(ctx, clone.figures[figure.id] ?? figure);
  } catch {
    return [];
  }
}

/** The monster's plan for this round: whom it goes for and the hexes it will walk through. */
export function monsterPlan(s: GameState, content: LoadedContent, figure: MonsterState): { focusId: FigureId | null; path: Hex[]; steps: Step[] } | null {
  if (!s.behaviourDecks[figure.typeId]?.current) return null;
  const steps = resolvedSteps(s, content, figure, s.behaviourDecks[figure.typeId]?.current as string);
  try {
    // A bell runner (scenario event) heads for its goal instead of fighting.
    const goal = runnerGoal({ s, c: content }, figure);
    const plan = goal ? planRun(s, figure.id, steps, goal) : planTurn(s, figure.id, steps);
    return { focusId: plan.focusId, path: plan.path, steps };
  } catch {
    return null;
  }
}

function resolvedLine(s: GameState, steps: Step[], f: MonsterState): HTMLElement[] {
  const out: HTMLElement[] = [h('span', null, steps.length ? steps.map((st) => stepText(st, s.variants.orbs)).join('; ') : t('game.monster.nothing'))];
  if (f.conditions.immobilize) out.push(h('span', { class: 'gtag is-bad' }, t('game.monster.immobilized')));
  if (f.conditions.disarm) out.push(h('span', { class: 'gtag is-bad' }, t('game.monster.disarmed')));
  if (f.conditions.stun) out.push(h('span', { class: 'gtag is-bad' }, t('condition.stun')));
  if (f.conditions.strengthen) out.push(h('span', { class: 'gtag is-gold' }, t('game.monster.advantage')));
  if (f.conditions.muddle) out.push(h('span', { class: 'gtag is-bad' }, t('game.monster.disadvantage')));
  return out;
}

/** This round's card (or the three possible ones in the fork) with the real numbers: per figure,
 *  or per rank when only the ribbon's monster type was tapped. The card's own deltas stay as a grey
 *  hint. With a figure after the reveal, its target from the AI plan. */
function intentLines(s: GameState, content: LoadedContent, typeId: string, figure?: MonsterState): HTMLElement {
  const deck = s.behaviourDecks[typeId];
  const ids = deck?.current ? [deck.current] : s.variants.threeIntents ? (deck?.intents ?? []) : [];
  const ctx = { s, c: content };
  const relative = !content.bosses[typeId];
  const raw = (steps: Step[]) => steps.map((st) => stepText(st, s.variants.orbs, relative)).join('; ');
  const all = Object.values(s.figures).filter((f): f is MonsterState => f.kind === 'monster' && f.typeId === typeId);
  // One line per rank is enough when the figures of a rank are alike; a tapped figure gets its own.
  const shown = figure ? [figure] : [...new Map(all.map((f) => [f.rank, f])).values()];
  const plan = figure && deck?.current ? monsterPlan(s, content, figure) : null;
  // Scenario events tied to these figures: «покличе підмогу на 3-му раунді», a runner's distance.
  const warnings = upcomingEvents(s, content).filter((w) => w.kind !== 'wave' && (figure ? w.figureId === figure.id : all.some((f) => f.id === w.figureId)));
  const runs = !!figure && !!runnerGoal({ s, c: content }, figure);
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
        h(
          'div',
          { class: 'gcol gmcard-body' },
          shown.map((f) => h('div', { class: 'grow' }, shown.length > 1 || !figure ? h('b', null, `${figureName(f.id, s)}:`) : null, resolvedLine(s, resolvedSteps(s, content, f, id), f))),
          h('small', { class: 'gmcard-raw', title: t('game.monster.raw') }, card.if ? `${t(`game.if.${card.if}`)}: ` : '', raw(card.steps), card.otherwise ? ` | ${t('game.otherwise')}: ${raw(card.otherwise)}` : ''),
        ),
      );
    }),
    plan ? h('p', { class: 'gfig-plan' }, icon('arrow'), runs ? t('game.monster.runs') : plan.focusId ? t('game.monster.goesFor', { name: figureName(plan.focusId, s) }) : t('game.monster.noFocus'), plan.path.length ? ` · ${t('game.monster.steps', { n: plan.path.length })}` : '') : null,
    warnings.map((w) => h('p', { class: 'gfig-plan gevent' }, icon(eventWarningIcon(w)), eventWarningText(w, s))),
  );
}
