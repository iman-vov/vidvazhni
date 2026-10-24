// Inline SVG icons for cards, panels and buttons. Elements and conditions differ by shape, not only
// by colour (design doc, «Загальне»). 24×24 viewBox, drawn in currentColor.

const S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

const ICONS: Record<string, string> = {
  // Steps
  attack: `<path ${S} d="M19 4 8.5 14.5M5.5 11.5l7 7M4 20l3-3"/><path ${F} d="M19 4h1v1l-1 0z"/>`,
  move: `<path ${S} d="M4 12h13M12 6l6 6-6 6"/>`,
  jump: `<path ${S} d="M3 19c3-12 13-12 17-3"/><path ${S} d="M20 10v6h-6"/>`,
  fly: `<path ${S} d="M3 13c4-1 6-5 9-8 1 4 4 7 9 8-5 1-7 3-9 6-2-3-4-5-9-6z"/>`,
  range: `<circle ${S} cx="12" cy="12" r="8"/><circle ${S} cx="12" cy="12" r="3.5"/><circle ${F} cx="12" cy="12" r="1"/>`,
  heal: `<path ${F} d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z"/>`,
  shield: `<path ${S} d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>`,
  retaliate: `<path ${S} d="M12 2l2.2 6 6.3-1.6-4.4 4.6 4.4 4.6-6.3-1.6L12 20l-2.2-6-6.3 1.6 4.4-4.6-4.4-4.6 6.3 1.6z"/>`,
  push: `<path ${S} d="M5 6l6 6-6 6M12 6l6 6-6 6"/>`,
  pull: `<path ${S} d="M19 6l-6 6 6 6M12 6l-6 6 6 6"/>`,
  pierce: `<path ${S} d="M3 12h17M15 7l5 5-5 5M10 5v14"/>`,
  targets: `<circle ${S} cx="12" cy="12" r="7"/><path ${S} d="M12 2v5M12 17v5M2 12h5M17 12h5"/>`,
  area: `<path ${S} d="M7 4l3 0 1.5 2.6L10 9.2H7L5.5 6.6zM14 4h3l1.5 2.6L17 9.2h-3l-1.5-2.6zM10.5 10.5h3l1.5 2.6-1.5 2.6h-3L9 13.1z"/>`,
  provoke: `<path ${S} d="M12 3 22 20H2z"/><path ${S} d="M12 9v5M12 17v.5"/>`,
  infuse: `<circle ${S} cx="12" cy="12" r="8"/><path ${S} d="M12 8v8M8 12h8"/>`,
  consume: `<circle ${S} cx="12" cy="12" r="8"/><path ${S} d="M8 12h8"/>`,
  loot: `<circle ${S} cx="12" cy="12" r="8"/><circle ${S} cx="12" cy="12" r="4"/>`,
  summon: `<circle ${S} cx="12" cy="8" r="4"/><path ${S} d="M4 21c1-5 4-7 8-7s7 2 8 7"/>`,
  trap: `<path ${S} d="M2 17l3-7 3 7 3-7 2 7 3-7 3 7 3-7"/>`,
  teleport: `<circle ${S} stroke-dasharray="3 3" cx="12" cy="12" r="8"/><path ${S} d="M9 12h7M13 9l3 3-3 3"/>`,
  special: `<path ${S} d="M12 3l2.5 6.2L21 10l-5 4.3 1.6 6.7L12 17.4 6.4 21 8 14.3 3 10l6.5-.8z"/>`,
  // Card marks
  xp: `<path ${F} d="M12 2.5l2.8 6 6.6.7-5 4.5 1.4 6.5L12 16.9l-5.8 3.3 1.4-6.5-5-4.5 6.6-.7z"/>`,
  loss: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M8 8l8 8M16 8l-8 8"/>`,
  active: `<path ${S} d="M20 12a8 8 0 1 1-3-6.2"/><path ${S} d="M18 2v5h-5"/>`,
  momentum: `<path ${F} d="M13.5 2 4 14h7l-1.5 8L20 10h-7z"/>`,
  initiative: `<path ${S} d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9"/>`,
  hp: `<path ${F} d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/>`,
  coin: `<circle ${F} cx="12" cy="12" r="8"/>`,
  hand: `<rect ${S} x="4" y="6" width="9" height="14" rx="1.5"/><rect ${S} x="11" y="3" width="9" height="14" rx="1.5"/>`,
  discard: `<rect ${S} x="5" y="4" width="11" height="16" rx="1.5"/><path ${S} d="M19 8v12H9"/>`,
  rest: `<path ${S} d="M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3z"/>`,
  item: `<path ${S} d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2"/>`,
  // Elements (shapes differ)
  fire: `<path ${F} d="M12 2c3 5 7 7 7 12a7 7 0 0 1-14 0c0-3 2-5.5 3.5-7.5.5 2.5 1.5 3.5 3 4 0-3-.5-5.5.5-8.5z"/>`,
  ice: `<path ${S} d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2"/>`,
  air: `<path ${S} d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6"/>`,
  earth: `<path ${F} d="M2 20 9 7l4 7 3-4 6 10z"/>`,
  light: `<circle ${F} cx="12" cy="12" r="4.5"/><path ${S} d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>`,
  dark: `<path ${F} d="M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3z"/>`,
  any: `<circle ${S} cx="12" cy="12" r="8"/><path ${S} d="M12 4v16M4 12h16"/>`,
  // Conditions (shapes differ)
  poison: `<path ${F} d="M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/>`,
  wound: `<path ${S} d="M6 4l5 7-5 9M14 4l5 7-5 9"/>`,
  immobilize: `<rect ${S} x="5" y="11" width="14" height="10" rx="2"/><path ${S} d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
  disarm: `<path ${S} d="M19 4l-5 5M11 12l-5 5M5.5 11.5l3 3M4 20l3-3M14 14l3 3"/>`,
  stun: `<path ${S} d="M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4-4 6 6 0 1 1-6 6"/>`,
  muddle: `<path ${S} d="M8 8a4 4 0 1 1 6 3.5c-1.5.8-2 1.6-2 3.5"/><circle ${F} cx="12" cy="19" r="1.4"/>`,
  invisible: `<path ${S} stroke-dasharray="3 2.5" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path ${S} d="M4 20 20 4"/>`,
  strengthen: `<path ${S} d="M6 13l6-6 6 6M6 19l6-6 6 6"/>`,
  bless: `<circle ${S} cx="12" cy="12" r="3"/><path ${S} d="M12 2v4M12 18v4M2 12h4M18 12h4"/>`,
  curse: `<path ${S} d="M12 21 2.5 6h19z"/><path ${S} d="M9 10l6 6M15 10l-6 6"/>`,
  // Intents
  approach: `<path ${S} d="M5 19 19 5M10 5h9v9"/>`,
  hold: `<path ${S} d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path ${S} d="M12 8v8"/>`,
  early: `<path ${S} d="M13 5l-6 7 6 7M19 5l-6 7 6 7"/>`,
  late: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 7v5l4 2"/>`,
  // Controls
  undo: `<path ${S} d="M9 14 4 9l5-5"/><path ${S} d="M4 9h10a6 6 0 0 1 0 12h-3"/>`,
  skip: `<path ${S} d="M5 5l7 7-7 7M13 5l7 7-7 7"/>`,
  menu: `<path ${S} d="M4 6h16M4 12h16M4 18h16"/>`,
  close: `<path ${S} d="M6 6l12 12M18 6 6 18"/>`,
  left: `<path ${S} d="M15 5l-7 7 7 7"/>`,
  right: `<path ${S} d="M9 5l7 7-7 7"/>`,
  up: `<path ${S} d="M5 15l7-7 7 7"/>`,
  down: `<path ${S} d="M5 9l7 7 7-7"/>`,
  check: `<path ${S} d="M4 12l5 5L20 6"/>`,
  rotate: `<path ${S} d="M20 12a8 8 0 1 1-2.3-5.7"/><path ${S} d="M20 4v5h-5"/>`,
  hint: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 11v6"/><circle ${F} cx="12" cy="7.5" r="1.3"/>`,
  revive: `<path ${F} d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/><path stroke="#1d2433" stroke-width="2.2" d="M12 8v7M8.5 11.5h7"/>`,
  monster: `<path ${S} d="M4 20V10a8 8 0 0 1 16 0v10l-3-2-2 2-3-2-3 2-2-2z"/><circle ${F} cx="9" cy="10" r="1.4"/><circle ${F} cx="15" cy="10" r="1.4"/>`,
  hero: `<circle ${S} cx="12" cy="7" r="4"/><path ${S} d="M5 21c0-5 3-8 7-8s7 3 7 8"/>`,
};

/** Name of the icon for a step type (falls back to `special`). */
export function stepIcon(type: string): string {
  return type in ICONS ? type : type === 'condition' ? 'special' : 'special';
}

export function hasIcon(name: string): boolean {
  return name in ICONS;
}

/** A span holding the icon; `label` makes it readable for screen readers. */
export function icon(name: string, cls = '', label?: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = `gi gi-${name}${cls ? ` ${cls}` : ''}`;
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS.special}</svg>`;
  if (label) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label);
  }
  return el;
}
