// Settings: language, graphics quality, floor details, music / sound / voice volume (src/audio) and the
// hint level per hero, and «Сюжет» (full / short / off). Used as a screen from the main menu and inside the in-game menu.

import { getGraphicsQuality, GRAPHICS_QUALITIES, setGraphicsQuality, type GraphicsQuality } from '../../render/quality';
import { FLOOR_DETAILS, floorDetail, setFloorDetail } from '../../render/floorDetail';
import { h } from '../../ui/dom';
import { getLang, LANGS, setLang, t } from '../../ui/i18n';
import { BASE_RULES, FULL_FORK, VARIANT_ORDER, type Variants } from '../../rules/variants';
import { HINT_LEVELS, settings, type Volumes } from '../settings';
import { STORY_MODES, type StoryMode } from '../story';

const CLASS_ORDER = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'];

export interface SettingsPanelOptions {
  /** Hero classes to show hint levels for (default: all). */
  heroes?: string[];
  onQuality?: (q: GraphicsQuality) => void;
  onSpeed?: (speed: number) => void;
  /** The current campaign's «Сюжет» (it is saved with the campaign); absent = the device setting. */
  story?: () => StoryMode;
  onStory?: (mode: StoryMode) => void;
}

export function settingsPanel(o: SettingsPanelOptions = {}): HTMLElement {
  const root = h('div', { class: 'gsettings' });
  const render = () => {
    const s = settings.get();
    const quality = getGraphicsQuality();
    root.replaceChildren(
      ...[
      field(
        t('ui.language'),
        h(
          'div',
          { class: 'gseg', role: 'group' },
          LANGS.map((l) => h('button', { class: 'gbtn gbtn-chip', 'aria-pressed': String(l === getLang()), onclick: () => (setLang(l), render()) }, t(`settings.lang.${l}`))),
        ),
      ),
      field(
        t('settings.quality'),
        h(
          'div',
          { class: 'gseg', role: 'group' },
          GRAPHICS_QUALITIES.map((q) =>
            h(
              'button',
              {
                class: 'gbtn gbtn-chip',
                'aria-pressed': String(q === quality),
                onclick: () => {
                  setGraphicsQuality(q);
                  o.onQuality?.(q);
                  render();
                },
              },
              t(`settings.quality.${q}`),
            ),
          ),
        ),
        t('settings.quality.text'),
      ),
      field(
        t('settings.floorDetail'),
        h(
          'div',
          { class: 'gseg', role: 'group' },
          FLOOR_DETAILS.map((d) =>
            h(
              'button',
              {
                class: 'gbtn gbtn-chip',
                'aria-pressed': String(d === floorDetail(quality)),
                onclick: () => {
                  // The board rebuilds its small-things layer on the change (environment/index.ts).
                  setFloorDetail(d);
                  render();
                },
              },
              t(`settings.floorDetail.${d}`),
            ),
          ),
        ),
        t('settings.floorDetail.text'),
      ),
      field(
        t('settings.speed'),
        h(
          'div',
          { class: 'gseg', role: 'group' },
          [1, 2].map((n) =>
            h(
              'button',
              {
                class: 'gbtn gbtn-chip',
                'aria-pressed': String(s.speed === n),
                onclick: () => {
                  settings.update({ speed: n });
                  o.onSpeed?.(n);
                  render();
                },
              },
              t(`settings.speed.${n}`),
            ),
          ),
        ),
      ),
      field(
        t('settings.story'),
        h(
          'div',
          { class: 'gseg', role: 'group' },
          STORY_MODES.map((m) =>
            h(
              'button',
              {
                class: 'gbtn gbtn-chip',
                'aria-pressed': String((o.story?.() ?? s.story) === m),
                onclick: () => {
                  settings.update({ story: m });
                  o.onStory?.(m);
                  render();
                },
              },
              t(`settings.story.${m}`),
            ),
          ),
        ),
        t('settings.story.text'),
      ),
      (['music', 'sound', 'voice'] as (keyof Volumes)[]).map((k) =>
        field(
          t(`settings.volume.${k}`),
          h('input', {
            type: 'range',
            min: 0,
            max: 100,
            step: 5,
            value: Math.round(s.volume[k] * 100),
            'aria-label': t(`settings.volume.${k}`),
            oninput: (e: Event) => settings.setVolume(k, Number((e.target as HTMLInputElement).value) / 100),
          }),
        ),
      ),
      h('h3', null, t('settings.hints')),
      h('p', { class: 'gside-hint' }, t('settings.hints.text')),
      (o.heroes ?? CLASS_ORDER).map((classId) => hintRow(classId, render)),
      rulesSection(render),
      ].flat(),
    );
  };
  render();
  return root;
}

let rulesOpen = false;

/** Advanced: the rules for new games. The fork is the main set; «Основа» or single mechanics here. */
function rulesSection(onChange: () => void): HTMLElement {
  const v = settings.get().variants;
  const set = (next: Variants) => (settings.update({ variants: next }), onChange());
  const isPreset = (p: Readonly<Variants>) => VARIANT_ORDER.every((k) => v[k] === p[k]);
  return h(
    'details',
    { class: 'gsection grules', open: rulesOpen, ontoggle: (e: Event) => (rulesOpen = (e.target as HTMLDetailsElement).open) },
    h('summary', null, t('settings.rules')),
    h('p', { class: 'gside-hint' }, t('settings.rules.text')),
    h(
      'div',
      { class: 'gseg' },
      h('button', { class: 'gbtn gbtn-chip', 'aria-pressed': String(isPreset(FULL_FORK)), onclick: () => set({ ...FULL_FORK }) }, t('menu.rules.fork')),
      h('button', { class: 'gbtn gbtn-chip', 'aria-pressed': String(isPreset(BASE_RULES)), onclick: () => set({ ...BASE_RULES }) }, t('menu.rules.base')),
    ),
    h(
      'div',
      { class: 'gvariants' },
      VARIANT_ORDER.map((k) =>
        h(
          'label',
          { class: 'gcheck' },
          h('input', { type: 'checkbox', checked: v[k], onchange: (e: Event) => set({ ...v, [k]: (e.target as HTMLInputElement).checked }) }),
          h('span', null, h('b', null, t(`variant.${k}`)), h('small', null, t(`variant.${k}.text`))),
        ),
      ),
    ),
  );
}

/** Hint level buttons for one hero (also used on the new-game screen). */
export function hintRow(classId: string, onChange: () => void): HTMLElement {
  const level = settings.hintLevel(classId);
  return field(
    t(`class.${classId}`),
    h(
      'div',
      { class: 'gseg', role: 'group' },
      HINT_LEVELS.map((n) =>
        h(
          'button',
          { class: 'gbtn gbtn-chip', 'aria-pressed': String(n === level), title: t(`settings.hint.${n}.text`), onclick: () => (settings.setHint(classId, n), onChange()) },
          t(`settings.hint.${n}`),
        ),
      ),
    ),
  );
}

function field(label: string, control: HTMLElement, note?: string): HTMLElement {
  return h('div', { class: 'gfield' }, h('span', { class: 'gfield-label' }, label), control, note ? h('small', null, note) : null);
}
