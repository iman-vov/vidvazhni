// UI art made by tools/ui-assets.mjs (src/ui/game/assets): localized logos and the 9-slice numbers
// of the button base, handed to CSS as custom properties. New art = run the tool again.

import type { Lang } from '../i18n';
import manifest from './assets/manifest.json';
import logoDe from './assets/logo-de.webp';
import logoEn from './assets/logo-en.webp';
import logoUk from './assets/logo-uk.webp';

const LOGOS: Record<Lang, { url: string; width: number; height: number }> = {
  uk: { url: logoUk, ...manifest['logo-uk'] },
  en: { url: logoEn, ...manifest['logo-en'] },
  de: { url: logoDe, ...manifest['logo-de'] },
};

export function logoOf(lang: Lang): { url: string; width: number; height: number } {
  return LOGOS[lang];
}

let installed = false;

/** Sets `--ubtn-slice` and `--ubtn-side` (end width per unit of button height) on :root, once. */
export function installUiArt(): void {
  if (installed) return;
  installed = true;
  const b = manifest.button;
  const root = document.documentElement.style;
  root.setProperty('--ubtn-slice', `${b.slice.top} ${b.slice.right} ${b.slice.bottom} ${b.slice.left}`);
  root.setProperty('--ubtn-side', String(+(b.slice.left / b.height).toFixed(3)));
}
