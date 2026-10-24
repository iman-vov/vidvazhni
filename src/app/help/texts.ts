// Texts of the rules reference and the tutorial (data/help/<lang>.json; merged into the i18n tables by
// loadTranslations) and a small renderer for their bodies: paragraphs split by a blank line, single
// line breaks kept, **bold** and `{icon:name}` placeholders.

import de from '../../../data/help/de.json';
import en from '../../../data/help/en.json';
import uk from '../../../data/help/uk.json';
import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { plain, rich } from '../../ui/icons';

export const HELP_TEXTS = { uk, de, en } as const;

function inline(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  text.split(/(\*\*[^*]+\*\*)/).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) out.push(h('b', null, rich(part.slice(2, -2))));
    else out.push(...rich(part));
  });
  return out;
}

/** A body text as <p> elements. */
export function richBody(text: string): HTMLElement[] {
  return text.split(/\n\s*\n/).map((para) =>
    h(
      'p',
      null,
      para.split('\n').map((line, i) => [i > 0 ? h('br') : null, inline(line)]),
    ),
  );
}

/** One line of rich text (no paragraphs). */
export function richLine(text: string): (Node | string)[] {
  return inline(text);
}

/** Text for search: placeholders as words, no markup, lower case. */
export function searchText(key: string): string {
  return plain(t(key)).replace(/\*\*/g, '').toLowerCase();
}
