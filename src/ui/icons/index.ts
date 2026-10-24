// The game's own icons: `icon(name)` builds an <svg> element, `iconHtml(name)` the same as a string,
// `rich(text)` turns `{icon:name}` placeholders in i18n texts into icons. Never emoji or font
// glyphs (tests/ui/icons-no-emoji.test.ts).

import { has, t } from '../i18n';
import { isIconName, type IconName } from './names';
import { iconSvg, type IconOptions } from './svg';
import './icons.css';

export { ICON_GROUPS, ICON_NAMES, isIconName, type IconGroup, type IconName } from './names';
export { ICON_TINTS, iconInner, iconSvg, type IconOptions } from './svg';

export interface IconElementOptions extends Omit<IconOptions, 'title'> {
  /** Accessible name; default the i18n label `icon.<name>`; false = decorative (next to a text). */
  title?: string | false;
}

/** Screen-reader label of an icon (`icon.<name>`). */
export function iconLabel(name: IconName): string {
  return has(`icon.${name}`) ? t(`icon.${name}`) : name;
}

function titleOf(name: IconName, title: string | false | undefined): string | undefined {
  return title === false ? undefined : (title ?? iconLabel(name));
}

/** The icon as an inline string (for templates). */
export function iconHtml(name: IconName, o: IconElementOptions = {}): string {
  return iconSvg(name, { ...o, title: titleOf(name, o.title) });
}

/** The icon as an <svg> element. */
export function icon(name: IconName, o: IconElementOptions = {}): SVGSVGElement {
  const box = document.createElement('span');
  box.innerHTML = iconHtml(name, o);
  return box.firstElementChild as SVGSVGElement;
}

const PLACEHOLDER = /\{icon:([a-z-]+)\}/g;

/** Text with `{icon:name}` placeholders as text and <svg> nodes (unknown names stay as text). */
export function rich(text: string, o: IconElementOptions = {}): (string | SVGSVGElement)[] {
  const out: (string | SVGSVGElement)[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    const name = m[1] as string;
    if (!isIconName(name)) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(icon(name, o));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Text with placeholders replaced by words, for titles, aria-labels and copied logs. */
export function plain(text: string): string {
  return text.replace(PLACEHOLDER, (m, name: string) => (!isIconName(name) ? m : name === 'arrow' ? '–' : iconLabel(name)));
}
