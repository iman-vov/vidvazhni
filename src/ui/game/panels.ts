// HUD around the board (approved mockup scenario-hud v5 + item slots from v4): the initiative ribbon
// of round portraits (top centre), the narrow hero panel (left), the row of elements or orbs (top
// right). Pure render functions; the scenario screen passes state and callbacks.

import type { ConditionId, ElementId, OrbId } from '../../rules/content';
import type { EventWarning, InitiativeForecast } from '../../rules/queries';
import type { FigureId, Figure, GameState, HeroState, TurnEntry } from '../../rules/state';
import type { LoadedContent } from '../../rules/load';
import { MOMENTUM_MAX } from '../../rules/variants';
import type { IntentId } from '../../app/game';
import { h } from '../dom';
import { t } from '../i18n';
import { icon, type IconName } from './icons';
import { onPress } from './press';
import { cardName, className, conditionName, elementName, eventWarningIcon, eventWarningText, figureName, monsterTypeName } from './text';
import { portraitOf, portraitUrl } from './uiArt';

export const ELEMENTS: ElementId[] = ['fire', 'ice', 'air', 'earth', 'light', 'dark'];
export const ORB_IDS: OrbId[] = ['fire', 'earth', 'air'];
export const MONSTER_RING = '#c9483c';
const SUMMON_RING = '#3cc8c8';
const MARK_RING = '#f0d58a';

export interface Explain {
  (title: string, text: string): void;
}

/** Long press (or tap) on an icon explains it. */
export function explained(el: HTMLElement, explain: Explain, title: string, text: string): HTMLElement {
  onPress(el, { hold: () => explain(title, text), tap: () => explain(title, text) });
  return el;
}

export function heroIndex(s: GameState, heroId: FigureId): number {
  return Object.values(s.figures)
    .filter((f) => f.kind === 'hero')
    .findIndex((f) => f.id === heroId);
}

export function heroBadge(s: GameState, heroId: FigureId, color: string, small = false): HTMLElement {
  const classId = heroId.split(':')[1] ?? '';
  return h('span', { class: `gbadge${small ? ' is-small' : ''}`, style: { background: color } }, className(classId).slice(0, 1));
}

/** A round portrait (concept art) in a coloured ring; the first letter when there is no art yet. */
export function portrait(figureId: FigureId, color: string, size: 'xs' | 'sm' | 'md' | 'lg' = 'sm', typeId?: string): HTMLElement {
  const url = typeId ? portraitUrl(typeId) : portraitOf(figureId);
  const name = typeId ? monsterTypeName(typeId) : figureName(figureId);
  const el = h('span', { class: `gport is-${size}`, title: name }, url ? h('img', { src: url, alt: '', draggable: 'false' }) : h('span', { class: 'gport-letter' }, name.slice(0, 1)));
  el.style.setProperty('--ring', color);
  return el;
}

export function intentIcons(list: IntentId[]): HTMLElement | null {
  if (list.length === 0) return null;
  return h(
    'span',
    { class: 'gintents' },
    list.map((id) => h('span', { class: 'gintent', title: t(`game.intent.${id}`) }, icon(intentIcon(id)))),
  );
}

export function intentIcon(id: IntentId): IconName {
  return ({ attack: 'attack', heal: 'heal', approach: 'approach', hold: 'hold', rest: 'rest', early: 'early', late: 'late' } as const)[id];
}

// ─── Initiative ribbon ──────────────────────────────────────────────────────

export interface InitiativeBarOptions {
  s: GameState;
  content: LoadedContent;
  colorOf: (heroId: FigureId) => string;
  intentsOf: (heroId: FigureId) => IntentId[];
  /** Fork «Прогноз раунду» while a card is held or chosen as leading. */
  forecast: InitiativeForecast | null;
  /** Hint level 2: who each monster type is going for this round. */
  monsterFocus: Record<string, FigureId[]> | null;
  /** Tap on a portrait: a hero (`figureId`) or a monster type (`typeId`). */
  onPick: (target: RibbonTarget) => void;
  /** Mouse over a portrait (PC); null when it leaves. */
  onHover?: (target: RibbonTarget | null) => void;
}

export interface RibbonTarget {
  figureId?: FigureId;
  typeId?: string;
}

function pickable(el: HTMLElement, o: InitiativeBarOptions, target: RibbonTarget): HTMLElement {
  el.addEventListener('click', () => o.onPick(target));
  el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && o.onHover?.(target));
  el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && o.onHover?.(null));
  return el;
}

export function initiativeBar(o: InitiativeBarOptions): HTMLElement {
  const s = o.s;
  const entries: HTMLElement[] = [];
  if (o.forecast) {
    for (const e of o.forecast.order) {
      if (e.kind === 'hero') entries.push(heroEntry(o, e.figureId, e.initiative, { self: !!e.self }));
      else entries.push(monsterEntry(o, e.typeId, String(e.initiative), { intent: true }));
    }
    return h(
      'div',
      { class: 'ginibar is-forecast', 'aria-label': t('variant.roundForecast') },
      h('span', { class: 'ginibar-tag' }, icon('initiative'), t('game.forecast', { n: o.forecast.position + 1 })),
      joined(entries),
      eventChips(s, o.forecast.events),
    );
  }
  if (s.phase === 'selectCards' || s.turnOrder.length === 0) {
    for (const f of Object.values(s.figures)) {
      if (f.kind !== 'hero' || f.exhausted) continue;
      entries.push(heroEntry(o, f.id, null, { chosen: f.selection !== null && s.pending?.kind === 'selectCards' }));
    }
    for (const typeId of typesShown(s)) {
      const deck = s.behaviourDecks[typeId];
      const inis = s.variants.threeIntents && deck?.intents.length ? deck.intents.map((c) => String(monsterIni(o.content, typeId, c))) : [];
      entries.push(monsterEntry(o, typeId, inis.length ? inis.join(' · ') : icon('initiative', '', t('ui.initiative')), {}));
    }
  } else {
    const current = s.phase === 'turns' ? s.turnIndex : s.turnOrder.length;
    s.turnOrder.forEach((e: TurnEntry, i) => {
      const state = { current: i === current && s.phase === 'turns', done: i < current };
      if (e.kind === 'monsterGroup') {
        if (!Object.values(s.figures).some((f) => f.kind === 'monster' && f.typeId === e.typeId) && i > current) return;
        entries.push(monsterEntry(o, e.typeId, rolledText(s, e), state));
      } else if (e.kind === 'hero') entries.push(heroEntry(o, e.figureId, rolledText(s, e), state));
      else
        entries.push(
          h('span', { class: `gini is-summon${state.done ? ' is-done' : ''}`, 'aria-label': figureName(e.figureId, s) }, portrait(e.figureId, SUMMON_RING, 'sm'), h('b', { class: 'gini-ini' }, rolledText(s, e))),
        );
    });
  }
  return h('div', { class: 'ginibar', 'aria-label': t('ui.initiative') }, joined(entries));
}

/** Scenario events due soon (a wave, a call for help, a runner), as warning tags. */
export function eventChips(s: GameState, warnings: EventWarning[]): HTMLElement | null {
  if (warnings.length === 0) return null;
  return h(
    'span',
    { class: 'gevents' },
    warnings.map((w) => h('span', { class: 'gtag is-bad gevent' }, icon(eventWarningIcon(w)), eventWarningText(w, s))),
  );
}

/** «Кубик ініціативи»: «25+7=32» for a rolled entry (the card's number from this round's roll
 *  event), else the plain initiative. */
function rolledText(s: GameState, e: TurnEntry): string | HTMLElement {
  if (e.roll === undefined) return String(e.initiative);
  const f = e.kind === 'monsterGroup' ? undefined : s.figures[e.figureId];
  const id = e.kind === 'monsterGroup' ? e.typeId : f?.kind === 'summon' ? f.ownerId : e.figureId;
  let card = e.initiative - e.roll;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const ev = s.log[i]!;
    if (ev.type === 'roundStarted') break;
    const r = ev.type === 'initiativeRolled' ? ev.rolls.find((x) => x.id === id) : undefined;
    if (r) {
      card = r.card;
      break;
    }
  }
  return h('span', { class: 'gini-roll', title: `${card} + ${e.roll} = ${e.initiative}` }, h('small', null, `${card}+${e.roll}=`), String(e.initiative));
}

/** Entries with the small gold diamonds between them, as on the mockup ribbon. */
function joined(entries: HTMLElement[]): HTMLElement[] {
  return entries.flatMap((e, i) => (i === 0 ? [e] : [h('span', { class: 'gini-sep', 'aria-hidden': 'true' }), e]));
}

function heroEntry(o: InitiativeBarOptions, heroId: FigureId, ini: number | string | HTMLElement | null, st: { self?: boolean; chosen?: boolean; current?: boolean; done?: boolean }): HTMLElement {
  const f = o.s.figures[heroId] as HeroState | undefined;
  const cls = ['gini', 'is-hero'];
  if (st.self) cls.push('is-self');
  if (st.current) cls.push('is-current');
  if (st.done) cls.push('is-done');
  if (f?.downed || f?.exhausted) cls.push('is-out');
  const iniText = ini === null ? (st.chosen ? icon('check', '', t('game.ready')) : icon('initiative', '', t('ui.initiative'))) : f?.selection?.kind === 'longRest' ? '99' : typeof ini === 'number' ? String(ini) : ini;
  const el = h(
    'button',
    { class: cls.join(' '), 'aria-label': figureName(heroId) },
    portrait(heroId, o.colorOf(heroId), st.current || st.self ? 'md' : 'sm'),
    h('b', { class: 'gini-ini' }, iniText),
    st.self ? h('span', { class: 'gini-you' }, t('game.you')) : null,
    intentIcons(o.intentsOf(heroId)),
  );
  return pickable(el, o, { figureId: heroId });
}

function monsterEntry(o: InitiativeBarOptions, typeId: string, ini: string | HTMLElement, st: { current?: boolean; done?: boolean; intent?: boolean }): HTMLElement {
  const cls = ['gini', 'is-monster'];
  if (st.current) cls.push('is-current');
  if (st.done) cls.push('is-done');
  if (st.intent) cls.push('is-intent');
  const focus = [...new Set(o.monsterFocus?.[typeId] ?? [])];
  const el = h(
    'button',
    { class: cls.join(' '), 'aria-label': monsterTypeName(typeId) },
    portrait(`monster:${typeId}`, MONSTER_RING, st.current ? 'md' : 'sm', typeId),
    h('b', { class: 'gini-ini' }, ini),
    focus.length
      ? h(
          'span',
          { class: 'gini-focus', title: `${t('game.hint.focus')}: ${focus.map((id) => figureName(id)).join(', ')}` },
          icon('arrow'),
          focus.map((id) => portrait(id, MARK_RING, 'xs')),
        )
      : null,
  );
  return pickable(el, o, { typeId });
}

function typesShown(s: GameState): string[] {
  const out: string[] = [];
  for (const f of Object.values(s.figures)) if (f.kind === 'monster' && !out.includes(f.typeId)) out.push(f.typeId);
  return out;
}

function monsterIni(content: LoadedContent, typeId: string, cardId: string): number {
  const m = content.monsters[typeId];
  const deckId = m?.deck ?? content.bosses[typeId]?.deck;
  const card = (deckId ? content.decks[deckId]?.cards.find((c) => c.id === cardId) : undefined) ?? m?.forkCards?.find((c) => c.id === cardId);
  return card ? Math.min(99, Math.max(1, card.initiative + (m?.initiativeOffset ?? 0))) : 0;
}

// ─── Hero panel ─────────────────────────────────────────────────────────────

export interface HeroPanelOptions {
  s: GameState;
  content: LoadedContent;
  open: boolean;
  focusId: FigureId | null;
  colorOf: (heroId: FigureId) => string;
  playerName: (heroId: FigureId) => string;
  intentsOf: (heroId: FigureId) => IntentId[];
  /** Item slots: usable now (glow); a tap opens the item's description. */
  items: (heroId: FigureId) => { id: string; state: string; usable: boolean; onOpen: () => void }[];
  explain: Explain;
  onToggle: () => void;
  onFocus: (heroId: FigureId) => void;
}

/** The focused hero in full (portrait, HP, conditions, item slots, momentum), the others as small
 *  portraits to switch to. Collapsed: portraits only. */
export function heroPanel(o: HeroPanelOptions): HTMLElement {
  const heroes = Object.values(o.s.figures).filter((f): f is HeroState => f.kind === 'hero');
  const focus = heroes.find((x) => x.id === o.focusId) ?? heroes[0];
  const toggle = h(
    'button',
    { class: 'gbtn gbtn-icon gpanel-toggle', 'aria-expanded': String(o.open), 'aria-label': t('game.panel.heroes'), onclick: o.onToggle },
    icon(o.open ? 'left' : 'right'),
  );
  const minis = (list: HeroState[]) =>
    h(
      'div',
      { class: 'ghero-others' },
      list.map((hero) =>
        h(
          'button',
          {
            class: `gmini${hero.exhausted || hero.downed ? ' is-out' : ''}`,
            'aria-label': figureName(hero.id),
            onclick: () => {
              o.onFocus(hero.id);
              if (!o.open) o.onToggle();
            },
          },
          portrait(hero.id, o.colorOf(hero.id), 'sm'),
          h('span', { class: `gmini-hp${hero.hp * 3 <= hero.maxHp ? ' is-low' : ''}` }, hero.hp),
        ),
      ),
    );
  if (!o.open || !focus) return h('aside', { class: 'gleft is-closed' }, toggle, minis(heroes));
  const others = heroes.filter((x) => x.id !== focus.id);
  return h('aside', { class: 'gleft' }, toggle, heroBlock(o, focus), others.length ? minis(others) : null);
}

function heroBlock(o: HeroPanelOptions, hero: HeroState): HTMLElement {
  const s = o.s;
  const tags: HTMLElement[] = [];
  if (hero.exhausted) tags.push(h('span', { class: 'gtag is-bad' }, t('ui.exhausted')));
  if (hero.downed) tags.push(h('span', { class: 'gtag is-bad' }, t('ui.downed')));
  if (hero.selection?.kind === 'longRest' && s.phase === 'turns') tags.push(h('span', { class: 'gtag' }, t('ui.longRest')));
  if (hero.wantsShortRest) tags.push(h('span', { class: 'gtag' }, t('ui.shortRest')));
  const pct = Math.max(0, Math.min(100, (100 * hero.hp) / Math.max(1, hero.maxHp)));
  const items = o.items(hero.id);
  const body: (HTMLElement | null)[] = [
    portrait(hero.id, o.colorOf(hero.id), 'lg'),
    h('div', { class: 'ghero-name' }, h('b', null, figureName(hero.id)), h('small', null, o.playerName(hero.id))),
    h('div', { class: 'ghp', title: t('ui.hp') }, icon('hp'), h('b', null, `${hero.hp}/${hero.maxHp}`)),
    h('div', { class: 'ghp-bar' }, h('div', { class: `ghp-fill${pct <= 34 ? ' is-low' : ''}`, style: { width: `${pct}%` } })),
    statusRow(s, hero, o.explain),
    tags.length ? h('div', { class: 'grow' }, tags) : null,
    intentIcons(o.intentsOf(hero.id)),
  ];
  if (s.variants.momentum) {
    body.push(
      explained(
        h(
          'div',
          { class: 'gmomentum', title: t('ui.momentum') },
          icon('momentum'),
          Array.from({ length: MOMENTUM_MAX }, (_, i) => h('span', { class: `gpip${i < hero.momentum ? ' is-on' : ''}` })),
        ),
        o.explain,
        t('variant.momentum'),
        t('variant.momentum.text'),
      ),
    );
  }
  if (items.length) {
    body.push(
      h(
        'div',
        { class: 'gslots' },
        items.map((it) =>
          h(
            'button',
            {
              class: `gslot is-${it.state}${it.usable ? ' is-glow' : ''}`,
              title: `${t(`item.${it.id}`)} · ${t(`game.itemState.${it.state}`)}`,
              'aria-label': `${t(`item.${it.id}`)}, ${t(`game.itemState.${it.state}`)}`,
              onclick: () => it.onOpen(),
            },
            icon('item'),
            h('small', null, t(`item.${it.id}`)),
          ),
        ),
      ),
    );
  }
  body.push(
    h(
      'div',
      { class: 'gstats' },
      stat('xp', t('ui.xp'), hero.xp),
      stat('coin', t('ui.coins'), hero.coins),
      stat('hand', t('ui.hand'), hero.hand.length),
      stat('discard', t('ui.discard'), hero.discard.length),
      stat('loss', t('ui.lost'), hero.lost.length),
    ),
  );
  if (hero.active.length) {
    body.push(
      h(
        'div',
        { class: 'gactive', title: t('ui.activeCards') },
        hero.active.map((a) => h('div', { class: 'gactive-card' }, icon('active'), h('span', null, cardName(a.cardId)), a.usesLeft !== undefined ? h('span', { class: 'gtag' }, `×${a.usesLeft}`) : null)),
      ),
    );
  }
  const el = h('section', { class: `ghero${hero.exhausted ? ' is-out' : ''}` }, body);
  el.style.setProperty('--ring', o.colorOf(hero.id));
  return el;
}

function stat(iconName: IconName, label: string, value: number): HTMLElement {
  return h('span', { class: 'gstat', title: label }, icon(iconName), h('b', null, value));
}

/** Conditions, shields, retaliate and provoke of a figure as icons; tap or hold explains. */
export function statusRow(s: GameState, f: Figure, explain: Explain): HTMLElement | null {
  const bits: HTMLElement[] = [];
  for (const [c, st] of Object.entries(f.conditions)) {
    if (!st) continue;
    const id = c as ConditionId;
    bits.push(explained(h('span', { class: `gcond c-${id}`, title: conditionName(id) }, icon(id), h('small', null, conditionName(id))), explain, conditionName(id), t(`condition.${id}.text`)));
  }
  const shield = f.shields.reduce((n, x) => n + x.value, 0);
  if (shield) bits.push(explained(h('span', { class: 'gcond is-good' }, icon('shield'), h('small', null, `${t('stat.shield')} ${shield}`)), explain, t('stat.shield'), t('game.explain.shield')));
  const ret = f.retaliates.reduce((n, x) => n + x.value, 0);
  if (ret) bits.push(explained(h('span', { class: 'gcond is-good' }, icon('retaliate'), h('small', null, `${t('stat.retaliate')} ${ret}`)), explain, t('stat.retaliate'), t('game.explain.retaliate')));
  if (f.kind === 'hero' && f.provokeRadius) bits.push(h('span', { class: 'gcond is-good' }, icon('provoke'), h('small', null, t('step.provoke', { radius: f.provokeRadius }))));
  if (f.kind === 'monster' && s.variants.followUp && f.attackedBy.length) bits.push(explained(h('span', { class: 'gcond is-good' }, icon('targets'), h('small', null, t('variant.followUp'))), explain, t('variant.followUp'), t('variant.followUp.text')));
  return bits.length ? h('div', { class: 'gstatus' }, bits) : null;
}

// ─── Elements / orbs ────────────────────────────────────────────────────────

export interface ElementsRowOptions {
  s: GameState;
  explain: Explain;
}

/** Elements (6, base rules) or orbs (3, fork) as a row of round tokens with their state; an orb
 *  shows its owner's portrait. */
export function elementsRow(o: ElementsRowOptions): HTMLElement {
  const s = o.s;
  const list = s.variants.orbs
    ? ORB_IDS.map((id) => {
        const orb = s.orbs[id];
        const state = orb ? (orb.age === 0 ? 'strong' : 'waning') : 'inert';
        const owner = orb ? (orb.ownerId.includes(':') ? figureName(orb.ownerId, s) : t('game.orb.scenario')) : t('game.orb.none');
        return explained(
          h(
            'div',
            { class: `gel el-${id} is-${state}`, title: `${elementName(id, true)}: ${owner}` },
            h('span', { class: 'gel-disc' }, icon(id), orb?.ownerId.includes(':') ? h('span', { class: 'gel-owner' }, portrait(orb.ownerId, MARK_RING, 'xs')) : null),
            h('span', { class: 'gel-label' }, elementName(id, true)),
            h('small', { class: 'gel-state' }, orb ? t(orb.age === 0 ? 'orb.state.fresh' : 'orb.state.dimmed') : t('game.orb.none')),
          ),
          o.explain,
          elementName(id, true),
          `${t(`orb.${id}.text`)}. ${owner}. ${t('game.explain.orbs')}`,
        );
      })
    : ELEMENTS.map((id) =>
        explained(
          h(
            'div',
            { class: `gel el-${id} is-${s.elements[id]}`, title: `${elementName(id, false)}: ${t(`element.state.${s.elements[id]}`)}` },
            h('span', { class: 'gel-disc' }, icon(id)),
            h('span', { class: 'gel-label' }, elementName(id, false)),
            h('small', { class: 'gel-state' }, t(`element.state.${s.elements[id]}`)),
          ),
          o.explain,
          elementName(id, false),
          `${t(`element.state.${s.elements[id]}`)}. ${t('game.explain.elements')}`,
        ),
      );
  return h('div', { class: `gels${s.variants.orbs ? ' is-orbs' : ''}`, role: 'group', 'aria-label': t(s.variants.orbs ? 'ui.orbs' : 'ui.elements') }, list);
}
