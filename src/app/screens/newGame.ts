// New game for one shared device, step by step: the adventure (scenario, players, difficulty), then
// each player alone picks a hero (and, if there is room, a clearly separate second hero) with their
// hint level, the device is handed on, and the party summary starts the game. No gear here: it is
// earned in the campaign. `heroStep` is one player's choice on its own, so network play can show it
// on each player's device without the hand-off.

import type { LoadedContent } from '../../rules/load';
import type { GameSetup } from '../../rules/state';
import { VARIANT_ORDER } from '../../rules/variants';
import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { icon } from '../../ui/game/icons';
import { heroBustUrl } from '../../ui/game/uiArt';
import type { PlayerInfo } from '../game';
import { settings } from '../settings';
import { localStore, readJson } from '../storage';
import { artButton, menuBackdrop } from './menu';
import { hintRow } from './settings';
import './newGame.css';

export const CLASS_ORDER = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'];
const KEY = 'vidvazhni.newGame';
const MAX_PLAYERS = 4;
const MAX_HEROES = 4;

interface Pick {
  classId: string;
  playerId: string;
  /** 0 = the player's hero, 1 = their second hero. */
  slot: 0 | 1;
}

interface Draft {
  scenarioId: string;
  players: PlayerInfo[];
  picks: Pick[];
  difficulty: GameSetup['difficulty'];
}

type Step = { kind: 'setup' } | { kind: 'handoff'; player: number } | { kind: 'hero'; player: number; slot: 0 | 1 } | { kind: 'party' };

export interface NewGameOptions {
  content: LoadedContent;
  onStart: (setup: GameSetup, players: PlayerInfo[]) => void;
  onBack: () => void;
  /** Hot-seat (default): «pass the device» between players. Network play turns it off. */
  handoff?: boolean;
}

function defaultDraft(): Draft {
  return {
    scenarioId: 's1',
    players: [
      { id: 'p1', name: '' },
      { id: 'p2', name: '' },
    ],
    picks: [],
    difficulty: 'normal',
  };
}

function loadDraft(): Draft {
  const d = readJson<Partial<Draft>>(localStore, KEY);
  if (!d?.players?.length) return defaultDraft();
  return { ...defaultDraft(), ...d, picks: Array.isArray(d.picks) ? d.picks : [] };
}

export function newGameScreen(o: NewGameOptions): HTMLElement {
  const draft = loadDraft();
  const handoff = o.handoff ?? true;
  const root = h('div', { class: 'gpage is-art gnew' });
  let step: Step = { kind: 'setup' };

  const nameOf = (i: number) => draft.players[i]?.name.trim() || t('menu.player', { n: i + 1 });
  const pickOf = (player: number, slot: 0 | 1) => draft.picks.find((x) => x.playerId === draft.players[player]?.id && x.slot === slot);
  const playerIndex = (id: string) => draft.players.findIndex((p) => p.id === id);
  /** Heroes of the players before `player`, who already chose. */
  const earlier = (player: number) => draft.picks.filter((x) => playerIndex(x.playerId) < player);
  /** Room for a second hero: everyone after still gets one, at most four in all. */
  const canTakeSecond = (player: number) => earlier(player).length + 2 + (draft.players.length - player - 1) <= MAX_HEROES;

  function setPick(player: number, slot: 0 | 1, classId: string | null): void {
    const playerId = (draft.players[player] as PlayerInfo).id;
    draft.picks = draft.picks.filter((x) => !(x.playerId === playerId && x.slot === slot));
    if (classId) draft.picks.push({ classId, playerId, slot });
  }

  /** After a player confirms: later players lose heroes taken meanwhile and second heroes that no longer fit. */
  function settleLater(player: number): void {
    const before = earlier(player + 1);
    const taken = new Set(before.map((x) => x.classId));
    const later: Pick[] = [];
    const sorted = draft.picks.filter((x) => playerIndex(x.playerId) > player).sort((a, b) => playerIndex(a.playerId) - playerIndex(b.playerId) || a.slot - b.slot);
    for (const x of sorted) {
      const rest = draft.players.length - playerIndex(x.playerId) - 1;
      if (taken.has(x.classId) || (x.slot === 1 && before.length + later.length + 1 + rest > MAX_HEROES)) continue;
      taken.add(x.classId);
      later.push(x);
    }
    draft.picks = [...before, ...later];
  }

  function setPlayers(n: number): void {
    const count = Math.max(1, Math.min(MAX_PLAYERS, n));
    while (draft.players.length < count) draft.players.push({ id: `p${draft.players.length + 1}`, name: '' });
    draft.players = draft.players.slice(0, count);
    const ids = new Set(draft.players.map((p) => p.id));
    draft.picks = draft.picks.filter((x) => ids.has(x.playerId));
    settleLater(-1);
    render();
  }

  function go(next: Step): void {
    step = next;
    localStore.set(KEY, JSON.stringify(draft));
    render();
    root.scrollTo?.({ top: 0 });
  }

  /** The step after a player is done: hand the device on, or the party. */
  function afterPlayer(player: number): void {
    settleLater(player);
    if (player + 1 >= draft.players.length) go({ kind: 'party' });
    else go(handoff ? { kind: 'handoff', player: player + 1 } : { kind: 'hero', player: player + 1, slot: 0 });
  }

  function back(): void {
    const last = draft.players.length - 1;
    const lastStep = (p: number): Step => ({ kind: 'hero', player: p, slot: pickOf(p, 1) ? 1 : 0 });
    if (step.kind === 'setup') o.onBack();
    else if (step.kind === 'party') go(lastStep(last));
    else if (step.kind === 'handoff') go(lastStep(step.player - 1));
    else if (step.slot === 1) go({ kind: 'hero', player: step.player, slot: 0 });
    else if (step.player === 0) go({ kind: 'setup' });
    else go(handoff ? { kind: 'handoff', player: step.player } : lastStep(step.player - 1));
  }

  function start(): void {
    localStore.set(KEY, JSON.stringify(draft));
    const players = draft.players.map((p, i) => ({ id: p.id, name: nameOf(i) }));
    // Heroes in player order, so the curtain passes the tablet around the table once.
    const heroes = [...draft.picks].sort((a, b) => playerIndex(a.playerId) - playerIndex(b.playerId) || a.slot - b.slot);
    o.onStart(
      {
        scenarioId: draft.scenarioId,
        seed: Math.floor(Math.random() * 1_000_000_000),
        heroes: heroes.map((x) => ({ classId: x.classId, playerId: x.playerId, level: 1 })),
        difficulty: draft.difficulty,
        variants: { ...settings.get().variants },
      },
      players,
    );
  }

  function setupStep(): HTMLElement[] {
    const c = o.content;
    return [
      section(
        t('ui.scenario'),
        h(
          'div',
          { class: 'gseg' },
          Object.values(c.scenarios).map((sc) =>
            h('button', { class: 'gbtn gbtn-chip', 'aria-pressed': String(sc.id === draft.scenarioId), onclick: () => ((draft.scenarioId = sc.id), render()) }, `${sc.number}. ${t(`scenario.${sc.id}`)}`),
          ),
        ),
        h('p', { class: 'gside-hint' }, t(`scenario.${draft.scenarioId}.goal`)),
      ),
      section(
        t('menu.players'),
        h(
          'div',
          { class: 'grow' },
          h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.players.less'), disabled: draft.players.length <= 1, onclick: () => setPlayers(draft.players.length - 1) }, icon('remove-player')),
          h('b', { class: 'gcount' }, draft.players.length),
          h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.players.more'), disabled: draft.players.length >= MAX_PLAYERS, onclick: () => setPlayers(draft.players.length + 1) }, icon('add-player')),
          draft.players.map((p, i) =>
            h('input', {
              class: 'ginput',
              type: 'text',
              maxlength: 16,
              value: p.name,
              placeholder: t('menu.player', { n: i + 1 }),
              'aria-label': t('menu.player', { n: i + 1 }),
              oninput: (e: Event) => (p.name = (e.target as HTMLInputElement).value),
            }),
          ),
        ),
        h('p', { class: 'gside-hint' }, t('newGame.players.text')),
      ),
      section(
        t('ui.difficulty'),
        h(
          'div',
          { class: 'gseg' },
          (['easy', 'normal', 'hard'] as const).map((d) => h('button', { class: 'gbtn gbtn-chip', 'aria-pressed': String(d === draft.difficulty), onclick: () => ((draft.difficulty = d), render()) }, t(`ui.difficulty.${d}`))),
        ),
        h('p', { class: 'gside-hint gnew-rules' }, rulesSummary(), ' ', h('small', null, t('menu.rules.where'))),
      ),
      h('footer', { class: 'gpage-foot' }, artButton('right', t('newGame.next'), () => go({ kind: 'hero', player: 0, slot: 0 }), { cls: 'is-go' })),
    ];
  }

  function handoffStep(player: number): HTMLElement[] {
    return [
      h(
        'section',
        { class: 'gnew-handoff' },
        h('p', { class: 'gnew-kicker' }, t('newGame.handoff.title')),
        h('h2', null, nameOf(player)),
        h('p', { class: 'gside-hint' }, t('newGame.handoff.text', { name: nameOf(player) })),
        artButton('play', t('newGame.handoff.go', { name: nameOf(player) }), () => go({ kind: 'hero', player, slot: 0 }), { cls: 'is-go' }),
      ),
    ];
  }

  function heroPickStep(player: number, slot: 0 | 1): HTMLElement[] {
    const own = pickOf(player, slot);
    const other = pickOf(player, slot === 0 ? 1 : 0);
    // A hero kept from the last game that someone before has taken meanwhile is dropped.
    const taken = new Map(earlier(player).map((x) => [x.classId, nameOf(playerIndex(x.playerId))]));
    if (other) taken.set(other.classId, slot === 0 ? t('newGame.secondHero') : t('newGame.firstHero'));
    if (own && taken.has(own.classId)) setPick(player, slot, null);
    const chosen = pickOf(player, slot)?.classId ?? null;
    const done = () => {
      if (slot === 0 && !canTakeSecond(player)) setPick(player, 1, null);
      afterPlayer(player);
    };
    return [
      heroStep({
        content: o.content,
        playerName: nameOf(player),
        slot,
        chosen,
        taken,
        onChoose: (classId) => (setPick(player, slot, classId), render()),
        onChange: render,
      }),
      h(
        'footer',
        { class: 'gpage-foot' },
        slot === 0 && canTakeSecond(player)
          ? h('button', { class: 'gbtn gnew-second-btn', disabled: !chosen, onclick: () => go({ kind: 'hero', player, slot: 1 }) }, icon('add-player'), ' ', pickOf(player, 1) ? t('newGame.second.edit') : t('newGame.second.add'))
          : null,
        slot === 1 ? h('button', { class: 'gbtn', onclick: () => (setPick(player, 1, null), afterPlayer(player)) }, t('newGame.second.none')) : null,
        artButton('check', t('newGame.done'), done, { cls: 'is-go', disabled: !chosen }),
      ),
    ];
  }

  function partyStep(): HTMLElement[] {
    return [
      section(
        t('newGame.party'),
        h('p', { class: 'gside-hint' }, `${t(`scenario.${draft.scenarioId}`)} · ${t(`ui.difficulty.${draft.difficulty}`)}`),
        h(
          'div',
          { class: 'gnew-party' },
          draft.players.map((p, i) =>
            h(
              'button',
              { class: 'gnew-member', onclick: () => go(handoff && i > 0 ? { kind: 'handoff', player: i } : { kind: 'hero', player: i, slot: 0 }), title: t('newGame.edit') },
              h('b', null, nameOf(i)),
              draft.picks
                .filter((x) => x.playerId === p.id)
                .sort((a, b) => a.slot - b.slot)
                .map((x) => h('span', { class: `gnew-member-hero${x.slot === 1 ? ' is-second' : ''}` }, bust(x.classId), t(`class.${x.classId}`))),
            ),
          ),
        ),
      ),
      h('footer', { class: 'gpage-foot' }, artButton('play', t('menu.start'), start, { cls: 'is-go', disabled: draft.players.some((_, i) => !pickOf(i, 0)) })),
    ];
  }

  function title(): string {
    if (step.kind === 'setup') return t('ui.newGame');
    if (step.kind === 'party') return t('newGame.party.title');
    if (step.kind === 'handoff') return t('newGame.handoff.title');
    return step.slot === 1 ? t('newGame.second.title', { name: nameOf(step.player) }) : t('newGame.choose', { name: nameOf(step.player) });
  }

  function progress(): HTMLElement {
    const at = step.kind === 'setup' ? 0 : step.kind === 'party' ? draft.players.length + 1 : step.player + 1;
    const labels = [t('newGame.step.setup'), ...draft.players.map((_, i) => nameOf(i)), t('newGame.step.party')];
    return h(
      'ol',
      { class: 'gnew-steps', 'aria-label': t('newGame.steps') },
      labels.map((label, i) => h('li', { class: i < at ? 'is-done' : i === at ? 'is-now' : '', 'aria-current': i === at ? 'step' : null }, label)),
    );
  }

  function render(): void {
    const body = step.kind === 'setup' ? setupStep() : step.kind === 'handoff' ? handoffStep(step.player) : step.kind === 'hero' ? heroPickStep(step.player, step.slot) : partyStep();
    root.replaceChildren(
      menuBackdrop(true),
      h('header', { class: 'gpage-head' }, h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.back'), onclick: back }, icon('left')), h('h1', null, title())),
      progress(),
      ...body,
    );
  }

  render();
  return root;
}

export interface HeroStepOptions {
  content: LoadedContent;
  playerName: string;
  /** 1: the player's second hero, shown apart from the first. */
  slot: 0 | 1;
  chosen: string | null;
  /** Heroes others have (class → who). */
  taken: Map<string, string>;
  onChoose: (classId: string) => void;
  /** Hint level changed. */
  onChange: () => void;
}

/** One player's hero choice: the gallery, the chosen hero's details and deck, its hint level. */
export function heroStep(o: HeroStepOptions): HTMLElement {
  const c = o.content;
  const chosen = o.chosen ? c.heroes[o.chosen] : undefined;
  return h(
    'div',
    { class: `gnew-hero${o.slot === 1 ? ' is-second' : ''}` },
    o.slot === 1 ? h('p', { class: 'gnew-second-note' }, icon('add-player'), ' ', t('newGame.second.text', { name: o.playerName })) : null,
    h(
      'div',
      { class: 'gnew-gallery', role: 'radiogroup', 'aria-label': t('newGame.heroes') },
      CLASS_ORDER.filter((id) => c.heroes[id]).map((id) => {
        const owner = o.taken.get(id);
        return h(
          'button',
          { class: 'gnew-tile', role: 'radio', 'aria-checked': String(id === o.chosen), disabled: !!owner, onclick: () => o.onChoose(id) },
          bust(id),
          h('b', null, t(`class.${id}`)),
          h('span', null, t(`class.${id}.role`)),
          owner ? h('small', { class: 'gnew-owner' }, owner) : null,
        );
      }),
    ),
    chosen
      ? h(
          'section',
          { class: 'gsection gnew-detail' },
          h('h2', null, t(`class.${chosen.id}`), ' ', h('small', { class: `gtag is-${chosen.complexity}` }, t(`complexity.${chosen.complexity}`))),
          h('p', null, t(`class.${chosen.id}.role`), ' · ', `${t('stat.hp')} ${chosen.hpByLevel[0] ?? ''} · ${t('menu.handSize', { n: chosen.handSize })}`),
          h('h3', null, t('settings.hints')),
          hintRow(chosen.id, o.onChange),
        )
      : h('p', { class: 'gside-hint gnew-pickfirst' }, t('newGame.pickFirst')),
  );
}

function bust(classId: string): HTMLElement {
  const url = heroBustUrl(classId);
  return h('span', { class: 'gnew-bust', 'aria-hidden': 'true' }, url ? h('img', { src: url, alt: '', draggable: 'false', loading: 'lazy' }) : null);
}

/** «Правила: форк» or «Правила: свої (4 з 7)» for the rules set in Settings. */
function rulesSummary(): string {
  const v = settings.get().variants;
  const on = VARIANT_ORDER.filter((k) => v[k]).length;
  const name = on === VARIANT_ORDER.length ? t('menu.rules.fork') : on === 0 ? t('menu.rules.base') : t('menu.rules.customCount', { n: on, of: VARIANT_ORDER.length });
  return `${t('menu.rules')}: ${name}.`;
}

function section(title: string, ...body: (HTMLElement | HTMLElement[] | null)[]): HTMLElement {
  return h('section', { class: 'gsection' }, h('h2', null, title), body);
}
