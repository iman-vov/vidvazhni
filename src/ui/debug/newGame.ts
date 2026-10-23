// New-game panel: scenario, 1–4 heroes, difficulty, seed, fork variants (one toggle each, plus
// «Основа» / «Увесь форк» presets), and loading a copied log for replay.

import type { LoadedContent } from '../../rules/load';
import type { GameSetup } from '../../rules/state';
import { BASE_RULES, FULL_FORK, VARIANT_ORDER, type Variants } from '../../rules/variants';
import { h } from '../dom';
import { t } from '../i18n';

const CLASS_ORDER = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'];
const STORAGE_KEY = 'vidvazhni.debug.setup';
const MAX_HEROES = 4;

export function defaultSetup(): GameSetup {
  const stored = readStored();
  if (stored) return stored;
  return {
    scenarioId: 's1',
    seed: randomSeed(),
    heroes: ['warden', 'wind-archer'].map((classId, i) => ({ classId, playerId: `p${i + 1}`, level: 1 })),
    difficulty: 'normal',
    variants: { ...BASE_RULES },
  };
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

function readStored(): GameSetup | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameSetup;
    return { ...s, variants: { ...BASE_RULES, ...s.variants } };
  } catch {
    return null;
  }
}

function store(setup: GameSetup): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // ignore
  }
}

export interface NewGameHandlers {
  start(setup: GameSetup): void;
  load(json: string): string | null;
  close?: () => void;
}

/** Builds the panel; edits a working copy of `initial` and re-renders itself in place. */
export function newGamePanel(content: LoadedContent, initial: GameSetup, on: NewGameHandlers): HTMLElement {
  const setup: GameSetup = structuredClone(initial);
  const root = h('div', { class: 'dbg-modal', role: 'dialog', 'aria-label': t('ui.newGame') });
  let replayText = '';
  let replayError = '';

  const classes = CLASS_ORDER.filter((id) => content.heroes[id]);
  const picked = () => setup.heroes.map((x) => x.classId);

  function toggleHero(id: string): void {
    const ids = picked();
    if (ids.includes(id)) {
      if (ids.length > 1) setup.heroes = setup.heroes.filter((x) => x.classId !== id);
    } else if (ids.length < MAX_HEROES) {
      setup.heroes.push({ classId: id, playerId: '', level: 1 });
    }
    setup.heroes.forEach((x, i) => (x.playerId = `p${i + 1}`));
    render();
  }

  type HeroSetup = GameSetup['heroes'][number] & { items?: string[] };
  function toggleItem(classId: string, itemId: string): void {
    const hero = setup.heroes.find((x) => x.classId === classId) as HeroSetup | undefined;
    if (!hero) return;
    const items = hero.items ?? [];
    hero.items = items.includes(itemId) ? items.filter((i) => i !== itemId) : [...items, itemId];
    render();
  }

  function preset(v: Readonly<Variants>): void {
    setup.variants = { ...v };
    render();
  }

  function render(): void {
    const ids = picked();
    const isPreset = (v: Readonly<Variants>) => VARIANT_ORDER.every((k) => setup.variants[k] === v[k]);
    root.replaceChildren(
      h(
        'div',
        { class: 'dbg-modal-box' },
        h('h2', null, `${t('ui.title')} · ${t('ui.debug')} · ${t('ui.newGame')}`),
        h(
          'label',
          { class: 'dbg-field' },
          h('span', null, t('ui.scenario')),
          h(
            'select',
            { onchange: (e: Event) => (setup.scenarioId = (e.target as HTMLSelectElement).value) },
            Object.values(content.scenarios).map((s) =>
              h('option', { value: s.id, selected: s.id === setup.scenarioId }, `${s.number}. ${t(`scenario.${s.id}`)}`),
            ),
          ),
        ),
        h('div', { class: 'dbg-field' }, h('span', null, t('debug.heroes', { max: MAX_HEROES }))),
        h(
          'div',
          { class: 'dbg-chips' },
          classes.map((id) =>
            h(
              'button',
              { class: 'dbg-chip', 'aria-pressed': String(ids.includes(id)), onclick: () => toggleHero(id) },
              ids.includes(id) ? `${ids.indexOf(id) + 1}. ` : '',
              t(`class.${id}`),
              h('small', null, t(`class.${id}.role`)),
            ),
          ),
        ),
        h(
          'div',
          { class: 'dbg-row' },
          h(
            'label',
            { class: 'dbg-field' },
            h('span', null, t('ui.difficulty')),
            h(
              'select',
              { onchange: (e: Event) => (setup.difficulty = (e.target as HTMLSelectElement).value as GameSetup['difficulty']) },
              (['easy', 'normal', 'hard'] as const).map((d) => h('option', { value: d, selected: d === setup.difficulty }, t(`ui.difficulty.${d}`))),
            ),
          ),
          h(
            'label',
            { class: 'dbg-field' },
            h('span', null, t('debug.seed')),
            h('input', {
              type: 'number',
              inputmode: 'numeric',
              value: setup.seed,
              onchange: (e: Event) => (setup.seed = Number((e.target as HTMLInputElement).value) | 0),
            }),
          ),
          h('button', { class: 'dbg-btn', onclick: () => ((setup.seed = randomSeed()), render()) }, t('debug.randomSeed')),
        ),
        h(
          'details',
          { class: 'dbg-replay', open: setup.heroes.some((x) => (x as HeroSetup).items?.length) },
          h('summary', null, t('debug.items')),
          setup.heroes.map((hero) =>
            h(
              'div',
              { class: 'dbg-row' },
              h('b', null, t(`class.${hero.classId}`)),
              Object.values(content.items).map((item) =>
                h(
                  'button',
                  {
                    class: 'dbg-btn dbg-small',
                    'aria-pressed': String(!!(hero as HeroSetup).items?.includes(item.id)),
                    onclick: () => toggleItem(hero.classId, item.id),
                  },
                  t(`item.${item.id}`),
                ),
              ),
            ),
          ),
        ),
        h('div', { class: 'dbg-field' }, h('span', null, t('ui.variants'))),
        h(
          'div',
          { class: 'dbg-row' },
          h('button', { class: 'dbg-btn', 'aria-pressed': String(isPreset(BASE_RULES)), onclick: () => preset(BASE_RULES) }, t('debug.preset.base')),
          h('button', { class: 'dbg-btn', 'aria-pressed': String(isPreset(FULL_FORK)), onclick: () => preset(FULL_FORK) }, t('debug.preset.fork')),
        ),
        h(
          'div',
          { class: 'dbg-variants' },
          VARIANT_ORDER.map((k) =>
            h(
              'label',
              { class: 'dbg-check' },
              h('input', {
                type: 'checkbox',
                checked: setup.variants[k],
                onchange: (e: Event) => {
                  setup.variants[k] = (e.target as HTMLInputElement).checked;
                  render();
                },
              }),
              h('span', null, h('b', null, t(`variant.${k}`)), h('small', null, t(`variant.${k}.text`))),
            ),
          ),
        ),
        h(
          'div',
          { class: 'dbg-row dbg-row-end' },
          on.close ? h('button', { class: 'dbg-btn', onclick: () => on.close?.() }, t('ui.cancel')) : null,
          h(
            'button',
            {
              class: 'dbg-btn dbg-primary',
              onclick: () => {
                store(setup);
                on.start(structuredClone(setup));
              },
            },
            t('debug.start'),
          ),
        ),
        h(
          'details',
          { class: 'dbg-replay' },
          h('summary', null, t('debug.loadLog')),
          h('textarea', {
            rows: 4,
            value: replayText,
            placeholder: t('debug.loadLog.hint'),
            oninput: (e: Event) => (replayText = (e.target as HTMLTextAreaElement).value),
          }),
          replayError ? h('p', { class: 'dbg-error' }, replayError) : null,
          h(
            'button',
            {
              class: 'dbg-btn',
              onclick: () => {
                replayError = on.load(replayText) ?? '';
                if (replayError) render();
              },
            },
            t('debug.replay'),
          ),
        ),
      ),
    );
  }

  render();
  return root;
}
