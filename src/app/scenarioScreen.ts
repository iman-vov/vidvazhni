// The scenario screen: the board fills the screen, the initiative bar sits on top, heroes on the
// left, elements/orbs and the log on the right, the hand or the turn controls at the bottom.
// Hot seat: before a hero's private choice (hand before the scenario, cards each round) a curtain
// asks to pass the tablet; nobody sees another player's hand. Every control answers with an
// engine action through the GameController; the board plays the events and the UI waits for it.

import { planTurn } from '../rules/ai/index';
import type { Step } from '../rules/content';
import type { Ctx } from '../rules/effects/context';
import { withConsumeBonus } from '../rules/effects/index';
import { hexKey, type Hex } from '../rules/hex';
import { attackPrompts, forecastInitiative, orbBonusPreview, previewAttack, usableItems } from '../rules/queries';
import { behaviourCard, monsterInitiative } from '../rules/round';
import type { Action, CardId, FigureId, GameEvent, GameState, HeroState, MonsterState, StepChoice } from '../rules/state';
import { figureSteps } from '../rules/turn';
import type { BoardHighlights, BoardView } from '../render/view';
import { stepText } from '../ui/debug/format';
import { emptySelection, stepModel, tapStep, type StepModel, type StepSelection } from '../ui/debug/stepPicker';
import { h } from '../ui/dom';
import { onLangChange, t } from '../ui/i18n';
import { cardKeywords, cardView, compactCard, type Half } from '../ui/game/card';
import { eventLine, ruleHints, type RuleHint } from '../ui/game/events';
import { icon, type IconName } from '../ui/game/icons';
import { rich } from '../ui/icons';
import { isIconName } from '../ui/icons/names';
import { elementsRow, heroPanel, initiativeBar, intentIcon, intentIcons, portrait, statusRow } from '../ui/game/panels';
import { onPress } from '../ui/game/press';
import { cardName, elementName, figureName, modifierLabel, monsterTypeName, playedCard, stepLine } from '../ui/game/text';
import { heroColor } from './boardViewStub';
import { INTENTS, toggleIntent, type GameController, type IntentId } from './game';
import { settings } from './settings';
import { artButton } from './screens/menu';
import { settingsPanel } from './screens/settings';

export interface ScenarioScreenOptions {
  overlay: HTMLElement;
  game: GameController;
  board: BoardView;
  /** Back to the main menu (the game stays saved). */
  onExit: () => void;
  /** The scenario is won or lost and every animation has played. */
  onEnd: () => void;
}

interface Toast {
  id: number;
  title: string;
  text: string;
  kind: 'hint' | 'turn' | 'info' | 'error';
}

interface ModifierShow {
  label: string;
  attacker: string;
  target: string;
  base: number;
  damage: number;
  shield: number;
  drawn: string[];
}

interface Ui {
  /** Hero whose private hand is shown now (card selection / hand choice); null = curtain. */
  revealed: FigureId | null;
  lastPlayer: string | null;
  pick: CardId[];
  leading: CardId | null;
  longRest: boolean;
  intents: IntentId[];
  intentsOpen: boolean;
  handPick: CardId[];
  pressCard: CardId | null;
  enlarged: { heroId: FigureId; cardId: CardId } | null;
  sel: StepSelection;
  /** A tapped choice waiting for a confirming second tap or the confirm button. */
  chosen: StepChoice | null;
  confirmEnd: boolean;
  avoidPick: CardId[];
  leftOpen: boolean;
  /** The event log drawer under the elements row. */
  rightOpen: boolean;
  focusHero: FigureId | null;
  modal: 'menu' | 'settings' | 'intro' | 'monster' | 'revive' | 'item' | null;
  itemInfo: { heroId: FigureId; itemId: string } | null;
  monsterInfo: string | null;
  busy: boolean;
  modifier: ModifierShow | null;
  toasts: Toast[];
  log: string[];
}

const TOAST_MS = 6000;
const MODIFIER_MS = 1100;
const LOG_LINES = 60;

export function mountScenario(o: ScenarioScreenOptions): () => void {
  const { game, board, overlay } = o;
  const content = game.content;
  const narrow = window.innerWidth < 900;
  const ui: Ui = {
    revealed: null,
    lastPlayer: null,
    pick: [],
    leading: null,
    longRest: false,
    intents: [],
    intentsOpen: false,
    handPick: [],
    pressCard: null,
    enlarged: null,
    sel: emptySelection(),
    chosen: null,
    confirmEnd: false,
    avoidPick: [],
    leftOpen: !narrow,
    rightOpen: false,
    focusHero: null,
    modal: game.actions.length === 0 ? 'intro' : null,
    monsterInfo: null,
    itemInfo: null,
    busy: false,
    modifier: null,
    toasts: [],
    log: [],
  };
  let toastId = 0;
  let seenState: GameState | null = null;
  let skipModifiers = false;
  let stepInfo: { model: StepModel; step: Step; heroId: FigureId } | null = null;
  let focusCache: { state: GameState; value: Record<string, FigureId[]> | null } | null = null;
  let disposed = false;
  let lastFigureTap: { id: FigureId; at: number } | null = null;

  const root = h('div', { class: 'gscreen' });
  const top = h('div', { class: 'gtop' });
  const left = h('div', { class: 'gleft-wrap' });
  const right = h('div', { class: 'gright-wrap' });
  const bottom = h('div', { class: 'gbottom' });
  const layer = h('div', { class: 'glayer' });
  root.append(top, left, right, bottom, layer);
  overlay.replaceChildren(root);
  document.body.classList.add('game');

  for (const e of game.state.log.slice(-8)) pushLog(e, game.state);

  // ─── Board input ─────────────────────────────────────────────────────────

  const unsubs: (() => void)[] = [];
  unsubs.push(
    board.onHexTap((hex) => {
      if (ui.busy || !stepInfo || ui.modal) return;
      const m = stepInfo.model;
      if (m.mode === 'targets') {
        // A tap near a target's feet may reach the board as a hex only.
        const f = Object.values(game.state.figures).find((x) => hexKey(x.hex) === hexKey(hex) && m.targetIds.includes(x.id));
        if (f && !(lastFigureTap?.id === f.id && Date.now() - lastFigureTap.at < 400)) figureTapped(f.id);
        return;
      }
      if (m.mode === 'plain') return;
      const r = tapStep(game.state, m, ui.sel, hex);
      if (m.mode === 'area') {
        if (r.sel) {
          ui.sel = r.sel;
          render();
        }
        return;
      }
      if (r.apply) {
        if (ui.chosen && sameChoice(ui.chosen, r.apply)) resolve(r.apply);
        else {
          ui.chosen = r.apply;
          render();
        }
      } else if (ui.chosen) {
        ui.chosen = null;
        render();
      }
    }),
  );
  unsubs.push(
    board.onFigureTap((id) => {
      lastFigureTap = { id, at: Date.now() };
      figureTapped(id);
    }),
  );

  function figureTapped(id: FigureId): void {
    if (ui.busy || ui.modal) return;
    const m = stepInfo?.model;
    if (!m || m.mode !== 'targets') {
      const f = game.state.figures[id];
      if (f?.kind === 'hero') {
        ui.focusHero = id;
        ui.leftOpen = true;
        render();
      }
      return;
    }
    if (!m.targetIds.includes(id)) return;
    if (m.maxTargets <= 1) {
      const c = m.choices.find((x) => x.targets?.length === 1 && x.targets[0] === id);
      if (!c) return;
      if (ui.chosen && sameChoice(ui.chosen, c)) resolve(c);
      else {
        ui.chosen = c;
        ui.sel = { ...ui.sel, targets: [id] };
        render();
      }
      return;
    }
    const targets = ui.sel.targets.includes(id) ? ui.sel.targets.filter((x) => x !== id) : [...ui.sel.targets, id];
    ui.sel = { ...ui.sel, targets };
    render();
  }

  unsubs.push(
    board.onFigureHold((id) => {
      const f = game.state.figures[id];
      if (f?.kind === 'monster') openMonster(f.typeId);
      else if (f?.kind === 'hero') {
        ui.focusHero = id;
        ui.leftOpen = true;
        render();
      }
    }),
  );
  unsubs.push(onLangChange(render));

  // ─── Actions ─────────────────────────────────────────────────────────────

  function act(action: Action, keepSelection = false): boolean {
    if (ui.busy) return false;
    const actor = actorOf(game.state, action);
    const r = game.act(action);
    if (!r.ok) {
      toast(t('game.rejected'), r.error ?? '', 'error');
      render();
      return false;
    }
    if (!keepSelection) {
      ui.sel = emptySelection();
      ui.chosen = null;
    }
    ui.confirmEnd = false;
    void playEvents(r.events, actor);
    return true;
  }

  function resolve(choice: StepChoice): void {
    act({ type: 'resolveStep', choice });
  }

  async function playEvents(events: GameEvent[], actor: FigureId | null): Promise<void> {
    const s = game.state;
    for (const e of events) pushLog(e, s);
    const heroAttacks = events.filter((e): e is Extract<GameEvent, { type: 'attacked' }> => e.type === 'attacked' && isHeroSide(s, e.attackerId));
    const visible = events.some((e) => e.type !== 'cardMoved' && e.type !== 'xpGained' && e.type !== 'undone');
    if (visible) {
      ui.busy = true;
      skipModifiers = false;
      render();
      await Promise.all([board.play(events, s, content), showModifiers(heroAttacks)]);
      if (disposed) return;
      ui.busy = false;
    } else {
      board.sync(s, content);
    }
    afterEvents(events, actor);
    if (game.over) {
      o.onEnd();
      return;
    }
    render();
  }

  async function showModifiers(list: Extract<GameEvent, { type: 'attacked' }>[]): Promise<void> {
    for (const e of list) {
      if (skipModifiers || disposed) break;
      ui.modifier = {
        label: modifierLabel(e.chosen),
        attacker: figureName(e.attackerId, game.state),
        target: figureName(e.targetId, game.state),
        base: e.base,
        damage: e.damage,
        shield: e.shield,
        drawn: e.modifiers.map(modifierLabel),
      };
      renderLayer();
      await sleep(MODIFIER_MS, () => skipModifiers);
    }
    ui.modifier = null;
    renderLayer();
  }

  function afterEvents(events: GameEvent[], actor: FigureId | null): void {
    const s = game.state;
    // Hint level 1: rules met for the first time, for the hero who acted or is asked next.
    const viewer = actor ?? game.pendingHeroes()[0] ?? null;
    if (viewer && hintLevel(viewer) >= 1) for (const hint of ruleHints(events)) showHint(hint);
    const next = game.pendingHeroes()[0];
    if (next && hintLevel(next) >= 1) {
      const kind = s.pending?.kind;
      if (kind === 'avoidDamage') showHint({ key: 'avoidDamage', title: t('ui.avoidDamage'), text: t('game.hint.avoidDamage') });
      if (kind === 'endOfRound') showHint({ key: 'shortRest', title: t('ui.shortRest'), text: t('game.hint.shortRest') });
      if (kind === 'longRestLoss') showHint({ key: 'longRest', title: t('ui.longRest'), text: t('game.hint.longRest') });
    }
    const started = [...events].reverse().find((e) => e.type === 'turnStarted' && s.figures[e.figureId]?.kind === 'hero');
    if (started && started.type === 'turnStarted' && game.pendingHeroes().includes(started.figureId)) {
      const who = figureName(started.figureId);
      const player = game.playerOf(started.figureId)?.name;
      toast(t('game.turnOf', { name: who }), player ?? '', 'turn');
      ui.focusHero = started.figureId;
    }
    for (const e of events) {
      if (e.type === 'attacked' && e.shield > 0) toast(t('game.ev.shieldBlocked', { name: figureName(e.targetId, s), shield: e.shield }), '', 'info');
      if (e.type === 'retaliated') toast(t('game.ev.retaliated', { name: figureName(e.figureId, s), target: figureName(e.targetId, s), damage: e.damage }), '', 'info');
      if (e.type === 'roomRevealed') toast(t('log.roomRevealed', { name: t(`room.${e.roomId}`) }), '', 'info');
      if (e.type === 'heroExhausted') toast(t('log.exhausted', { name: figureName(e.heroId) }), '', 'info');
    }
  }

  function showHint(hint: RuleHint): void {
    if (game.markHint(hint.key)) toast(hint.title, hint.text, 'hint');
  }

  function toast(title: string, text: string, kind: Toast['kind']): void {
    const id = ++toastId;
    ui.toasts = [...ui.toasts.filter((x) => !(kind === 'turn' && x.kind === 'turn')), { id, title, text, kind }].slice(-3);
    renderLayer();
    setTimeout(() => {
      ui.toasts = ui.toasts.filter((x) => x.id !== id);
      if (!disposed) renderLayer();
    }, kind === 'hint' ? TOAST_MS * 2 : TOAST_MS);
  }

  function explain(title: string, text: string): void {
    toast(title, text, 'hint');
  }

  function pushLog(e: GameEvent, s: GameState): void {
    const line = eventLine(e, s);
    if (line) ui.log = [...ui.log, line].slice(-LOG_LINES);
  }

  // ─── Derived state ───────────────────────────────────────────────────────

  function hintLevel(heroId: FigureId): number {
    const f = game.state.figures[heroId];
    return f?.kind === 'hero' ? settings.hintLevel(f.classId) : 0;
  }

  function colorOf(heroId: FigureId): string {
    const ids = game.heroes().map((x) => x.id);
    return heroColor(Math.max(0, ids.indexOf(heroId)));
  }

  function playerName(heroId: FigureId): string {
    return game.playerOf(heroId)?.name ?? '';
  }

  /** The hero who must make a private choice now (hand or cards), if any. */
  function privateHero(): FigureId | null {
    const p = game.state.pending;
    if (p?.kind === 'selectCards' || p?.kind === 'chooseHandBeforeScenario') return p.heroIds[0] ?? null;
    return null;
  }

  /** The hero whose turn it is (heroTurn / stepChoice). */
  function turnHero(): HeroState | null {
    const p = game.state.pending;
    if (p?.kind !== 'heroTurn' && p?.kind !== 'stepChoice') return null;
    const f = game.state.figures[p.heroId];
    return f?.kind === 'hero' ? f : null;
  }

  function sync(): void {
    const s = game.state;
    if (seenState === s) return;
    seenState = s;
    const next = privateHero();
    if (next !== ui.revealed) {
      ui.pick = [];
      ui.leading = null;
      ui.longRest = false;
      ui.intents = game.intentsOf(next ?? '');
      ui.handPick = [];
      ui.pressCard = null;
      ui.enlarged = null;
      // Two heroes of one player: no curtain between them.
      const player = next ? game.playerOf(next)?.id : null;
      ui.revealed = next && player && player === ui.lastPlayer && ui.revealed !== null ? next : null;
      if (next && s.pending?.kind === 'chooseHandBeforeScenario') {
        const hero = s.figures[next] as HeroState;
        const cls = content.heroes[hero.classId];
        ui.handPick = cls ? cls.cards.filter((c) => c.level <= Math.max(1, hero.level)).slice(0, cls.handSize).map((c) => c.id) : [];
      }
    }
    if (s.pending?.kind !== 'avoidDamage') ui.avoidPick = [];
    const th = turnHero();
    if (th) ui.focusHero = th.id;
  }

  function monsterFocus(): Record<string, FigureId[]> | null {
    const s = game.state;
    if (focusCache?.state === s) return focusCache.value;
    let value: Record<string, FigureId[]> | null = null;
    const viewer = turnHero()?.id ?? null;
    if (s.phase === 'turns' && viewer && hintLevel(viewer) >= 2) {
      value = {};
      const ctx: Ctx = { s, c: content, ev: [], out: [] };
      const acted = new Set(s.turnOrder.slice(0, s.turnIndex + 1).map((e) => (e.kind === 'monsterGroup' ? e.typeId : e.figureId)));
      for (const f of Object.values(s.figures)) {
        if (f.kind !== 'monster' || acted.has(f.typeId)) continue;
        try {
          const plan = planTurn(s, f.id, figureSteps(ctx, f));
          if (plan.focusId) value[f.typeId] = [...(value[f.typeId] ?? []), plan.focusId];
        } catch {
          // a monster the planner cannot read: no arrow
        }
      }
    }
    focusCache = { state: s, value };
    return value;
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  function render(): void {
    if (disposed) return;
    sync();
    const s = game.state;
    stepInfo = null;
    if (s.pending?.kind === 'stepChoice' && !ui.busy) {
      const choices = game.legalOf('resolveStep').map((a) => a.choice);
      let model = stepModel(s, s.pending.step, choices, ui.sel);
      // An area anchor starts with its first rotation, so it can be confirmed at once.
      if (model.mode === 'area' && ui.sel.hex && ui.sel.direction === null && model.directions.length) {
        ui.sel = { ...ui.sel, direction: model.directions[0] ?? null };
        model = stepModel(s, s.pending.step, choices, ui.sel);
      }
      stepInfo = { step: s.pending.step, heroId: s.pending.heroId, model };
    }
    document.body.classList.toggle('g-left-closed', !ui.leftOpen);
    renderTop();
    renderLeft();
    renderRight();
    renderBottom();
    renderLayer();
    updateBoard();
  }

  function renderTop(): void {
    const s = game.state;
    const hero = ui.revealed;
    const fcCard = ui.pressCard ?? ui.leading;
    const forecast = hero && fcCard && s.pending?.kind === 'selectCards' && !ui.longRest ? forecastInitiative(s, content, hero, fcCard) : null;
    top.replaceChildren(
      h('div', { class: 'gplate gtop-name' }, icon('light'), h('b', null, t(`scenario.${s.scenarioId}`))),
      h(
        'div',
        { class: 'gplate gtop-ribbon' },
        initiativeBar({
          s,
          content,
          colorOf,
          intentsOf: (id) => game.intentsOf(id),
          forecast,
          monsterFocus: monsterFocus(),
          onMonster: openMonster,
        }),
      ),
      h('div', { class: 'gplate gtop-round' }, h('b', null, t('ui.round', { round: s.round })), h('small', null, t(`game.phase.${phaseKey(s)}`))),
      h(
        'div',
        { class: 'gtop-tools' },
        h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('ui.log'), 'aria-expanded': String(ui.rightOpen), title: t('ui.log'), onclick: () => ((ui.rightOpen = !ui.rightOpen), renderRight()) }, icon('discard')),
        h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('game.menu'), onclick: () => ((ui.modal = 'menu'), render()) }, icon('menu')),
      ),
    );
  }

  function renderLeft(): void {
    const s = game.state;
    left.replaceChildren(
      heroPanel({
        s,
        content,
        open: ui.leftOpen,
        focusId: ui.focusHero ?? game.heroes()[0]?.id ?? null,
        colorOf,
        playerName,
        intentsOf: (id) => game.intentsOf(id),
        items: itemButtons,
        explain,
        onToggle: () => ((ui.leftOpen = !ui.leftOpen), render()),
        onFocus: (id) => ((ui.focusHero = id), render()),
      }),
    );
  }

  function itemButtons(heroId: FigureId): { id: string; state: string; usable: boolean; onOpen: () => void }[] {
    const s = game.state;
    const hero = s.figures[heroId] as HeroState;
    const items = hero.items ?? [];
    if (items.length === 0) return [];
    const mine = turnHero()?.id === heroId && !ui.busy;
    const usable = new Set(mine ? usableItems(s, content, heroId).map((i) => i.itemId) : []);
    return items.map((it) => ({ id: it.id, state: it.state, usable: usable.has(it.id), onOpen: () => openItem(heroId, it.id) }));
  }

  function openItem(heroId: FigureId, itemId: string): void {
    ui.itemInfo = { heroId, itemId };
    ui.modal = 'item';
    render();
  }

  function renderRight(): void {
    const s = game.state;
    const log = ui.rightOpen
      ? h(
          'div',
          { class: 'glog', 'aria-label': t('ui.log') },
          h('div', { class: 'glog-head' }, h('b', null, t('ui.log')), h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('ui.cancel'), onclick: () => ((ui.rightOpen = false), renderRight()) }, icon('close'))),
          [...ui.log].reverse().slice(0, 40).map((l) => h('div', null, rich(l))),
        )
      : null;
    right.replaceChildren(elementsRow({ s, explain }), ...(log ? [log] : []));
  }

  // ─── Bottom: hand, turn controls, prompts ────────────────────────────────

  function renderBottom(): void {
    const s = game.state;
    const p = s.pending;
    let body: HTMLElement | null = null;
    let size = 'none';
    if (ui.busy) {
      // Same height as before, so the board does not refit in the middle of an animation.
      body = h('div', { class: 'gbar is-busy' }, h('span', null, t('game.playing')), h('button', { class: 'gbtn', onclick: skipAnimations }, icon('skip'), t('game.skip')));
      size = ['tall', 'short', 'none'].find((k) => document.body.classList.contains(`g-bottom-${k}`)) ?? 'short';
    } else if (p?.kind === 'chooseHandBeforeScenario' && ui.revealed) {
      body = chooseHandPanel(ui.revealed);
      size = 'tall';
    } else if (p?.kind === 'selectCards' && ui.revealed) {
      body = selectPanel(ui.revealed);
      size = 'tall';
    } else if (p?.kind === 'heroTurn' || p?.kind === 'stepChoice') {
      body = turnPanel(s.figures[p.heroId] as HeroState);
      size = 'tall';
    } else if (p?.kind === 'avoidDamage') {
      body = avoidPanel();
      size = 'short';
    } else if (p?.kind === 'endOfRound') {
      body = shortRestPanel();
      size = 'short';
    } else if (p?.kind === 'shortRestReroll') {
      body = rerollPanel();
      size = 'short';
    } else if (p?.kind === 'longRestLoss') {
      body = longRestPanel();
      size = 'tall';
    }
    for (const k of ['tall', 'short', 'none']) document.body.classList.toggle(`g-bottom-${k}`, size === k);
    bottom.replaceChildren(...(body ? [body] : []));
  }

  function skipAnimations(): void {
    skipModifiers = true;
    board.skip();
  }

  /** Card selection for one hero: the hand strip, intent tokens, long rest, confirm. */
  /** Card selection for one hero: the hand as a grid of compact cards (name, initiative, both
   *  halves as icons); a tap opens the full card, the corner button selects; the intent tokens on
   *  top; who chooses, long rest and «Готово» on the right. */
  function selectPanel(heroId: FigureId): HTMLElement {
    const s = game.state;
    const hero = s.figures[heroId] as HeroState;
    const bonuses = orbBonusPreview(s, content, heroId);
    const grid = h(
      'div',
      { class: 'gcc-grid', role: 'list' },
      hero.hand.map((cardId) => {
        const picked = ui.pick.includes(cardId) && !ui.longRest;
        const el = compactCard({
          s,
          content,
          hero,
          cardId,
          accent: colorOf(heroId),
          picked,
          leading: picked && ui.leading === cardId,
          bonus: bonuses.some((b) => b.cardId === cardId && b.available && b.value !== b.boosted),
          onToggle: () => togglePick(cardId),
        });
        el.setAttribute('role', 'listitem');
        onPress(el, {
          tap: () => openCard(heroId, cardId),
          down: () => {
            ui.pressCard = cardId;
            renderTop();
          },
          up: () => {
            ui.pressCard = null;
            renderTop();
          },
          hold: () => openCard(heroId, cardId),
        });
        return el;
      }),
    );
    const [a, b] = ui.pick;
    const ready = ui.longRest || (a && b && ui.leading);
    const leadCard = ui.leading ? playedCard(content, hero.classId, ui.leading, s.variants) : undefined;
    const canRest = hero.discard.length >= 2;
    const info = h(
      'div',
      { class: 'gselect-info' },
      h('b', null, figureName(heroId)),
      h('small', null, playerName(heroId)),
      h('span', { class: 'gside-hint' }, ui.longRest ? t('game.longRest.text') : ui.pick.length < 2 ? t('game.select.hint2', { n: 2 - ui.pick.length }) : t('game.select.leading', { card: cardName(ui.leading ?? ''), initiative: leadCard?.initiative ?? '' })),
      // Phones: the intent tokens open from a button instead of taking a row.
      h(
        'button',
        { class: 'gbtn gintent-toggle', 'aria-expanded': String(ui.intentsOpen), onclick: () => ((ui.intentsOpen = !ui.intentsOpen), renderBottom()) },
        ui.intents.length ? ui.intents.map((i) => icon(intentIcon(i))) : icon('approach'),
        t('game.intents.short'),
      ),
    );
    const rest = artButton('rest', t('ui.longRest'), () => ((ui.longRest = !ui.longRest), render()), { cls: `gb-right gb-upper${ui.longRest ? ' is-on' : ''}`, disabled: !canRest });
    rest.setAttribute('aria-pressed', String(ui.longRest));
    if (!canRest) rest.title = t('game.longRest.no');
    return h('div', { class: 'gpanel-select is-grid' }, intentsRow(), grid, info, rest, artButton('check', t('game.ready'), () => confirmSelection(heroId), { cls: 'gb-right is-go', disabled: !ready }));
  }

  function openCard(heroId: FigureId, cardId: CardId): void {
    ui.enlarged = { heroId, cardId };
    renderLayer();
  }

  function intentsRow(): HTMLElement {
    return h(
      'div',
      { class: `gintent-row${ui.intentsOpen ? ' is-open' : ''}`, role: 'group', 'aria-label': t('game.intents') },
      h('small', null, t('game.intents')),
      INTENTS.map((id) =>
        h(
          'button',
          { class: 'gbtn gbtn-chip', 'aria-pressed': String(ui.intents.includes(id)), onclick: () => ((ui.intents = toggleIntent(ui.intents, id)), renderBottom()) },
          icon(intentIcon(id)),
          t(`game.intent.${id}`),
        ),
      ),
    );
  }

  function togglePick(cardId: CardId): void {
    ui.longRest = false;
    if (ui.pick.includes(cardId)) {
      ui.pick = ui.pick.filter((c) => c !== cardId);
      if (ui.leading === cardId) ui.leading = ui.pick[0] ?? null;
    } else if (ui.pick.length < 2) {
      ui.pick = [...ui.pick, cardId];
      ui.leading ??= cardId;
    } else {
      // Third tap replaces the non-leading card.
      ui.pick = [ui.leading ?? (ui.pick[0] as CardId), cardId];
    }
    render();
  }

  function confirmSelection(heroId: FigureId): void {
    const [a, b] = ui.pick;
    const action: Action | null = ui.longRest ? { type: 'declareLongRest', heroId } : a && b && ui.leading ? { type: 'selectCards', heroId, cards: [a, b], leading: ui.leading } : null;
    if (!action) return;
    game.setIntents(heroId, ui.intents);
    actPrivate(heroId, action);
  }

  /** A private choice: remembers whose it was before the screen re-renders, so the next hero of
   *  the same player needs no curtain and anyone else gets one. */
  function actPrivate(heroId: FigureId, action: Action): void {
    const before = ui.lastPlayer;
    ui.lastPlayer = game.playerOf(heroId)?.id ?? null;
    if (!act(action)) ui.lastPlayer = before;
  }

  function chooseHandPanel(heroId: FigureId): HTMLElement {
    const s = game.state;
    const hero = s.figures[heroId] as HeroState;
    const cls = content.heroes[hero.classId];
    const all = cls ? cls.cards.filter((c) => c.level <= Math.max(1, hero.level)).map((c) => c.id) : [];
    const need = cls?.handSize ?? 0;
    const grid = h(
      'div',
      { class: 'gcc-grid', role: 'list' },
      all.map((cardId) => {
        const el = compactCard({ s, content, hero, cardId, accent: colorOf(heroId), picked: ui.handPick.includes(cardId), onToggle: () => toggleHandPick(cardId, need) });
        onPress(el, { tap: () => openCard(heroId, cardId), hold: () => openCard(heroId, cardId) });
        return el;
      }),
    );
    const info = h('div', { class: 'gselect-info' }, h('b', null, figureName(heroId)), h('small', null, playerName(heroId)), h('span', { class: 'gside-hint' }, t('game.chooseHand', { n: need, picked: ui.handPick.length })));
    return h(
      'div',
      { class: 'gpanel-select is-grid is-hand' },
      grid,
      info,
      artButton('check', t('game.ready'), () => actPrivate(heroId, { type: 'chooseHand', heroId, cards: [...ui.handPick] }), { cls: 'gb-right is-go', disabled: ui.handPick.length !== need }),
    );
  }

  function toggleHandPick(cardId: CardId, need: number): void {
    ui.handPick = ui.handPick.includes(cardId) ? ui.handPick.filter((c) => c !== cardId) : ui.handPick.length < need ? [...ui.handPick, cardId] : ui.handPick;
    render();
  }

  /** The hero's turn: only the two chosen cards, big and upright, each half a button; the step
   *  controls on the left, Порив / revive / items on the right, «Скасувати» bottom left and
   *  «Завершити хід» bottom right. */
  function turnPanel(hero: HeroState): HTMLElement {
    const s = game.state;
    const p = s.pending;
    const starts = p?.kind === 'heroTurn' ? game.legalOf('startHalf').filter((x) => x.heroId === hero.id) : [];
    const cards = hero.selection?.kind === 'cards' ? hero.selection.cards : [];
    const bonuses = orbBonusPreview(s, content, hero.id);
    const cardEls = cards.map((cardId) => {
      const played = hero.playedThisTurn.filter((x) => x.cardId === cardId).map((x) => x.half);
      const usedCard = played.length > 0 || (s.half?.cardId === cardId && s.half.heroId === hero.id);
      const find = (half: Half, basic: boolean) => starts.find((x) => x.cardId === cardId && x.half === half && !!x.basic === basic);
      const playable = (['top', 'bottom'] as const).filter((x) => find(x, false));
      const basicTop = find('top', true);
      const basicBottom = find('bottom', true);
      const inProgress = s.half && s.half.cardId === cardId ? [s.half.half] : [];
      const el = cardView({
        s,
        content,
        hero,
        cardId,
        accent: colorOf(hero.id),
        full: true,
        bonuses: bonuses.filter((b) => b.cardId === cardId),
        playedHalves: [...played, ...inProgress],
        playable,
        onHalf: (half) => {
          const a = find(half, false);
          if (a) act(a);
        },
        footer:
          basicTop || basicBottom
            ? h(
                'div',
                { class: 'gcard-basic' },
                h('button', { class: 'gbtn gbtn-small', disabled: !basicTop, onclick: () => basicTop && act(basicTop) }, icon('attack'), t('game.basicAttack')),
                h('button', { class: 'gbtn gbtn-small', disabled: !basicBottom, onclick: () => basicBottom && act(basicBottom) }, icon('move'), t('game.basicMove')),
              )
            : null,
      });
      if (usedCard && playable.length === 0 && !basicTop && !basicBottom) el.classList.add('is-used');
      onPress(el, {
        hold: () => {
          ui.enlarged = { heroId: hero.id, cardId };
          renderLayer();
        },
      });
      return el;
    });
    const leftBox = h('div', { class: 'gturn-box gturn-left' }, h('div', { class: 'gside-who' }, h('b', null, figureName(hero.id)), h('small', null, playerName(hero.id))));
    if (p?.kind === 'stepChoice') leftBox.append(...stepControls(hero));
    else leftBox.append(turnHint(hero));
    const extras = extraControls(hero);
    const undo = artButton('undo', t('game.undo'), () => act({ type: 'undo' }), { cls: 'gb-left is-stop', disabled: !game.canUndo() });
    return h(
      'div',
      { class: 'gpanel-turn' },
      h('div', { class: 'gturn-cards' }, cardEls),
      leftBox,
      extras.length ? h('div', { class: 'gturn-box gturn-right' }, extras) : null,
      undo,
      endTurnButton(hero),
    );
  }

  function turnHint(hero: HeroState): HTMLElement {
    const halvesLeft = 2 - hero.playedThisTurn.length;
    return h('p', { class: 'gside-hint' }, halvesLeft === 2 ? t('game.turn.hint') : halvesLeft === 1 ? t('game.turn.hintOne') : t('game.turn.hintDone'));
  }

  /** «Завершити хід», asking once more while halves are left unplayed. */
  function endTurnButton(hero: HeroState): HTMLElement {
    const end = game.state.pending?.kind === 'heroTurn' ? game.legalOf('endTurn').find((a) => a.heroId === hero.id) : undefined;
    const halvesLeft = 2 - hero.playedThisTurn.length;
    const careful = halvesLeft > 0 && !ui.confirmEnd;
    return artButton(
      'check',
      ui.confirmEnd ? t('game.endTurn.sure') : t('ui.endTurn'),
      () => {
        if (!end) return;
        if (careful) {
          ui.confirmEnd = true;
          renderBottom();
        } else act(end);
      },
      { cls: `gb-right is-go${halvesLeft === 0 ? ' is-ready' : ''}`, disabled: !end },
    );
  }

  /** Порив, revive, advice and the item prompts («Кинджал: Атака 3 → 4?»). */
  function extraControls(hero: HeroState): HTMLElement[] {
    const s = game.state;
    const out: HTMLElement[] = [];
    const surge = game.legalOf('surge').find((a) => a.heroId === hero.id);
    if (surge) out.push(h('button', { class: 'gbtn gbtn-glow', onclick: () => act(surge) }, icon('momentum'), t('ui.useSurge')));
    const revive = game.legalOf('reviveAlly').filter((a) => a.heroId === hero.id);
    if (revive.length) out.push(h('button', { class: 'gbtn gbtn-glow', onclick: () => ((ui.modal = 'revive'), render()) }, icon('revive'), t('ui.revive')));
    const info = stepInfo;
    // Fork «Предмети-кнопки»: items worth using on this attack or move.
    if (s.variants.itemPrompts && info && s.pending?.kind === 'stepChoice') {
      const m = info.model;
      const legalUse = game.legalOf('useItem').filter((a) => a.heroId === hero.id);
      if (m.mode === 'targets' && info.step.type === 'attack') {
        const target = ui.sel.targets[0] ?? m.targetIds[0];
        if (target) {
          for (const pr of attackPrompts(s, content, hero.id, target)) {
            const a = legalUse.find((x) => x.itemId === pr.itemId);
            if (a) out.push(h('button', { class: 'gbtn gbtn-glow', onclick: () => act(a, true) }, icon('item'), rich(t('game.itemPrompt', { item: t(pr.nameKey), value: pr.value, boosted: pr.boosted }))));
          }
        }
      } else if (m.mode === 'path') {
        for (const it of usableItems(s, content, hero.id, 'move')) {
          const a = legalUse.find((x) => x.itemId === it.itemId);
          if (a) out.push(h('button', { class: 'gbtn gbtn-glow', onclick: () => act(a, true) }, icon('item'), t('game.itemUse', { item: t(it.nameKey) })));
        }
      }
    }
    if (hintLevel(hero.id) >= 3) out.push(h('button', { class: 'gbtn', onclick: () => toast(t('game.advice'), t('game.advice.soon'), 'hint') }, icon('hint'), t('game.advice')));
    return out;
  }

  function stepControls(_hero: HeroState): HTMLElement[] {
    const s = game.state;
    const info = stepInfo;
    const out: HTMLElement[] = [];
    if (!info) return out;
    const m = info.model;
    out.push(h('div', { class: 'gstep-now' }, icon(stepIconOf(info.step)), h('b', null, stepLine(info.step, s.variants.orbs))));
    const hint = { path: t('game.step.move'), targets: m.maxTargets > 1 ? t('game.step.targets', { n: m.maxTargets }) : t('game.step.target'), area: t('game.step.area'), hex: t('ui.chooseHex'), plain: '' }[m.mode];
    if (m.choices.length === 0) out.push(h('p', { class: 'gside-hint' }, t('ui.noTarget')));
    else if (hint) out.push(h('p', { class: 'gside-hint' }, ui.chosen ? t('game.step.again') : hint));
    if (m.consumeToggle) {
      out.push(
        h(
          'button',
          { class: `gbtn gbtn-toggle${ui.sel.consume ? ' gbtn-glow' : ''}`, 'aria-pressed': String(ui.sel.consume), onclick: () => ((ui.sel = { ...emptySelection(), consume: !ui.sel.consume }), (ui.chosen = null), render()) },
          icon(info.step.consume?.element && info.step.consume.element !== 'any' ? info.step.consume.element : 'any'),
          t('ui.useConsume'),
        ),
      );
    }
    if (m.elementKeys.length > 0 && m.mode !== 'plain') {
      out.push(
        h(
          'div',
          { class: 'grow' },
          m.elementKeys.map((k) =>
            h(
              'button',
              { class: 'gbtn gbtn-chip', 'aria-pressed': String(k === m.elementKey), onclick: () => ((ui.sel = { ...ui.sel, elementKey: k }), (ui.chosen = null), render()) },
              k.split('+').map((e) => (isIconName(e) ? icon(e) : null)),
              k.split('+').map((e) => elementName(e as never, s.variants.orbs)).join(' + '),
            ),
          ),
        ),
      );
    }
    if (m.mode === 'area' && m.directions.length > 1) {
      const cur = ui.sel.direction ?? m.directions[0] ?? 0;
      const next = m.directions[(m.directions.indexOf(cur) + 1) % m.directions.length] ?? cur;
      out.push(h('button', { class: 'gbtn', onclick: () => ((ui.sel = { ...ui.sel, direction: next }), render()) }, icon('rotate'), t('game.rotate')));
    }
    if (m.mode === 'plain') {
      for (const c of m.choices) out.push(h('button', { class: 'gbtn gbtn-primary', onclick: () => resolve(c) }, plainChoiceLabel(c)));
    }
    const ready = m.mode === 'targets' && m.maxTargets > 1 ? m.ready : m.mode === 'area' ? m.ready : ui.chosen;
    if (m.mode !== 'plain') {
      const label = info.step.type === 'attack' ? t('game.confirm.attack') : info.step.type === 'move' ? t('game.confirm.move') : t('ui.confirm');
      out.push(h('button', { class: 'gbtn gbtn-primary', disabled: !ready, onclick: () => ready && resolve(ready) }, icon('check'), label));
    }
    const skip = game.legalOf('skipStep')[0];
    if (skip) out.push(h('button', { class: 'gbtn', onclick: () => act(skip) }, icon('skip'), t('ui.skip')));
    return out;
  }

  function plainChoiceLabel(c: StepChoice): (Element | string)[] {
    const orbs = game.state.variants.orbs;
    if (c.element) return [icon(c.element), elementName(c.element, orbs)];
    if (c.elements) return c.elements.flatMap((e, i) => (i ? [icon('arrow'), elementName(e, orbs)] : [elementName(e, orbs)]));
    return [icon('check'), c.consume ? t('game.doWithConsume') : t('game.do')];
  }

  function avoidPanel(): HTMLElement {
    const s = game.state;
    const p = s.pending;
    if (p?.kind !== 'avoidDamage') return h('div');
    const hero = s.figures[p.heroId] as HeroState;
    const source = p.source.includes(':') ? figureName(p.source, s) : t(`game.source.${p.source}`);
    const take: Action = { type: 'avoidDamage', heroId: hero.id, choice: { kind: 'take' } };
    const canDiscard = hero.discard.length >= 2;
    const [d1, d2] = ui.avoidPick;
    return h(
      'div',
      { class: 'gsheet' },
      h('p', { class: 'gsheet-title' }, icon('hp'), t('game.avoid.title', { name: figureName(hero.id), amount: p.amount, source })),
      h('p', { class: 'gside-hint' }, t('game.avoid.text', { hp: hero.hp })),
      defenceLine(hero),
      h('div', { class: 'grow' }, h('button', { class: 'gbtn gbtn-primary', onclick: () => act(take) }, t('ui.takeDamage'))),
      hero.hand.length
        ? h('div', { class: 'grow' }, h('small', null, t('game.avoid.hand')), hero.hand.map((c) => h('button', { class: 'gbtn gbtn-small', onclick: () => act({ type: 'avoidDamage', heroId: hero.id, choice: { kind: 'loseHand', cardId: c } }) }, icon('loss'), cardName(c))))
        : null,
      canDiscard
        ? h(
            'div',
            { class: 'grow' },
            h('small', null, t('game.avoid.discard')),
            hero.discard.map((c) =>
              h(
                'button',
                {
                  class: 'gbtn gbtn-small gbtn-toggle',
                  'aria-pressed': String(ui.avoidPick.includes(c)),
                  onclick: () => ((ui.avoidPick = ui.avoidPick.includes(c) ? ui.avoidPick.filter((x) => x !== c) : [...ui.avoidPick, c].slice(-2)), renderBottom()),
                },
                cardName(c),
              ),
            ),
            h('button', { class: 'gbtn', disabled: !(d1 && d2), onclick: () => d1 && d2 && act({ type: 'avoidDamage', heroId: hero.id, choice: { kind: 'loseDiscard', cardIds: [d1, d2] } }) }, icon('loss'), t('game.avoid.loseTwo')),
          )
        : null,
    );
  }

  /** In the damage prompt: the hero's shield already counted, and defensive items (the engine lets
   *  items be used on the hero's own turn only, so they are shown, not offered). */
  function defenceLine(hero: HeroState): HTMLElement | null {
    const shield = hero.shields.reduce((n, x) => n + x.value, 0);
    const defensive = (hero.items ?? []).filter((it) => {
      const def = content.items[it.id];
      return it.state === 'ready' && def && def.use !== 'passive' && def.effect.some((st) => st.type === 'shield' || st.type === 'heal' || (st.type === 'special' && st.name === 'nextAttackAgainstSelfDisadvantage'));
    });
    if (!shield && defensive.length === 0) return null;
    return h(
      'div',
      { class: 'grow gdefence' },
      shield ? h('span', { class: 'gcond is-good' }, icon('shield'), t('game.avoid.shield', { shield })) : null,
      defensive.map((it) => h('button', { class: 'gbtn gbtn-small', onclick: () => openItem(hero.id, it.id) }, icon('item'), t(`item.${it.id}`))),
      defensive.length ? h('small', null, t('game.item.ownTurn')) : null,
    );
  }

  function shortRestPanel(): HTMLElement {
    const s = game.state;
    const p = s.pending;
    if (p?.kind !== 'endOfRound') return h('div');
    return h(
      'div',
      { class: 'gsheet' },
      h('p', { class: 'gsheet-title' }, icon('rest'), t('game.shortRest.title', { round: s.round })),
      h('p', { class: 'gside-hint' }, t('game.shortRest.text')),
      p.heroIds.map((id) => {
        const hero = s.figures[id] as HeroState;
        return h(
          'div',
          { class: 'grow gsheet-row' },
          h('span', { class: 'gsheet-who' }, h('b', null, figureName(id)), h('small', null, t('game.shortRest.cards', { hand: hero.hand.length, discard: hero.discard.length }))),
          h('button', { class: 'gbtn gbtn-primary', onclick: () => act({ type: 'shortRest', heroId: id, rest: true }) }, icon('rest'), t('game.shortRest.yes')),
          h('button', { class: 'gbtn', onclick: () => act({ type: 'shortRest', heroId: id, rest: false }) }, t('game.shortRest.no')),
        );
      }),
    );
  }

  function rerollPanel(): HTMLElement {
    const p = game.state.pending;
    if (p?.kind !== 'shortRestReroll') return h('div');
    return h(
      'div',
      { class: 'gsheet' },
      h('p', { class: 'gsheet-title' }, icon('loss'), t('game.reroll.title', { name: figureName(p.heroId), card: cardName(p.lostCard) })),
      h('p', { class: 'gside-hint' }, t('game.reroll.text')),
      h(
        'div',
        { class: 'grow' },
        h('button', { class: 'gbtn gbtn-primary', onclick: () => act({ type: 'shortRestReroll', heroId: p.heroId, reroll: false }) }, t('game.reroll.keep')),
        h('button', { class: 'gbtn', onclick: () => act({ type: 'shortRestReroll', heroId: p.heroId, reroll: true }) }, icon('hp'), t('game.reroll.reroll')),
      ),
    );
  }

  function longRestPanel(): HTMLElement {
    const s = game.state;
    const p = s.pending;
    if (p?.kind !== 'longRestLoss') return h('div');
    const hero = s.figures[p.heroId] as HeroState;
    const strip = h(
      'div',
      { class: 'ghand' },
      hero.discard.map((cardId) => {
        const el = cardView({ s, content, hero, cardId });
        onPress(el, {
          tap: () => act({ type: 'longRestLoss', heroId: hero.id, cardId }),
          hold: () => {
            ui.enlarged = { heroId: hero.id, cardId };
            renderLayer();
          },
        });
        return el;
      }),
    );
    return h(
      'div',
      { class: 'gpanel-select' },
      h('div', { class: 'gpanel-row' }, strip, h('div', { class: 'gside' }, h('b', null, figureName(hero.id)), h('p', { class: 'gside-hint' }, t('game.longRest.pick')))),
    );
  }

  // ─── Layer: curtain, modals, modifier card, toasts ───────────────────────

  function renderLayer(): void {
    if (disposed) return;
    const s = game.state;
    const parts: HTMLElement[] = [];
    const next = privateHero();
    if (next && !ui.revealed && !ui.busy && ui.modal !== 'intro') parts.push(curtain(next));
    if (ui.modal === 'intro') parts.push(introModal());
    if (ui.modal === 'menu') parts.push(menuModal());
    if (ui.modal === 'settings') parts.push(modalBox(t('ui.settings'), settingsPanel({ heroes: game.heroes().map((x) => x.classId), onQuality: (q) => board.setQuality(q), onSpeed: (n) => board.setSpeed?.(n) }), () => ((ui.modal = 'menu'), render())));
    if (ui.modal === 'monster' && ui.monsterInfo) parts.push(monsterModal(ui.monsterInfo));
    if (ui.modal === 'revive') parts.push(reviveModal());
    if (ui.enlarged) {
      const hero = s.figures[ui.enlarged.heroId] as HeroState | undefined;
      if (hero) parts.push(cardDetail(hero, ui.enlarged.cardId));
    }
    if (ui.modal === 'item' && ui.itemInfo) parts.push(itemModal(ui.itemInfo.heroId, ui.itemInfo.itemId));
    if (ui.modifier) {
      const m = ui.modifier;
      parts.push(
        h(
          'div',
          { class: 'gmodifier', onclick: () => (skipModifiers = true) },
          h('div', { class: `gmod-card${m.label === '×2' ? ' is-crit' : ''}${m.label === t('game.modifier.miss') ? ' is-miss' : ''}` }, m.label),
          m.drawn.length > 1 ? h('small', null, t('game.modifier.drawn', { cards: m.drawn.join(' / ') })) : null,
          h('p', null, rich(t('game.modifier.line', { attacker: m.attacker, target: m.target, base: m.base, damage: m.damage }))),
          m.shield ? h('small', null, t('game.modifier.shield', { shield: m.shield })) : null,
        ),
      );
    }
    if (ui.toasts.length) {
      parts.push(
        h(
          'div',
          { class: 'gtoasts' },
          ui.toasts.map((x) =>
            h(
              'div',
              { class: `gtoast is-${x.kind}`, onclick: () => ((ui.toasts = ui.toasts.filter((y) => y.id !== x.id)), renderLayer()) },
              x.kind === 'hint' ? icon('hint') : null,
              h('div', null, h('b', null, x.title), x.text ? h('p', null, x.text) : null),
            ),
          ),
        ),
      );
    }
    layer.replaceChildren(...parts);
  }

  /** The full card: both halves in words, the orb/element bonus, explanations of its keywords, and
   *  (while choosing) select / make leading. */
  function cardDetail(hero: HeroState, cardId: CardId): HTMLElement {
    const s = game.state;
    const close = () => ((ui.enlarged = null), renderLayer());
    const big = cardView({ s, content, hero, cardId, big: true, full: true, accent: colorOf(hero.id), bonuses: orbBonusPreview(s, content, hero.id).filter((b) => b.cardId === cardId) });
    const words = cardKeywords(s, content, hero, cardId);
    const actions: HTMLElement[] = [];
    const p = s.pending;
    if (p?.kind === 'selectCards' && ui.revealed === hero.id) {
      const picked = ui.pick.includes(cardId) && !ui.longRest;
      actions.push(
        h('button', { class: `gbtn${picked ? '' : ' gbtn-primary'}`, onclick: () => (togglePick(cardId), close()) }, icon(picked ? 'close' : 'check'), picked ? t('game.card.unpick') : t('game.card.pick')),
      );
      if (picked && ui.leading !== cardId) actions.push(h('button', { class: 'gbtn', onclick: () => ((ui.leading = cardId), close(), render()) }, icon('initiative'), t('game.makeLeading')));
      if (picked && ui.leading === cardId) actions.push(h('span', { class: 'gtag' }, t('game.leading')));
      const fc = forecastInitiative(s, content, hero.id, cardId);
      if (fc) actions.push(h('p', { class: 'gside-hint' }, icon('initiative'), t('game.forecast', { n: fc.position + 1 })));
    } else if (p?.kind === 'chooseHandBeforeScenario' && ui.revealed === hero.id) {
      const need = content.heroes[hero.classId]?.handSize ?? 0;
      const picked = ui.handPick.includes(cardId);
      actions.push(h('button', { class: `gbtn${picked ? '' : ' gbtn-primary'}`, onclick: () => (toggleHandPick(cardId, need), close()) }, icon(picked ? 'close' : 'check'), picked ? t('game.card.unpick') : t('game.card.pick')));
    }
    actions.push(h('button', { class: 'gbtn', onclick: close }, t('game.close')));
    return h(
      'div',
      { class: 'gmodal is-card', onclick: (e: Event) => e.target === e.currentTarget && close() },
      h(
        'div',
        { class: 'gdetail' },
        big,
        h(
          'div',
          { class: 'gdetail-side' },
          words.length ? h('div', { class: 'gdetail-words' }, words.map((w) => h('p', null, h('b', null, w.title), ' — ', w.text))) : null,
          h('div', { class: 'gcol' }, actions),
        ),
      ),
    );
  }

  /** An item: what it does, its slot, how it is spent, its state and whether it can be used now. */
  function itemModal(heroId: FigureId, itemId: string): HTMLElement {
    const s = game.state;
    const def = content.items[itemId];
    const hero = s.figures[heroId] as HeroState | undefined;
    const it = hero?.items?.find((x) => x.id === itemId);
    const close = () => ((ui.modal = null), (ui.itemInfo = null), render());
    const effect = def ? (s.variants.orbs && def.forkEffect ? def.forkEffect : def.effect) : [];
    const use = game.legalOf('useItem').find((a) => a.heroId === heroId && a.itemId === itemId);
    const why = !it || it.state !== 'ready' ? t(`game.itemState.${it?.state ?? 'lost'}`) : def?.use === 'passive' ? t('use.passive') : turnHero()?.id !== heroId ? t('game.item.ownTurn') : t('game.item.notNow');
    return modalBox(
      t(`item.${itemId}`),
      [
        h('p', { class: 'gitem-effect' }, icon('item'), effect.map((st) => stepLine(st, s.variants.orbs)).join('; ')),
        def ? h('p', { class: 'gside-hint' }, `${t('game.item.slot')}: ${t(`slot.${def.slot}`)} · ${t(`use.${def.use}`)} · ${t(`game.item.use.${def.use}`)}`) : null,
        h('p', null, h('b', null, t('game.item.state')), ' ', t(`game.itemState.${it?.state ?? 'ready'}`)),
        use
          ? h('button', { class: 'gbtn gbtn-primary', onclick: () => ((ui.modal = null), (ui.itemInfo = null), act(use, true)) }, icon('item'), t('game.itemUse', { item: t(`item.${itemId}`) }))
          : h('p', { class: 'gside-hint' }, why),
      ],
      close,
    );
  }

  function curtain(heroId: FigureId): HTMLElement {
    const s = game.state;
    const player = game.playerOf(heroId);
    const chosen = game.heroes().filter((x) => x.selection !== null && s.pending?.kind === 'selectCards');
    const what = s.pending?.kind === 'chooseHandBeforeScenario' ? t('game.curtain.hand') : t('game.curtain.cards');
    return h(
      'button',
      { class: 'gcurtain', onclick: () => ((ui.revealed = heroId), render()) },
      h('div', { class: 'gcurtain-box' }, portrait(heroId, colorOf(heroId), 'lg'), h('small', null, t('game.curtain.pass')), h('div', { class: 'gcurtain-name', style: { color: colorOf(heroId) } }, player?.name || figureName(heroId)), player?.name ? h('div', { class: 'gcurtain-hero' }, figureName(heroId)) : null, h('p', null, what), h('div', { class: 'gcurtain-tap' }, t('game.curtain.tap'))),
      chosen.length
        ? h(
            'div',
            { class: 'gcurtain-intents' },
            chosen.map((x) => h('div', null, h('b', null, figureName(x.id)), ' ', intentIcons(game.intentsOf(x.id)) ?? h('small', null, t('game.intent.none')), ' ', game.intentsOf(x.id).map((i) => t(`game.intent.${i}`)).join(', '))),
          )
        : null,
    );
  }

  function modalBox(title: string, body: HTMLElement | (HTMLElement | null)[], onClose: () => void): HTMLElement {
    return h(
      'div',
      { class: 'gmodal', role: 'dialog', 'aria-label': title },
      h('div', { class: 'gmodal-box' }, h('div', { class: 'gmodal-head' }, h('h2', null, title), h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('ui.cancel'), onclick: onClose }, icon('close'))), body),
    );
  }

  function introModal(): HTMLElement {
    const s = game.state;
    const sc = content.scenarios[s.scenarioId];
    return modalBox(
      `${sc?.number ?? ''}. ${t(`scenario.${s.scenarioId}`)}`,
      [
        h('p', { class: 'gintro' }, t(`scenario.${s.scenarioId}.intro`)),
        h('p', null, h('b', null, t('game.goal')), ' ', t(`scenario.${s.scenarioId}.goal`)),
        sc?.introduces.length ? h('p', { class: 'gside-hint' }, t('game.introduces'), ' ', sc.introduces.map((i) => t(`introduces.${i}`)).join(', ')) : null,
        h('div', { class: 'grow gend' }, h('button', { class: 'gbtn gbtn-primary', onclick: () => ((ui.modal = null), render()) }, t('game.begin'))),
      ],
      () => ((ui.modal = null), render()),
    );
  }

  function menuModal(): HTMLElement {
    return modalBox(
      t('game.menu'),
      h(
        'div',
        { class: 'gcol' },
        artButton('play', t('game.resume'), () => ((ui.modal = null), render())),
        artButton('gear', t('ui.settings'), () => ((ui.modal = 'settings'), render())),
        artButton('map', t('ui.scenario'), () => ((ui.modal = 'intro'), render())),
        h('button', { class: 'gbtn', onclick: () => void copyLog() }, t('game.copyLog')),
        artButton(null, t('game.toMenu'), () => o.onExit()),
      ),
      () => ((ui.modal = null), render()),
    );
  }

  async function copyLog(): Promise<void> {
    try {
      await navigator.clipboard.writeText(game.exportJson());
      toast(t('game.copied'), '', 'info');
    } catch {
      toast(t('game.copyFailed'), '', 'error');
    }
  }

  function openMonster(typeId: string): void {
    ui.monsterInfo = typeId;
    ui.modal = 'monster';
    render();
  }

  function monsterModal(typeId: string): HTMLElement {
    const s = game.state;
    const m = content.monsters[typeId];
    const ctx = { s, c: content };
    const deck = s.behaviourDecks[typeId];
    const cards = deck?.current ? [deck.current] : s.variants.threeIntents ? (deck?.intents ?? []) : [];
    const relative = !content.bosses[typeId];
    const figures = Object.values(s.figures).filter((f): f is MonsterState => f.kind === 'monster' && f.typeId === typeId);
    const stats = (rank: 'normal' | 'elite'): HTMLElement | null => {
      const st = m?.[rank];
      if (!st) return null;
      return h(
        'div',
        { class: 'gmstats' },
        h('b', null, t(`rank.${rank}`)),
        ` ${t('stat.hp')} ${st.hp} · ${t('stat.move')} ${st.move} · ${t('stat.attack')} ${st.attack}`,
        st.range ? ` · ${t('stat.range')} ${st.range}` : '',
        st.shield ? ` · ${t('stat.shield')} ${st.shield}` : '',
      );
    };
    return modalBox(
      monsterTypeName(typeId),
      [
        stats('normal'),
        stats('elite'),
        h('small', null, cards.length ? (deck?.current ? t('game.monster.card') : t('game.monster.intents')) : t('game.monster.unknown')),
        ...cards.map((cardId) => {
          const card = behaviourCard(ctx, typeId, cardId);
          const ini = monsterInitiative(ctx, typeId, card);
          const relSteps = card.steps.map((st) => stepText(st, s.variants.orbs, relative)).join('; ');
          return h('div', { class: 'gmcard' }, h('span', { class: 'gcard-ini' }, ini), h('span', null, card.if ? `${t(`game.if.${card.if}`)}: ` : '', relSteps, card.otherwise ? ` | ${t('game.otherwise')}: ${card.otherwise.map((st) => stepText(st, s.variants.orbs, relative)).join('; ')}` : ''));
        }),
        h(
          'div',
          { class: 'gcol' },
          figures
            .sort((a, b) => a.number - b.number)
            .map((f) => h('div', { class: 'gmfig' }, h('b', null, figureName(f.id, s)), ` ${f.hp}/${f.maxHp}`, statusRow(s, f, explain))),
        ),
      ],
      () => ((ui.modal = null), (ui.monsterInfo = null), render()),
    );
  }

  function reviveModal(): HTMLElement {
    const hero = turnHero();
    const list = hero ? game.legalOf('reviveAlly').filter((a) => a.heroId === hero.id) : [];
    return modalBox(
      t('ui.revive'),
      h(
        'div',
        { class: 'gcol' },
        h('p', { class: 'gside-hint' }, t('variant.reviveAlly.text')),
        list.map((a) =>
          h(
            'button',
            { class: 'gbtn', onclick: () => ((ui.modal = null), act(a)) },
            icon('revive'),
            t('game.reviveWith', { name: figureName(a.targetId), card: cardName(a.cardId), half: t(a.half === 'top' ? 'ui.playTop' : 'ui.playBottom') }),
          ),
        ),
      ),
      () => ((ui.modal = null), render()),
    );
  }

  // ─── Board highlights ────────────────────────────────────────────────────

  function updateBoard(): void {
    const s = game.state;
    if (!stepInfo || ui.busy) {
      board.clearHighlights();
      return;
    }
    const m = stepInfo.model;
    const hl: BoardHighlights = {};
    if (m.mode === 'path') {
      hl.reachable = m.highlights.map((hex) => ({ hex, cost: shortestPath(m.choices, hex) }));
      if (ui.chosen?.path) hl.path = ui.chosen.path;
    } else if (m.mode === 'targets') {
      hl.targets = m.targetIds;
      const step = stepInfo.step;
      if (step.type === 'attack') {
        // With the consume toggle on, the preview counts the bonus too.
        const boosted = ui.sel.consume && step.consume ? withConsumeBonus(step, step.consume).step : step;
        const dmg: Record<FigureId, number> = {};
        for (const id of m.targetIds) {
          const pv = previewAttack(s, stepInfo.heroId, id, content, boosted.type === 'attack' ? boosted : undefined);
          if (pv) dmg[id] = pv.damage;
        }
        hl.expectedDamage = dmg;
      }
      const chosen = ui.chosen?.targets ?? ui.sel.targets;
      if (chosen.length) hl.targets = [...chosen, ...m.targetIds.filter((x) => !chosen.includes(x))];
    } else if (m.mode === 'area') {
      if (m.areaPreview.length) hl.area = m.areaPreview;
      else hl.reachable = m.highlights.map((hex) => ({ hex, cost: 0 }));
    } else if (m.mode === 'hex') {
      hl.reachable = m.highlights.map((hex) => ({ hex, cost: 0 }));
      if (ui.chosen?.hex) hl.path = [ui.chosen.hex];
    }
    board.highlight(hl);
  }

  // ─── Start ───────────────────────────────────────────────────────────────

  board.sync(game.state, content);
  if (game.restoreError) toast(t('game.restoreFailed'), game.restoreError, 'error');
  render();

  return () => {
    disposed = true;
    for (const u of unsubs) u();
    document.body.classList.remove('game', 'g-left-closed', 'g-right-closed', 'g-bottom-tall', 'g-bottom-short', 'g-bottom-none');
    overlay.replaceChildren();
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number, cancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => (cancelled() || Date.now() - start >= ms ? resolve() : setTimeout(tick, 50));
    tick();
  });
}

function sameChoice(a: StepChoice, b: StepChoice): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function shortestPath(choices: StepChoice[], hex: Hex): number {
  const key = hexKey(hex);
  let best = Infinity;
  for (const c of choices) {
    const end = c.path?.[c.path.length - 1];
    if (end && hexKey(end) === key) best = Math.min(best, c.path?.length ?? Infinity);
  }
  return Number.isFinite(best) ? best : 0;
}

function isHeroSide(s: GameState, id: FigureId): boolean {
  return id.startsWith('hero:') || id.startsWith('summon:') || s.figures[id]?.kind === 'summon';
}

/** The hero an action is made by (for hint levels), if any. */
function actorOf(s: GameState, a: Action): FigureId | null {
  if ('heroId' in a) return a.heroId;
  const p = s.pending;
  return p && 'heroId' in p ? p.heroId : null;
}

function phaseKey(s: GameState): string {
  const p = s.pending;
  if (s.phase === 'won' || s.phase === 'lost') return s.phase;
  if (p?.kind === 'chooseHandBeforeScenario') return 'chooseHand';
  if (p?.kind === 'endOfRound' || p?.kind === 'shortRestReroll') return 'endOfRound';
  return s.phase;
}

function stepIconOf(step: Step): IconName {
  if (step.type === 'move') return step.jump ? 'jump' : 'move';
  if (step.type === 'attack') return step.range ? 'ranged' : 'attack';
  return ['heal', 'shield', 'retaliate', 'provoke', 'push', 'pull', 'loot', 'summon', 'trap', 'teleport'].includes(step.type) ? (step.type as IconName) : 'special';
}
