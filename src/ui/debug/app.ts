// Phase-1 debug mode: an HTML overlay over the board that plays a scenario by hand through the
// rules engine. Left: elements/orbs, heroes, monsters. Right: the pending decision with its
// actions, then the event log. Top: round, phase, initiative order, language, new game.
// Every button and every tap answers with an action from `legalActions`.

import type { ElementId, OrbId } from '../../rules/content';
import type { AreaShape } from '../../rules/content';
import { areaHexes } from '../../rules/geometry';
import { isFromSelf } from '../../rules/area';
import { DIRECTIONS, type Hex } from '../../rules/hex';
import { loadContent } from '../../rules/load';
import * as queries from '../../rules/queries';
import type { Action, Figure, GameSetup, GameState, HeroState, MonsterState, Pending, StepChoice } from '../../rules/state';
import { hexToWorld } from '../../render/hexLayout';
import { h } from '../dom';
import { getLang, LANGS, onLangChange, setLang, t } from '../i18n';
import { icon, rich } from '../icons';
import { BoardView, heroColor } from './boardView';
import {
  actionText,
  cardForVariants,
  cardName,
  choiceText,
  conditionName,
  elementName,
  entryName,
  eventText,
  figureName,
  findHeroCard,
  halfText,
  stepText,
  tokenLabel,
} from './format';
import { defaultSetup, newGamePanel } from './newGame';
import { attackPrompts, forecast as forecastQuery, heroItems, orbBonuses, usableItems, type OrbBonusView } from './forkQueries';
import { Session, type LegalOption } from './session';
import { emptySelection, stepModel, tapStep, type StepModel, type StepSelection } from './stepPicker';

const ELEMENTS: ElementId[] = ['fire', 'ice', 'air', 'earth', 'light', 'dark'];
const ORBS: OrbId[] = ['fire', 'earth', 'air'];
const HL_MOVE = '#4fb3ff';
const HL_TARGET = '#ff6b5b';
const HL_HEX = '#ffc457';
const HL_AREA = '#ff9f43';

interface UiState {
  heroId: string | null;
  pick: string[];
  leading: string | null;
  sel: StepSelection;
  collapsed: { left: boolean; right: boolean };
  modal: 'newGame' | 'copy' | null;
  copyText: string;
  notice: string;
  noticeOk: boolean;
}


export function mountDebug(boardEl: HTMLElement, overlay: HTMLElement): void {
  document.body.classList.add('debug');
  const boardView = new BoardView(boardEl);
  let session: Session | null = null;
  let seenState: GameState | null = null;
  let stepInfo: { model: StepModel; step: Extract<Pending, { kind: 'stepChoice' }>['step'] } | null = null;
  const ui: UiState = {
    heroId: null,
    pick: [],
    leading: null,
    sel: emptySelection(),
    collapsed: { left: false, right: false },
    modal: 'newGame',
    copyText: '',
    notice: '',
    noticeOk: false,
  };
  const scroll: Record<string, number> = {};

  boardView.onTap((hex) => {
    if (!session || !stepInfo) return;
    const r = tapStep(session.state, stepInfo.model, ui.sel, hex);
    if (r.apply) act({ type: 'resolveStep', choice: r.apply });
    else if (r.sel) {
      ui.sel = r.sel;
      render();
    }
  });
  onLangChange(render);

  // The game in progress survives a reload (seed + setup + actions, replayed on start).
  const SAVE_KEY = 'vidvazhni.debug.game';
  function save(): void {
    try {
      if (session) localStorage.setItem(SAVE_KEY, session.exportJson());
    } catch {
      // storage blocked: no autosave
    }
  }
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      session = Session.fromJson(saved);
      ui.modal = null;
    }
  } catch (e) {
    ui.notice = t('debug.restoreFailed', { error: e instanceof Error ? e.message : String(e) });
  }

  function start(setup: GameSetup): void {
    try {
      session = new Session(setup);
      save();
    } catch (e) {
      ui.notice = e instanceof Error ? e.message : String(e);
      render();
      return;
    }
    ui.modal = null;
    seenState = null;
    render();
  }

  // Dev builds expose the session for inspection from the browser console.
  if (import.meta.env.DEV) Object.defineProperty(window, '__dbg', { get: () => ({ session, ui, act }), configurable: true });

  function act(action: Action): void {
    if (!session) return;
    const err = session.act(action);
    ui.notice = err ? t('debug.rejected', { error: err }) : '';
    ui.noticeOk = false;
    if (!err) save();
    render();
  }

  function legal(): LegalOption[] {
    return session?.legal() ?? [];
  }

  function legalOf<T extends Action['type']>(type: T): Extract<Action, { type: T }>[] {
    return legal()
      .map((o) => o.action)
      .filter((a): a is Extract<Action, { type: T }> => a.type === type);
  }

  /** Resets per-decision UI state when the engine moved on. */
  function sync(s: GameState): void {
    if (seenState === s) return;
    const prev = seenState;
    seenState = s;
    ui.sel = emptySelection();
    const p = s.pending;
    const ids = pendingHeroes(p);
    const samePending = prev?.pending?.kind === p?.kind && ids.length > 0 && ui.heroId !== null && ids.includes(ui.heroId);
    if (!samePending) {
      ui.pick = [];
      ui.leading = null;
    }
    if (ids.length > 0 && (!ui.heroId || !ids.includes(ui.heroId))) {
      ui.heroId = ids[0] as string;
      ui.pick = [];
      ui.leading = null;
    }
    if (!ui.heroId || !s.figures[ui.heroId]) ui.heroId = heroList(s)[0]?.id ?? null;
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  function render(): void {
    for (const id of ['dbg-left', 'dbg-right', 'dbg-log']) {
      const el = document.getElementById(id);
      if (el) scroll[id] = el.scrollTop;
    }
    document.body.classList.toggle('dbg-left-collapsed', ui.collapsed.left);
    document.body.classList.toggle('dbg-right-collapsed', ui.collapsed.right);
    const parts: HTMLElement[] = [];
    if (session) {
      const s = session.state;
      sync(s);
      stepInfo = null;
      const step = s.pending?.kind === 'stepChoice' ? s.pending.step : null;
      if (step) stepInfo = { step, model: stepModel(s, step, legalOf('resolveStep').map((a) => a.choice), ui.sel) };
      parts.push(topBar(s), leftPanel(s), rightPanel(s));
      updateBoard(s);
    } else {
      parts.push(h('div', { class: 'dbg-top' }, h('strong', null, `${t('ui.title')} · ${t('ui.debug')}`), ui.notice ? h('span', { class: 'dbg-error' }, ui.notice) : null, h('span', { class: 'dbg-grow' }), langSwitch()));
    }
    if (ui.modal === 'newGame' || !session) {
      parts.push(
        newGamePanel(loadContent(), session?.setup ?? defaultSetup(), {
          start,
          load: (json) => {
            try {
              session = Session.fromJson(json);
              save();
              ui.modal = null;
              seenState = null;
              render();
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : String(e);
            }
          },
          ...(session
            ? {
                close: () => {
                  ui.modal = null;
                  render();
                },
              }
            : {}),
        }),
      );
    }
    if (ui.modal === 'copy') parts.push(copyModal());
    overlay.replaceChildren(...parts);
    for (const [id, top] of Object.entries(scroll)) {
      const el = document.getElementById(id);
      if (el) el.scrollTop = top;
    }
  }

  function updateBoard(s: GameState): void {
    const labels: Record<string, string> = {};
    let hl: { hexes: Hex[]; color: string } = { hexes: [], color: HL_HEX };
    if (stepInfo) {
      const m = stepInfo.model;
      if (m.mode === 'path') hl = { hexes: m.highlights, color: HL_MOVE };
      else if (m.mode === 'targets') {
        const chosen = new Set(ui.sel.targets);
        const hexes = m.targetIds.filter((id) => !chosen.has(id)).map((id) => s.figures[id]?.hex).filter((x): x is Hex => !!x);
        hl = { hexes, color: HL_TARGET };
        for (const id of ui.sel.targets) {
          const f = s.figures[id];
          if (f) labels[id] = `[${tokenLabel(f)}]`;
        }
      } else if (m.mode === 'area') hl = m.areaPreview.length ? { hexes: m.areaPreview, color: HL_AREA } : { hexes: m.highlights, color: HL_HEX };
      else if (m.mode === 'hex') hl = { hexes: m.highlights, color: HL_HEX };
      if (stepInfo.step.type === 'attack' && s.half) {
        for (const f of Object.values(s.figures)) {
          if (f.kind !== 'monster' || (m.mode === 'targets' && !m.targetIds.includes(f.id))) continue;
          const p = queries.previewAttack(s, s.half.heroId, f.id, session?.content);
          if (p) labels[f.id] = `${labels[f.id] ?? tokenLabel(f)} (${p.damage}${p.advantage ? '+' : ''}${p.disadvantage ? '−' : ''})`;
        }
      }
    }
    boardView.show(s, hl, labels);
  }

  // ─── Top bar ─────────────────────────────────────────────────────────────

  function topBar(s: GameState): HTMLElement {
    const current = s.phase === 'turns' ? s.turnOrder[s.turnIndex] : undefined;
    return h(
      'div',
      { class: 'dbg-top' },
      h('strong', null, t('ui.round', { round: s.round })),
      h('span', { class: 'dbg-phase' }, t(`debug.phase.${s.phase}`)),
      h(
        'div',
        { class: 'dbg-order', 'aria-label': t('ui.initiative') },
        s.turnOrder.length
          ? s.turnOrder.map((e, i) =>
              h(
                'span',
                { class: `dbg-ini${e === current ? ' is-current' : ''}${i < s.turnIndex && s.phase === 'turns' ? ' is-done' : ''}` },
                h('b', null, e.initiative),
                ' ',
                entryName(e, s),
              ),
            )
          : h('span', { class: 'dbg-quiet' }, t('debug.orderAfterReveal')),
      ),
      h('span', { class: 'dbg-grow' }),
      langSwitch(),
      h('button', { class: 'dbg-btn', onclick: () => ((ui.modal = 'newGame'), render()) }, t('ui.newGame')),
    );
  }

  function langSwitch(): HTMLElement {
    return h(
      'div',
      { class: 'dbg-lang', role: 'group', 'aria-label': t('ui.language') },
      LANGS.map((l) => h('button', { class: 'dbg-btn dbg-small', 'aria-pressed': String(l === getLang()), onclick: () => setLang(l) }, l.toUpperCase())),
    );
  }

  // ─── Left panel: elements, heroes, monsters ──────────────────────────────

  function leftPanel(s: GameState): HTMLElement {
    const collapse = h(
      'button',
      { class: 'dbg-btn dbg-collapse', 'aria-expanded': String(!ui.collapsed.left), onclick: () => ((ui.collapsed.left = !ui.collapsed.left), render()) },
      icon(ui.collapsed.left ? 'right' : 'left', { title: false }),
    );
    if (ui.collapsed.left) return h('aside', { class: 'dbg-left is-collapsed', id: 'dbg-left' }, collapse);
    return h(
      'aside',
      { class: 'dbg-left', id: 'dbg-left' },
      h('div', { class: 'dbg-panel-head' }, collapse, h('span', null, t('debug.party'))),
      elementsBox(s),
      heroTabs(s),
      ui.heroId ? heroBox(s, s.figures[ui.heroId] as HeroState) : null,
      monstersBox(s),
    );
  }

  function elementsBox(s: GameState): HTMLElement {
    if (s.variants.orbs) {
      return section(
        'orbs',
        t('ui.orbs'),
        h(
          'div',
          { class: 'dbg-elements' },
          ORBS.map((o) => {
            const orb = s.orbs[o];
            return h(
              'span',
              { class: `dbg-el el-${o}${orb ? (orb.age === 0 ? ' is-strong' : ' is-waning') : ''}` },
              h('b', null, t(`orb.${o}`)),
              orb
                ? `${orb.ownerId.includes(':') ? figureName(orb.ownerId, s) : t('debug.orbScenario')} · ${t(orb.age === 0 ? 'orb.state.fresh' : 'orb.state.dimmed')}`
                : t('debug.orbNone'),
            );
          }),
        ),
      );
    }
    return section(
      'elements',
      t('ui.elements'),
      h(
        'div',
        { class: 'dbg-elements' },
        ELEMENTS.map((e) =>
          h('span', { class: `dbg-el el-${e} is-${s.elements[e]}` }, h('b', null, t(`element.${e}`)), t(`element.state.${s.elements[e]}`)),
        ),
      ),
    );
  }

  function heroTabs(s: GameState): HTMLElement {
    const pendingIds = pendingHeroes(s.pending);
    return h(
      'div',
      { class: 'dbg-tabs', role: 'tablist' },
      heroList(s).map((hero) =>
        h(
          'button',
          {
            class: 'dbg-tab',
            role: 'tab',
            'aria-selected': String(hero.id === ui.heroId),
            style: { borderColor: heroColor(s, hero.id) },
            onclick: () => {
              ui.heroId = hero.id;
              ui.pick = [];
              ui.leading = null;
              render();
            },
          },
          figureName(hero.id),
          pendingIds.includes(hero.id) ? icon('hint', { title: false }) : '',
          h('small', null, `${hero.hp}/${hero.maxHp}`),
        ),
      ),
    );
  }

  function heroBox(s: GameState, hero: HeroState): HTMLElement {
    const content = (session as Session).content;
    const p = s.pending;
    const picking = (p?.kind === 'selectCards' || p?.kind === 'chooseHandBeforeScenario') && p.heroIds.includes(hero.id);
    const handSize = content.heroes[hero.classId]?.handSize ?? 0;
    const cardsShown = p?.kind === 'chooseHandBeforeScenario' && picking ? allCardsOf(hero) : hero.hand;
    const sel = hero.selection;
    const bonuses = s.variants.orbs ? orbBonuses(s, content, hero.id) : [];
    return h(
      'div',
      { class: 'dbg-hero' },
      h(
        'div',
        { class: 'dbg-stats' },
        stat(t('ui.hp'), `${hero.hp}/${hero.maxHp}`),
        stat(t('ui.xp'), hero.xp),
        stat(t('ui.coins'), hero.coins),
        hero.initiative !== null ? stat(t('ui.initiative'), hero.initiative) : null,
        s.variants.momentum ? stat(t('ui.momentum'), t('ui.momentumCharges', { charges: hero.momentum })) : null,
        hero.exhausted ? h('span', { class: 'dbg-tag is-bad' }, t('ui.exhausted')) : null,
        hero.downed ? h('span', { class: 'dbg-tag is-bad' }, t('ui.downed')) : null,
        hero.wantsShortRest ? h('span', { class: 'dbg-tag' }, t('ui.shortRest')) : null,
      ),
      statusLine(s, hero),
      itemsRow(s, hero),
      sel ? h('p', { class: 'dbg-quiet' }, sel.kind === 'longRest' ? t('ui.longRest') : t('debug.selected', { cards: sel.cards.map(cardName).join(' + '), leading: cardName(sel.leading) })) : null,
      section(
        'hand',
        p?.kind === 'chooseHandBeforeScenario' && picking ? t('debug.chooseHand', { n: handSize, picked: ui.pick.length }) : `${t('ui.hand')} (${hero.hand.length})`,
        h('div', { class: 'dbg-cards' }, cardsShown.map((id) => cardButton(s, hero, id, picking, bonuses))),
      ),
      hero.active.length
        ? section(
            'active',
            t('ui.activeCards'),
            h(
              'ul',
              { class: 'dbg-list' },
              hero.active.map((a) => h('li', null, `${cardName(a.cardId)} (${t(a.half === 'top' ? 'ui.playTop' : 'ui.playBottom')})${a.usesLeft !== undefined ? ` · ${a.usesLeft}` : ''}`)),
            ),
          )
        : null,
      pile('discard', t('ui.discard'), hero.discard),
      pile('lost', t('ui.lost'), hero.lost),
      section('modifiers', t('debug.modifiers'), h('p', { class: 'dbg-quiet' }, t('debug.modifierDeck', { draw: hero.modifierDeck.draw.length, discard: hero.modifierDeck.discard.length }))),
    );
  }

  function allCardsOf(hero: HeroState): string[] {
    const cls = (session as Session).content.heroes[hero.classId];
    return cls ? cls.cards.filter((c) => c.level <= Math.max(1, hero.level)).map((c) => c.id) : hero.hand;
  }

  /** Carried items; with «Предмети-кнопки» the usable ones light up and can be pressed. */
  function itemsRow(s: GameState, hero: HeroState): HTMLElement | null {
    const items = heroItems(hero);
    if (items.length === 0) return null;
    const usable = new Set(s.variants.itemPrompts ? usableItems(s, (session as Session).content, hero.id).map((i) => i.itemId) : []);
    const legalUse = legal()
      .map((o) => o.action as { type: string; heroId?: string; itemId?: string })
      .filter((a) => a.type === 'useItem' && a.heroId === hero.id);
    return h(
      'div',
      { class: 'dbg-row' },
      items.map((it) => {
        const action = legalUse.find((a) => a.itemId === it.id) as Action | undefined;
        return h(
          'button',
          { class: `dbg-btn dbg-small${usable.has(it.id) ? ' dbg-primary' : ''}`, disabled: !action, onclick: () => action && act(action) },
          `${t(`item.${it.id}`)} · ${t(`debug.itemState.${it.state}`)}`,
        );
      }),
    );
  }

  function bonusLine(s: GameState, b: OrbBonusView): HTMLElement {
    const el = b.element === 'any' ? t(s.variants.orbs ? 'orb.any.acc' : 'element.any.acc') : elementName(b.element, s.variants.orbs);
    const numbers = b.value !== undefined && b.boosted !== undefined && b.value !== b.boosted ? [` ${b.value} `, icon('arrow', { title: false }), ` ${b.boosted}`] : '';
    const when = b.now ? t('debug.orbHint.now') : b.available ? t('debug.orbHint.from', { names: b.from.map((id) => entryNameById(id, s)).join(', ') }) : t('debug.orbHint.no');
    return h('span', { class: `dbg-orb-hint${b.available ? ' is-on' : ''}` }, icon(b.half === 'top' ? 'up' : 'down', { title: false }), ` ${el}`, numbers, `: ${when}`);
  }

  function entryNameById(id: string, s: GameState): string {
    return id.includes(':') ? figureName(id, s) : entryName({ kind: 'monsterGroup', typeId: id }, s);
  }

  function cardButton(s: GameState, hero: HeroState, cardId: string, picking: boolean, bonuses: OrbBonusView[] = []): HTMLElement {
    const content = (session as Session).content;
    const card = findHeroCard(content, hero.classId, cardId);
    const view = card ? cardForVariants(card, s.variants) : null;
    const idx = ui.pick.indexOf(cardId);
    const isLeading = ui.leading === cardId;
    const body = [
      h('span', { class: 'dbg-card-head' }, h('b', null, cardName(cardId)), view ? h('span', { class: 'dbg-ini-badge' }, view.initiative) : null, view?.momentum ? h('span', { title: t('ui.momentum') }, icon('momentum', { title: false })) : null),
      view ? h('span', { class: 'dbg-card-half' }, h('i', null, icon('up', { title: false }), ' '), halfText(view.top, s.variants.orbs)) : null,
      view ? h('span', { class: 'dbg-card-half' }, h('i', null, icon('down', { title: false }), ' '), halfText(view.bottom, s.variants.orbs)) : null,
      bonuses.filter((b) => b.cardId === cardId).map((b) => bonusLine(s, b)),
      idx >= 0 && s.pending?.kind === 'selectCards' ? h('span', { class: 'dbg-tag' }, isLeading ? t('debug.leadingTag') : t('debug.pickedTag')) : null,
    ];
    if (!picking) return h('div', { class: 'dbg-card' }, body);
    return h(
      'button',
      {
        class: 'dbg-card',
        'aria-pressed': String(idx >= 0),
        onclick: () => {
          togglePick(s, hero, cardId);
          render();
        },
      },
      body,
    );
  }

  function togglePick(s: GameState, hero: HeroState, cardId: string): void {
    const max = s.pending?.kind === 'chooseHandBeforeScenario' ? ((session as Session).content.heroes[hero.classId]?.handSize ?? 0) : 2;
    if (ui.pick.includes(cardId)) {
      // In card selection a second tap on a picked card makes it the leading card first.
      if (s.pending?.kind === 'selectCards' && ui.leading !== cardId && ui.pick.length === 2) {
        ui.leading = cardId;
        return;
      }
      ui.pick = ui.pick.filter((c) => c !== cardId);
      if (ui.leading === cardId) ui.leading = ui.pick[0] ?? null;
      return;
    }
    if (ui.pick.length >= max) return;
    ui.pick.push(cardId);
    ui.leading ??= cardId;
  }

  function pile(key: string, title: string, cards: string[]): HTMLElement {
    return section(key, `${title} (${cards.length})`, cards.length ? h('p', { class: 'dbg-quiet' }, cards.map(cardName).join(', ')) : null, true);
  }

  function statusLine(s: GameState, f: Figure): HTMLElement | null {
    const bits: string[] = [];
    for (const [c, st] of Object.entries(f.conditions)) {
      if (!st) continue;
      bits.push(conditionName(c as Parameters<typeof conditionName>[0]) + (st.expiresAfterTurn !== undefined ? ` (${t('debug.untilTurn', { n: st.expiresAfterTurn })})` : ''));
    }
    for (const sh of f.shields) bits.push(`${t('stat.shield')} ${sh.value}${untilText(sh.until)}`);
    for (const r of f.retaliates) bits.push(`${t('stat.retaliate')} ${r.value}${r.range > 1 ? ` (${t('step.range', { value: r.range })})` : ''}${untilText(r.until)}`);
    if (f.kind === 'hero' && f.provokeRadius) bits.push(t('step.provoke', { radius: f.provokeRadius }));
    for (const g of (f as { surgeGrants?: { on: string; usesLeft: number }[] }).surgeGrants ?? []) bits.push(`${t('ui.surge')}: ${t(`debug.grant.${g.on}`)} (${g.usesLeft})`);
    if (f.kind === 'monster' && s.variants.followUp && f.attackedBy.length) bits.push(`${t('variant.followUp')}: ${f.attackedBy.map((id) => figureName(id)).join(', ')}`);
    return bits.length ? h('p', { class: 'dbg-status' }, bits.join(' · ')) : null;
  }

  function untilText(u: 'round' | 'scenario' | { uses: number }): string {
    if (u === 'scenario') return '';
    if (u === 'round') return ` ${t('duration.round')}`;
    return ` ${t('duration.uses', { uses: u.uses })}`;
  }

  function monstersBox(s: GameState): HTMLElement {
    const groups = new Map<string, MonsterState[]>();
    for (const f of Object.values(s.figures)) {
      if (f.kind !== 'monster') continue;
      groups.set(f.typeId, [...(groups.get(f.typeId) ?? []), f]);
    }
    const summons = Object.values(s.figures).filter((f) => f.kind === 'summon');
    return section(
      'monsters',
      t('debug.monsters'),
      [[...groups.entries()].map(([typeId, list]) => {
        const deck = s.behaviourDecks[typeId];
        const current = deck?.current ? behaviourLine(s, typeId, deck.current) : null;
        const intents = s.variants.threeIntents && deck?.intents.length ? deck.intents.map((c) => behaviourLine(s, typeId, c)) : [];
        return h(
          'div',
          { class: 'dbg-monster-group' },
          h('b', null, entryName({ kind: 'monsterGroup', typeId }, s)),
          current ? h('p', { class: 'dbg-intent' }, `${t('debug.intent')}: ${current}`) : null,
          intents.length ? h('p', { class: 'dbg-intent' }, `${t('debug.intents')}:`, h('br'), intents.map((x) => [x, h('br')])) : null,
          h(
            'ul',
            { class: 'dbg-list' },
            list
              .sort((a, b) => a.number - b.number)
              .map((m) => h('li', null, `${figureName(m.id, s)} — ${m.hp}/${m.maxHp} (${m.hex.join(',')})`, statusLine(s, m))),
          ),
        );
      }),
      summons.map((f) => h('p', null, `${figureName(f.id, s)} — ${f.hp}/${f.maxHp}`, statusLine(s, f))),
      groups.size === 0 && summons.length === 0 ? h('p', { class: 'dbg-quiet' }, t('debug.noMonsters')) : null],
    );
  }

  function behaviourLine(s: GameState, typeId: string, cardId: string): string {
    const content = (session as Session).content;
    const deckId = content.monsters[typeId]?.deck ?? content.bosses[typeId]?.deck;
    const card =
      (deckId ? content.decks[deckId]?.cards.find((c) => c.id === cardId) : undefined) ??
      content.monsters[typeId]?.forkCards?.find((c) => c.id === cardId);
    if (!card) return cardId;
    const offset = content.monsters[typeId]?.initiativeOffset ?? 0;
    const relative = !content.bosses[typeId];
    const steps = card.steps.map((st) => stepText(st, s.variants.orbs, relative)).join('; ');
    const alt = card.otherwise ? ` | ${t('debug.otherwise')}: ${card.otherwise.map((st) => stepText(st, s.variants.orbs, relative)).join('; ')}` : '';
    const cond = card.if ? `${t(`debug.if.${card.if}`)}: ` : '';
    return `${card.initiative + offset}${card.shuffle ? ' ⟳' : ''} — ${cond}${steps}${alt}`;
  }

  // ─── Right panel: decision, actions, log ─────────────────────────────────

  function rightPanel(s: GameState): HTMLElement {
    const collapse = h(
      'button',
      { class: 'dbg-btn dbg-collapse', 'aria-expanded': String(!ui.collapsed.right), onclick: () => ((ui.collapsed.right = !ui.collapsed.right), render()) },
      icon(ui.collapsed.right ? 'left' : 'right', { title: false }),
    );
    if (ui.collapsed.right) return h('aside', { class: 'dbg-right is-collapsed', id: 'dbg-right' }, collapse);
    return h(
      'aside',
      { class: 'dbg-right', id: 'dbg-right' },
      h('div', { class: 'dbg-panel-head' }, h('span', null, t('debug.actions')), h('span', { class: 'dbg-grow' }), collapse),
      h('div', { class: 'dbg-actions' }, prompt(s), ui.notice ? h('p', { class: ui.noticeOk ? 'dbg-ok' : 'dbg-error' }, ui.notice) : null, actionsFor(s), genericActions(s)),
      logBox(s),
    );
  }

  function prompt(s: GameState): HTMLElement {
    const p = s.pending;
    if (s.phase === 'won') return h('p', { class: 'dbg-prompt is-win' }, t('ui.victory'));
    if (s.phase === 'lost') return h('p', { class: 'dbg-prompt is-loss' }, t('ui.defeat'));
    if (!p) return h('p', { class: 'dbg-prompt' }, t('debug.pending.none'));
    const name = 'heroId' in p ? figureName(p.heroId) : ui.heroId ? figureName(ui.heroId) : '';
    let text = t(`debug.pending.${p.kind}`, { name });
    if (p.kind === 'stepChoice') text += `: ${stepText(p.step, s.variants.orbs)}`;
    if (p.kind === 'avoidDamage') text = t('debug.pending.avoidDamage', { name, amount: p.amount, source: p.source.includes(':') ? figureName(p.source, s) : t(`debug.source.${p.source}`) });
    if (p.kind === 'shortRestReroll') text = t('debug.pending.shortRestReroll', { name, card: cardName(p.lostCard) });
    return h('p', { class: 'dbg-prompt' }, text);
  }

  function btn(label: string, action: Action | null, extra: { primary?: boolean; title?: string } = {}): HTMLElement {
    return h(
      'button',
      {
        class: `dbg-btn${extra.primary ? ' dbg-primary' : ''}`,
        disabled: !action,
        title: extra.title,
        onclick: () => action && act(action),
      },
      rich(label),
    );
  }


  function actionsFor(s: GameState): (HTMLElement | null)[] {
    const p = s.pending;
    if (!p || !session) return [];
    const heroId = ui.heroId ?? '';
    switch (p.kind) {
      case 'chooseHandBeforeScenario': {
        const quick = legalOf('chooseHand').find((a) => a.heroId === heroId);
        const custom: Action = { type: 'chooseHand', heroId, cards: [...ui.pick] };
        return [
          h('p', { class: 'dbg-quiet' }, t('debug.chooseHand.hint')),
          h('div', { class: 'dbg-row' }, btn(t('debug.chooseHand.confirm'), ui.pick.length ? custom : null, { primary: true }), btn(t('debug.chooseHand.first'), quick ?? null)),
        ];
      }
      case 'selectCards': {
        if (!p.heroIds.includes(heroId)) return [h('p', { class: 'dbg-quiet' }, t('debug.pickHeroTab'))];
        const [a, b] = ui.pick;
        // The engine lists each pair once, in hand order; match the picked pair as a set.
        const action =
          legalOf('selectCards').find((x) => x.heroId === heroId && x.leading === ui.leading && ui.pick.length === 2 && x.cards.every((c) => ui.pick.includes(c))) ?? null;
        const rest = legalOf('declareLongRest').find((x) => x.heroId === heroId) ?? null;
        return [
          h('p', { class: 'dbg-quiet' }, t('debug.selectCards.hint')),
          forecast(s, heroId),
          h(
            'div',
            { class: 'dbg-row' },
            btn(a && b && ui.leading ? t('debug.selectCards.confirm', { leading: cardName(ui.leading) }) : t('ui.selectCards'), action, { primary: true }),
            btn(t('ui.longRest'), rest),
          ),
        ];
      }
      case 'heroTurn': {
        const hero = s.figures[p.heroId] as HeroState;
        const starts = legalOf('startHalf').filter((x) => x.heroId === hero.id);
        const out: (HTMLElement | null)[] = [];
        if (hero.selection?.kind === 'cards') {
          for (const cardId of hero.selection.cards) {
            const card = findHeroCard(session.content, hero.classId, cardId);
            const view = card ? cardForVariants(card, s.variants) : null;
            const played = !starts.some((x) => x.cardId === cardId);
            const find = (half: 'top' | 'bottom', basic: boolean) => starts.find((x) => x.cardId === cardId && x.half === half && !!x.basic === basic) ?? null;
            out.push(
              h(
                'div',
                { class: `dbg-card is-static${played ? ' is-used' : ''}` },
                h('span', { class: 'dbg-card-head' }, h('b', null, cardName(cardId)), view ? h('span', { class: 'dbg-ini-badge' }, view.initiative) : null),
                view ? h('span', { class: 'dbg-card-half' }, h('i', null, icon('up', { title: false }), ' '), halfText(view.top, s.variants.orbs)) : null,
                view ? h('span', { class: 'dbg-card-half' }, h('i', null, icon('down', { title: false }), ' '), halfText(view.bottom, s.variants.orbs)) : null,
                h('div', { class: 'dbg-row' }, btn(t('ui.playTop'), find('top', false), { primary: true }), btn(t('ui.playBottom'), find('bottom', false), { primary: true })),
                h('div', { class: 'dbg-row' }, btn(t('ui.basicAttack'), find('top', true)), btn(t('ui.basicMove'), find('bottom', true))),
              ),
            );
          }
        }
        out.push(h('div', { class: 'dbg-row' }, btn(t('ui.endTurn'), legalOf('endTurn')[0] ?? null)));
        return out;
      }
      case 'stepChoice':
        return stepActions(s);
      case 'avoidDamage': {
        const list = legalOf('avoidDamage');
        return [
          h(
            'div',
            { class: 'dbg-col' },
            list.map((a) =>
              btn(
                a.choice.kind === 'take'
                  ? t('ui.takeDamage')
                  : a.choice.kind === 'loseHand'
                    ? t('debug.avoid.loseHand', { card: cardName(a.choice.cardId) })
                    : t('debug.avoid.loseDiscard', { cards: a.choice.cardIds.map(cardName).join(', ') }),
                a,
                { primary: a.choice.kind === 'take' },
              ),
            ),
          ),
        ];
      }
      case 'endOfRound': {
        const list = legalOf('shortRest');
        return p.heroIds.map((id) =>
          h(
            'div',
            { class: 'dbg-row' },
            h('span', { class: 'dbg-grow' }, figureName(id)),
            btn(t('debug.shortRest.yes'), list.find((a) => a.heroId === id && a.rest) ?? null, { primary: true }),
            btn(t('debug.shortRest.no'), list.find((a) => a.heroId === id && !a.rest) ?? null),
          ),
        );
      }
      case 'shortRestReroll': {
        const list = legalOf('shortRestReroll');
        return [h('div', { class: 'dbg-row' }, btn(t('debug.reroll.keep'), list.find((a) => !a.reroll) ?? null, { primary: true }), btn(t('debug.reroll.reroll'), list.find((a) => a.reroll) ?? null))];
      }
      case 'longRestLoss':
        return [h('div', { class: 'dbg-col' }, legalOf('longRestLoss').map((a) => btn(t('debug.loseCard', { card: cardName(a.cardId) }), a)))];
      case 'fadeOut':
        // Тінерук «Згасання» (engine choice added with scenarios 2–5); labels are the action names.
        return [h('div', { class: 'dbg-row' }, legalOf('fadeOut').map((a) => btn(a.choice, a)))];
      default:
        // Reaction windows (e.g. `beforeAttacked`) and later pending kinds: offer whatever the engine lists.
        return [h('div', { class: 'dbg-col' }, legal().map((o) => btn(o.action.type, o.action)))];
    }
  }

  /** Fork «Прогноз раунду»: where the hero would stand with the chosen leading card. */
  function forecast(s: GameState, heroId: string): HTMLElement | null {
    if (!s.variants.roundForecast || !ui.leading || !session) return null;
    const f = forecastQuery(s, session.content, heroId, ui.leading);
    if (!f) return null;
    return h(
      'div',
      { class: 'dbg-forecast' },
      h('b', null, `${t('variant.roundForecast')}: ${t('debug.forecastPlace', { n: f.position + 1, initiative: f.initiative })}`),
      h(
        'div',
        { class: 'dbg-order is-wrap' },
        f.order.map((e) =>
          h(
            'span',
            { class: `dbg-ini${e.kind === 'hero' && e.self ? ' is-current' : ''}` },
            h('b', null, e.initiative),
            ' ',
            e.kind === 'hero' ? figureName(e.figureId, s) : entryName({ kind: 'monsterGroup', typeId: e.typeId }, s),
          ),
        ),
      ),
      f.monsters
        .filter((m) => m.intents === null)
        .map((m) => h('p', { class: 'dbg-quiet' }, t('debug.forecastUnknown', { name: entryName({ kind: 'monsterGroup', typeId: m.typeId }, s) }))),
    );
  }

  function stepActions(s: GameState): (HTMLElement | null)[] {
    if (!stepInfo) return [];
    const m = stepInfo.model;
    const out: (HTMLElement | null)[] = [];
    const resolve = (c: StepChoice) => act({ type: 'resolveStep', choice: c });
    const hint = {
      path: t('debug.step.tapMove'),
      targets: m.maxTargets > 1 ? t('debug.step.tapTargets', { n: m.maxTargets }) : t('ui.chooseTarget'),
      area: t('debug.step.tapArea'),
      hex: t('ui.chooseHex'),
      plain: '',
    }[m.mode];
    if (m.choices.length === 0) out.push(h('p', { class: 'dbg-quiet' }, t('ui.noTarget')));
    else if (hint) out.push(h('p', { class: 'dbg-quiet' }, hint));
    if (m.consumeToggle) {
      out.push(
        h(
          'label',
          { class: 'dbg-check' },
          h('input', { type: 'checkbox', checked: ui.sel.consume, onchange: () => ((ui.sel = { ...emptySelection(), consume: !ui.sel.consume }), render()) }),
          h('span', null, t('ui.useConsume')),
        ),
      );
    }
    if (m.elementKeys.length > 0 && m.mode !== 'plain') {
      out.push(
        h(
          'div',
          { class: 'dbg-row' },
          m.elementKeys.map((k) =>
            h(
              'button',
              { class: 'dbg-btn dbg-small', 'aria-pressed': String(k === m.elementKey), onclick: () => ((ui.sel = { ...ui.sel, elementKey: k }), render()) },
              k.split('+').map((e) => elementName(e, s.variants.orbs)).join(' + '),
            ),
          ),
        ),
      );
    }
    if (m.mode === 'targets') {
      // Same choices as tapping the tokens on the board.
      const attack = stepInfo.step.type === 'attack' && s.half ? s.half.heroId : null;
      const label = (id: string) => {
        const f = s.figures[id];
        const p = attack && session ? queries.previewAttack(s, attack, id, session.content) : null;
        return rich(`${figureName(id, s)}${f ? ` (${f.hp}/${f.maxHp})` : ''}${p ? ` {icon:attack}${p.damage}` : ''}`);
      };
      out.push(
        h(
          'div',
          { class: 'dbg-row' },
          m.targetIds.map((id) => {
            if (m.maxTargets <= 1) {
              const c = m.choices.find((x) => x.targets?.length === 1 && x.targets[0] === id);
              return h('button', { class: 'dbg-btn dbg-primary', disabled: !c, onclick: () => c && resolve(c) }, label(id));
            }
            const on = ui.sel.targets.includes(id);
            return h(
              'button',
              {
                class: 'dbg-btn',
                'aria-pressed': String(on),
                onclick: () => ((ui.sel = { ...ui.sel, targets: on ? ui.sel.targets.filter((x) => x !== id) : [...ui.sel.targets, id] }), render()),
              },
              label(id),
            );
          }),
        ),
      );
    }
    if (m.mode === 'targets' && stepInfo.step.type === 'attack' && s.half && session && s.variants.itemPrompts) {
      const heroId = s.half.heroId;
      const legalUse = legal().map((o) => o.action as { type: string; heroId?: string; itemId?: string });
      const seen = new Set<string>();
      for (const id of m.targetIds) {
        for (const pr of attackPrompts(s, session.content, heroId, id)) {
          if (seen.has(pr.itemId)) continue;
          seen.add(pr.itemId);
          const action = legalUse.find((a) => a.type === 'useItem' && a.heroId === heroId && a.itemId === pr.itemId) as Action | undefined;
          out.push(btn(t('debug.itemPrompt', { item: t(pr.nameKey), value: pr.value, boosted: pr.boosted }), action ?? null, { primary: true }));
        }
      }
    }
    if (m.mode === 'targets' && m.maxTargets > 1) {
      out.push(
        h('p', null, ui.sel.targets.length ? ui.sel.targets.map((id) => figureName(id, s)).join(', ') : '—'),
        h('div', { class: 'dbg-row' }, btn(t('ui.confirm'), m.ready ? { type: 'resolveStep', choice: m.ready } : null, { primary: true })),
      );
    }
    if (m.mode === 'area' && m.directions.length > 0) {
      out.push(
        h(
          'div',
          { class: 'dbg-row' },
          m.directions.map((d) =>
            h('button', { class: 'dbg-btn', 'aria-pressed': String(ui.sel.direction === d), onclick: () => ((ui.sel = { ...ui.sel, direction: d }), render()) }, areaArrow(s, stepInfo, ui.sel.hex, d)),
          ),
        ),
      );
      out.push(h('div', { class: 'dbg-row' }, btn(t('ui.confirm'), m.ready ? { type: 'resolveStep', choice: m.ready } : null, { primary: true })));
    }
    if (m.mode === 'plain') {
      out.push(h('div', { class: 'dbg-col' }, m.choices.map((c) => h('button', { class: 'dbg-btn dbg-primary', onclick: () => resolve(c) }, rich(choiceText(c, s, s.variants.orbs))))));
    }
    out.push(h('div', { class: 'dbg-row' }, btn(t('ui.skip'), legalOf('skipStep')[0] ?? null)));
    const all = legalOf('resolveStep');
    if (all.length > 1) {
      out.push(
        h(
          'details',
          { class: 'dbg-all' },
          h('summary', null, t('debug.allChoices', { n: all.length })),
          h('div', { class: 'dbg-col' }, all.map((a) => h('button', { class: 'dbg-btn dbg-small', onclick: () => resolve(a.choice) }, rich(choiceText(a.choice, s, s.variants.orbs))))),
        ),
      );
    }
    return out;
  }

  /** Undo, surge, revive and anything else the engine offers that has no dedicated control. */
  function genericActions(s: GameState): HTMLElement | null {
    const handled = new Set(['useItem', 'chooseHand', 'selectCards', 'declareLongRest', 'startHalf', 'endTurn', 'resolveStep', 'skipStep', 'avoidDamage', 'shortRest', 'shortRestReroll', 'longRestLoss']);
    const rest = legal()
      .map((o) => o.action)
      .filter((a) => !handled.has(a.type));
    if (rest.length === 0) return null;
    return h(
      'div',
      { class: 'dbg-row dbg-extra' },
      rest.map((a) => btn(actionText(a, s), a, { primary: a.type === 'surge' || a.type === 'reviveAlly' })),
    );
  }

  function logBox(s: GameState): HTMLElement {
    const entries = [...(session as Session).log].reverse();
    return h(
      'div',
      { class: 'dbg-logbox' },
      h(
        'div',
        { class: 'dbg-panel-head' },
        h('span', null, t('ui.log')),
        h('span', { class: 'dbg-grow' }),
        h('button', { class: 'dbg-btn dbg-small', onclick: copyLog }, t('debug.copyLog')),
      ),
      h(
        'div',
        { class: 'dbg-log', id: 'dbg-log' },
        entries.map((e) => {
          const action = e.action >= 0 ? (session as Session).actions[e.action] : null;
          const lines = e.events.map((ev) => eventText(ev, e.state)).filter((x): x is string => !!x);
          return h(
            'div',
            { class: 'dbg-log-entry' },
            h('div', { class: 'dbg-log-head' }, action ? rich(`#${e.action + 1} ${actionLabel(action, e.state, e.actorId)}`) : t('debug.setupDone')),
            lines.map((l) => h('div', null, rich(l))),
          );
        }),
      ),
      h('p', { class: 'dbg-quiet' }, t('debug.seedLine', { seed: (session as Session).setup.seed, round: s.round })),
    );
  }

  function actionLabel(a: Action, s: GameState, actorId: string | null): string {
    const heroId = 'heroId' in a ? a.heroId : actorId;
    const who = heroId ? `${figureName(heroId)}: ` : '';
    switch (a.type) {
      case 'selectCards':
        return `${who}${a.cards.map(cardName).join(' + ')} (${cardName(a.leading)})`;
      case 'startHalf':
        return `${who}${cardName(a.cardId)} — ${a.basic ? t(a.half === 'top' ? 'ui.basicAttack' : 'ui.basicMove') : t(a.half === 'top' ? 'ui.playTop' : 'ui.playBottom')}`;
      case 'shortRest':
        return `${who}${t(a.rest ? 'debug.shortRest.yes' : 'debug.shortRest.no')}`;
      case 'longRestLoss':
        return `${who}${t('debug.loseCard', { card: cardName(a.cardId) })}`;
      case 'avoidDamage':
        return (
          who +
          (a.choice.kind === 'take'
            ? t('ui.takeDamage')
            : a.choice.kind === 'loseHand'
              ? t('debug.avoid.loseHand', { card: cardName(a.choice.cardId) })
              : t('debug.avoid.loseDiscard', { cards: a.choice.cardIds.map(cardName).join(', ') }))
        );
      case 'shortRestReroll':
        return `${who}${t(a.reroll ? 'debug.reroll.reroll' : 'debug.reroll.keep')}`;
      default:
        return who + actionText(a, s);
    }
  }

  async function copyLog(): Promise<void> {
    if (!session) return;
    const text = session.exportJson();
    try {
      await navigator.clipboard.writeText(text);
      ui.notice = t('debug.copied');
      ui.noticeOk = true;
      render();
    } catch {
      ui.copyText = text;
      ui.modal = 'copy';
      render();
    }
  }

  function copyModal(): HTMLElement {
    const area = h('textarea', { rows: 14, readonly: true, value: ui.copyText });
    queueMicrotask(() => area.select());
    return h(
      'div',
      { class: 'dbg-modal' },
      h(
        'div',
        { class: 'dbg-modal-box' },
        h('p', null, t('debug.copyManual')),
        area,
        h('div', { class: 'dbg-row dbg-row-end' }, h('button', { class: 'dbg-btn dbg-primary', onclick: () => ((ui.modal = null), render()) }, t('ui.confirm'))),
      ),
    );
  }

  render();
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function pendingHeroes(p: Pending | null): string[] {
  if (!p) return [];
  if ('heroIds' in p) return p.heroIds;
  if ('heroId' in p) return [p.heroId];
  return [];
}

function heroList(s: GameState): HeroState[] {
  return Object.values(s.figures).filter((f): f is HeroState => f.kind === 'hero');
}

/** Open/closed state of collapsible sections, kept across re-renders. */
const openState = new Map<string, boolean>();

function section(key: string, title: string, body: Parameters<typeof h>[2], collapsed = false): HTMLElement {
  const el = h('details', { class: 'dbg-section', open: openState.get(key) ?? !collapsed }, h('summary', null, title), body);
  el.addEventListener('toggle', () => openState.set(key, el.open));
  return el;
}

function stat(label: string, value: string | number): HTMLElement {
  return h('span', { class: 'dbg-stat' }, h('small', null, label), h('b', null, value));
}

/** Arrow pointing from the performer (or the anchor) to the middle of the area for rotation `d`. */
function areaArrow(s: GameState, info: { step: { type: string } } | null, anchor: Hex | null, d: number): SVGSVGElement {
  const step = info?.step as { type: string; area?: AreaShape; consume?: { area?: AreaShape } } | undefined;
  const area = step?.area ?? step?.consume?.area;
  const actor = s.half ? s.figures[s.half.heroId] : undefined;
  if (!area || !actor) return directionArrow(DIRECTIONS[((d % 6) + 6) % 6] as Hex);
  const from = isFromSelf(area) ? actor.hex : (anchor ?? actor.hex);
  const hexes = areaHexes(area, actor.hex, from, d);
  let x = 0;
  let z = 0;
  for (const [q, r] of hexes) {
    const w = hexToWorld(q - from[0], r - from[1]);
    x += w.x;
    z += w.z;
  }
  return directionArrow(null, x, z);
}

function directionArrow(dir: Hex | null, wx = 0, wz = 0): SVGSVGElement {
  const { x, z } = dir ? hexToWorld(dir[0], dir[1]) : { x: wx, z: wz };
  const angle = Math.atan2(z, x); // screen: +x right, +z down
  const i = Math.round(((angle + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
  const arrow = icon('arrow', { title: false });
  arrow.style.transform = `rotate(${i * 45}deg)`;
  return arrow;
}

