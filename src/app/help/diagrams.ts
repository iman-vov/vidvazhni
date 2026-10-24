// Small explanatory pictures for the rules reference, drawn as inline SVG strings: a few hexes, card
// shapes and the game's own icons (nested <svg>), labels from i18n (`help.diagram.*`). Colours come
// from the page (currentColor, CSS variables), so they follow the panel theme.

import { t } from '../../ui/i18n';
import { iconInner, ICON_TINTS, type IconName } from '../../ui/icons';

export type DiagramId = 'round' | 'card' | 'initiative' | 'move' | 'attack' | 'modifiers' | 'push' | 'orbs' | 'elements' | 'piles';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function ic(name: IconName, x: number, y: number, size = 22, tint?: string): string {
  const color = tint ?? ICON_TINTS[name] ?? 'currentColor';
  return `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${color}">${iconInner(name)}</svg>`;
}

function label(x: number, y: number, text: string, o: { size?: number; anchor?: string; cls?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? 'middle'}" font-size="${o.size ?? 11}" class="${o.cls ?? 'hd-text'}">${esc(text)}</text>`;
}

const R = 17;
/** Pointy-top hex centred at (x, y). */
function hex(x: number, y: number, cls = 'hd-hex'): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(x + R * Math.cos(a)).toFixed(1)},${(y + R * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return `<polygon points="${pts}" class="${cls}"/>`;
}
/** Centre of hex column `c` in a straight row (row `r` shifts half a hex). */
const hx = (c: number, r = 0) => 24 + c * R * Math.sqrt(3) + (r % 2 ? (R * Math.sqrt(3)) / 2 : 0);
const hy = (r: number) => 30 + r * R * 1.5;

function arrow(x1: number, y1: number, x2: number, y2: number, cls = 'hd-arrow'): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}" marker-end="url(#hd-head)"/>`;
}

const DEFS = '<defs><marker id="hd-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="hd-head"/></marker></defs>';

function frame(w: number, hgt: number, body: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" class="hdiagram" role="img" aria-label="${esc(title)}">${DEFS}${body}</svg>`;
}

function round(): string {
  const steps: [IconName, string][] = [
    ['hand', t('help.diagram.round.choose')],
    ['initiative', t('help.diagram.round.reveal')],
    ['hero', t('help.diagram.round.turns')],
    ['rest', t('help.diagram.round.end')],
  ];
  const body = steps
    .map(([name, text], i) => {
      const x = 46 + i * 82;
      return `<circle cx="${x}" cy="40" r="24" class="hd-node"/>${ic(name, x, 40, 26)}${label(x, 82, text)}${i < 3 ? arrow(x + 27, 40, x + 54, 40) : ''}`;
    })
    .join('');
  return frame(340, 126, body + `<path d="M290,92 C290,124 46,124 46,94" class="hd-loop" marker-end="url(#hd-head)"/>`, t('help.round.title'));
}

function card(): string {
  const body =
    `<rect x="20" y="8" width="130" height="150" rx="10" class="hd-card"/>` +
    `<rect x="20" y="8" width="130" height="24" rx="10" class="hd-card-head"/>` +
    label(32, 25, t('help.diagram.card.name'), { anchor: 'start' }) +
    `<circle cx="134" cy="20" r="11" class="hd-ini"/>` +
    label(134, 24, '25', { size: 11, cls: 'hd-ini-text' }) +
    `<rect x="28" y="40" width="114" height="50" rx="6" class="hd-half is-top"/>${ic('attack', 48, 65)}${label(92, 69, t('help.diagram.card.attack'))}` +
    `<rect x="28" y="100" width="114" height="50" rx="6" class="hd-half is-bottom"/>${ic('move', 48, 125)}${label(92, 129, t('help.diagram.card.move'))}` +
    arrow(240, 20, 150, 20) +
    label(246, 24, t('help.diagram.card.initiative'), { anchor: 'start' }) +
    arrow(240, 65, 146, 65) +
    label(246, 69, t('help.diagram.card.top'), { anchor: 'start' }) +
    arrow(240, 125, 146, 125) +
    label(246, 129, t('help.diagram.card.bottom'), { anchor: 'start' });
  return frame(360, 166, body, t('help.cards.title'));
}

function initiative(): string {
  const order: [IconName, number, string][] = [
    ['hero', 12, t('help.diagram.ini.hero')],
    ['monster', 30, t('help.diagram.ini.monster')],
    ['hero', 55, t('help.diagram.ini.hero2')],
    ['monster', 70, t('help.diagram.ini.monster2')],
  ];
  const body =
    order
      .map(([name, n, text], i) => {
        const x = 46 + i * 82;
        return `<rect x="${x - 30}" y="16" width="60" height="50" rx="10" class="${name === 'hero' ? 'hd-node is-hero' : 'hd-node is-monster'}"/>${ic(name, x, 34, 22)}${label(x, 60, String(n), { size: 13, cls: 'hd-ini-text' })}${label(x, 84, text, { size: 10 })}`;
      })
      .join('') +
    arrow(20, 98, 320, 98) +
    label(170, 112, t('help.diagram.ini.order'), { size: 10 });
  return frame(340, 118, body, t('help.initiative.title'));
}

function move(): string {
  const tiles: [number, number, string][] = [
    [0, 0, 'hd-hex is-hero'],
    [1, 0, 'hd-hex is-path'],
    [2, 0, 'hd-hex is-rough'],
    [3, 0, 'hd-hex is-path'],
    [4, 0, 'hd-hex is-end'],
    [5, 0, 'hd-hex'],
    [1, 1, 'hd-hex is-block'],
    [2, 1, 'hd-hex'],
    [3, 1, 'hd-hex is-trap'],
    [4, 1, 'hd-hex'],
    [5, 1, 'hd-hex'],
  ];
  const body =
    tiles.map(([c, r, cls]) => hex(hx(c, r), hy(r), cls)).join('') +
    ic('hero', hx(0), hy(0), 20) +
    label(hx(1), hy(0) + 4, '1', { cls: 'hd-step' }) +
    label(hx(2), hy(0) + 4, '2+3', { cls: 'hd-step', size: 10 }) +
    label(hx(3), hy(0) + 4, '4', { cls: 'hd-step' }) +
    ic('check', hx(4), hy(0), 18, 'var(--good)') +
    ic('close', hx(1, 1), hy(1), 16, 'var(--quiet)') +
    ic('trap', hx(3, 1), hy(1), 20) +
    label(120, hy(1) + 44, t('help.diagram.move.legend'), { size: 10 });
  return frame(240, 120, body, t('help.move.title'));
}

function attack(): string {
  const body =
    `<rect x="10" y="20" width="70" height="40" rx="8" class="hd-node"/>${ic('attack', 30, 40)}${label(58, 45, '3', { size: 14, cls: 'hd-ini-text' })}` +
    label(92, 45, '+', { size: 16 }) +
    `<rect x="104" y="16" width="38" height="48" rx="6" class="hd-mod"/>${label(123, 45, '+1', { size: 13, cls: 'hd-ini-text' })}` +
    label(156, 45, '−', { size: 16 }) +
    `<rect x="168" y="20" width="50" height="40" rx="8" class="hd-node"/>${ic('shield', 186, 40)}${label(206, 45, '1', { size: 13, cls: 'hd-ini-text' })}` +
    label(232, 45, '=', { size: 16 }) +
    `<rect x="246" y="20" width="64" height="40" rx="8" class="hd-node is-hit"/>${ic('hp', 266, 40)}${label(292, 45, '3', { size: 14, cls: 'hd-ini-text' })}` +
    label(45, 80, t('help.diagram.attack.card'), { size: 10 }) +
    label(123, 80, t('help.diagram.attack.mod'), { size: 10 }) +
    label(193, 80, t('help.diagram.attack.shield'), { size: 10 }) +
    label(278, 80, t('help.diagram.attack.damage'), { size: 10 });
  return frame(320, 92, body, t('help.attack.title'));
}

function modifiers(): string {
  const deck: [string, number, string][] = [
    ['+0', 6, ''],
    ['+1', 5, ''],
    ['−1', 5, ''],
    ['+2', 1, ''],
    ['−2', 1, ''],
    ['×2', 1, 'is-crit'],
    ['', 1, 'is-miss'],
  ];
  const body = deck
    .map(([text, n, cls], i) => {
      const x = 26 + i * 44;
      return `<rect x="${x - 17}" y="12" width="34" height="46" rx="5" class="hd-mod ${cls}"/>${cls === 'is-miss' ? ic('close', x, 35, 20, 'var(--bad)') : label(x, 40, text, { size: 13, cls: 'hd-ini-text' })}${label(x, 74, `×${n}`, { size: 10 })}`;
    })
    .join('');
  return frame(320, 84, body, t('help.modifiers.title'));
}

function push(): string {
  const body =
    [0, 1, 2, 3, 4, 5].map((c) => hex(hx(c), hy(0), c === 1 ? 'hd-hex is-hero' : c === 2 ? 'hd-hex is-foe' : c === 4 ? 'hd-hex is-end' : 'hd-hex')).join('') +
    ic('hero', hx(1), hy(0), 20) +
    ic('monster', hx(2), hy(0), 20) +
    `<path d="M${hx(2)},${hy(0) - 20} Q${hx(3)},${hy(0) - 44} ${hx(4)},${hy(0) - 20}" class="hd-loop" marker-end="url(#hd-head)"/>` +
    label(hx(3), hy(0) - 40, t('help.diagram.push.push'), { size: 10 }) +
    `<path d="M${hx(5)},${hy(0) + 20} Q${hx(4)},${hy(0) + 40} ${hx(3)},${hy(0) + 22}" class="hd-loop is-pull" marker-end="url(#hd-head)"/>` +
    label(hx(4), hy(0) + 52, t('help.diagram.push.pull'), { size: 10 });
  return frame(220, 118, `<g transform="translate(0,22)">${body}</g>`, t('help.push.title'));
}

function orbs(): string {
  const cols: [string, string][] = [
    [t('help.diagram.orbs.now'), 'is-strong'],
    [t('help.diagram.orbs.end1'), 'is-weak'],
    [t('help.diagram.orbs.end2'), 'is-gone'],
  ];
  const body =
    cols
      .map(([text, cls], i) => {
        const x = 56 + i * 104;
        return `<circle cx="${x}" cy="40" r="24" class="hd-orb ${cls}"/>${cls === 'is-gone' ? ic('close', x, 40, 18, 'var(--quiet)') : ic('orb-earth', x, 40, cls === 'is-weak' ? 22 : 30)}${label(x, 82, text, { size: 10 })}${i < 2 ? arrow(x + 28, 40, x + 74, 40) : ''}`;
      })
      .join('');
  return frame(320, 96, body, t('help.orbs.title'));
}

function elements(): string {
  const cols: [string, string][] = [
    [t('help.diagram.el.strong'), 'is-strong'],
    [t('help.diagram.el.weak'), 'is-weak'],
    [t('help.diagram.el.inert'), 'is-gone'],
  ];
  const body = cols
    .map(([text, cls], i) => {
      const x = 56 + i * 104;
      return `<circle cx="${x}" cy="40" r="24" class="hd-orb ${cls}"/>${ic('fire', x, 40, cls === 'is-gone' ? 18 : cls === 'is-weak' ? 22 : 30, cls === 'is-gone' ? 'var(--quiet)' : undefined)}${label(x, 82, text, { size: 10 })}${i < 2 ? arrow(x + 28, 40, x + 74, 40) : ''}`;
    })
    .join('');
  return frame(320, 96, body, t('help.elements.title'));
}

function piles(): string {
  const boxes: [IconName, string, number][] = [
    ['hand', t('help.diagram.piles.hand'), 6],
    ['discard', t('help.diagram.piles.discard'), 3],
    ['loss', t('help.diagram.piles.lost'), 1],
  ];
  const body =
    boxes
      .map(([name, text, n], i) => {
        const x = 50 + i * 110;
        return `<rect x="${x - 36}" y="14" width="72" height="56" rx="10" class="hd-node"/>${ic(name, x, 34, 22)}${label(x, 60, String(n), { size: 13, cls: 'hd-ini-text' })}${label(x, 86, text, { size: 10 })}`;
      })
      .join('') +
    arrow(88, 34, 122, 34) +
    arrow(198, 34, 232, 34) +
    `<path d="M160,94 C160,122 50,122 50,96" class="hd-loop" marker-end="url(#hd-head)"/>` +
    label(160, 132, t('help.diagram.piles.rest'), { size: 10 });
  return frame(320, 138, body, t('help.discard.title'));
}

const DIAGRAMS: Record<DiagramId, () => string> = { round, card, initiative, move, attack, modifiers, push, orbs, elements, piles };

export function diagramSvg(id: DiagramId): string {
  return DIAGRAMS[id]();
}

export const DIAGRAM_IDS = Object.keys(DIAGRAMS) as DiagramId[];
