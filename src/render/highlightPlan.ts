// Turns BoardHighlights into per-hex cells and per-figure marks. Pure, so the merge rules are tested:
// one hex shows one tint (area over the path end over the path over reachable), and a reachable hex
// keeps its cost label under a path dot.

import { hexKey, type Hex, type HexKey } from '../rules/hex';
import type { FigureId } from '../rules/state';
import type { BoardHighlights } from './view';

export type CellKind = 'reach' | 'path' | 'pathEnd' | 'area';

export interface HighlightCell {
  hex: Hex;
  kind: CellKind;
  /** Movement cost label (from `reachable`). */
  cost?: number;
}

export interface FigureMark {
  figureId: FigureId;
  /** Expected damage label before the modifier, if given. */
  expectedDamage?: number;
}

export interface HighlightPlan {
  cells: HighlightCell[];
  targets: FigureMark[];
  /** Path hexes in order (for the dotted line), start excluded as given. */
  path: Hex[];
}

const PRIORITY: Record<CellKind, number> = { reach: 0, path: 1, pathEnd: 2, area: 3 };

export const CELL_COLORS: Record<CellKind, string> = {
  reach: '#ffd36b',
  path: '#fff1b8',
  pathEnd: '#ffffff',
  area: '#ff6a4d',
};

export function planHighlights(h: BoardHighlights): HighlightPlan {
  const cells = new Map<HexKey, HighlightCell>();
  const put = (hex: Hex, kind: CellKind, cost?: number) => {
    const key = hexKey(hex);
    const old = cells.get(key);
    const keepCost = cost ?? old?.cost;
    if (!old || PRIORITY[kind] >= PRIORITY[old.kind]) {
      cells.set(key, { hex: [hex[0], hex[1]], kind, ...(keepCost !== undefined ? { cost: keepCost } : {}) });
    } else if (cost !== undefined) {
      old.cost = cost;
    }
  };
  for (const r of h.reachable ?? []) put(r.hex, 'reach', r.cost);
  const path = h.path ?? [];
  path.forEach((hex, i) => put(hex, i === path.length - 1 ? 'pathEnd' : 'path'));
  for (const hex of h.area ?? []) put(hex, 'area');

  const marks = new Map<FigureId, FigureMark>();
  for (const id of h.targets ?? []) marks.set(id, { figureId: id });
  for (const [id, dmg] of Object.entries(h.expectedDamage ?? {})) {
    const m = marks.get(id) ?? { figureId: id };
    m.expectedDamage = dmg;
    marks.set(id, m);
  }
  return { cells: [...cells.values()], targets: [...marks.values()], path: path.map((x) => [x[0], x[1]] as Hex) };
}
