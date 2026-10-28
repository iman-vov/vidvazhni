// Movement: legality of steps, cheapest paths, reachable hexes.
//
// Walking: obstacles are impassable; enemies block; allies can be passed through but not ended on;
// difficult terrain (and water) costs 2; traps and hazardous terrain can be entered (the engine
// applies their effects) and count as negative hexes; closed doors cannot be passed, only a hero
// may end a move on one (that is how doors open).
// Jumping: every hex costs 1 and only the landing hex matters (it must be a legal end hex; a trap
// or hazard there is the only negative hex of the move).
// Flying: every hex costs 1; terrain, obstacles, traps and figures are ignored on the way; the end
// hex must still be legal. Flying never counts negative hexes.
// For every mode: hexes that do not exist (unrevealed rooms, off the map) and thin walls block.
//
// Paths are ranked by (cost, negative hexes) or, with `avoidNegativeHexes`, by
// (negative hexes, cost): a longer path that avoids traps and hazards wins whenever one exists.
// Ties keep the first path found, with neighbours explored in DIRECTIONS order.

import { DIRECTIONS, add, hexEquals, hexKey, parseHexKey, type Hex, type HexKey } from './hex';
import { wallIndex, type WallIndex } from './los';
import type { Figure, FigureId, GameState, Tile } from './state';

export interface MoveOptions {
  /** The moving figure: allies can be passed through, enemies block. */
  figureId: FigureId;
  jump?: boolean;
  fly?: boolean;
  /** Monsters avoid traps and hazardous terrain when another path exists. */
  avoidNegativeHexes?: boolean;
}

export interface PathResult {
  path: Hex[]; // excludes the start hex
  cost: number; // movement points spent (difficult terrain = 2, except jump/fly)
}

/** A path plus the number of negative hexes (traps, hazards) it enters. */
export interface Route extends PathResult {
  negative: number;
}

export type Side = 'party' | 'monsters';

export function sideOf(f: Figure): Side {
  return f.kind === 'monster' ? 'monsters' : 'party';
}

/** Figures standing on the board. Exhausted heroes and dead monsters or summons are gone;
 *  a downed hero (fork «Підняти друга») still occupies its hex. */
export function isOnBoard(f: Figure): boolean {
  if (f.kind === 'hero') return !f.exhausted;
  return f.hp > 0;
}

export function isNegativeTile(t: Tile): boolean {
  return t.trap !== undefined || t.terrain === 'hazardous';
}

export type MoveMode = 'walk' | 'jump' | 'fly';

/** Precomputed movement rules for one figure on one state. */
export interface MoveModel {
  start: Hex;
  startKey: HexKey;
  mode: MoveMode;
  avoid: boolean;
  walls: WallIndex;
  /** Existing hexes one step away, not across a thin wall. */
  steps(key: HexKey): HexKey[];
  /** The figure may continue moving after entering this hex. */
  passable(key: HexKey): boolean;
  /** The figure may end its move here (never true for the start hex). */
  endable(key: HexKey): boolean;
  /** Cost and negative count for entering a hex on the way (end hex included). */
  enterCost(key: HexKey): number;
  enterNegative(key: HexKey): number;
  /** Extra negative count when the move ends here (jump landing). */
  endNegative(key: HexKey): number;
}

export function buildMoveModel(state: GameState, opts: MoveOptions): MoveModel {
  const me = state.figures[opts.figureId];
  if (!me) throw new Error(`geometry: unknown figure ${opts.figureId}`);
  const tiles = state.board.tiles;
  const walls = wallIndex(state.board);
  const mode: MoveMode = opts.fly ? 'fly' : opts.jump ? 'jump' : 'walk';
  const side = sideOf(me);
  const occupant = new Map<HexKey, Figure>();
  for (const f of Object.values(state.figures)) {
    if (f.id !== me.id && isOnBoard(f)) occupant.set(hexKey(f.hex), f);
  }
  const startKey = hexKey(me.hex);
  const isNeg = (key: HexKey): number => {
    const t = tiles[key];
    return t && isNegativeTile(t) ? 1 : 0;
  };
  return {
    start: me.hex,
    startKey,
    mode,
    avoid: opts.avoidNegativeHexes === true,
    walls,
    steps(key) {
      const h = parseHexKey(key);
      const out: HexKey[] = [];
      for (const d of DIRECTIONS) {
        const n = add(h, d);
        const nk = hexKey(n);
        if (tiles[nk] !== undefined && !walls.isThinWall(h, n)) out.push(nk);
      }
      return out;
    },
    passable(key) {
      if (key === startKey) return true;
      const t = tiles[key];
      if (!t) return false;
      if (t.door && !t.door.open) return false;
      if (mode !== 'walk') return true;
      if (t.obstacle) return false;
      const f = occupant.get(key);
      return !f || sideOf(f) === side;
    },
    endable(key) {
      if (key === startKey) return false;
      const t = tiles[key];
      if (!t || t.obstacle || occupant.has(key)) return false;
      if (t.door && !t.door.open) return me.kind === 'hero';
      return true;
    },
    enterCost(key) {
      if (mode !== 'walk') return 1;
      if (me.kind === 'hero' && me.ignoreTerrainTurn === me.turnCount) return 1;
      const t = tiles[key];
      return t && (t.terrain === 'difficult' || t.terrain === 'water') ? 2 : 1;
    },
    enterNegative(key) {
      return mode === 'walk' ? isNeg(key) : 0;
    },
    endNegative(key) {
      return mode === 'jump' ? isNeg(key) : 0;
    },
  };
}

// ─── Labels and a small binary heap ───────────────────────────────────────

export interface Label {
  negative: number;
  cost: number;
}

export function compareLabels(avoid: boolean, a: Label, b: Label): number {
  return avoid ? a.negative - b.negative || a.cost - b.cost : a.cost - b.cost || a.negative - b.negative;
}

class Heap<T> {
  private items: { value: T; seq: number }[] = [];
  private seq = 0;
  constructor(private readonly less: (a: T, b: T) => number) {}
  get size(): number {
    return this.items.length;
  }
  private before(i: number, j: number): boolean {
    const a = this.items[i]!;
    const b = this.items[j]!;
    const c = this.less(a.value, b.value);
    return c < 0 || (c === 0 && a.seq < b.seq);
  }
  push(value: T): void {
    this.items.push({ value, seq: this.seq++ });
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.before(i, p)) break;
      [this.items[i], this.items[p]] = [this.items[p]!, this.items[i]!];
      i = p;
    }
  }
  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (top === undefined || last === undefined) return undefined;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.before(l, m)) m = l;
        if (r < this.items.length && this.before(r, m)) m = r;
        if (m === i) break;
        [this.items[i], this.items[m]] = [this.items[m]!, this.items[i]!];
        i = m;
      }
    }
    return top.value;
  }
}

// ─── Searches ─────────────────────────────────────────────────────────────

export interface SearchNode extends Label {
  prev: HexKey | null;
}

/** Best label to every hex the figure can enter (unbounded), keyed by hex. End hexes that cannot be
 *  passed (closed door for a hero) get a label but are not expanded. Jump landing negatives are
 *  not included; see `routeFrom`. */
export function searchAll(model: MoveModel): Map<HexKey, SearchNode> {
  const best = new Map<HexKey, SearchNode>();
  best.set(model.startKey, { negative: 0, cost: 0, prev: null });
  const heap = new Heap<{ key: HexKey; label: Label }>((a, b) => compareLabels(model.avoid, a.label, b.label));
  heap.push({ key: model.startKey, label: { negative: 0, cost: 0 } });
  while (heap.size > 0) {
    const { key, label } = heap.pop()!;
    const cur = best.get(key)!;
    if (cur.cost !== label.cost || cur.negative !== label.negative) continue;
    if (!model.passable(key)) continue;
    for (const next of model.steps(key)) {
      if (!model.passable(next) && !model.endable(next)) continue;
      const l: Label = { negative: label.negative + model.enterNegative(next), cost: label.cost + model.enterCost(next) };
      const old = best.get(next);
      if (old && compareLabels(model.avoid, l, old) >= 0) continue;
      best.set(next, { ...l, prev: key });
      heap.push({ key: next, label: l });
    }
  }
  return best;
}

/** Path from the start to `key` along `prev` links. */
export function tracePath(nodes: Map<HexKey, SearchNode>, key: HexKey): Hex[] {
  const out: Hex[] = [];
  let k: HexKey | null = key;
  while (k !== null) {
    const n = nodes.get(k);
    if (!n || n.prev === null) break;
    out.push(parseHexKey(k));
    k = n.prev;
  }
  return out.reverse();
}

/** Route to an end hex from an unbounded search, or null when the figure cannot end there. */
export function routeFrom(model: MoveModel, nodes: Map<HexKey, SearchNode>, key: HexKey): Route | null {
  const n = nodes.get(key);
  if (!n || !model.endable(key)) return null;
  return { path: tracePath(nodes, key), cost: n.cost, negative: n.negative + model.endNegative(key) };
}

/** Every hex the figure can end on with at most `budget` movement points (start hex excluded).
 *  With avoidance the best route per hex is the one with fewest negative hexes among those that
 *  fit the budget, so a dynamic programme over (hex, points spent) is used. */
export function searchWithin(model: MoveModel, budget: number): Map<HexKey, Route> {
  const out = new Map<HexKey, Route>();
  if (budget <= 0) return out;
  // layers[c] maps hex -> { negative, prev state } for states reached with exactly c points.
  type State = { negative: number; prevKey: HexKey | null; prevCost: number };
  const layers: Map<HexKey, State>[] = [];
  for (let c = 0; c <= budget; c++) layers.push(new Map());
  layers[0]!.set(model.startKey, { negative: 0, prevKey: null, prevCost: 0 });
  for (let c = 0; c <= budget; c++) {
    for (const [key, st] of layers[c]!) {
      if (!model.passable(key)) continue;
      for (const next of model.steps(key)) {
        if (!model.passable(next) && !model.endable(next)) continue;
        const nc = c + model.enterCost(next);
        if (nc > budget) continue;
        const neg = st.negative + model.enterNegative(next);
        const old = layers[nc]!.get(next);
        if (old && old.negative <= neg) continue;
        layers[nc]!.set(next, { negative: neg, prevKey: key, prevCost: c });
      }
    }
  }
  const trace = (key: HexKey, cost: number): Hex[] => {
    const path: Hex[] = [];
    let k: HexKey | null = key;
    let c = cost;
    while (k !== null) {
      const st: State | undefined = layers[c]!.get(k);
      if (!st || st.prevKey === null) break;
      path.push(parseHexKey(k));
      k = st.prevKey;
      c = st.prevCost;
    }
    return path.reverse();
  };
  const bestAt = new Map<HexKey, Label>();
  for (let c = 0; c <= budget; c++) {
    for (const [key, st] of layers[c]!) {
      if (!model.endable(key)) continue;
      const l: Label = { negative: st.negative + model.endNegative(key), cost: c };
      const old = bestAt.get(key);
      if (old && compareLabels(model.avoid, l, old) >= 0) continue;
      bestAt.set(key, l);
    }
  }
  for (const [key, l] of bestAt) out.set(key, { path: trace(key, l.cost), cost: l.cost, negative: l.negative });
  return out;
}

/** Remaining (negative, cost) from every hex to the nearest of `targets` (reverse search).
 *  Targets must be hexes the figure may end on (or its start hex). */
export function distanceField(model: MoveModel, targets: HexKey[]): Map<HexKey, Label> {
  const dist = new Map<HexKey, Label>();
  const seeds = new Set(targets);
  const heap = new Heap<{ key: HexKey; label: Label }>((a, b) => compareLabels(model.avoid, a.label, b.label));
  for (const t of targets) {
    const l: Label = { negative: model.endNegative(t), cost: 0 };
    const old = dist.get(t);
    if (old && compareLabels(model.avoid, l, old) >= 0) continue;
    dist.set(t, l);
    heap.push({ key: t, label: l });
  }
  while (heap.size > 0) {
    const { key, label } = heap.pop()!;
    const cur = dist.get(key)!;
    if (cur.cost !== label.cost || cur.negative !== label.negative) continue;
    // Stepping from a neighbour into `key`: `key` must be passable unless the move ends there.
    if (!seeds.has(key) && !model.passable(key)) continue;
    const l: Label = { negative: label.negative + model.enterNegative(key), cost: label.cost + model.enterCost(key) };
    for (const prev of model.steps(key)) {
      const old = dist.get(prev);
      if (old && compareLabels(model.avoid, l, old) >= 0) continue;
      dist.set(prev, l);
      heap.push({ key: prev, label: l });
    }
  }
  return dist;
}

// ─── Public API (re-exported by geometry.ts) ──────────────────────────────

export function findPath(state: GameState, to: Hex, opts: MoveOptions): PathResult | null {
  const model = buildMoveModel(state, opts);
  if (hexEquals(to, model.start)) return { path: [], cost: 0 };
  const r = routeFrom(model, searchAll(model), hexKey(to));
  return r && { path: r.path, cost: r.cost };
}

export function reachableHexes(state: GameState, move: number, opts: MoveOptions): Map<string, PathResult> {
  const model = buildMoveModel(state, opts);
  const out = new Map<string, PathResult>();
  for (const [key, r] of searchWithin(model, move)) out.set(key, { path: r.path, cost: r.cost });
  return out;
}

export function validatePath(state: GameState, path: Hex[], move: number, opts: MoveOptions): PathResult | null {
  const model = buildMoveModel(state, opts);
  if (path.length === 0) return { path: [], cost: 0 };
  let cur = model.startKey;
  let cost = 0;
  for (let i = 0; i < path.length; i++) {
    const key = hexKey(path[i]!);
    if (!model.steps(cur).includes(key)) return null;
    const last = i === path.length - 1;
    if (last ? !model.endable(key) : !model.passable(key)) return null;
    cost += model.enterCost(key);
    cur = key;
  }
  if (cost > move) return null;
  return { path: path.map((h) => [h[0], h[1]] as Hex), cost };
}
