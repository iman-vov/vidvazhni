// Tiny boards and figures for geometry and AI tests.
//
// Figure ids decide the kind: `hero:*`, `monster:<type>:<n>`, `summon:*`.

import type { ConditionId } from '../../src/rules/content';
import { hexKey, hexesInRadius, type Hex } from '../../src/rules/hex';
import type { Figure, GameState, HeroState, MonsterState, SummonState, Tile, TurnEntry } from '../../src/rules/state';
import { BASE_RULES } from '../../src/rules/variants';

export interface BoardSpec {
  /** Board hexes; default: radius `radius` (default 4) around 0,0. */
  hexes?: Hex[];
  radius?: number;
  /** Hexes removed from the board (holes, i.e. walls all around). */
  holes?: Hex[];
  obstacles?: Hex[];
  difficult?: Hex[];
  water?: Hex[];
  hazardous?: Hex[];
  traps?: Hex[];
  doors?: { hex: Hex; open?: boolean }[];
  walls?: [Hex, Hex][];
}

export interface FigureSpec {
  id: string;
  at: Hex;
  /** Hero initiative this round (heroes), or the group initiative added to turnOrder (monsters). */
  initiative?: number;
  number?: number;
  conditions?: ConditionId[];
  provokeRadius?: number;
  downed?: boolean;
  exhausted?: boolean;
  owner?: string;
  hp?: number;
}

/** A straight row of hexes from 0,0 in direction [1,0]: q = 0 … length−1, r = 0. */
export function row(length: number): Hex[] {
  return Array.from({ length }, (_, q) => [q, 0] as Hex);
}

/** A parallelogram q = 0 … cols−1, r = 0 … rows−1. */
export function rhombus(cols: number, rows: number): Hex[] {
  const out: Hex[] = [];
  for (let q = 0; q < cols; q++) for (let r = 0; r < rows; r++) out.push([q, r]);
  return out;
}

function base(id: string, at: Hex, spec: FigureSpec) {
  const conditions: Figure['conditions'] = {};
  for (const c of spec.conditions ?? []) conditions[c] = {};
  return {
    id,
    hex: at,
    hp: spec.hp ?? 5,
    maxHp: 5,
    conditions,
    shields: [],
    retaliates: [],
    turnCount: 0,
  };
}

function makeFigure(spec: FigureSpec): Figure {
  const [kind] = spec.id.split(':');
  if (kind === 'hero') {
    const h: HeroState = {
      ...base(spec.id, spec.at, spec),
      kind: 'hero',
      classId: spec.id.slice(5),
      playerId: 'p',
      level: 1,
      hand: [],
      discard: [],
      lost: [],
      active: [],
      selection: null,
      initiative: spec.initiative ?? null,
      xp: 0,
      coins: 0,
      modifierDeck: { draw: [], discard: [], needsShuffle: false },
      exhausted: spec.exhausted ?? false,
      downed: spec.downed ?? false,
      revived: false,
      momentum: 0,
      playedThisTurn: [],
      wantsShortRest: false,
      provokeRadius: spec.provokeRadius ?? null,
    };
    return h;
  }
  if (kind === 'monster') {
    const parts = spec.id.split(':');
    const m: MonsterState = {
      ...base(spec.id, spec.at, spec),
      kind: 'monster',
      typeId: parts[1] ?? 'm',
      rank: 'normal',
      number: spec.number ?? Number(parts[2] ?? 1),
      attackedBy: [],
    };
    return m;
  }
  if (kind === 'summon') {
    const s: SummonState = {
      ...base(spec.id, spec.at, spec),
      kind: 'summon',
      ownerId: spec.owner ?? 'hero:tinker',
      summonId: spec.id.slice(7),
      move: 2,
      attack: 1,
    };
    return s;
  }
  throw new Error(`fixture: bad figure id ${spec.id}`);
}

export function makeBoard(spec: BoardSpec = {}): GameState['board'] {
  const holes = new Set((spec.holes ?? []).map(hexKey));
  const tiles: Record<string, Tile> = {};
  for (const h of spec.hexes ?? hexesInRadius([0, 0], spec.radius ?? 4)) {
    if (!holes.has(hexKey(h))) tiles[hexKey(h)] = { room: 'r1', terrain: 'normal' };
  }
  const tile = (h: Hex): Tile => {
    const t = tiles[hexKey(h)];
    if (!t) throw new Error(`fixture: hex ${hexKey(h)} is not on the board`);
    return t;
  };
  for (const h of spec.obstacles ?? []) tile(h).obstacle = true;
  for (const h of spec.difficult ?? []) tile(h).terrain = 'difficult';
  for (const h of spec.water ?? []) tile(h).terrain = 'water';
  for (const h of spec.hazardous ?? []) tile(h).terrain = 'hazardous';
  for (const h of spec.traps ?? []) tile(h).trap = { damage: 3, conditions: [] };
  for (const d of spec.doors ?? []) tile(d.hex).door = { to: 'r2', open: d.open ?? false };
  const walls = (spec.walls ?? []).map(([a, b]) => {
    const ka = hexKey(a);
    const kb = hexKey(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  });
  return { tiles, walls, revealedRooms: ['r1'] };
}

export function makeState(board: BoardSpec, figures: FigureSpec[]): GameState {
  const figs: Record<string, Figure> = {};
  const turnOrder: TurnEntry[] = [];
  for (const spec of figures) {
    const f = makeFigure(spec);
    figs[f.id] = f;
    if (f.kind === 'monster' && spec.initiative !== undefined && !turnOrder.some((e) => e.kind === 'monsterGroup' && e.typeId === f.typeId)) {
      turnOrder.push({ kind: 'monsterGroup', typeId: f.typeId, initiative: spec.initiative });
    }
  }
  return {
    version: 1,
    scenarioId: 'test',
    level: 1,
    difficulty: 'normal',
    variants: { ...BASE_RULES },
    rng: { seed: 1 },
    round: 1,
    phase: 'turns',
    pending: null,
    figures: figs,
    board: makeBoard(board),
    elements: { fire: 'inert', ice: 'inert', air: 'inert', earth: 'inert', light: 'inert', dark: 'inert' },
    pendingInfusions: [],
    orbs: {},
    monsterDeck: { draw: [], discard: [], needsShuffle: false },
    behaviourDecks: {},
    turnOrder,
    turnIndex: 0,
    half: null,
    log: [],
  };
}

export const keys = (hexes: Hex[]): string[] => hexes.map(hexKey);
