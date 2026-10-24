// Icon markup as strings, without DOM or i18n, so the board overlay (src/render) can use it too.
// The art lives in ./svg/*.svg only (drawn by tools/icon-svgs.mjs): a navy body in currentColor, one
// accent in var(--icon-accent) and a light halo with inner details in var(--icon-halo); see icons.css.

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

/** Accent colour of each icon (the fallback of var(--icon-accent) in its file; icons without one are plain). */
export const ICON_TINTS: Partial<Record<IconName, string>> = {
  attack: '#c8372d',
  ranged: '#c8372d',
  range: '#c8372d',
  targets: '#c8372d',
  jump: '#d39b22',
  fly: '#d39b22',
  heal: '#2e9a4b',
  shield: '#d39b22',
  retaliate: '#c8372d',
  push: '#d39b22',
  pull: '#2e9a4b',
  pierce: '#c8372d',
  area: '#c8372d',
  loot: '#d39b22',
  provoke: '#c8372d',
  infuse: '#1d8c9c',
  consume: '#1d8c9c',
  summon: '#1d8c9c',
  teleport: '#1d8c9c',
  special: '#d39b22',
  initiative: '#d39b22',
  loss: '#c8372d',
  xp: '#d39b22',
  momentum: '#d39b22',
  active: '#d39b22',
  bless: '#d39b22',
  curse: '#c8372d',
  poison: '#2e9a4b',
  wound: '#c8372d',
  immobilize: '#d39b22',
  disarm: '#c8372d',
  stun: '#d39b22',
  muddle: '#c8372d',
  strengthen: '#2e9a4b',
  fire: '#c8372d',
  ice: '#1d8c9c',
  air: '#1d8c9c',
  earth: '#d39b22',
  light: '#d39b22',
  dark: '#d39b22',
  any: '#1d8c9c',
  'orb-fire': '#c8372d',
  'orb-earth': '#d39b22',
  'orb-air': '#1d8c9c',
  door: '#d39b22',
  trap: '#c8372d',
  chest: '#d39b22',
  coin: '#d39b22',
  hp: '#c8372d',
  monster: '#c8372d',
  hero: '#d39b22',
  elite: '#d39b22',
  gold: '#d39b22',
  'objective-flag': '#c8372d',
  escort: '#d39b22',
  'defend-point': '#d39b22',
  lever: '#d39b22',
  dice: '#d39b22',
  reroll: '#1d8c9c',
  discard: '#d39b22',
  rest: '#d39b22',
  item: '#d39b22',
  approach: '#c8372d',
  early: '#d39b22',
  late: '#d39b22',
  check: '#2e9a4b',
  hint: '#d39b22',
  revive: '#c8372d',
  'add-player': '#2e9a4b',
  'remove-player': '#c8372d',
  compass: '#d39b22',
  map: '#d39b22',
};
