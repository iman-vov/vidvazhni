// Settings: language, graphics quality, music / sound / voice volume (stored; no audio yet) and the
// hint level per hero. Used as a screen from the main menu and inside the in-game menu.

import { getGraphicsQuality, GRAPHICS_QUALITIES, setGraphicsQuality, type GraphicsQuality } from '../../render/quality';
import { h } from '../../ui/dom';
import { getLang, LANGS, setLang, t } from '../../ui/i18n';
import { HINT_LEVELS, settings, type Volumes } from '../settings';

const CLASS_ORDER = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'];

export interface SettingsPanelOptions {
  /** Hero classes to show hint levels for (default: all). */
  heroes?: string[];
  onQuality?: (q: GraphicsQuality) => void;
  onSpeed?: (speed: number) => void;
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
      h('p', { class: 'gside-hint' }, t('settings.volume.none')),
      h('h3', null, t('settings.hints')),
      h('p', { class: 'gside-hint' }, t('settings.hints.text')),
      (o.heroes ?? CLASS_ORDER).map((classId) => hintRow(classId, render)),
      ].flat(),
    );
  };
  render();
  return root;
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
