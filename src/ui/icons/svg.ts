// Icon markup as strings, without DOM or i18n, so the board overlay (src/render) can use it too.
// The art lives in ./svg/*.svg only: a body in currentColor, a rounded outline and inner details
// in var(--icon-line). Setting --icon-line to currentColor shows the bare silhouette.

import type { IconName } from './names';

const FILES = import.meta.glob<string>('./svg/*.svg', { query: '?raw', import: 'default', eager: true });

const INNER: Record<string, string> = {};
for (const [file, text] of Object.entries(FILES)) {
  const name = file.slice('./svg/'.length, -'.svg'.length);
  INNER[name] = text
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s*/g, '');
}

/** Names that have a file (the test compares them with ICON_NAMES). */
export function iconFiles(): string[] {
  return Object.keys(INNER).sort();
}

/** The inside of the icon's <svg> element. */
export function iconInner(name: IconName): string {
  return INNER[name] ?? INNER.special ?? '';
}

export interface IconOptions {
  /** Pixels, or any CSS length; default 1.25em (follows the text). */
  size?: number | string;
  /** Accessible name; omitted = decorative (aria-hidden). */
  title?: string;
  /** Extra classes on the <svg>. */
  className?: string;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The icon as an inline <svg> string. */
export function iconSvg(name: IconName, o: IconOptions = {}): string {
  const size = o.size === undefined ? '1.25em' : typeof o.size === 'number' ? `${o.size}` : o.size;
  const a11y = o.title ? `role="img" aria-label="${escapeAttr(o.title)}"` : 'aria-hidden="true"';
  const cls = `vi vi-${name}${o.className ? ` ${o.className}` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" class="${cls}" ${a11y} focusable="false">${iconInner(name)}</svg>`;
}

/** Suggested body colours (elements and conditions keep their colour code; the rest follow the text). */
export const ICON_TINTS: Partial<Record<IconName, string>> = {
  fire: '#ef6a2e',
  ice: '#8fd3f4',
  air: '#bfe3d0',
  earth: '#a3a24a',
  light: '#f6d55c',
  dark: '#8f6cc9',
  any: '#d8cfbf',
  'orb-fire': '#ef6a2e',
  'orb-earth': '#a3a24a',
  'orb-air': '#bfe3d0',
  poison: '#6cc25a',
  wound: '#e0645a',
  immobilize: '#8aa7cf',
  disarm: '#d29a52',
  stun: '#f0d03c',
  muddle: '#b78ae6',
  invisible: '#c7d2e2',
  strengthen: '#f07a3e',
  bless: '#f6e08a',
  curse: '#a77ad6',
  heal: '#7fd47a',
  hp: '#e8594f',
  revive: '#e8594f',
  shield: '#9db8e6',
  retaliate: '#9db8e6',
  xp: '#f3cf5a',
  coin: '#f3c54a',
  elite: '#f3cf5a',
  momentum: '#ffd36e',
  loot: '#d9b26a',
  chest: '#c98d4a',
  door: '#b07a48',
  trap: '#b0a69a',
};
