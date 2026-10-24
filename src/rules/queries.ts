// Read-only queries for bots and the debug UI.

import type { Content, ElementId, ItemDef, ItemSlot, Step, StepType } from './content';
import { canAvoidDamage, effectiveCard } from './damage';
import { attackSpecFor, shieldOf } from './effects/attack';
import { alliesOf, enemiesOf, isFreeHex, isPresent, type Ctx } from './effects/context';
import { withConsumeBonus } from './effects/index';
import { availableElements, canConsume, elementIds, ORBS } from './elements';
import { apply } from './engine';
import { reachableHexes } from './geometry';
import { areAdjacent, distance, hexesInRadius, neighbors, type Hex } from './hex';
import { itemDef, itemEffect, itemNameKey } from './items';
import { interactiveObstacles } from './obstacles';
import { behaviourCard, groupInitiative, monsterInitiative, typesOnBoard } from './round';
import { adjustDamage, boardObjects, doorLocked } from './scenarioRules';
import { availableCards } from './setup';
import type { Action, CardId, Figure, FigureId, GameEvent, GameState, HeroState, StepChoice } from './state';
import { figureSteps } from './turn';
import { MOMENTUM_MAX } from './variants';

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
        if (cls) out.push({ type: 'chooseHand', heroId: id, cards: availableCards(cls, h.level, h.cardPool).slice(0, cls.handSize) });
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
        for (const o of boardObjects(state)) {
          if (!areAdjacent(o.hex, h.hex)) continue;
          for (const cardId of h.selection.cards) {
            for (const half of ['top', 'bottom'] as const) out.push({ type: 'interact', heroId: h.id, cardId, half, objectId: o.tile.object.id });
          }
        }
        if (state.variants.reviveAlly) {
          for (const t of Object.values(state.figures)) {
            if (t.kind !== 'hero' || !t.downed || t.revived || !areAdjacent(t.hex, h.hex)) continue;
            for (const cardId of h.selection.cards) {
              for (const half of ['top', 'bottom'] as const) out.push({ type: 'reviveAlly', heroId: h.id, cardId, half, targetId: t.id });
            }
          }
        }
      }
      ownTurnExtras(state, h, out);
      out.push({ type: 'endTurn', heroId: h.id });
      break;
    }
    case 'stepChoice': {
      out.push({ type: 'skipStep' });
      for (const choice of stepChoices(state, content, hero(p.heroId), p.step)) out.push({ type: 'resolveStep', choice });
      ownTurnExtras(state, hero(p.heroId), out);
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
      for (const it of h.items ?? []) if (it.state === 'ready') out.push({ type: 'useItem', heroId: h.id, itemId: it.id });
      break;
    }
    case 'beforeAttacked': {
      const h = hero(p.heroId);
      out.push({ type: 'passReaction', heroId: h.id });
      for (const it of h.items ?? []) if (it.state === 'ready') out.push({ type: 'useItem', heroId: h.id, itemId: it.id });
      break;
    }
    case 'initiativeItems':
      for (const id of p.heroIds) {
        const h = hero(id);
        out.push({ type: 'passReaction', heroId: id });
        for (const it of h.items ?? []) {
          if (it.state !== 'ready') continue;
          out.push({ type: 'useItem', heroId: id, itemId: it.id });
          out.push({ type: 'useItem', heroId: id, itemId: it.id, shift: -1 }, { type: 'useItem', heroId: id, itemId: it.id, shift: 1 });
          for (const a of Object.values(state.figures)) if (a.kind === 'hero' && a.id !== id) out.push({ type: 'useItem', heroId: id, itemId: it.id, targetId: a.id });
        }
      }
      break;
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
    case 'fadeOut':
      out.push({ type: 'fadeOut', heroId: p.heroId, choice: 'loseCard' });
      out.push({ type: 'fadeOut', heroId: p.heroId, choice: 'damage' });
      break;
  }
  if (state.undoPoint) out.push({ type: 'undo' });
  return out;
}

/** Порив (fork «Наснага») and carried items, offered during the hero's own turn. */
function ownTurnExtras(state: GameState, h: HeroState, out: Action[]): void {
  if (state.variants.momentum && h.momentum >= MOMENTUM_MAX) out.push({ type: 'surge', heroId: h.id });
  for (const it of h.items ?? []) if (it.state === 'ready') out.push({ type: 'useItem', heroId: h.id, itemId: it.id });
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
      for (const o of interactiveObstacles(state)) if (o.movable && areAdjacent(o.hex, h.hex)) base.push({ moveObstacle: o.hex });
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
        for (const o of interactiveObstacles(state)) {
          if (o.breakable && distance(o.hex, h.hex) <= (step.range ?? 1) + (step.consume?.add?.range ?? 0)) base.push({ obstacles: [o.hex] });
        }
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
      if (step.element === 'any') for (const e of elementIds(state)) base.push({ element: e });
      else base.push({});
      break;
    case 'special':
      if (step.name === 'transmuteOrb') {
        for (const from of ORBS) for (const to of ORBS) if (from !== to && state.orbs[from]) base.push({ elements: [from, to] });
      } else {
        base.push({});
      }
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
    damage: adjustDamage(ctx, target, Math.max(0, value - Math.max(0, shield - spec.pierce))),
    advantage: spec.advantage,
    disadvantage: spec.disadvantage,
  };
}

// ─── Fork queries for the UI ───────────────────────────────────────────────

function readCtx(state: GameState, content: Content): Ctx {
  return { s: state, c: content, ev: [], out: [] };
}

function heroCard(content: Content, state: GameState, h: HeroState, cardId: CardId) {
  const card = content.heroes[h.classId]?.cards.find((c) => c.id === cardId);
  return card ? effectiveCard(card, state.variants) : undefined;
}

/** Hero tie order: the order of the heroes in the state. */
function heroOrder(state: GameState, id: FigureId): number {
  return Object.keys(state.figures).indexOf(id);
}

export type ForecastEntry =
  | { kind: 'hero'; figureId: FigureId; initiative: number; self?: true }
  | { kind: 'monsterIntent'; typeId: string; cardId: string; initiative: number };

export interface InitiativeForecast {
  heroId: FigureId;
  cardId: CardId;
  initiative: number;
  /** 0-based place among the heroes that already chose (and this hero). */
  position: number;
  /** This hero, the allies that already chose and every possible monster card, in turn order
   *  (heroes before monsters on equal initiative). */
  order: ForecastEntry[];
  /** Per monster type on the board: its possible cards (three with «Три можливі наміри», the
   *  drawn one after the reveal) with whether the hero acts first; `null` = unknown until the reveal. */
  monsters: { typeId: string; intents: { cardId: string; initiative: number; heroFirst: boolean }[] | null }[];
}

/** Fork «Прогноз раунду»: where the hero would stand in this round's order with `leadingCardId`
 *  as the leading card. Null when the variant is off or the card is not the hero's. */
export function forecastInitiative(state: GameState, content: Content, heroId: FigureId, leadingCardId: CardId): InitiativeForecast | null {
  if (!state.variants.roundForecast) return null;
  const h = state.figures[heroId];
  if (h?.kind !== 'hero') return null;
  const inHand = h.hand.includes(leadingCardId) || (h.selection?.kind === 'cards' && h.selection.cards.includes(leadingCardId));
  const card = inHand ? heroCard(content, state, h, leadingCardId) : undefined;
  if (!card) return null;
  // After the reveal the chosen leading card's initiative includes the die («Кубик ініціативи»).
  const revealed = state.phase !== 'selectCards' && h.selection?.kind === 'cards' && h.selection.leading === leadingCardId;
  const initiative = revealed && h.initiative !== null ? h.initiative : card.initiative;
  const ctx = readCtx(state, content);
  const heroes: Extract<ForecastEntry, { kind: 'hero' }>[] = [{ kind: 'hero', figureId: heroId, initiative, self: true }];
  for (const f of Object.values(state.figures)) {
    if (f.kind !== 'hero' || f.id === heroId || f.exhausted || f.downed || f.initiative === null) continue;
    heroes.push({ kind: 'hero', figureId: f.id, initiative: f.initiative });
  }
  heroes.sort((a, b) => a.initiative - b.initiative || heroOrder(state, a.figureId) - heroOrder(state, b.figureId));
  const monsters: InitiativeForecast['monsters'] = [];
  const intents: Extract<ForecastEntry, { kind: 'monsterIntent' }>[] = [];
  for (const typeId of typesOnBoard(ctx)) {
    const deck = state.behaviourDecks[typeId];
    const ids = deck?.current ? [deck.current] : (deck?.intents ?? []);
    if (ids.length === 0) {
      monsters.push({ typeId, intents: null });
      continue;
    }
    const list = ids.map((cardId) => {
      const ini = deck?.current ? groupInitiative(ctx, typeId, cardId) : monsterInitiative(ctx, typeId, behaviourCard(ctx, typeId, cardId));
      intents.push({ kind: 'monsterIntent', typeId, cardId, initiative: ini });
      return { cardId, initiative: ini, heroFirst: initiative <= ini };
    });
    monsters.push({ typeId, intents: list });
  }
  const order: ForecastEntry[] = [...heroes, ...intents].sort(
    (a, b) => a.initiative - b.initiative || (a.kind === 'hero' ? 0 : 1) - (b.kind === 'hero' ? 0 : 1),
  );
  return { heroId, cardId: leadingCardId, initiative, position: heroes.findIndex((e) => e.self), order, monsters };
}

export interface OrbBonusPreview {
  cardId: CardId;
  half: 'top' | 'bottom';
  stepIndex: number;
  stepType: StepType;
  /** What the bonus consumes (`any` = the player's choice). */
  element: ElementId | 'any';
  count: number;
  /** The bonus can be paid on the hero's turn: the element is there now or will be infused by a
   *  figure acting earlier (someone may still consume it first). */
  available: boolean;
  /** Available right now. */
  now: boolean;
  /** Figures (or monster types) acting before the hero whose cards this round infuse the element. */
  from: FigureId[];
  /** The step's number without and with the bonus («Атака 3 → 5»), when it has one. */
  value?: number;
  boosted?: number;
}

function infuses(steps: Step[], e: ElementId | 'any'): boolean {
  return steps.some((st) => st.type === 'infuse' && (st.element === 'any' || e === 'any' || st.element === e));
}

function stepNumber(step: Step): number | undefined {
  return 'value' in step && typeof step.value === 'number' ? step.value : undefined;
}

/** For every card the hero can still play this round: which consume bonuses will be payable on the
 *  hero's turn, given the elements (orbs) present now and the infusions of figures acting earlier.
 *  The hero's initiative is the chosen one, or (while choosing) that card's as the leading card. */
export function orbBonusPreview(state: GameState, content: Content, heroId: FigureId): OrbBonusPreview[] {
  const h = state.figures[heroId];
  if (h?.kind !== 'hero') return [];
  const ctx = readCtx(state, content);
  const selected = h.selection?.kind === 'cards' ? h.selection.cards : [];
  const cards = [...h.hand, ...selected.filter((c) => !h.hand.includes(c) && !h.playedThisTurn.some((p) => p.cardId === c))];
  const acted = new Set(
    state.turnOrder.slice(0, Math.max(0, state.turnIndex + 1)).map((e) => (e.kind === 'monsterGroup' ? e.typeId : e.figureId)),
  );
  const out: OrbBonusPreview[] = [];
  for (const cardId of cards) {
    const card = heroCard(content, state, h, cardId);
    if (!card) continue;
    const myIni = h.initiative ?? card.initiative;
    // Figures acting before the hero, with the steps they may play this round.
    const earlier: { id: FigureId; steps: Step[] }[] = [];
    if (state.phase === 'selectCards' || state.phase === 'turns') {
      for (const f of Object.values(state.figures)) {
        if (f.kind !== 'hero' || f.id === heroId || f.exhausted || f.downed || f.initiative === null) continue;
        if (f.selection?.kind !== 'cards' || acted.has(f.id)) continue;
        const before = f.initiative < myIni || (f.initiative === myIni && heroOrder(state, f.id) < heroOrder(state, heroId));
        if (!before) continue;
        const steps = f.selection.cards.flatMap((c) => {
          const fc = heroCard(content, state, f, c);
          return fc ? [...fc.top.steps, ...fc.bottom.steps] : [];
        });
        earlier.push({ id: f.id, steps });
      }
      if (!state.variants.orbs) {
        for (const typeId of typesOnBoard(ctx)) {
          const current = state.behaviourDecks[typeId]?.current;
          if (!current || acted.has(typeId)) continue;
          const mc = behaviourCard(ctx, typeId, current);
          if (groupInitiative(ctx, typeId, current) < myIni) earlier.push({ id: typeId, steps: [...mc.steps, ...(mc.otherwise ?? [])] });
        }
      }
    }
    for (const half of ['top', 'bottom'] as const) {
      card[half].steps.forEach((step, stepIndex) => {
        const bonus = step.consume;
        if (!bonus) return;
        const count = bonus.count ?? 1;
        const now = bonus.element === 'any' ? availableElements(ctx).length >= count : canConsume(ctx, bonus.element);
        const from = earlier.filter((e) => infuses(e.steps, bonus.element)).map((e) => e.id);
        const entry: OrbBonusPreview = {
          cardId,
          half,
          stepIndex,
          stepType: step.type,
          element: bonus.element,
          count,
          available: now || (count === 1 && from.length > 0),
          now,
          from,
        };
        const value = stepNumber(step);
        const boosted = stepNumber(withConsumeBonus(step, bonus).step);
        if (value !== undefined && boosted !== undefined) {
          entry.value = value;
          entry.boosted = boosted;
        }
        out.push(entry);
      });
    }
  }
  return out;
}

export interface UsableItem {
  itemId: string;
  /** i18n key of the item's name. */
  nameKey: string;
  slot: ItemSlot;
  use: ItemDef['use'];
  effect: Step[];
}

const ATTACK_ITEM_SPECIALS = ['meleeAttackBonus'];
const MOVE_ITEM_SPECIALS = ['moveBonus', 'jumpOnMove'];

function itemTouches(effect: Step[], context: 'attack' | 'move'): boolean {
  return effect.some((st) =>
    context === 'attack'
      ? (st.type === 'special' && ATTACK_ITEM_SPECIALS.includes(st.name)) || (st.type === 'condition' && st.condition === 'strengthen')
      : st.type === 'special' && MOVE_ITEM_SPECIALS.includes(st.name),
  );
}

/** Fork «Предмети-кнопки»: the hero's items that can be used right now (the buttons that light up).
 *  `context` keeps only the items that help the pending attack or move. Empty when the variant is off. */
export function usableItems(state: GameState, content: Content, heroId: FigureId, context?: 'attack' | 'move'): UsableItem[] {
  if (!state.variants.itemPrompts) return [];
  const h = state.figures[heroId];
  if (h?.kind !== 'hero') return [];
  const out: UsableItem[] = [];
  for (const it of h.items ?? []) {
    const def = itemDef({ c: content }, it.id);
    if (!def || it.state !== 'ready' || def.use === 'passive') continue;
    const effect = itemEffect({ s: state }, def);
    if (context && !itemTouches(effect, context)) continue;
    if (!apply(state, { type: 'useItem', heroId, itemId: it.id }, content).ok) continue;
    out.push({ itemId: it.id, nameKey: `item.${it.id}`, slot: def.slot, use: def.use, effect });
  }
  return out;
}

export interface AttackPrompt extends UsableItem {
  /** Attack value against the target before the modifier, without and with the item. */
  value: number;
  boosted: number;
  advantage: boolean;
}

/** Fork «Предмети-кнопки»: before the hero's pending attack on `targetId`, the items worth offering
 *  («Кинджал: +1 Атака?») with the attack value without and with each. */
export function attackPrompts(state: GameState, content: Content, heroId: FigureId, targetId: FigureId): AttackPrompt[] {
  const p = state.pending;
  if (p?.kind !== 'stepChoice' || p.heroId !== heroId || p.step.type !== 'attack') return [];
  const before = previewAttack(state, heroId, targetId, content);
  if (!before) return [];
  const out: AttackPrompt[] = [];
  for (const item of usableItems(state, content, heroId, 'attack')) {
    const r = apply(state, { type: 'useItem', heroId, itemId: item.itemId }, content);
    if (!r.ok) continue;
    const after = previewAttack(r.state, heroId, targetId, content);
    if (!after) continue;
    out.push({ ...item, value: before.value, boosted: after.value, advantage: after.advantage && !after.disadvantage });
  }
  return out;
}

export interface ReactionPrompt extends UsableItem {
  window: 'damage' | 'beforeAttacked';
  /** Damage window: the shield the item gives and the incoming damage without and with it. */
  shield?: number;
  damage?: number;
  reduced?: number;
  /** Before-attacked window: the attack gets disadvantage. */
  disadvantage?: true;
}

/** The items the pending reaction window offers («Кольчуга: Щит 1?» while damage is coming,
 *  «Шкіряний шолом: атака з вадою?» before a monster's attack), with what each would change.
 *  Works in the base rules too: the windows are rules, not the itemPrompts fork. */
export function reactionPrompts(state: GameState, content: Content): ReactionPrompt[] {
  const p = state.pending;
  if (p?.kind !== 'avoidDamage' && p?.kind !== 'beforeAttacked') return [];
  const h = state.figures[p.heroId];
  if (h?.kind !== 'hero') return [];
  const out: ReactionPrompt[] = [];
  for (const it of h.items ?? []) {
    const def = itemDef({ c: content }, it.id);
    if (!def || it.state !== 'ready') continue;
    const r = apply(state, { type: 'useItem', heroId: h.id, itemId: it.id }, content);
    if (!r.ok) continue;
    const effect = itemEffect({ s: state }, def);
    const base: UsableItem = { itemId: it.id, nameKey: `item.${it.id}`, slot: def.slot, use: def.use, effect };
    if (p.kind === 'beforeAttacked') {
      out.push({ ...base, window: 'beforeAttacked', disadvantage: true });
      continue;
    }
    const ev = r.events.find((e): e is Extract<GameEvent, { type: 'itemReaction' }> => e.type === 'itemReaction');
    out.push({ ...base, window: 'damage', shield: ev?.shield ?? 0, damage: p.amount, reduced: ev?.damage ?? p.amount });
  }
  return out;
}

export interface InitiativePrompt {
  heroId: FigureId;
  itemId: string;
  nameKey: string;
  /** What the item does: `reroll` hides the new roll, the others show the new total. */
  kind: 'reroll' | 'dieOne' | 'rerollBest' | 'swap' | 'shift';
  action: Extract<Action, { type: 'useItem' }>;
  /** The hero's initiative now and, unless `reroll`/`rerollBest`, after the item. */
  initiative: number;
  after?: number;
  roll?: number;
  allyId?: FigureId;
  shift?: 1 | -1;
}

const INITIATIVE_KINDS: Record<string, InitiativePrompt['kind']> = {
  initiativeReroll: 'reroll',
  initiativeDieOne: 'dieOne',
  dieRerollBest: 'rerollBest',
  initiativeSwap: 'swap',
  initiativeShift: 'shift',
};

/** «Предмети кубика»: the buttons of the window after the initiative roll («Пісочний годинник:
 *  перекинути 11?», «Тихі черевики: 32 → 22»). A reroll never shows its result in advance. */
export function initiativePrompts(state: GameState, content: Content): InitiativePrompt[] {
  const p = state.pending;
  if (p?.kind !== 'initiativeItems') return [];
  const out: InitiativePrompt[] = [];
  for (const heroId of p.heroIds) {
    const h = state.figures[heroId];
    if (h?.kind !== 'hero' || h.initiative === null) continue;
    for (const it of h.items ?? []) {
      const def = it.state === 'ready' ? itemDef({ c: content }, it.id) : undefined;
      const st = def ? itemEffect({ s: state }, def).find((x) => x.type === 'special' && x.name in INITIATIVE_KINDS) : undefined;
      if (!st || st.type !== 'special') continue;
      const kind = INITIATIVE_KINDS[st.name] as InitiativePrompt['kind'];
      const opts: { targetId?: FigureId; shift?: 1 | -1 }[] =
        kind === 'swap' ? Object.values(state.figures).filter((a) => a.kind === 'hero' && a.id !== heroId).map((a) => ({ targetId: a.id })) : kind === 'shift' ? [{ shift: -1 }, { shift: 1 }] : [{}];
      for (const o of opts) {
        const action: Extract<Action, { type: 'useItem' }> = { type: 'useItem', heroId, itemId: it.id, ...o };
        const r = apply(state, action, content);
        if (!r.ok) continue;
        const after = r.state.figures[heroId] as HeroState;
        const hidden = kind === 'reroll' || kind === 'rerollBest';
        out.push({
          heroId,
          itemId: it.id,
          nameKey: itemNameKey(it.id),
          kind,
          action,
          initiative: h.initiative,
          ...(hidden ? {} : { after: after.initiative ?? h.initiative }),
          ...(h.initiativeRoll !== undefined ? { roll: h.initiativeRoll } : {}),
          ...(o.targetId ? { allyId: o.targetId } : {}),
          ...(o.shift ? { shift: o.shift } : {}),
        });
      }
    }
  }
  return out;
}

/** Obstacles and closed doors the heroes can break (`breakable`, hp left) or push aside
 *  (`movable`): attacked with `resolveStep { obstacles: [hex] }`, moved with
 *  `resolveStep { moveObstacle: hex }` during a move step. */
export { interactiveObstacles } from './obstacles';

// ─── Scenarios ─────────────────────────────────────────────────────────────

export interface ScenarioReward {
  goldEach: number;
  /** Items the party gets once (s2: one Зілля лікування for the whole party, not one each). */
  partyItems: string[];
  unlock: string[];
}

export function scenarioReward(content: Content, scenarioId: string): ScenarioReward | null {
  const reward = content.scenarios[scenarioId]?.reward;
  if (!reward) return null;
  return { goldEach: reward.goldEach, partyItems: [...(reward.items ?? [])], unlock: [...(reward.unlock ?? [])] };
}

/** A closed door that needs a key nobody in the party holds (s4: the upper tier). */
export function isDoorLocked(state: GameState, hex: Hex): boolean {
  return doorLocked(state, state.board.tiles[`${hex[0]},${hex[1]}`]);
}

/** Scenario objects on the board (lever, braziers, runes, millstones) with their state. */
export function scenarioObjects(state: GameState): { id: string; kind: string; state?: string; hex: Hex }[] {
  return boardObjects(state).map((o) => ({ ...o.tile.object, hex: o.hex }));
}
