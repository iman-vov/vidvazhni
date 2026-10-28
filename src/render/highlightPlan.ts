// Turns BoardHighlights into per-hex cells and per-figure marks. Pure, so the merge rules are tested:
// one hex shows one tint (area over the path end over the path over reachable over threat), and a reachable hex
// keeps its cost label under a path dot.

import { DIRECTIONS, distance, hexKey, type Hex, type HexKey } from '../rules/hex';
import type { IconName } from '../ui/icons/names';
import type { FigureId, GameState } from '../rules/state';
import type { BoardHighlights } from './view';

export type CellKind = 'threat' | 'reach' | 'path' | 'pathEnd' | 'area';

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
  /** Result preview label (heal, shield, push), if given. */
  preview?: { text: string; icon: IconName };
}

/** One side of the range outline: the edge of `hex` toward its neighbour in direction `dir`. */
export interface RangeEdge {
  hex: Hex;
  dir: number;
}

export interface HighlightPlan {
  cells: HighlightCell[];
  targets: FigureMark[];
  /** Path hexes in order (for the dotted line), start excluded as given. */
  path: Hex[];
  /** Outline of the action's range (edges between a hex in range and one outside it). */
  range: RangeEdge[];
  tone: 'enemy' | 'ally';
  /** Sight lines, as given. */
  sight: { from: Hex; to: Hex; hit: boolean }[];
}

const PRIORITY: Record<CellKind, number> = { threat: -1, reach: 0, path: 1, pathEnd: 2, area: 3 };

export const CELL_COLORS: Record<CellKind, string> = {
  threat: '#e2483d',
  reach: '#ffd36b',
  path: '#fff1b8',
  pathEnd: '#ffffff',
  area: '#ff6a4d',
};

/** The outline of the hexes within `radius` of `center` that pass `onBoard` (all when absent). */
export function rangeOutline(center: Hex, radius: number, onBoard?: (hex: Hex) => boolean): RangeEdge[] {
  if (radius < 1) return [];
  const inside = (h: Hex) => distance(h, center) <= radius && (!onBoard || onBoard(h));
  const out: RangeEdge[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      const hex: Hex = [center[0] + q, center[1] + r];
      if (!inside(hex)) continue;
      DIRECTIONS.forEach((d, dir) => {
        if (!inside([hex[0] + d[0], hex[1] + d[1]])) out.push({ hex, dir });
      });
    }
  }
  return out;
}

export function planHighlights(h: BoardHighlights, onBoard?: (hex: Hex) => boolean): HighlightPlan {
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
  for (const hex of h.threat ?? []) put(hex, 'threat');
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
  for (const [id, pv] of Object.entries(h.preview ?? {})) {
    const m = marks.get(id) ?? { figureId: id };
    m.preview = pv;
    marks.set(id, m);
  }
  return {
    cells: [...cells.values()],
    targets: [...marks.values()],
    path: path.map((x) => [x[0], x[1]] as Hex),
    range: h.range ? rangeOutline(h.range.center, h.range.radius, onBoard) : [],
    tone: h.targetTone ?? 'enemy',
    sight: (h.sight ?? []).map((l) => ({ from: [l.from[0], l.from[1]] as Hex, to: [l.to[0], l.to[1]] as Hex, hit: !!l.hit })),
  };
}

/** The figure whose turn it is: the hero the engine waits for, else the current turn-order entry
 *  (a hero or summon; a monster group has no single figure). Null between rounds. */
export function activeFigure(s: Pick<GameState, 'phase' | 'pending' | 'turnOrder' | 'turnIndex' | 'figures'>): FigureId | null {
  const p = s.pending;
  if (p && (p.kind === 'heroTurn' || p.kind === 'stepChoice')) return p.heroId;
  if (s.phase !== 'turns') return null;
  const entry = s.turnOrder[s.turnIndex];
  if (!entry || entry.kind === 'monsterGroup') return null;
  return s.figures[entry.figureId] ? entry.figureId : null;
}
