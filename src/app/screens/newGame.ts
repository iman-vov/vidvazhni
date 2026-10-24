// New game: scenario, 1–4 players with 1–2 heroes each (role and difficulty from data), hint level
// per hero, difficulty, rule set («Основа» / «Форк» / own toggles) and optional equipment.

import type { LoadedContent } from '../../rules/load';
import type { GameSetup } from '../../rules/state';
import { BASE_RULES, FULL_FORK, VARIANT_ORDER, type Variants } from '../../rules/variants';
import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { icon } from '../../ui/game/icons';
import { heroColor } from '../boardViewStub';
import type { PlayerInfo } from '../game';
import { localStore, readJson } from '../storage';
import { hintRow } from './settings';

const CLASS_ORDER = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'];
const KEY = 'vidvazhni.newGame';
const MAX_PLAYERS = 4;
const MAX_HEROES = 4;
const MAX_PER_PLAYER = 2;
const MAX_ITEMS = 3;

type RuleSet = 'base' | 'fork' | 'custom';

interface Draft {
  scenarioId: string;
  players: PlayerInfo[];
  heroes: { classId: string; playerId: string; items: string[] }[];
  difficulty: GameSetup['difficulty'];
  rules: RuleSet;
  variants: Variants;
}

export interface NewGameOptions {
  content: LoadedContent;
  onStart: (setup: GameSetup, players: PlayerInfo[]) => void;
  onBack: () => void;
}

function defaultDraft(): Draft {
  return {
    scenarioId: 's1',
    players: [
      { id: 'p1', name: '' },
      { id: 'p2', name: '' },
    ],
    heroes: [
      { classId: 'warden', playerId: 'p1', items: [] },
      { classId: 'wind-archer', playerId: 'p2', items: [] },
    ],
    difficulty: 'normal',
    rules: 'base',
    variants: { ...BASE_RULES },
  };
}

function loadDraft(): Draft {
  const d = readJson<Draft>(localStore, KEY);
  if (!d?.players?.length || !Array.isArray(d.heroes)) return defaultDraft();
  return { ...defaultDraft(), ...d, variants: { ...BASE_RULES, ...d.variants } };
}

export function newGameScreen(o: NewGameOptions): HTMLElement {
  const draft = loadDraft();
  const root = h('div', { class: 'gpage' });
  let itemsOpen = draft.heroes.some((x) => x.items.length > 0);

  const playerName = (p: PlayerInfo, i: number) => p.name.trim() || t('menu.player', { n: i + 1 });
  const heroesOf = (playerId: string) => draft.heroes.filter((x) => x.playerId === playerId);

  function problem(): string | null {
    if (draft.heroes.length === 0) return t('menu.problem.noHeroes');
    for (const [i, p] of draft.players.entries()) {
      const n = heroesOf(p.id).length;
      if (n === 0) return t('menu.problem.playerNoHero', { name: playerName(p, i) });
      if (n > MAX_PER_PLAYER) return t('menu.problem.playerTooMany', { name: playerName(p, i), max: MAX_PER_PLAYER });
    }
    return null;
  }

  function setPlayers(n: number): void {
    const count = Math.max(1, Math.min(MAX_PLAYERS, n));
    while (draft.players.length < count) draft.players.push({ id: `p${draft.players.length + 1}`, name: '' });
    draft.players = draft.players.slice(0, count);
    const ids = draft.players.map((p) => p.id);
    for (const hero of draft.heroes) if (!ids.includes(hero.playerId)) hero.playerId = ids[ids.length - 1] as string;
    render();
  }

  function toggleHero(classId: string): void {
    if (draft.heroes.some((x) => x.classId === classId)) draft.heroes = draft.heroes.filter((x) => x.classId !== classId);
    else if (draft.heroes.length < MAX_HEROES) {
      // The player with the fewest heroes takes it.
      const owner = [...draft.players].sort((a, b) => heroesOf(a.id).length - heroesOf(b.id).length)[0] as PlayerInfo;
      draft.heroes.push({ classId, playerId: owner.id, items: [] });
    }
    render();
  }

  function setRules(r: RuleSet): void {
    draft.rules = r;
    if (r === 'base') draft.variants = { ...BASE_RULES };
    if (r === 'fork') draft.variants = { ...FULL_FORK };
    render();
  }

  function start(): void {
    if (problem()) return;
    localStore.set(KEY, JSON.stringify(draft));
    const players = draft.players.map((p, i) => ({ id: p.id, name: playerName(p, i) }));
    const order = draft.players.map((p) => p.id);
    // Heroes in player order, so the curtain passes the tablet around the table once.
    const heroes = [...draft.heroes].sort((a, b) => order.indexOf(a.playerId) - order.indexOf(b.playerId));
    o.onStart(
      {
        scenarioId: draft.scenarioId,
        seed: Math.floor(Math.random() * 1_000_000_000),
        heroes: heroes.map((x) => ({ classId: x.classId, playerId: x.playerId, level: 1, ...(x.items.length ? { items: [...x.items] } : {}) })),
        difficulty: draft.difficulty,
        variants: { ...draft.variants },
      },
      players,
    );
  }

  function render(): void {
    const c = o.content;
    const err = problem();
    fill(
      root,
      h('header', { class: 'gpage-head' }, h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.back'), onclick: o.onBack }, icon('left')), h('h1', null, t('ui.newGame'))),
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
      ),
      section(
        t('menu.heroes', { max: MAX_HEROES }),
        h(
          'div',
          { class: 'gclasses' },
          CLASS_ORDER.filter((id) => c.heroes[id]).map((id) => {
            const cls = c.heroes[id];
            const picked = draft.heroes.find((x) => x.classId === id);
            const index = draft.heroes.findIndex((x) => x.classId === id);
            return h(
              'div',
              { class: `gclass${picked ? ' is-picked' : ''}`, style: picked ? { borderColor: heroColor(index) } : {} },
              h(
                'button',
                { class: 'gclass-main', 'aria-pressed': String(!!picked), onclick: () => toggleHero(id) },
                h('b', null, t(`class.${id}`)),
                h('span', null, t(`class.${id}.role`)),
                h('small', { class: `gtag is-${cls?.complexity}` }, t(`complexity.${cls?.complexity ?? 'simple'}`)),
                h('small', { class: 'gside-hint' }, `${t('stat.hp')} ${cls?.hpByLevel[0] ?? ''} · ${t('menu.handSize', { n: cls?.handSize ?? 0 })}`),
              ),
              picked && draft.players.length > 1
                ? h(
                    'div',
                    { class: 'gseg is-small' },
                    draft.players.map((p, i) =>
                      h('button', { class: 'gbtn gbtn-chip', 'aria-pressed': String(picked.playerId === p.id), onclick: () => ((picked.playerId = p.id), render()) }, playerName(p, i)),
                    ),
                  )
                : null,
            );
          }),
        ),
      ),
      draft.heroes.length ? section(t('settings.hints'), h('p', { class: 'gside-hint' }, t('settings.hints.text')), draft.heroes.map((x) => hintRow(x.classId, render))) : null,
      section(
        t('ui.difficulty'),
        h(
          'div',
          { class: 'gseg' },
          (['easy', 'normal', 'hard'] as const).map((d) => h('button', { class: 'gbtn gbtn-chip', 'aria-pressed': String(d === draft.difficulty), onclick: () => ((draft.difficulty = d), render()) }, t(`ui.difficulty.${d}`))),
        ),
      ),
      section(
        t('menu.rules'),
        h(
          'div',
          { class: 'gseg' },
          (['base', 'fork', 'custom'] as const).map((r) => h('button', { class: 'gbtn gbtn-chip', 'aria-pressed': String(r === draft.rules), onclick: () => setRules(r) }, t(`menu.rules.${r}`))),
        ),
        h('p', { class: 'gside-hint' }, t(`menu.rules.${draft.rules}.text`)),
        draft.rules === 'custom'
          ? h(
              'div',
              { class: 'gvariants' },
              VARIANT_ORDER.map((k) =>
                h(
                  'label',
                  { class: 'gcheck' },
                  h('input', { type: 'checkbox', checked: draft.variants[k], onchange: (e: Event) => ((draft.variants[k] = (e.target as HTMLInputElement).checked), render()) }),
                  h('span', null, h('b', null, t(`variant.${k}`)), h('small', null, t(`variant.${k}.text`))),
                ),
              ),
            )
          : null,
      ),
      h(
        'details',
        { class: 'gsection', open: itemsOpen, ontoggle: (e: Event) => (itemsOpen = (e.target as HTMLDetailsElement).open) },
        h('summary', null, t('menu.items')),
        h('p', { class: 'gside-hint' }, t('menu.items.text', { max: MAX_ITEMS })),
        draft.heroes.map((hero) =>
          h(
            'div',
            { class: 'gfield' },
            h('span', { class: 'gfield-label' }, t(`class.${hero.classId}`)),
            h(
              'div',
              { class: 'gseg is-wrap' },
              Object.values(c.items)
                .filter((it) => it.unlockedAfter === 0)
                .map((it) =>
                  h(
                    'button',
                    {
                      class: 'gbtn gbtn-chip',
                      'aria-pressed': String(hero.items.includes(it.id)),
                      onclick: () => {
                        hero.items = hero.items.includes(it.id) ? hero.items.filter((x) => x !== it.id) : hero.items.length < MAX_ITEMS ? [...hero.items, it.id] : hero.items;
                        render();
                      },
                    },
                    t(`item.${it.id}`),
                  ),
                ),
            ),
          ),
        ),
      ),
      h('footer', { class: 'gpage-foot' }, err ? h('p', { class: 'gerror' }, err) : null, h('button', { class: 'gbtn gbtn-primary gbtn-big', disabled: !!err, onclick: start }, t('menu.start'))),
    );
  }

  render();
  return root;
}

function fill(el: HTMLElement, ...parts: (HTMLElement | null)[]): void {
  el.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
}

function section(title: string, ...body: (HTMLElement | HTMLElement[] | null)[]): HTMLElement {
  return h('section', { class: 'gsection' }, h('h2', null, title), body);
}
