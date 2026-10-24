// Non-attack steps: heal, shield, retaliate, provoke, condition, bless, infuse, loot, summon,
// trap, active, teleport. Each `perform*` validates and returns either an error or the function
// that applies the step, so consume bonuses are only paid for steps that succeed.

import { addCondition, removeCondition } from '../conditions';
import { NEGATIVE_CONDITIONS, type ConditionId, type ElementId, type Step, type TargetSpec } from '../content';
import { elementIds, infuse } from '../elements';
import { hasLineOfSight } from '../geometry';
import { areAdjacent, distance, hexesInRadius, neighbors, type Hex } from '../hex';
import { addToDeck } from '../modifiers';
import { chestLoot, findItem, teleportHex } from '../scenarioRules';
import { spawnMonster } from '../setup';
import type { Figure, HeroState, ShieldEffect, StepChoice, SummonState } from '../state';
import { alliesOf, areEnemies as areEnemiesOf, emit, enemiesOf, isFreeHex, isPresent, monsterStats, tileAt, wallBetween, type Ctx } from './context';

export type Apply = () => void;
export type StepResult = string | Apply;
type S<T extends Step['type']> = Extract<Step, { type: T }>;

/** Where an effect comes from: a hero card (its shields are tied to the active card) or a monster. */
export interface EffectSource {
  cardId?: string;
  /** Extra chosen targets granted by a consume bonus. */
  extraTargets?: number;
  /** Fork «Наснага»: the step belongs to the class Порив (its `active` steps become surge grants). */
  surge?: boolean;
}

export function effectSourceId(src: EffectSource): string {
  return src.cardId ? `card:${src.cardId}` : 'round';
}

/** Range check with line of sight (adjacent hexes only need no wall between them). */
export function inRangeWithSight(ctx: Ctx, from: Hex, to: Hex, range: number): boolean {
  const d = distance(from, to);
  if (d > range) return false;
  if (d === 0) return true;
  if (d === 1) return !wallBetween(ctx.s, from, to);
  return hasLineOfSight(ctx.s, from, to);
}

/** Resolves a TargetSpec. Chosen targets come from `choice.targets`; monsters without a choice
 *  pick deterministically (most wounded first). */
export function resolveTargets(
  ctx: Ctx,
  f: Figure,
  spec: TargetSpec,
  choice: StepChoice,
  opts: { range?: number; radius?: number; extraTargets?: number },
): Figure[] | string {
  const allies = alliesOf(ctx.s, f);
  const enemies = enemiesOf(ctx.s, f);
  const range = opts.range ?? 1;
  const count = 1 + (opts.extraTargets ?? 0);
  const pick = (candidates: Figure[]): Figure[] | string => {
    const valid = candidates.filter((t) => inRangeWithSight(ctx, f.hex, t.hex, range));
    if (choice.targets && choice.targets.length > 0) {
      if (choice.targets.length > count || new Set(choice.targets).size !== choice.targets.length) return 'too many targets';
      const out: Figure[] = [];
      for (const id of choice.targets) {
        const t = valid.find((x) => x.id === id);
        if (!t) return `invalid target ${id}`;
        out.push(t);
      }
      return out;
    }
    if (f.kind === 'hero') return 'choose a target';
    return [...valid].sort((a, b) => b.maxHp - b.hp - (a.maxHp - a.hp)).slice(0, count);
  };
  switch (spec) {
    case 'self':
      return [f];
    case 'ally':
      return pick(allies);
    case 'allyOrSelf':
      return pick([f, ...allies]);
    case 'adjacentAllies':
      return allies.filter((t) => areAdjacent(t.hex, f.hex) && !wallBetween(ctx.s, t.hex, f.hex));
    case 'alliesInRadius': {
      const r = opts.radius ?? range;
      return [f, ...allies.filter((t) => inRangeWithSight(ctx, f.hex, t.hex, r))];
    }
    case 'adjacentEnemies':
      return enemies.filter((t) => areAdjacent(t.hex, f.hex) && !wallBetween(ctx.s, t.hex, f.hex));
    case 'enemiesInRadius': {
      const r = opts.radius ?? range;
      return enemies.filter((t) => inRangeWithSight(ctx, f.hex, t.hex, r));
    }
    case 'summon':
      return Object.values(ctx.s.figures).filter((s) => s.kind === 'summon' && s.ownerId === f.id && isPresent(s));
  }
}

// ─── Heal ──────────────────────────────────────────────────────────────────

/** Heal: on a poisoned figure it only removes the poison; otherwise restores hp and removes wound. */
export function healFigure(ctx: Ctx, t: Figure, amount: number): void {
  const removed: ConditionId[] = [];
  let healed = 0;
  if (t.conditions.poison) {
    removeCondition(ctx, t, 'poison');
    removed.push('poison');
  } else {
    healed = Math.min(amount, t.maxHp - t.hp);
    t.hp += healed;
  }
  if (removeCondition(ctx, t, 'wound')) removed.push('wound');
  emit(ctx, { type: 'healed', figureId: t.id, amount: healed, removed });
}

export function performHeal(ctx: Ctx, f: Figure, step: S<'heal'>, choice: StepChoice, src: EffectSource): StepResult {
  const range = step.range ?? (step.target === 'ally' || step.target === 'allyOrSelf' ? 1 : 0);
  const targets = resolveTargets(ctx, f, step.target, choice, { range, radius: step.radius, extraTargets: src.extraTargets });
  if (typeof targets === 'string') return targets;
  return () => {
    for (const t of targets) {
      healFigure(ctx, t, step.value);
      let n = step.removeNegative ?? 0;
      for (const c of NEGATIVE_CONDITIONS) if (n > 0 && removeCondition(ctx, t, c)) n--;
      if (step.bless) blessFigure(ctx, t);
    }
  };
}

// ─── Shield, retaliate, provoke ────────────────────────────────────────────

function until(duration: S<'shield'>['duration']): ShieldEffect['until'] {
  if (typeof duration === 'object') return { uses: duration.uses };
  return duration === 'round' ? 'round' : 'scenario';
}

export function performShield(ctx: Ctx, f: Figure, step: S<'shield'>, choice: StepChoice, src: EffectSource): StepResult {
  const targets = resolveTargets(ctx, f, step.target, choice, { range: step.range, extraTargets: src.extraTargets });
  if (typeof targets === 'string') return targets;
  return () => {
    for (const t of targets) {
      t.shields.push({ value: step.value, source: effectSourceId(src), until: until(step.duration) });
      emit(ctx, { type: 'shieldAdded', figureId: t.id, value: step.value });
    }
  };
}

export function performRetaliate(_ctx: Ctx, f: Figure, step: S<'retaliate'>, src: EffectSource): StepResult {
  return () => {
    f.retaliates.push({ value: step.value, range: step.range ?? 1, source: effectSourceId(src), until: until(step.duration) });
  };
}

export function performProvoke(_ctx: Ctx, f: Figure, step: S<'provoke'>): StepResult {
  if (f.kind !== 'hero') return 'only heroes provoke';
  return () => {
    f.provokeRadius = step.radius;
  };
}

// ─── Conditions, bless ─────────────────────────────────────────────────────

export function performCondition(ctx: Ctx, f: Figure, step: S<'condition'>, choice: StepChoice, src: EffectSource): StepResult {
  const targets = resolveTargets(ctx, f, step.target, choice, { range: step.range, radius: step.radius, extraTargets: src.extraTargets });
  if (typeof targets === 'string') return targets;
  // Invisible enemies cannot be targeted.
  const list = targets.filter((t) => t.id === f.id || !areEnemiesOf(f, t) || !t.conditions.invisible);
  return () => {
    for (const t of list) addCondition(ctx, t, step.condition);
  };
}

export function blessFigure(ctx: Ctx, t: Figure): void {
  const deck = t.kind === 'hero' ? t.modifierDeck : t.kind === 'summon' ? ownerDeck(ctx, t) : ctx.s.monsterDeck;
  if (deck) addToDeck(ctx.s.rng, deck, 'bless');
}

export function curseFigure(ctx: Ctx, t: Figure): void {
  const deck = t.kind === 'hero' ? t.modifierDeck : t.kind === 'summon' ? ownerDeck(ctx, t) : ctx.s.monsterDeck;
  if (deck) addToDeck(ctx.s.rng, deck, 'curse');
}

function ownerDeck(ctx: Ctx, t: SummonState) {
  const owner = ctx.s.figures[t.ownerId];
  return owner?.kind === 'hero' ? owner.modifierDeck : undefined;
}

export function performBless(ctx: Ctx, f: Figure, step: S<'bless'>, choice: StepChoice, src: EffectSource): StepResult {
  const targets = resolveTargets(ctx, f, step.target, choice, { range: step.range, extraTargets: src.extraTargets });
  if (typeof targets === 'string') return targets;
  return () => {
    for (const t of targets) blessFigure(ctx, t);
  };
}

// ─── Elements ──────────────────────────────────────────────────────────────

export function performInfuse(ctx: Ctx, f: Figure, step: S<'infuse'>, choice: StepChoice): StepResult {
  const element: ElementId | undefined = step.element === 'any' ? choice.element : step.element;
  if (!element) return 'choose an element';
  if (step.element === 'any' && !elementIds(ctx.s).includes(element)) return 'no such element';
  return () => infuse(ctx, element, f.id);
}

// ─── Loot ──────────────────────────────────────────────────────────────────

/** Picks up coins, a chest (its coins, story item and shop item) and story items lying on one hex. */
export function lootHex(ctx: Ctx, h: HeroState, hex: Hex): void {
  const tile = tileAt(ctx.s, hex);
  if (!tile || (!tile.coins && !tile.chest && !tile.questItems?.length)) return;
  const chest = tile.chest;
  const loot = chest ? chestLoot(ctx, chest) : undefined;
  const coins = (tile.coins ?? 0) + (loot?.coins ?? 0);
  const items = [...(tile.questItems ?? [])];
  if (loot?.questItem) items.unshift(loot.questItem);
  h.coins += coins;
  delete tile.coins;
  delete tile.chest;
  delete tile.questItems;
  if (chest) (h.chests ??= []).push(chest);
  if (items.length > 0) (h.questItems ??= []).push(...items);
  emit(ctx, {
    type: 'looted',
    heroId: h.id,
    coins,
    ...(chest ? { chest } : {}),
    ...(items.length > 0 ? { questItems: items } : {}),
  });
  if (chest && loot?.item) findItem(ctx, loot.item, { chest });
}

/** «Лут N»: every coin and chest within N hexes. */
export function performLoot(ctx: Ctx, f: Figure, step: S<'loot'>): StepResult {
  if (f.kind !== 'hero') return 'only heroes loot';
  return () => {
    for (const hex of hexesInRadius(f.hex, step.range)) lootHex(ctx, f, hex);
  };
}

// ─── Summon, trap, teleport ────────────────────────────────────────────────

/** First free hex around `hex` in direction order (deterministic placement for monsters). */
export function firstFreeNeighbor(ctx: Ctx, hex: Hex): Hex | undefined {
  return neighbors(hex).find((n) => isFreeHex(ctx.s, n) && !wallBetween(ctx.s, hex, n));
}

export function performSummon(ctx: Ctx, f: Figure, step: S<'summon'>, choice: StepChoice): StepResult {
  if (f.kind === 'monster') {
    const traits = ctx.c.monsters[f.typeId]?.traits ?? [];
    const max = traits.find((t) => t.trait === 'maxSummonsPerFigure');
    return () => {
      for (let i = 0; i < (step.count ?? 1); i++) {
        if (max && max.trait === 'maxSummonsPerFigure') {
          const mine = Object.values(ctx.s.figures).filter((m) => m.kind === 'monster' && m.summonerId === f.id).length;
          if (mine >= max.value) return;
        }
        const hex = firstFreeNeighbor(ctx, f.hex);
        if (!hex) return;
        spawnMonster(ctx, step.summon, step.rank ?? 'normal', hex, f.id);
      }
    };
  }
  if (f.kind !== 'hero') return 'summons cannot summon';
  const def = ctx.c.heroes[f.classId]?.summon;
  if (!def || def.id !== step.summon) return `unknown summon ${step.summon}`;
  const id = `summon:${def.id}`;
  if (ctx.s.figures[id]) return 'already summoned';
  const hex = choice.hex;
  if (!hex || !areAdjacent(hex, f.hex) || !isFreeHex(ctx.s, hex) || wallBetween(ctx.s, hex, f.hex)) {
    return 'summon needs a free adjacent hex';
  }
  return () => {
    const summon: SummonState = {
      id,
      kind: 'summon',
      ownerId: f.id,
      summonId: def.id,
      move: def.move,
      attack: def.attack,
      hex: [hex[0], hex[1]],
      hp: def.hp,
      maxHp: def.hp,
      conditions: {},
      shields: [],
      retaliates: [],
      turnCount: 0,
    };
    if (def.range !== undefined) summon.range = def.range;
    ctx.s.figures[id] = summon;
    emit(ctx, { type: 'figureSpawned', figureId: id });
  };
}

export function performTrap(ctx: Ctx, f: Figure, step: S<'trap'>, choice: StepChoice): StepResult {
  const hex = choice.hex;
  const tile = hex && tileAt(ctx.s, hex);
  if (!hex || !tile || !areAdjacent(hex, f.hex) || !isFreeHex(ctx.s, hex) || tile.trap || tile.door) {
    return 'trap needs an empty adjacent hex';
  }
  return () => {
    tile.trap = { damage: step.damage, conditions: [...(step.conditions ?? [])] };
    emit(ctx, { type: 'trapPlaced', hex: [hex[0], hex[1]] });
  };
}

export function performTeleport(ctx: Ctx, f: Figure, step: S<'teleport'>, choice: StepChoice): StepResult {
  // Monsters (Тінерук) pick their hex deterministically.
  const hex = choice.hex ?? (f.kind === 'monster' ? teleportHex(ctx, f, step.range, monsterStats(ctx, f).range ?? 1) : undefined);
  if (f.kind === 'monster' && hex && hex[0] === f.hex[0] && hex[1] === f.hex[1]) return () => {};
  if (!hex || distance(hex, f.hex) > step.range || !isFreeHex(ctx.s, hex)) return 'teleport needs a free hex in range';
  return () => {
    f.hex = [hex[0], hex[1]];
    emit(ctx, { type: 'moved', figureId: f.id, path: [[hex[0], hex[1]]], jump: true });
  };
}

/** `active` steps only mark the card; the bonus is read from the active area when attacking.
 *  A Порив has no card: its `active` steps are kept on the hero until used up or the round ends. */
export function performActive(_ctx: Ctx, f: Figure, step: S<'active'>, src: EffectSource = {}): StepResult {
  if (f.kind !== 'hero') return 'only heroes have active cards';
  return () => {
    if (src.surge) (f.surgeGrants ??= []).push({ on: step.on, usesLeft: step.uses, grant: structuredClone(step.grant) });
  };
}
