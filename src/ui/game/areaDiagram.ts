// A small hex pattern for an area attack on a card: the hexes hit in red, the hero's own hex in
// grey for the shapes placed around the hero (arc, line, all around). Drawn from the engine's
// `areaHexes`, so the picture always matches the rules.

import { areaHexes, isFromSelf } from '../../rules/area';
import type { AreaShape } from '../../rules/content';
import type { Hex } from '../../rules/hex';
import { t } from '../i18n';

const NS = 'http://www.w3.org/2000/svg';
const R = 10; // hex radius in viewBox units
const SQ3 = Math.sqrt(3);

/** Flat-top hex centre for axial (q, r), as on the board (render/hexLayout.ts). */
function centre([q, r]: Hex): [number, number] {
  return [R * 1.5 * q, R * SQ3 * (r + q / 2)];
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * 60 * i;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** The most compact rotation (a line lies diagonally instead of standing four hexes tall), then
 *  the one pointing up, so every card reads the same way. The hero's hex counts for shapes placed
 *  around the hero. */
function upright(shape: AreaShape, self: Hex): Hex[] {
  let best: Hex[] = [];
  let bestScore = Infinity;
  for (let d = 0; d < 6; d++) {
    const hexes = areaHexes(shape, self, self, d);
    const all = isFromSelf(shape) ? [...hexes, self] : hexes;
    const xs = all.map((x) => centre(x)[0]);
    const ys = all.map((x) => centre(x)[1]);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const y = hexes.reduce((n, x) => n + centre(x)[1], 0) / hexes.length;
    const score = size * 100 + y;
    if (score < bestScore - 1e-6) (bestScore = score), (best = hexes);
  }
  return best;
}

/** The shape in words («трикутник з 3 гексів»), as the step text says it. */
export function areaText(shape: AreaShape): string {
  return shape.shape === 'line' ? t('area.line', { length: shape.length }) : t(`area.${shape.shape}`);
}

export function areaDiagram(shape: AreaShape, cls = 'garea'): SVGSVGElement {
  const self: Hex = [0, 0];
  const fromSelf = isFromSelf(shape);
  const hit = upright(shape, self);
  const cells: { hex: Hex; kind: 'hit' | 'self' | 'anchor' }[] = hit.map((hex) => ({ hex, kind: 'hit' }));
  if (fromSelf) cells.push({ hex: self, kind: 'self' });
  // Placed shapes: ring the target hex (the anchor).
  else for (const c of cells) if (c.hex[0] === self[0] && c.hex[1] === self[1]) c.kind = 'anchor';
  const xs = cells.map((c) => centre(c.hex)[0]);
  const ys = cells.map((c) => centre(c.hex)[1]);
  const pad = R + 1.5;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) + pad - minX;
  const hgt = Math.max(...ys) + pad - minY;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${hgt.toFixed(2)}`);
  svg.setAttribute('class', cls);
  svg.setAttribute('role', 'img');
  const key = areaText(shape);
  svg.setAttribute('aria-label', key);
  const title = document.createElementNS(NS, 'title');
  title.textContent = key;
  svg.append(title);
  for (const c of cells) {
    const [cx, cy] = centre(c.hex);
    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', hexPoints(cx, cy, R - 0.8));
    poly.setAttribute('class', `garea-${c.kind}`);
    svg.append(poly);
  }
  return svg;
}
