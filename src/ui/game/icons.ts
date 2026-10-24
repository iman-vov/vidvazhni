// Icons for cards, panels and buttons: the game's own set from src/ui/icons, wrapped in a span the
// game CSS sizes (`.gi`). Elements and conditions differ by shape, not only by colour (design doc,
// «Загальне»).

import type { IconName } from '../icons/names';
import { iconSvg } from '../icons/svg';

export type { IconName };

/** A span holding the icon; `label` makes it readable for screen readers. */
export function icon(name: IconName, cls = '', label?: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = `gi gi-${name}${cls ? ` ${cls}` : ''}`;
  el.innerHTML = iconSvg(name, { size: '100%' });
  if (label) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label);
  }
  return el;
}
