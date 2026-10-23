// Monster AI: focus, movement and target choice. Deterministic: no randomness, no questions to players.
//
// 1. Focus. For every enemy that can be targeted (not invisible, not downed), the cheapest route to any
//    hex the figure could attack it from, ranked by (negative hexes, movement) — so a trap-free route
//    beats a shorter one through a trap. Focus = least negative hexes, then least movement, then
//    nearest in hexes, then lowest initiative this round (a summon counts as just before its owner;
//    monsters use their group's initiative), then lowest standee number, then id.
//    Monsters focus heroes and hero summons; summons focus monsters.
// 2. «Виклик» Вартового: a monster within a hero's `provokeRadius` (hex distance, at the start of its
//    turn) focuses that hero if it can attack him this turn.
// 3. Movement, when the focus can be attacked this turn: among the hexes reachable within the move
//    (staying included) whose route enters no more negative hexes than the focus route needs, pick
//    the one hitting the most targets (focus always included), then without disadvantage on the
//    focus, then with the fewest disadvantaged targets, then the least movement, then lowest q, r.
//    Extra targets are chosen in focus order.
// 4. Otherwise the figure moves to the reachable hex closest (negative hexes, then movement) to a hex
//    it could attack the focus from, spending as little movement as possible on ties; it does not
//    attack. 5. No focus at all: it stays and its attack steps get no targets.
// The movement plan uses the first attack step after the move step (or the first attack step, or a
// plain melee attack when the card has none). Each attack step is then aimed from where the figure
// stands when it is performed. Conditions are already folded into `steps` by the engine
// (immobilize → no move step, disarm → no attack steps, stun → no steps); flying monsters must get
// `fly: true` on their move step.

import type { Step } from '../content';
import { distance, hexKey, parseHexKey, type Hex, type HexKey } from '../hex';
import { lineOfSight } from '../los';
import {
  buildMoveModel,
  compareLabels,
  distanceField,
  isOnBoard,
  searchAll,
  searchWithin,
  sideOf,
  type Label,
  type Route,
} from '../path';
import type { Figure, FigureId, GameState } from '../state';
import { DEFAULT_MELEE, isRanged, maxReach, placements, type AttackStep, type MoveStep, type Placement, type TargetingView } from './attack';

export interface MonsterPlan {
  /** Chosen focus, or null when no enemy can be focused (then only non-attack steps run). */
  focusId: FigureId | null;
  /** Hexes the figure moves through (empty = stays). */
  path: Hex[];
  /** Targets per attack step of `steps`, in step order. */
  attackTargets: FigureId[][];
}

interface Candidate {
  hex: Hex;
  route: Route;
}

interface AttackOption {
  targets: Figure[];
  focusDisadvantage: number;
  disadvantaged: number;
}

function targetable(f: Figure): boolean {
  return isOnBoard(f) && !f.conditions.invisible && !(f.kind === 'hero' && f.downed);
}

function initiativeOf(state: GameState, f: Figure): number {
  if (f.kind === 'hero') return f.initiative ?? 100;
  if (f.kind === 'summon') {
    const owner = state.figures[f.ownerId];
    return (owner?.kind === 'hero' ? (owner.initiative ?? 100) : 100) - 0.5;
  }
  const entry = state.turnOrder.find((t) => t.kind === 'monsterGroup' && t.typeId === f.typeId);
  return entry ? entry.initiative : 100;
}

function byHex(a: Hex, b: Hex): number {
  return a[0] - b[0] || a[1] - b[1];
}

/**
 * Plans one monster's (or hero summon's) turn for the given behaviour steps.
 * `steps` already have absolute values (base stats + card deltas, conditions applied:
 * immobilize → no move, disarm → no attack).
 * Summons focus monsters; monsters focus heroes and summons.
 */
export function planTurn(state: GameState, figureId: FigureId, steps: Step[]): MonsterPlan {
  const me = state.figures[figureId];
  if (!me) throw new Error(`ai.planTurn: unknown figure ${figureId}`);

  const attackIdx: number[] = [];
  steps.forEach((s, i) => {
    if (s.type === 'attack') attackIdx.push(i);
  });
  const moveIdx = steps.findIndex((s) => s.type === 'move');
  const moveStep = moveIdx >= 0 ? (steps[moveIdx] as MoveStep) : undefined;
  const refIdx = attackIdx.find((i) => i > moveIdx) ?? attackIdx[0];
  const ref = refIdx !== undefined ? (steps[refIdx] as AttackStep) : DEFAULT_MELEE;
  const noTargets = (): FigureId[][] => attackIdx.map(() => []);

  const model = buildMoveModel(state, {
    figureId,
    jump: moveStep?.jump,
    fly: moveStep?.fly,
    avoidNegativeHexes: true,
  });

  // ── Targeting view ──
  const losCache = new Map<string, boolean>();
  const los = (a: Hex, b: Hex): boolean => {
    const k = `${hexKey(a)}>${hexKey(b)}`;
    let v = losCache.get(k);
    if (v === undefined) {
      v = lineOfSight(model.walls, a, b);
      losCache.set(k, v);
    }
    return v;
  };
  const side = sideOf(me);
  const enemies = Object.values(state.figures)
    .filter((f) => sideOf(f) !== side && targetable(f))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const enemyByHex = new Map<HexKey, Figure>(enemies.map((e) => [hexKey(e.hex), e]));
  const view: TargetingView = {
    exists: (h) => model.walls.exists(h),
    los,
    enemies,
    enemyAt: (k) => enemyByHex.get(k),
  };
  const placementCache = new Map<AttackStep, Map<HexKey, Placement[]>>();
  const placementsAt = (h: Hex, step: AttackStep): Placement[] => {
    let byHexKey = placementCache.get(step);
    if (!byHexKey) placementCache.set(step, (byHexKey = new Map()));
    const k = hexKey(h);
    let p = byHexKey.get(k);
    if (!p) byHexKey.set(k, (p = placements(view, h, step)));
    return p;
  };

  // ── Focus plans: cheapest route to any hex the enemy can be attacked from ──
  const forward = searchAll(model);
  const positions: { hex: Hex; label: Label }[] = [{ hex: me.hex, label: { negative: 0, cost: 0 } }];
  for (const [k, node] of forward) {
    if (model.endable(k)) positions.push({ hex: parseHexKey(k), label: { negative: node.negative + model.endNegative(k), cost: node.cost } });
  }
  const reach = maxReach(ref);
  const plans = new Map<FigureId, { label: Label; hexes: HexKey[] }>();
  for (const e of enemies) {
    let best: Label | null = null;
    const hexes: HexKey[] = [];
    for (const p of positions) {
      if (distance(p.hex, e.hex) > reach) continue;
      if (!placementsAt(p.hex, ref).some((pl) => pl.hit.includes(e))) continue;
      hexes.push(hexKey(p.hex));
      if (!best || compareLabels(true, p.label, best) < 0) best = p.label;
    }
    if (best) plans.set(e.id, { label: best, hexes });
  }

  const UNREACHABLE: Label = { negative: Infinity, cost: Infinity };
  const rank = (a: Figure, b: Figure): number => {
    const pa = plans.get(a.id)?.label ?? UNREACHABLE;
    const pb = plans.get(b.id)?.label ?? UNREACHABLE;
    return (
      pa.negative - pb.negative ||
      pa.cost - pb.cost ||
      distance(me.hex, a.hex) - distance(me.hex, b.hex) ||
      initiativeOf(state, a) - initiativeOf(state, b) ||
      (a.kind === 'monster' ? a.number : Infinity) - (b.kind === 'monster' ? b.number : Infinity) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  };
  const focusables = enemies.filter((e) => plans.has(e.id)).sort(rank);
  if (focusables.length === 0) return { focusId: null, path: [], attackTargets: noTargets() };

  // ── Attacking from a hex ──
  const bestAttack = (from: Hex, focus: Figure, step: AttackStep): AttackOption | null => {
    if (distance(from, focus.hex) > maxReach(step)) return null;
    const ranged = isRanged(step);
    const disadvantaged = (e: Figure): boolean => ranged && distance(from, e.hex) === 1;
    let best: AttackOption | null = null;
    for (const p of placementsAt(from, step)) {
      if (!p.hit.includes(focus)) continue;
      const others = p.hit
        .filter((e) => e !== focus)
        .sort(rank)
        .slice(0, Math.max(0, p.max - 1));
      const targets = [focus, ...others];
      const opt: AttackOption = {
        targets,
        focusDisadvantage: disadvantaged(focus) ? 1 : 0,
        disadvantaged: targets.filter(disadvantaged).length,
      };
      if (
        !best ||
        (opt.targets.length - best.targets.length ||
          best.focusDisadvantage - opt.focusDisadvantage ||
          best.disadvantaged - opt.disadvantaged) > 0
      ) {
        best = opt;
      }
    }
    return best;
  };

  // ── Where the figure can be after this turn's move ──
  const candidates: Candidate[] = [{ hex: me.hex, route: { path: [], cost: 0, negative: 0 } }];
  for (const [k, route] of searchWithin(model, moveStep?.value ?? 0)) candidates.push({ hex: parseHexKey(k), route });

  const attackThisTurn = (focus: Figure): Candidate | null => {
    const allowed = plans.get(focus.id)!.label.negative;
    let best: { c: Candidate; opt: AttackOption } | null = null;
    for (const c of candidates) {
      if (c.route.negative > allowed) continue;
      const opt = bestAttack(c.hex, focus, ref);
      if (!opt) continue;
      if (!best) {
        best = { c, opt };
        continue;
      }
      const diff =
        best.opt.targets.length - opt.targets.length ||
        opt.focusDisadvantage - best.opt.focusDisadvantage ||
        opt.disadvantaged - best.opt.disadvantaged ||
        c.route.cost - best.c.route.cost ||
        byHex(c.hex, best.c.hex);
      if (diff < 0) best = { c, opt };
    }
    return best?.c ?? null;
  };

  // ── Focus (provoke first) and destination ──
  let focus: Figure | undefined;
  let dest: Candidate | null = null;
  if (me.kind === 'monster') {
    for (const e of focusables) {
      if (e.kind !== 'hero' || e.provokeRadius == null || distance(me.hex, e.hex) > e.provokeRadius) continue;
      dest = attackThisTurn(e);
      if (dest) {
        focus = e;
        break;
      }
    }
  }
  if (!focus) {
    focus = focusables[0]!;
    dest = attackThisTurn(focus);
  }
  if (!dest) {
    const field = distanceField(model, plans.get(focus.id)!.hexes);
    let best: { c: Candidate; total: Label } | null = null;
    for (const c of candidates) {
      const rest = field.get(hexKey(c.hex));
      if (!rest) continue;
      const total: Label = { negative: c.route.negative + rest.negative, cost: rest.cost };
      const diff = best
        ? compareLabels(true, total, best.total) || c.route.cost - best.c.route.cost || byHex(c.hex, best.c.hex)
        : -1;
      if (diff < 0) best = { c, total };
    }
    dest = best?.c ?? candidates[0]!;
  }

  const finalHex = dest.hex;
  const chosenFocus = focus;
  const attackTargets = attackIdx.map((i) => {
    const from = moveIdx >= 0 && i > moveIdx ? finalHex : me.hex;
    const opt = bestAttack(from, chosenFocus, steps[i] as AttackStep);
    return opt ? opt.targets.map((t) => t.id) : [];
  });
  return { focusId: focus.id, path: dest.route.path, attackTargets };
}
