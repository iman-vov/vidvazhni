// The scenario screen: the board fills the screen, the initiative bar sits on top, heroes on the
// left, elements/orbs and the log on the right, the hand or the turn controls at the bottom.
// Hot seat: before a hero's private choice (hand before the scenario, cards each round) a curtain
// asks to pass the tablet; nobody sees another player's hand. Every control answers with an
// engine action through the GameController; the board plays the events and the UI waits for it.

import { planTurn } from '../rules/ai/index';
import { loadContent } from '../rules/load';
import type { Content, Step } from '../rules/content';
import type { Ctx } from '../rules/effects/context';
import { withConsumeBonus } from '../rules/effects/index';
import { hexKey, type Hex } from '../rules/hex';
import { objectiveStatus } from '../rules/objectives';
import * as queries from '../rules/queries';
import { attackPrompts, eventsSoon, forecastInitiative, initiativePrompts, orbBonusPreview, previewAttack, usableItems, type InitiativePrompt } from '../rules/queries';
import { behaviourCard, monsterInitiative } from '../rules/round';
import type { Action, CardId, FigureId, GameEvent, GameState, HeroState, MonsterState, StepChoice } from '../rules/state';
import { figureSteps } from '../rules/turn';
import type { BoardHighlights, BoardView } from '../render/view';
import { stepText } from '../ui/debug/format';
import { emptySelection, stepModel, tapStep, type StepModel, type StepSelection } from '../ui/debug/stepPicker';
import { h } from '../ui/dom';
import { getLang, onLangChange, t } from '../ui/i18n';
import { cardKeywords, cardView, compactCard, type Half } from '../ui/game/card';
import { defensePanel } from '../ui/game/defense';
import { chestFinds, eventLine, ruleHints, type RuleHint } from '../ui/game/events';
import { icon, type IconName } from '../ui/game/icons';
import { rich } from '../ui/icons';
import { isIconName } from '../ui/icons/names';
import { elementsRow, eventChips, heroPanel, initiativeBar, intentIcon, intentIcons, portrait, statusRow, type RibbonTarget } from '../ui/game/panels';
import { figureCard, monsterPlan } from '../ui/game/figureCard';
import { onPress } from '../ui/game/press';
import { cardName, elementName, figureName, modifierLabel, monsterTypeName, playedCard, stepLine } from '../ui/game/text';
import { previewAction, type ActionPreview } from './actionPreview';
import { heroColor } from './boardViewStub';
import { INTENTS, toggleIntent, type GameController, type IntentId } from './game';
import { settings } from './settings';
import { isTutorial } from './tutorial/scenario';
import { beatLines, beatsFor, scenarioStory, type StoryMode } from './story';
import { createSpeech } from './storySpeech';
import { getGraphicsQuality } from '../render/quality';
import { artButton } from './screens/menu';
import { settingsPanel } from './screens/settings';
import { topicForHint } from './help/topics';
import { boardMusic, endStinger, playEvents as eventSounds, playUi, stepSounds } from '../audio/index';
import { environmentFor } from '../render/environment/data';

export interface ScenarioScreenOptions {
  overlay: HTMLElement;
  game: GameController;
  board: BoardView;
  /** Back to the main menu (the game stays saved). */
  onExit: () => void;
  /** The scenario is won or lost and every animation has played. */
  onEnd: () => void;
  /** Opens the rules reference (src/app/help), on a topic if given. */
  onHelp?: (topic?: string | null) => void;
  /** «Сюжет» of this game (a campaign keeps its own); default: the device setting. */
  storyMode?: () => StoryMode;
  onStoryMode?: (mode: StoryMode) => void;
}

interface Toast {
  id: number;
  title: string;
  text: string;
  kind: 'hint' | 'turn' | 'info' | 'error';
  /** Reference topic behind a rule hint («Детальніше»). */
  topic?: string | null;
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
  /** «Ухилитися» with this dice item (the damage prompt's toggle). */
  dodgeItem: string | null;
  leftOpen: boolean;
  /** The event log drawer under the elements row. */
  rightOpen: boolean;
  focusHero: FigureId | null;
  modal: 'menu' | 'settings' | 'intro' | 'monster' | 'revive' | 'item' | 'hero' | null;
  /** The small stat card (ribbon portrait or board figure); `pinned` = opened by a tap, not hover. */
  figInfo: (RibbonTarget & { pinned: boolean }) | null;
  heroInfo: FigureId | null;
  /** Card choice: the board is shown for a moment instead of the hand. */
  peek: boolean;
  itemInfo: { heroId: FigureId; itemId: string } | null;
  monsterInfo: string | null;
  busy: boolean;
  modifier: ModifierShow | null;
  toasts: Toast[];
  log: string[];
}

const TOAST_MS = 6000;
/** End of round: a short rest is asked only of heroes with this many cards in hand or fewer (two
 *  more rounds' worth otherwise); the others say «Не зараз» by themselves. */
const SHORT_REST_HAND = 3;
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
    dodgeItem: null,
    leftOpen: !narrow,
    rightOpen: false,
    focusHero: null,
    // The tutorial opens on the scenario card; a mission only shows its goal (the goal banner below).
    modal: game.actions.length === 0 && isTutorial(game.setup.scenarioId) ? 'intro' : null,
    monsterInfo: null,
    itemInfo: null,
    figInfo: null,
    heroInfo: null,
    peek: false,
    busy: false,
    modifier: null,
    toasts: [],
    log: [],
  };
  let toastId = 0;
  let seenState: GameState | null = null;
  let skipModifiers = false;
  let stepInfo: { model: StepModel; step: Step; heroId: FigureId; preview: ActionPreview | null } | null = null;
  // Non-attack steps: who the step reaches and what it does there (the engine plays each choice on
  // a copy), kept until the state or the choices change.
  let previewKey: { s: GameState; key: string; value: ActionPreview | null } | null = null;
  function actionPreview(s: GameState, step: Step, heroId: FigureId, m: StepModel): ActionPreview | null {
    const key = JSON.stringify(m.choices);
    if (previewKey?.s !== s || previewKey.key !== key) previewKey = { s, key, value: previewAction(s, content, heroId, step, m.choices) };
    return previewKey.value;
  }
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

  // Story beats: bubbles over the speaker or a banner on top; the ones already in the log played before.
  // Off in battle for now (storySpeech BATTLE_SPEECH): the talk is in the intro and the outro.
  const storyMode = o.storyMode ?? (() => settings.get().story);
  const firedBeats = new Set<string>();
  beatsFor(scenarioStory(getLang(), game.setup.scenarioId), game.state.log, firedBeats);
  const speech = createSpeech({ root, board, state: () => game.state });

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
    // Area, hex and path steps aim at the figure's hex: the board's hex tap that follows does it
    // (a hold still opens the figure card).
    if (m && (m.mode === 'area' || m.mode === 'hex' || m.mode === 'path')) return;
    if (!m || m.mode !== 'targets') {
      const f = game.state.figures[id];
      if (f?.kind === 'hero') ui.focusHero = id;
      openFigure({ figureId: id }, true);
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
    board.onFigureHold((id) => moreAbout({ figureId: id })),
  );
  unsubs.push(onLangChange(render));

  // ─── Actions ─────────────────────────────────────────────────────────────

  function act(action: Action, keepSelection = false): boolean {
    if (ui.busy) return false;
    const actor = actorOf(game.state, action);
    const r = game.act(action);
    if (!r.ok) {
      playUi('error');
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
    eventSounds(events);
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
      endStinger(game.state.phase === 'won');
      o.onEnd();
      return;
    }
    music();
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
      if (kind === 'endOfRound' && restAsked().length) showHint({ key: 'shortRest', title: t('ui.shortRest'), text: t('game.hint.shortRest') });
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
      if (e.type === 'looted' && e.chest) {
        const found = [...chestFinds(e, events), ...(e.coins > 0 ? [t('game.ev.chestCoins', { coins: e.coins })] : [])];
        toast(t('game.ev.chestOpened', { name: figureName(e.heroId, s) }), found.length ? t('game.ev.chestFound', { items: found.join(', ') }) : t('game.ev.chestEmpty'), 'info');
      }
      if (e.type === 'story') toast(t(e.text), '', 'info');
      if (e.type === 'heroExhausted') toast(t('log.exhausted', { name: figureName(e.heroId) }), '', 'info');
    }
    sayBeats(events, actor);
  }

  function sayBeats(events: GameEvent[], actor: FigureId | null): void {
    const party = game.heroes().map((x) => x.classId);
    const actorClass = actor?.startsWith('hero:') ? actor.slice(5) : null;
    for (const beat of beatsFor(scenarioStory(getLang(), game.setup.scenarioId), events, firedBeats)) {
      speech.say(beatLines(beat, storyMode(), party, game.setup.seed, actorClass));
    }
  }

  function showHint(hint: RuleHint): void {
    if (game.markHint(hint.key)) toast(hint.title, hint.text, 'hint', topicForHint(hint.key));
  }

  function toast(title: string, text: string, kind: Toast['kind'], topic: string | null = null): void {
    const id = ++toastId;
    ui.toasts = [...ui.toasts.filter((x) => !(kind === 'turn' && x.kind === 'turn')), { id, title, text, kind, topic }].slice(-3);
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
    const f = game.state.figures[heroId];
    return heroColor(f?.kind === 'hero' ? f.classId : '');
  }

  function playerName(heroId: FigureId): string {
    return game.playerOf(heroId)?.name ?? '';
  }

  /** The hero who makes a private choice now, if any: the hand before the scenario goes hero by
   *  hero; the round's cards are chosen by whoever tapped their own hero, in any order. */
  function privateHero(): FigureId | null {
    const p = game.state.pending;
    if (p?.kind === 'chooseHandBeforeScenario') return p.heroIds[0] ?? null;
    if (p?.kind === 'selectCards') return ui.revealed && p.heroIds.includes(ui.revealed) ? ui.revealed : null;
    return null;
  }

  /** Round card choice: a player tapped their hero (banner or ribbon) and sees that hero's hand. */
  function revealHero(heroId: FigureId | null): void {
    const p = game.state.pending;
    if (heroId && (p?.kind !== 'selectCards' || !p.heroIds.includes(heroId))) return;
    ui.revealed = heroId;
    ui.pick = [];
    ui.leading = null;
    ui.longRest = false;
    ui.intents = game.intentsOf(heroId ?? '');
    ui.pressCard = null;
    ui.enlarged = null;
    ui.intentsOpen = false;
    render();
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
    if (s.pending?.kind !== 'avoidDamage') {
      ui.avoidPick = [];
      ui.dodgeItem = null;
    }
    if (s.pending?.kind !== 'selectCards' && s.pending?.kind !== 'chooseHandBeforeScenario') ui.peek = false;
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
    // Heroes with a hand big enough skip the short rest without a prompt (one at a time: each
    // answer re-renders).
    const p = s.pending;
    if (p?.kind === 'endOfRound' && !ui.busy) {
      const skip = p.heroIds.find((id) => !restAsked().includes(id));
      if (skip && act({ type: 'shortRest', heroId: skip, rest: false })) return;
    }
    stepInfo = null;
    if (s.pending?.kind === 'stepChoice' && !ui.busy) {
      const choices = game.legalOf('resolveStep').map((a) => a.choice);
      let model = stepModel(s, s.pending.step, choices, ui.sel);
      // An area anchor starts with its first rotation, so it can be confirmed at once.
      if (model.mode === 'area' && ui.sel.hex && ui.sel.direction === null && model.directions.length) {
        ui.sel = { ...ui.sel, direction: model.directions[0] ?? null };
        model = stepModel(s, s.pending.step, choices, ui.sel);
      }
      stepInfo = { step: s.pending.step, heroId: s.pending.heroId, model, preview: model.mode === 'targets' || model.mode === 'plain' ? actionPreview(s, s.pending.step, s.pending.heroId, model) : null };
    }
    document.body.classList.toggle('g-left-closed', !ui.leftOpen);
    renderTop();
    renderLeft();
    renderRight();
    renderBottom();
    renderLayer();
    updateBoard();
  }

  // Initiative roll (art/ui-mockups/dice/v1.png): the d12s tumble by the card numbers, then the sums
  // show and the ribbon slides into the order by total. Under 1.2 s, any tap skips it; none on the
  // low graphics tier or with reduced motion. A game resumed from a save does not replay its roll.
  const ROLL_TUMBLE_MS = 650;
  const ROLL_SUM_MS = 450;
  let rollKey: string | null = null;
  let rollStart = 0;
  let rollShown: 'tumble' | 'sum' | null = null;
  let rollTimers: number[] = [];

  function stopRoll(): void {
    rollStart = 0;
    for (const id of rollTimers) clearTimeout(id);
    rollTimers = [];
  }

  function skipRoll(): void {
    if (!rollStart) return;
    stopRoll();
    renderTop();
  }

  function rollMotion(): boolean {
    return getGraphicsQuality() !== 'low' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  function rollingNow(s: GameState): { phase: 'tumble' | 'sum'; at: number } | null {
    let idx = -1;
    for (let i = s.log.length - 1; i >= 0; i--) {
      const ev = s.log[i]!;
      if (ev.type === 'roundStarted') break;
      if (ev.type === 'initiativeRolled') {
        idx = i;
        break;
      }
    }
    const key = idx < 0 ? '' : `${s.round}:${idx}`;
    if (key !== rollKey) {
      const first = rollKey === null;
      rollKey = key;
      stopRoll();
      if (key && !first && rollMotion()) {
        const speed = settings.get().speed || 1;
        rollStart = performance.now();
        rollTimers = [ROLL_TUMBLE_MS, ROLL_TUMBLE_MS + ROLL_SUM_MS].map((ms) => window.setTimeout(() => !disposed && renderTop(), ms / speed + 20));
      }
    }
    if (!rollStart) return null;
    const at = (performance.now() - rollStart) * (settings.get().speed || 1);
    if (at < ROLL_TUMBLE_MS) return { phase: 'tumble', at };
    if (at < ROLL_TUMBLE_MS + ROLL_SUM_MS) return { phase: 'sum', at: at - ROLL_TUMBLE_MS };
    stopRoll();
    return null;
  }

  /** Card order → order by total: each portrait slides from where it stood (FLIP). */
  function slideRibbon(before: Map<string, number>): void {
    for (const el of top.querySelectorAll<HTMLElement>('.ginibar [data-ini]')) {
      const x = before.get(el.dataset.ini ?? '');
      const dx = x === undefined ? 0 : x - el.getBoundingClientRect().left;
      if (Math.abs(dx) > 1) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
  }

  function renderTop(): void {
    const s = game.state;
    const rolling = rollingNow(s);
    const before = new Map<string, number>();
    if (rollShown === 'tumble' && rolling?.phase === 'sum') for (const el of top.querySelectorAll<HTMLElement>('.ginibar [data-ini]')) before.set(el.dataset.ini ?? '', el.getBoundingClientRect().left);
    rollShown = rolling?.phase ?? null;
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
          rolling: forecast ? null : rolling,
          monsterFocus: monsterFocus(),
          onPick: (tg) => (s.pending?.kind === 'selectCards' && tg.figureId && s.pending.heroIds.includes(tg.figureId) ? revealHero(tg.figureId) : openFigure(tg, true)),
          onHover: (tg) => (tg ? openFigure(tg, false) : closeHoverFigure()),
        }),
      ),
      h('div', { class: 'gplate gtop-round' }, h('b', null, t('ui.round', { round: s.round })), h('small', null, t(`game.phase.${phaseKey(s)}`))),
      objectivePlate(content, s),
      ...(forecast ? [] : [eventChips(s, eventsSoon(s, content))].filter((x): x is HTMLElement => !!x)),
      h(
        'div',
        { class: 'gtop-tools' },
        h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('ui.log'), 'aria-expanded': String(ui.rightOpen), title: t('ui.log'), onclick: () => ((ui.rightOpen = !ui.rightOpen), renderRight()) }, icon('discard')),
        h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('game.menu'), onclick: () => ((ui.modal = 'menu'), render()) }, icon('menu')),
      ),
    );    if (before.size) slideRibbon(before);
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
    } else if ((p?.kind === 'chooseHandBeforeScenario' || p?.kind === 'selectCards') && ui.revealed) {
      body = ui.peek ? h('div', { class: 'gbar gpeek-bar' }, artButton('hand', t('game.select.back'), () => ((ui.peek = false), render()), { cls: 'is-small' })) : null;
      size = ui.peek ? 'short' : 'none';
    } else if (p?.kind === 'heroTurn' || p?.kind === 'stepChoice') {
      body = turnPanel(s.figures[p.heroId] as HeroState);
      size = 'tall';
    } else if (p?.kind === 'avoidDamage') {
      body = avoidPanel();
      size = 'tall';
    } else if (p?.kind === 'endOfRound') {
      body = shortRestPanel();
      size = 'short';
    } else if (p?.kind === 'shortRestReroll') {
      body = rerollPanel();
      size = 'short';
    } else if ((p as { kind: string } | null)?.kind === 'beforeAttacked') {
      body = reactionPanel();
      size = 'short';
    } else if (p?.kind === 'initiativeItems') {
      body = initiativeItemsPanel();
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
  /** Choosing the round's cards over the dimmed board, as in Gloomhaven digital: the whole hand as
   *  small full cards, a tap picks a card and a long press opens the big one; picks go to two slots, the first is
   *  the leading one (its initiative), tapping a slot card puts it back; «Готово» once both are set. Intents fold into one button; «Поле» peeks at the board. */
  function selectionOverlay(heroId: FigureId): HTMLElement {
    const s = game.state;
    const hero = s.figures[heroId] as HeroState;
    const choosingHand = s.pending?.kind === 'chooseHandBeforeScenario';
    const cls = content.heroes[hero.classId];
    const need = cls?.handSize ?? 0;
    const cards = choosingHand && cls ? cls.cards.filter((c) => c.level <= Math.max(1, hero.level)).map((c) => c.id) : hero.hand;
    const bonuses = choosingHand ? [] : orbBonusPreview(s, content, heroId);
    const accent = colorOf(heroId);
    const open = (cardId: CardId) => openCard(heroId, cardId);
    const pick = (cardId: CardId) => (choosingHand ? toggleHandPick(cardId, need) : togglePick(cardId));
    // The whole hand as small full cards, sized to fit without scrolling (fitHand); a picked card
    // leaves a ghost behind and sits in its slot. Tap: pick or put back; hold: the big card.
    const hand = h(
      'div',
      { class: 'gsel-hand', role: 'list' },
      cards.map((cardId) => {
        const picked = choosingHand ? ui.handPick.includes(cardId) : ui.pick.includes(cardId) && !ui.longRest;
        const el = cardView({ s, content, hero, cardId, full: true, accent, bonuses: bonuses.filter((b) => b.cardId === cardId), picked });
        el.setAttribute('role', 'listitem');
        el.tabIndex = 0;
        if (picked && !choosingHand) el.classList.add('is-lifted');
        if (picked && choosingHand) el.append(h('span', { class: 'gsel-badge' }, icon('check')));
        onPress(el, {
          tap: () => pick(cardId),
          down: () => {
            if (choosingHand) return;
            ui.pressCard = cardId;
            renderTop();
          },
          up: () => {
            if (choosingHand) return;
            ui.pressCard = null;
            renderTop();
          },
          hold: () => open(cardId),
        });
        // Keyboard: Enter or Space picks, I opens the big card.
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), pick(cardId));
          else if (e.key.toLowerCase() === 'i') (e.preventDefault(), open(cardId));
        });
        return el;
      }),
    );
    fitHand(hand, cards.length);
    const [a, b] = ui.pick;
    const leadCard = ui.leading ? playedCard(content, hero.classId, ui.leading, s.variants) : undefined;
    const hint = choosingHand
      ? t('game.chooseHand', { n: need, picked: ui.handPick.length })
      : ui.longRest
        ? t('game.longRest.text')
        : ui.pick.length < 2
          ? t('game.select.hint2', { n: 2 - ui.pick.length })
          : t('game.select.leading', { card: cardName(ui.leading ?? ''), initiative: leadCard?.initiative ?? '' });
    const head = h(
      'div',
      { class: 'gsel-head gpanel' },
      portrait(heroId, colorOf(heroId), 'sm'),
      h('div', { class: 'gsel-who' }, h('b', null, figureName(heroId)), h('small', null, playerName(heroId))),
      h('p', { class: 'gsel-hint' }, hint),
      choosingHand
        ? null
        : h(
            'button',
            { class: `gbtn gsel-intents${ui.intentsOpen ? ' is-open' : ''}`, 'aria-expanded': String(ui.intentsOpen), onclick: () => ((ui.intentsOpen = !ui.intentsOpen), renderLayer()) },
            ui.intents.length ? ui.intents.map((i) => icon(intentIcon(i))) : icon('approach'),
            t('game.intents.short'),
            icon(ui.intentsOpen ? 'up' : 'down'),
          ),
      h('button', { class: 'gbtn', title: t('game.select.peek'), onclick: () => ((ui.peek = true), render()) }, icon('hint'), t('game.select.peek')),
      // Round cards: back to the board, so another player can choose first.
      choosingHand ? null : h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('game.close'), title: t('game.close'), onclick: () => revealHero(null) }, icon('close')),
    );
    const intents =
      !choosingHand && ui.intentsOpen
        ? h(
            'div',
            { class: 'gsel-chips gpanel', role: 'group', 'aria-label': t('game.intents') },
            INTENTS.map((id) =>
              h(
                'button',
                { class: 'gbtn gbtn-chip', 'aria-pressed': String(ui.intents.includes(id)), onclick: () => ((ui.intents = toggleIntent(ui.intents, id)), renderLayer()) },
                icon(intentIcon(id)),
                t(`game.intent.${id}`),
              ),
            ),
          )
        : null;
    const foot = h('div', { class: 'gsel-foot' });
    if (choosingHand) {
      foot.append(
        h('span', { class: 'gsel-sum' }, t('game.chooseHand', { n: need, picked: ui.handPick.length })),
        artButton('check', t('game.ready'), () => actPrivate(heroId, { type: 'chooseHand', heroId, cards: [...ui.handPick] }), { cls: 'is-go', disabled: ui.handPick.length !== need }),
      );
    } else {
      const canRest = hero.discard.length >= 2;
      const rest = artButton('rest', t('ui.longRest'), () => ((ui.longRest = !ui.longRest), render()), { cls: ui.longRest ? 'is-on' : '', disabled: !canRest });
      rest.setAttribute('aria-pressed', String(ui.longRest));
      if (!canRest) rest.title = t('game.longRest.no');
      const ready = ui.longRest || (a && b && ui.leading);
      // Two slots: the leading card (its initiative counts) and the second one; tap a slot card to put it back.
      const lead = ui.longRest ? null : (ui.leading ?? a ?? null);
      const second = ui.longRest ? null : (ui.pick.find((c) => c !== lead) ?? null);
      const slot = (cardId: CardId | null, which: 'lead' | 'second') => {
        const label = h('small', { class: 'gsel-slot-label' }, which === 'lead' ? icon('initiative') : null, t(`game.select.slot.${which}`));
        if (!cardId) return h('div', { class: `gsel-slot is-empty is-${which}` }, label);
        const card = compactCard({ s, content, hero, cardId, accent, leading: which === 'lead', picked: true });
        card.addEventListener('click', () => togglePick(cardId));
        card.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), togglePick(cardId)));
        return h('div', { class: `gsel-slot is-${which}` }, label, card);
      };
      // Between the slots: swap, the second card becomes the leading one. Keeps the foot one card high.
      const swap = second
        ? h(
            'button',
            {
              class: 'gbtn gbtn-icon gsel-lead',
              'data-card': second,
              title: t('game.makeLeading'),
              'aria-label': t('game.makeLeading'),
              onclick: () => ((ui.leading = second), (ui.pick = [second, ...ui.pick.filter((c) => c !== second)]), render()),
            },
            icon('initiative'),
          )
        : null;
      foot.append(
        rest,
        h('div', { class: 'gsel-slots' }, slot(lead, 'lead'), swap, slot(second, 'second')),
        ready ? artButton('check', t('game.ready'), () => confirmSelection(heroId), { cls: 'is-go' }) : h('span', { class: 'gsel-sum' }, ui.longRest ? t('ui.longRest') : t('game.select.hint2', { n: 2 - ui.pick.length })),
      );
    }
    return h('div', { class: 'gsel', role: 'dialog', 'aria-label': hint }, head, intents, hand, foot);
  }

  /** Sizes the hand's cards (--sel-w) to the biggest that fits all of them without scrolling: the
   *  best number of rows for the space; on a phone one row that scrolls sideways. */
  function fitHand(el: HTMLElement, n: number): void {
    const ASPECT = 0.727; // card frame width / height (cardFrames.json)
    const GAP = 10;
    const fit = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const hgt = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (w <= 0 || hgt <= 0 || n === 0) return;
      let best = 0;
      if (cs.flexWrap === 'nowrap') best = hgt * ASPECT;
      else
        for (let rows = 1; rows <= n; rows++) {
          const cols = Math.ceil(n / rows);
          best = Math.max(best, Math.min((w - (cols - 1) * GAP) / cols, ((hgt - (rows - 1) * GAP) / rows) * ASPECT));
        }
      el.style.setProperty('--sel-w', `${Math.floor(Math.min(best, 260))}px`);
    };
    new ResizeObserver(fit).observe(el);
  }

  function openCard(heroId: FigureId, cardId: CardId): void {
    ui.enlarged = { heroId, cardId };
    renderLayer();
  }

  function togglePick(cardId: CardId): void {
    playUi('cardPick');
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

  function toggleHandPick(cardId: CardId, need: number): void {
    playUi('cardPick');
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
        // The basic-action row is always there (hidden while it offers nothing), so the cards keep
        // their height and position when it appears after the first half.
        footer: h(
          'div',
          { class: `gcard-basic${basicTop || basicBottom ? '' : ' is-idle'}`, 'aria-hidden': basicTop || basicBottom ? null : 'true' },
          h('button', { class: 'gbtn gbtn-small', disabled: !basicTop, onclick: () => basicTop && act(basicTop) }, icon('attack'), t('game.basicAttack')),
          h('button', { class: 'gbtn gbtn-small', disabled: !basicBottom, onclick: () => basicBottom && act(basicBottom) }, icon('move'), t('game.basicMove')),
        ),
      });
      // Dimmed once used; not while its half is being played (the step's buttons sit on it).
      if (usedCard && inProgress.length === 0 && playable.length === 0 && !basicTop && !basicBottom) el.classList.add('is-used');
      onPress(el, {
        hold: () => {
          ui.enlarged = { heroId: hero.id, cardId };
          renderLayer();
        },
      });
      return el;
    });
    // The step's confirm, rotate and skip over the other half of the card being played.
    const actions = p?.kind === 'stepChoice' ? stepActions() : [];
    const playing = s.half?.heroId === hero.id ? s.half : null;
    const playingEl = playing ? cardEls.find((el) => el.dataset.card === playing.cardId) : undefined;
    if (playing && playingEl && actions.length) {
      const over = playing.half === 'top' ? 'bottom' : 'top';
      (playingEl.querySelector('.gcard-face') ?? playingEl).append(h('div', { class: `gcard-confirm is-${over}` }, actions));
    }
    const leftBox = h('div', { class: 'gturn-box gturn-left' }, h('div', { class: 'gside-who' }, h('b', null, figureName(hero.id)), h('small', null, playerName(hero.id))));
    if (p?.kind === 'stepChoice') leftBox.append(...stepControls(hero), ...(playingEl ? [] : [h('div', { class: 'gstep-actions' }, actions)]));
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

  /** «Завершити хід», asking once more while halves are left unplayed: a message says what is left
   *  and the button turns amber («Так, завершити»), so the first press visibly did something. */
  function endTurnButton(hero: HeroState): HTMLElement {
    const end = game.state.pending?.kind === 'heroTurn' ? game.legalOf('endTurn').find((a) => a.heroId === hero.id) : undefined;
    const halvesLeft = 2 - hero.playedThisTurn.length;
    const careful = halvesLeft > 0 && !ui.confirmEnd;
    return artButton(
      ui.confirmEnd ? 'hint' : 'check',
      ui.confirmEnd ? t('game.endTurn.sure') : t('ui.endTurn'),
      () => {
        if (!end) return;
        if (careful) {
          ui.confirmEnd = true;
          playUi('open');
          toast(t('game.endTurn.ask'), t('game.endTurn.unplayed', { n: halvesLeft }), 'hint');
          renderBottom();
        } else act(end);
      },
      { cls: `gb-right is-go${halvesLeft === 0 ? ' is-ready' : ''}${ui.confirmEnd ? ' is-warn' : ''}`, disabled: !end },
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
      }
      // «Предмети кубика»: Щаслива кістка / Зілля удачі on the rolled X of this step.
      if (info.step.xRoll !== undefined) {
        for (const it of usableItems(s, content, hero.id)) {
          if (!it.effect.some((st) => st.type === 'special' && (st.name === 'xRerollBest' || st.name === 'dieRerollBest'))) continue;
          const a = legalUse.find((x) => x.itemId === it.itemId);
          if (a) out.push(h('button', { class: 'gbtn gbtn-glow', onclick: () => act(a, true) }, icon('item'), t('game.dieReroll', { item: t(it.nameKey), roll: info.step.xRoll })));
        }
      }
      if (m.mode === 'path') {
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
    // «Карти з X»: the roll behind the value, «X = 4».
    if (info.step.xRoll !== undefined) {
      out.push(h('p', { class: 'gstep-die', title: t('game.dieX', { roll: info.step.xRoll }) }, 'X =', h('span', { class: 'gdie' }, String(info.step.xRoll))));
    }
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
    // The result on the chosen target (or the only one): «Травниця: 5 → 8».
    const pv = info.preview;
    if (pv) {
      const picked = ui.chosen?.targets?.[0] ?? (pv.targets.length === 1 || m.mode === 'plain' ? undefined : null);
      const ids = picked === null ? [] : picked ? [picked] : pv.targets;
      for (const id of ids) {
        const r = pv.results[id];
        if (!r || !r.text) continue;
        out.push(h('p', { class: 'gside-hint gstep-preview' }, h('b', null, `${figureName(id, s)}: ${r.text} `), icon(r.icon === 'heal' ? 'hp' : r.icon)));
      }
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
    // Breakable and movable obstacles: hit or push one aside instead of a figure or a path.
    if (m.mode !== 'plain') {
      for (const c of m.choices) {
        if (c.targets?.length || c.path?.length || !(c.obstacles?.length || c.moveObstacle)) continue;
        const hex = c.obstacles?.[0];
        const tile = hex ? s.board.tiles[hexKey(hex)] : undefined;
        const hp = tile?.breakable ?? tile?.door?.breakable;
        out.push(h('button', { class: 'gbtn', onclick: () => resolve(c) }, plainChoiceLabel(c), hp ? ` ${hp.hp}/${hp.maxHp}` : null));
      }
    }
    return out;
  }

  /** Rotate, confirm and skip for the current step: they sit on the card being played (over its
   *  other half, which cannot be played this turn), see turnPanel. Breakable obstacles stay in the
   *  step box. */
  function stepActions(): HTMLElement[] {
    const s = game.state;
    const info = stepInfo;
    if (!info) return [];
    const m = info.model;
    const actions: HTMLElement[] = [];
    if (m.mode === 'area' && m.directions.length > 1) {
      const cur = ui.sel.direction ?? m.directions[0] ?? 0;
      const next = m.directions[(m.directions.indexOf(cur) + 1) % m.directions.length] ?? cur;
      actions.push(h('button', { class: 'gbtn', onclick: () => ((ui.sel = { ...ui.sel, direction: next }), render()) }, icon('rotate'), t('game.rotate')));
    }
    if (m.mode === 'plain') {
      for (const c of m.choices) actions.push(h('button', { class: 'gbtn gbtn-primary', onclick: () => resolve(c) }, plainChoiceLabel(c)));
    }
    const ready = m.mode === 'targets' && m.maxTargets > 1 ? m.ready : m.mode === 'area' ? m.ready : ui.chosen;
    if (m.mode !== 'plain') {
      const label = info.step.type === 'attack' ? t('game.confirm.attack') : info.step.type === 'move' ? t('game.confirm.move') : t('ui.confirm');
      actions.push(h('button', { class: 'gbtn gbtn-primary', disabled: !ready, onclick: () => ready && resolve(ready) }, icon('check'), label));
    }
    const skip = game.legalOf('skipStep')[0];
    if (skip) actions.push(h('button', { class: 'gbtn', onclick: () => act(skip) }, icon('skip'), t('ui.skip')));
    return actions;
  }

  function plainChoiceLabel(c: StepChoice): (Element | string)[] {
    const orbs = game.state.variants.orbs;
    if (c.element) return [icon(c.element), elementName(c.element, orbs)];
    if (c.obstacles?.length) return [icon('attack'), t('game.obstacle.attack')];
    if (c.moveObstacle) return [icon('push'), t('game.obstacle.move')];
    if (c.elements) return c.elements.flatMap((e, i) => (i ? [icon('arrow'), elementName(e, orbs)] : [elementName(e, orbs)]));
    return [icon('check'), c.consume ? t('game.doWithConsume') : t('game.do')];
  }

  function avoidPanel(): HTMLElement {
    const s = game.state;
    const p = s.pending;
    if (p?.kind !== 'avoidDamage') return h('div');
    // Take, «Ухилитися», «Прикрий друга», shield items, losing cards last (src/ui/game/defense.ts).
    return defensePanel({
      s,
      content,
      options: queries.defenseOptions(s, content),
      act: (a) => act(a),
      discardPick: ui.avoidPick,
      onDiscardPick: (cards) => ((ui.avoidPick = cards), renderBottom()),
      dodgeItem: ui.dodgeItem,
      onDodgeItem: (id) => ((ui.dodgeItem = id), renderBottom()),
      extra: [defenceLine(s.figures[p.heroId] as HeroState)],
    });
  }

  /** Items the engine accepts as a reaction right now (a shield while attack damage comes, a
   *  disadvantage item before a monster's attack), labelled with what they change. Uses the engine's
   *  `reactionPrompts` when it has one. */
  function reactionButtons(heroId: FigureId): HTMLElement | null {
    const s = game.state;
    const uses = game.legalOf('useItem').filter((a) => a.heroId === heroId);
    if (uses.length === 0) return null;
    const prompts = reactionPromptsOf(s);
    return h(
      'div',
      { class: 'grow greact' },
      uses.map((a) => {
        const pr = prompts.find((x) => x.itemId === a.itemId);
        const item = t(`item.${a.itemId}`);
        const label =
          pr?.shield !== undefined && pr.damage !== undefined && pr.reduced !== undefined
            ? t('game.react.shield', { item, shield: pr.shield, damage: pr.damage, reduced: pr.reduced })
            : pr?.disadvantage
              ? t('game.react.disadvantage', { item })
              : t('game.itemUse', { item });
        return h('button', { class: 'gbtn gbtn-glow', onclick: () => act(a) }, icon('item'), rich(label));
      }),
    );
  }

  /** «Предмети кубика»: right after the initiative roll each listed hero may use a dice item
   *  («Пісочний годинник: перекинути 7?», «Тихі черевики: 32 → 22») or say ready. */
  function initiativeItemsPanel(): HTMLElement {
    const s = game.state;
    const p = s.pending as Extract<GameState['pending'], { kind: 'initiativeItems' }>;
    const prompts = initiativePrompts(s, content);
    const label = (pr: InitiativePrompt): string => {
      const item = t(pr.nameKey);
      if (pr.kind === 'reroll' || pr.kind === 'rerollBest') return t(`game.initItems.${pr.kind}`, { item, roll: pr.roll ?? 0 });
      if (pr.kind === 'swap') return t('game.initItems.swap', { item, ally: figureName(pr.allyId ?? '', s), from: pr.initiative, to: pr.after ?? pr.initiative });
      return t('game.initItems.change', { item, from: pr.initiative, to: pr.after ?? pr.initiative });
    };
    return h(
      'div',
      { class: 'gsheet' },
      h('p', { class: 'gsheet-title' }, icon('item'), t('game.initItems.title')),
      ...p.heroIds.map((id) =>
        h(
          'div',
          { class: 'grow greact' },
          h('b', null, figureName(id, s)),
          prompts.filter((pr) => pr.heroId === id).map((pr) => h('button', { class: 'gbtn gbtn-glow', onclick: () => act(pr.action) }, icon('item'), rich(label(pr)))),
          h('button', { class: 'gbtn gbtn-primary', onclick: () => act({ type: 'passReaction', heroId: id }) }, t('game.initItems.done')),
        ),
      ),
    );
  }

  /** «Пацюк атакує Вартового»: before the modifier is drawn, an item can still help, or pass. */
  function reactionPanel(): HTMLElement {
    const s = game.state;
    const p = s.pending as unknown as { heroId: FigureId; attackerId: FigureId };
    const pass = game.legal().map((o) => o.action).find((a) => (a as { type: string }).type === 'passReaction');
    return h(
      'div',
      { class: 'gsheet' },
      h('p', { class: 'gsheet-title' }, icon('shield'), t('game.react.title', { attacker: figureName(p.attackerId, s), name: figureName(p.heroId, s) })),
      h('p', { class: 'gside-hint' }, t('game.react.text')),
      reactionButtons(p.heroId),
      h('div', { class: 'grow' }, pass ? h('button', { class: 'gbtn gbtn-primary', onclick: () => act(pass) }, t('game.react.pass')) : null),
    );
  }

  /** In the damage prompt: the hero's shield already counted, and defensive items that cannot be
   *  used right now (on the hero's own turn only, unless the engine offers them as a reaction). */
  function defenceLine(hero: HeroState): HTMLElement | null {
    const shield = hero.shields.reduce((n, x) => n + x.value, 0);
    const offered = new Set(game.legalOf('useItem').filter((a) => a.heroId === hero.id).map((a) => a.itemId));
    const defensive = (hero.items ?? []).filter((it) => {
      if (offered.has(it.id)) return false;
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

  /** Heroes asked about a short rest this round: offered by the engine and short of cards. */
  function restAsked(): FigureId[] {
    const p = game.state.pending;
    if (p?.kind !== 'endOfRound') return [];
    return p.heroIds.filter((id) => {
      const hero = game.state.figures[id];
      return hero?.kind === 'hero' && hero.hand.length <= SHORT_REST_HAND;
    });
  }

  /** One prompt for every hero still asked; «Не зараз — усім» answers for all of them at once. */
  function shortRestPanel(): HTMLElement {
    const s = game.state;
    const p = s.pending;
    if (p?.kind !== 'endOfRound') return h('div');
    const asked = restAsked();
    return h(
      'div',
      { class: 'gsheet' },
      h('p', { class: 'gsheet-title' }, icon('rest'), t('game.shortRest.title', { round: s.round })),
      h('p', { class: 'gside-hint' }, t('game.shortRest.text')),
      asked.length > 1
        ? h(
            'div',
            { class: 'grow' },
            h('button', { class: 'gbtn', onclick: () => asked.every((id) => act({ type: 'shortRest', heroId: id, rest: false })) }, t('game.shortRest.noAll')),
          )
        : null,
      asked.map((id) => {
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
    if (s.pending?.kind === 'selectCards' && !next && !ui.busy && ui.modal !== 'intro') parts.push(pickBanner());
    if (ui.modal === 'intro') parts.push(introModal());
    if (ui.modal === 'menu') parts.push(menuModal());
    if (ui.modal === 'settings') parts.push(modalBox(t('ui.settings'), settingsPanel({ heroes: game.heroes().map((x) => x.classId), onQuality: (q) => board.setQuality(q), onSpeed: (n) => board.setSpeed?.(n), story: o.storyMode, onStory: o.onStoryMode }), () => ((ui.modal = 'menu'), render())));
    if (next && ui.revealed && !ui.busy && !ui.peek && ui.modal !== 'intro') parts.push(selectionOverlay(ui.revealed));
    if (ui.modal === 'monster' && ui.monsterInfo) parts.push(monsterModal(ui.monsterInfo));
    if (ui.modal === 'hero' && ui.heroInfo) parts.push(heroModal(ui.heroInfo));
    if (ui.figInfo && !ui.modal) {
      const card = figureCard({
        s,
        content,
        ...(ui.figInfo.figureId ? { figureId: ui.figInfo.figureId } : {}),
        ...(ui.figInfo.typeId ? { typeId: ui.figInfo.typeId } : {}),
        colorOf,
        explain,
        onMore: () => ui.figInfo && moreAbout(ui.figInfo),
        onClose: () => ((ui.figInfo = null), renderLayer(), updateBoard()),
      });
      if (card) parts.push(card);
    }
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
              x.topic && o.onHelp ? h('button', { class: 'gbtn gbtn-small', onclick: (e: Event) => (e.stopPropagation(), o.onHelp?.(x.topic)) }, t('help.more')) : null,
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
        h('button', { class: `gbtn${picked ? '' : ' gbtn-primary'}`, 'data-sound': 'none', onclick: () => (togglePick(cardId), close()) }, icon(picked ? 'close' : 'check'), picked ? t('game.card.unpick') : t('game.card.pick')),
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
          words.length
            ? h('div', { class: 'gdetail-words' }, words.map((w) => h('p', null, h('b', null, w.title), ' — ', w.text, w.topic && o.onHelp ? [' ', h('button', { class: 'gbtn gbtn-small', onclick: () => o.onHelp?.(w.topic) }, t('help.more'))] : null)))
            : null,
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

  /** Round card choice without a curtain: a short note over the board and a button per hero still
   *  to choose; each player taps their own (or their portrait in the ribbon), in any order. */
  function pickBanner(): HTMLElement {
    const s = game.state;
    const p = s.pending;
    const waiting = p?.kind === 'selectCards' ? p.heroIds : [];
    return h(
      'div',
      { class: 'gpick gplate', role: 'group', 'aria-label': t('game.select.who') },
      h('p', { class: 'gpick-text' }, icon('hand'), t('game.select.who')),
      h(
        'div',
        { class: 'gpick-heroes' },
        game.heroes().map((x) => {
          const ready = !waiting.includes(x.id);
          return h(
            'button',
            { class: `gbtn gpick-hero${ready ? ' is-ready' : ''}`, disabled: ready, style: `--hero: ${colorOf(x.id)}`, onclick: () => revealHero(x.id) },
            portrait(x.id, colorOf(x.id), 'md'),
            h('span', { class: 'gpick-who' }, h('b', null, figureName(x.id)), h('small', null, playerName(x.id))),
            ready ? (intentIcons(game.intentsOf(x.id)) ?? icon('check')) : null,
          );
        }),
      ),
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
      `${sc?.number ? `${sc.number}. ` : ''}${t(`scenario.${s.scenarioId}`)}`,
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
        o.onHelp ? artButton('hint', t('help.menu'), () => o.onHelp?.()) : null,
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

  /** The small stat card; a second tap on the same portrait opens the full details. */
  function openFigure(tg: RibbonTarget, pinned: boolean): void {
    const same = ui.figInfo && ui.figInfo.figureId === tg.figureId && ui.figInfo.typeId === tg.typeId;
    if (pinned && same && ui.figInfo?.pinned) return moreAbout(tg);
    if (!pinned && ui.figInfo?.pinned) return;
    ui.figInfo = { ...tg, pinned };
    renderLayer();
    updateBoard();
  }

  function closeHoverFigure(): void {
    if (ui.figInfo && !ui.figInfo.pinned) {
      ui.figInfo = null;
      renderLayer();
      updateBoard();
    }
  }

  /** Full details: the monster type (stats, behaviour cards, figures) or the hero (cards, items). */
  function moreAbout(tg: RibbonTarget): void {
    ui.figInfo = null;
    const f = tg.figureId ? game.state.figures[tg.figureId] : undefined;
    if (tg.typeId || f?.kind === 'monster') return openMonster(tg.typeId ?? (f as MonsterState).typeId);
    if (f?.kind === 'hero') {
      ui.heroInfo = f.id;
      ui.modal = 'hero';
      render();
    }
  }

  function heroModal(heroId: FigureId): HTMLElement {
    const s = game.state;
    const hero = s.figures[heroId] as HeroState;
    const close = () => ((ui.modal = null), (ui.heroInfo = null), render());
    const cardButtons = (ids: CardId[]) => h('div', { class: 'grow' }, ids.map((c) => h('button', { class: 'gbtn gbtn-small', onclick: () => openCard(heroId, c) }, cardName(c))));
    const revealed = s.phase !== 'selectCards' && hero.selection?.kind === 'cards' ? hero.selection.cards : [];
    return modalBox(
      figureName(heroId),
      [
        h('div', { class: 'grow' }, portrait(heroId, colorOf(heroId), 'lg'), h('div', { class: 'gcol' }, h('b', null, `${t('ui.hp')}: ${hero.hp}/${hero.maxHp}`), h('small', null, playerName(heroId)), statusRow(s, hero, explain))),
        revealed.length ? h('div', null, h('small', null, t('game.figure.cards')), cardButtons(revealed)) : null,
        hero.active.length ? h('div', null, h('small', null, t('ui.activeCards')), cardButtons(hero.active.map((a) => a.cardId))) : null,
        (hero.items ?? []).length
          ? h('div', null, h('small', null, t('game.figure.items')), h('div', { class: 'grow' }, (hero.items ?? []).map((it) => h('button', { class: `gbtn gbtn-small${it.state !== 'ready' ? ' is-spent' : ''}`, onclick: () => openItem(heroId, it.id) }, icon('item'), t(`item.${it.id}`)))))
          : null,
        h('p', { class: 'gside-hint' }, `${t('ui.hand')} ${hero.hand.length} · ${t('ui.discard')} ${hero.discard.length} · ${t('ui.lost')} ${hero.lost.length} · ${t('ui.xp')} ${hero.xp} · ${t('ui.coins')} ${hero.coins}`),
      ],
      close,
    );
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
    // A monster's stat card shows its plan: the path it will walk and whom it goes for.
    const figOpen = ui.figInfo?.figureId ? s.figures[ui.figInfo.figureId] : undefined;
    if (!stepInfo && !ui.busy && figOpen?.kind === 'monster') {
      const plan = monsterPlan(s, content, figOpen);
      if (plan) {
        board.highlight({ ...(plan.path.length ? { path: plan.path } : {}), ...(plan.focusId ? { targets: [plan.focusId] } : {}) });
        return;
      }
    }
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
        // The preview counts the consume bonus only when the choices left really pay it.
        const boosted = m.consume && step.consume ? withConsumeBonus(step, step.consume).step : step;
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
  // Music: the location's track, the battle track while a boss is up; sounds follow the board.
    } else if (stepInfo.preview && (m.mode === 'targets' || m.mode === 'plain')) {
      // Heal, shield, buffs, push and pull: the targets in green (allies) or red, the reach around
      // the hero and the result over each target; the chosen one first.
      const pv = stepInfo.preview;
      const chosen = ui.chosen?.targets ?? ui.sel.targets;
      hl.targets = [...chosen.filter((x) => pv.targets.includes(x)), ...pv.targets.filter((x) => !chosen.includes(x))];
      hl.targetTone = pv.tone;
      const hero = s.figures[stepInfo.heroId];
      if (hero && pv.range > 0) hl.range = { center: hero.hex, radius: pv.range };
      hl.preview = {};
      for (const [id, r] of Object.entries(pv.results)) hl.preview[id] = { text: r.text, icon: r.icon };
  function music(): void {
    const awake = Object.values(game.state.figures).filter((f): f is MonsterState => f.kind === 'monster' && f.hp > 0);
    if (!game.over) boardMusic(environmentFor(game.state.scenarioId).id, awake.some((f) => f.rank === 'boss'), Math.min(1, awake.length / 6));
  }
  music();
  if (board.onStep) unsubs.push(board.onStep(stepSounds()));
  if (game.restoreError) toast(t('game.restoreFailed'), game.restoreError, 'error');
  document.addEventListener('pointerdown', skipRoll, true);
  render();
  // A new mission: a short goal banner; the goal line stays in the HUD.
  if (game.actions.length === 0 && ui.modal !== 'intro') toast(t('game.goal'), t(`scenario.${game.setup.scenarioId}.goal`), 'info');

  return () => {
    disposed = true;
    speech.dispose();
    stopRoll();
    document.removeEventListener('pointerdown', skipRoll, true);
    for (const u of unsubs) u();
    document.body.classList.remove('game', 'g-left-closed', 'g-right-closed', 'g-bottom-tall', 'g-bottom-short', 'g-bottom-none');
    overlay.replaceChildren();
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface ReactionPromptView {
  itemId: string;
  shield?: number;
  damage?: number;
  reduced?: number;
  disadvantage?: true;
}

/** The engine's reaction prompts, looked up at run time so the screen builds with or without them. */
function reactionPromptsOf(s: GameState): ReactionPromptView[] {
  const fn = (queries as unknown as { reactionPrompts?: (state: GameState, content: unknown) => ReactionPromptView[] }).reactionPrompts;
  if (!fn) return [];
  try {
    return fn(s, loadContent());
  } catch {
    return [];
  }
}

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

/** The main goal with its counter and the secondary goals (a check mark when met). A minimal
 *  text plate until the objective banners land. */
function objectivePlate(content: Content, s: GameState): HTMLElement {
  const st = objectiveStatus(content, s);
  if (!st) return h('span', null);
  const secondary = st.secondary.map((g) =>
    h('span', null, g.met ? icon('check') : '', t(`objective.secondary.${g.check}`, Object.fromEntries(Object.entries(g.params ?? {}).map(([k, v]) => [k, String(v)])))),
  );
  return h(
    'div',
    { class: 'gplate gtop-round gtop-goal' },
    h('b', null, t(`objective.${st.goal}`, { done: st.done ?? 0, of: st.of ?? 0 })),
    st.roundsLeft !== undefined ? h('small', null, t('objective.roundsLeft', { n: st.roundsLeft })) : null,
    secondary.length ? h('small', null, ...secondary) : null,
  );
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
