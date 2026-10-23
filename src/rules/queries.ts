// Read-only queries for bots and the debug UI.

import type { Content, ElementId, Step } from './content';
import { canAvoidDamage } from './damage';
import { attackSpecFor, shieldOf } from './effects/attack';
import { alliesOf, enemiesOf, isFreeHex, isPresent, type Ctx } from './effects/context';
import { availableElements, ELEMENTS } from './elements';
import { apply } from './engine';
import { reachableHexes } from './geometry';
import { hexesInRadius, neighbors, type Hex } from './hex';
import { availableCards } from './setup';
import type { Action, Figure, GameEvent, GameState, HeroState, StepChoice } from './state';
import { figureSteps } from './turn';

const EMPTY_CONTENT: Content = { heroes: {}, monsters: {}, bosses: {}, decks: {}, scenarios: {} };
/** Cap on attack target combinations per step, to keep the list small for bots. */
const MAX_COMBOS = 64;

/** Candidate actions for the pending decision; `apply` decides which are legal. */
function candidateActions(state: GameState, content: Content): Action[] {
  const p = state.pending;
  if (!p || state.phase === 'won' || state.phase === 'lost') return [];
  const out: Action[] = [];
  const hero = (id: string) => state.figures[id] as HeroState;
  switch (p.kind) {
    case 'chooseHandBeforeScenario':
      for (const id of p.heroIds) {
        const h = hero(id);
        const cls = content.heroes[h.classId];
        if (cls) out.push({ type: 'chooseHand', heroId: id, cards: availableCards(cls, h.level).slice(0, cls.handSize) });
      }
      break;
    case 'selectCards':
      for (const id of p.heroIds) {
        const h = hero(id);
        for (let i = 0; i < h.hand.length; i++) {
          for (let j = i + 1; j < h.hand.length; j++) {
            const a = h.hand[i] as string;
            const b = h.hand[j] as string;
            out.push({ type: 'selectCards', heroId: id, cards: [a, b], leading: a });
            out.push({ type: 'selectCards', heroId: id, cards: [a, b], leading: b });
          }
        }
        if (h.discard.length >= 2) out.push({ type: 'declareLongRest', heroId: id });
      }
      break;
    case 'heroTurn': {
      const h = hero(p.heroId);
      if (h.selection?.kind === 'cards') {
        for (const cardId of h.selection.cards) {
          for (const half of ['top', 'bottom'] as const) {
            out.push({ type: 'startHalf', heroId: h.id, cardId, half });
            out.push({ type: 'startHalf', heroId: h.id, cardId, half, basic: true });
          }
        }
      }
      out.push({ type: 'endTurn', heroId: h.id });
      break;
    }
    case 'stepChoice': {
      out.push({ type: 'skipStep' });
      for (const choice of stepChoices(state, content, hero(p.heroId), p.step)) out.push({ type: 'resolveStep', choice });
      break;
    }
    case 'avoidDamage': {
      const h = hero(p.heroId);
      out.push({ type: 'avoidDamage', heroId: h.id, choice: { kind: 'take' } });
      if (canAvoidDamage(h)) {
        for (const cardId of h.hand) out.push({ type: 'avoidDamage', heroId: h.id, choice: { kind: 'loseHand', cardId } });
        const [a, b] = h.discard;
        if (a && b) out.push({ type: 'avoidDamage', heroId: h.id, choice: { kind: 'loseDiscard', cardIds: [a, b] } });
      }
      break;
    }
    case 'endOfRound':
      for (const id of p.heroIds) {
        out.push({ type: 'shortRest', heroId: id, rest: true });
        out.push({ type: 'shortRest', heroId: id, rest: false });
      }
      break;
    case 'shortRestReroll':
      out.push({ type: 'shortRestReroll', heroId: p.heroId, reroll: false });
      out.push({ type: 'shortRestReroll', heroId: p.heroId, reroll: true });
      break;
    case 'longRestLoss':
      for (const cardId of hero(p.heroId).discard) out.push({ type: 'longRestLoss', heroId: p.heroId, cardId });
      break;
  }
  if (state.undoPoint) out.push({ type: 'undo' });
  return out;
}

/** Every action that `apply` accepts right now. Choices are enumerated (move destinations,
 *  target sets, area placements); push/pull paths are left to the engine's default.
 *  The hand choice before a scenario is offered only as «the first N cards». */
export function legalActions(state: GameState, content: Content): Action[] {
  return legalActionResults(state, content).map((r) => r.action);
}

/** `legalActions` together with the state and events each one leads to (for bots and previews). */
export function legalActionResults(state: GameState, content: Content): { action: Action; state: GameState; events: GameEvent[] }[] {
  const out = [];
  for (const action of candidateActions(state, content)) {
    const r = apply(state, action, content);
    if (r.ok) out.push({ action, state: r.state, events: r.events });
  }
  return out;
}

function combos<T>(items: T[], max: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (out.length >= MAX_COMBOS) return;
    if (acc.length > 0) out.push([...acc]);
    if (acc.length === max) return;
    for (let i = start; i < items.length; i++) walk(i + 1, [...acc, items[i] as T]);
  };
  walk(0, []);
  return out;
}

/** Candidate choices for one step (the engine validates them). */
function stepChoices(state: GameState, content: Content, h: HeroState, step: Step): StepChoice[] {
  const base: StepChoice[] = [];
  const ids = (fs: Figure[]) => fs.map((f) => f.id);
  const near = (radius: number): Hex[] => hexesInRadius(h.hex, radius).filter((x) => state.board.tiles[`${x[0]},${x[1]}`]);
  switch (step.type) {
    case 'move': {
      const opts = { figureId: h.id, ...(step.jump ? { jump: true } : {}), ...(step.fly ? { fly: true } : {}) };
      const bonus = step.consume?.add?.move ?? 0;
      for (const [, r] of reachableHexes(state, step.value + bonus, opts)) if (r.path.length > 0) base.push({ path: r.path });
      break;
    }
    case 'attack': {
      const enemies = ids(enemiesOf(state, h));
      if (step.area) {
        const fromSelf = step.area.shape === 'arc' || step.area.shape === 'allAdjacent' || step.area.shape === 'line';
        const anchors = fromSelf ? [h.hex] : near(step.range ?? 1);
        for (const hex of anchors) for (let d = 0; d < 6; d++) base.push({ hex, direction: d });
      } else if (step.targetAll) {
        base.push({});
      } else {
        const extra = step.consume?.add?.targets ?? 0;
        for (const set of combos(enemies, (step.targets ?? 1) + extra)) base.push({ targets: set });
      }
      break;
    }
    case 'heal':
    case 'shield':
    case 'condition':
    case 'bless':
    case 'push':
    case 'pull': {
      const spec = step.target;
      if (spec === 'ally' || spec === 'allyOrSelf') {
        for (const f of [h, ...alliesOf(state, h)]) base.push({ targets: [f.id] });
      } else {
        base.push({});
      }
      break;
    }
    case 'infuse':
      if (step.element === 'any') for (const e of ELEMENTS) base.push({ element: e });
      else base.push({});
      break;
    case 'summon':
    case 'trap':
      for (const hex of neighbors(h.hex)) if (isFreeHex(state, hex)) base.push({ hex });
      break;
    case 'teleport':
      for (const hex of near(step.range)) if (isFreeHex(state, hex)) base.push({ hex });
      break;
    default:
      base.push({});
  }
  if (!step.consume) return base;
  const ctx: Ctx = { s: state, c: content, ev: [], out: [] };
  const avail = availableElements(ctx);
  const withConsume: StepChoice[] = [];
  for (const c of base) {
    if (step.consume.element !== 'any') {
      if (avail.includes(step.consume.element)) withConsume.push({ ...c, consume: true });
    } else if ((step.consume.count ?? 1) === 1) {
      for (const e of avail) withConsume.push({ ...c, consume: true, element: e });
    } else {
      const pairs = combos<ElementId>(avail, step.consume.count ?? 2).filter((x) => x.length === (step.consume?.count ?? 2));
      for (const els of pairs) withConsume.push({ ...c, consume: true, elements: els });
    }
  }
  return [...base, ...withConsume];
}

export interface AttackPreview {
  /** Attack value after card bonuses and poison, before the modifier. */
  value: number;
  shield: number;
  pierce: number;
  /** Expected damage before the modifier is drawn. */
  damage: number;
  advantage: boolean;
  disadvantage: boolean;
}

/** Expected damage of an attack before the modifier: the pending attack step of a hero, the
 *  monster's own attack this round, or a given step. */
export function previewAttack(
  state: GameState,
  attackerId: string,
  targetId: string,
  content: Content = EMPTY_CONTENT,
  step?: Extract<Step, { type: 'attack' }>,
): AttackPreview | null {
  const attacker = state.figures[attackerId];
  const target = state.figures[targetId];
  if (!isPresent(attacker) || !isPresent(target)) return null;
  const ctx: Ctx = { s: state, c: content, ev: [], out: [] };
  let attack = step;
  if (!attack && state.pending?.kind === 'stepChoice' && state.pending.heroId === attackerId && state.pending.step.type === 'attack') {
    attack = state.pending.step;
  }
  if (!attack && attacker.kind !== 'hero') {
    try {
      attack = figureSteps(ctx, attacker).find((s): s is Extract<Step, { type: 'attack' }> => s.type === 'attack');
    } catch {
      attack = undefined;
    }
  }
  if (!attack) return null;
  const spec = attackSpecFor(ctx, attacker, target, attack);
  const value = spec.value + (target.conditions.poison ? 1 : 0);
  const shield = shieldOf(target, ctx);
  return {
    value,
    shield,
    pierce: spec.pierce,
    damage: Math.max(0, value - Math.max(0, shield - spec.pierce)),
    advantage: spec.advantage,
    disadvantage: spec.disadvantage,
  };
}
