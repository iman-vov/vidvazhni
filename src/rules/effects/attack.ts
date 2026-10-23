// Attacks. Order: base → card and item bonuses (and poison) → modifier → target shield reduced by
// pierce. Then conditions, curse, push/pull and finally the target's retaliate.
// Fork «Підхоплення» (variants.followUp) would add its bonus in `attackSpecFor`.

import type { AttackBonus, AttackBonusCondition, ConditionId, Step } from '../content';
import { addCondition } from '../conditions';
import { areaHexes } from '../geometry';
import { areAdjacent, distance, hexEquals } from '../hex';
import { applyModifier, drawForAttack } from '../modifiers';
import { moveActiveOut } from '../round';
import type { AttackSpec, EngineTask, Figure, HeroState, ModifierDeck, StepChoice } from '../state';
import { emit, enemiesOf, figureAt, isPresent, schedule, wallBetween, type Ctx } from './context';
import { autoForcedPath, forcedMove, validForcedPath } from './move';
import { curseFigure, inRangeWithSight, type StepResult } from './support';

type AttackStep = Extract<Step, { type: 'attack' }>;
type AttackTask = Extract<EngineTask, { t: 'attackTarget' }>;
type AfterHitTask = Extract<EngineTask, { t: 'afterHit' }>;

export function isRanged(step: AttackStep): boolean {
  return step.range !== undefined;
}

function bonusHolds(ctx: Ctx, attacker: Figure, target: Figure, cond: AttackBonusCondition): boolean {
  const near = (f: Figure) => isPresent(f) && areAdjacent(f.hex, target.hex);
  const figures = Object.values(ctx.s.figures);
  switch (cond) {
    case 'allyAdjacentToTarget':
      return figures.some((f) => f.id !== attacker.id && near(f) && (f.kind === 'monster') === (attacker.kind === 'monster'));
    case 'targetHasNoOtherEnemyAdjacent':
      // Nobody from the target's own side stands next to it.
      return !figures.some((f) => f.id !== target.id && near(f) && (f.kind === 'monster') === (target.kind === 'monster'));
    case 'sameTypeAdjacentToTarget':
      return (
        attacker.kind === 'monster' &&
        figures.some((f) => f.id !== attacker.id && near(f) && f.kind === 'monster' && f.typeId === attacker.typeId)
      );
  }
}

/** Active-card grants that apply to this attack (Пташиний зір: next 2 ranged attacks with advantage). */
function activeGrants(ctx: Ctx, h: HeroState, ranged: boolean): { cardId: string; advantage: boolean; conditions: ConditionId[] }[] {
  const out = [];
  for (const a of h.active) {
    const card = ctx.c.heroes[h.classId]?.cards.find((c) => c.id === a.cardId);
    for (const st of card?.[a.half].steps ?? []) {
      if (st.type !== 'active' || st.on === 'attacked') continue;
      if (st.on === 'rangedAttack' && !ranged) continue;
      out.push({ cardId: a.cardId, advantage: !!st.grant.advantage, conditions: st.grant.conditions ?? [] });
    }
  }
  return out;
}

/** One use of every applicable active grant is spent per attack step. */
export function spendActiveGrants(ctx: Ctx, f: Figure, step: AttackStep): void {
  if (f.kind !== 'hero') return;
  for (const g of activeGrants(ctx, f, isRanged(step))) spendActiveUse(ctx, f, g.cardId);
}

export function spendActiveUse(ctx: Ctx, h: HeroState, cardId: string): void {
  const a = h.active.find((x) => x.cardId === cardId);
  if (!a || a.usesLeft === undefined) return;
  a.usesLeft--;
  if (a.usesLeft <= 0) moveActiveOut(ctx, h, cardId);
}

/** Numbers of one attack against one target. */
export function attackSpecFor(ctx: Ctx, attacker: Figure, target: Figure, step: AttackStep): AttackSpec {
  const ranged = isRanged(step);
  let value = step.value;
  let advantage = !!step.advantage || !!attacker.conditions.strengthen;
  const conditions = [...(step.conditions ?? [])];
  for (const b of step.bonuses ?? ([] as AttackBonus[])) {
    if (!bonusHolds(ctx, attacker, target, b.if)) continue;
    value += b.attack ?? 0;
    if (b.advantage) advantage = true;
  }
  if (attacker.kind === 'monster') {
    const traits = ctx.c.monsters[attacker.typeId]?.traits ?? [];
    if (traits.some((t) => t.trait === 'advantageIfSameTypeAdjacentToTarget') && bonusHolds(ctx, attacker, target, 'sameTypeAdjacentToTarget')) {
      advantage = true;
    }
  }
  if (attacker.kind === 'hero') {
    for (const g of activeGrants(ctx, attacker, ranged)) {
      if (g.advantage) advantage = true;
      conditions.push(...g.conditions);
    }
  }
  let disadvantage = !!attacker.conditions.muddle;
  if (ranged && areAdjacent(attacker.hex, target.hex)) disadvantage = true;
  if (ranged && target.kind === 'monster') {
    const traits = ctx.c.monsters[target.typeId]?.traits ?? [];
    if (traits.some((t) => t.trait === 'rangedAttacksAgainstHaveDisadvantage')) disadvantage = true;
  }
  return {
    value,
    ranged,
    pierce: step.pierce ?? 0,
    push: step.push ?? 0,
    pull: step.pull ?? 0,
    conditions: [...new Set(conditions)],
    curse: !!step.curse,
    advantage,
    disadvantage,
  };
}

/** Whether `attacker` may target `target` with this step from where it stands. */
export function canTarget(ctx: Ctx, attacker: Figure, target: Figure, step: AttackStep): boolean {
  if (!isPresent(target) || target.conditions.invisible) return false;
  if (!enemiesOf(ctx.s, attacker).some((e) => e.id === target.id)) return false;
  return inRangeWithSight(ctx, attacker.hex, target.hex, step.range ?? 1);
}

/** A hero's (or a summon's chosen) attack: validates targets and schedules one attack per target. */
export function performAttack(ctx: Ctx, f: Figure, step: AttackStep, choice: StepChoice): StepResult {
  if (f.conditions.disarm) return 'disarmed';
  let targets: Figure[];
  if (step.targetAll === 'adjacentEnemies') {
    targets = enemiesOf(ctx.s, f).filter((e) => areAdjacent(e.hex, f.hex) && !wallBetween(ctx.s, e.hex, f.hex) && !e.conditions.invisible);
  } else if (step.area) {
    const fromSelf = step.area.shape === 'arc' || step.area.shape === 'allAdjacent' || step.area.shape === 'line';
    const anchor = choice.hex ?? (fromSelf ? f.hex : undefined);
    if (!anchor) return 'choose where the area goes';
    if (!fromSelf && !inRangeWithSight(ctx, f.hex, anchor, step.range ?? 1)) return 'area out of range';
    const hexes = areaHexes(step.area, f.hex, anchor, choice.direction ?? 0);
    targets = hexes
      .map((h) => figureAt(ctx.s, h))
      .filter((t): t is Figure => !!t && enemiesOf(ctx.s, f).some((e) => e.id === t.id) && !t.conditions.invisible);
    // Ranged areas: the anchor is in range; every target needs line of sight.
    if (!fromSelf) targets = targets.filter((t) => hexEquals(t.hex, anchor) || inRangeWithSight(ctx, f.hex, t.hex, Infinity));
  } else {
    const ids = choice.targets ?? [];
    const max = step.targets ?? 1;
    if (ids.length === 0) return 'choose targets';
    if (ids.length > max || new Set(ids).size !== ids.length) return `at most ${max} targets`;
    targets = [];
    for (const id of ids) {
      const t = ctx.s.figures[id];
      if (!t || !canTarget(ctx, f, t, step)) return `cannot target ${id}`;
      targets.push(t);
    }
  }
  if (targets.length === 0) return 'no targets';
  const forced = step.push ? 'push' : step.pull ? 'pull' : null;
  for (const t of targets) {
    const path = choice.pushPaths?.[t.id];
    if (forced && path && !validForcedPath(ctx, t, f.hex, path, (step.push ?? step.pull) as number, forced)) {
      return `illegal ${forced} path for ${t.id}`;
    }
  }
  return () => {
    spendActiveGrants(ctx, f, step);
    for (const t of targets) {
      const path = choice.pushPaths?.[t.id];
      schedule(ctx, { t: 'attackTarget', attackerId: f.id, targetId: t.id, spec: attackSpecFor(ctx, f, t, step), ...(path ? { pushPath: path } : {}) });
    }
  };
}

export function modifierDeckOf(ctx: Ctx, f: Figure): ModifierDeck {
  if (f.kind === 'hero') return f.modifierDeck;
  if (f.kind === 'summon') {
    const owner = ctx.s.figures[f.ownerId];
    if (owner?.kind === 'hero') return owner.modifierDeck;
  }
  return ctx.s.monsterDeck;
}

/** Active cards that shield their hero while attacked (Кам'яна шкіра: Щит 1 for 4 attacks). */
function attackedGrants(ctx: Ctx, f: Figure): { cardId: string; shield: number }[] {
  if (f.kind !== 'hero') return [];
  const out = [];
  for (const a of f.active) {
    const card = ctx.c.heroes[f.classId]?.cards.find((c) => c.id === a.cardId);
    for (const st of card?.[a.half].steps ?? []) {
      if (st.type === 'active' && st.on === 'attacked' && st.grant.shield) out.push({ cardId: a.cardId, shield: st.grant.shield });
    }
  }
  return out;
}

/** Total shield of a figure against one attack. */
export function shieldOf(f: Figure, ctx?: Ctx): number {
  const grants = ctx ? attackedGrants(ctx, f).reduce((sum, g) => sum + g.shield, 0) : 0;
  return grants + f.shields.reduce((sum, x) => sum + x.value, 0);
}

/** Task: draw the modifier and deal damage to one target. */
export function runAttackTarget(ctx: Ctx, task: AttackTask): void {
  const attacker = ctx.s.figures[task.attackerId];
  const target = ctx.s.figures[task.targetId];
  if (!isPresent(attacker) || !isPresent(target)) return;
  const spec = task.spec;
  const value = spec.value + (target.conditions.poison ? 1 : 0);
  const { drawn, chosen } = drawForAttack(ctx.s.rng, modifierDeckOf(ctx, attacker), value, spec.advantage, spec.disadvantage);
  if (ctx.s.half) ctx.s.half.committed = true;
  ctx.s.undoPoint = null;
  const afterModifier = applyModifier(chosen, value);
  const shield = shieldOf(target, ctx);
  const damage = Math.max(0, afterModifier - Math.max(0, shield - spec.pierce));
  emit(ctx, { type: 'attacked', attackerId: attacker.id, targetId: target.id, base: spec.value, modifiers: drawn, chosen, shield, damage });
  spendShieldUses(ctx, target);
  if (target.kind === 'hero') for (const g of attackedGrants(ctx, target)) spendActiveUse(ctx, target, g.cardId);
  if (target.kind === 'monster' && attacker.kind === 'hero' && !target.attackedBy.includes(attacker.id)) target.attackedBy.push(attacker.id);
  schedule(
    ctx,
    { t: 'damage', targetId: target.id, amount: damage, source: attacker.id, avoidable: true },
    { t: 'afterHit', attackerId: attacker.id, targetId: target.id, spec, ...(task.pushPath ? { pushPath: task.pushPath } : {}) },
  );
}

/** Shields «for N attacks» lose a use per attack; the card leaves the active area at 0. */
function spendShieldUses(ctx: Ctx, target: Figure): void {
  for (const sh of [...target.shields]) {
    if (typeof sh.until !== 'object') continue;
    sh.until.uses--;
    syncActiveUses(target, sh.source, sh.until.uses);
    if (sh.until.uses > 0) continue;
    target.shields = target.shields.filter((x) => x !== sh);
    if (target.kind === 'hero' && sh.source.startsWith('card:')) moveActiveOut(ctx, target, sh.source.slice(5));
  }
}

function syncActiveUses(f: Figure, source: string, uses: number): void {
  if (f.kind !== 'hero') return;
  const a = f.active.find((x) => `card:${x.cardId}` === source);
  if (a && a.usesLeft !== undefined) a.usesLeft = uses;
}

/** Task: conditions, curse, push/pull, then retaliate — only if the target survived. */
export function runAfterHit(ctx: Ctx, task: AfterHitTask): void {
  const attacker = ctx.s.figures[task.attackerId];
  const target = ctx.s.figures[task.targetId];
  if (!isPresent(target)) return;
  const spec = task.spec;
  for (const c of spec.conditions) addCondition(ctx, target, c);
  if (spec.curse) curseFigure(ctx, target);
  if (attacker && (spec.push > 0 || spec.pull > 0)) {
    const kind = spec.push > 0 ? 'push' : 'pull';
    const value = spec.push > 0 ? spec.push : spec.pull;
    const path =
      task.pushPath && validForcedPath(ctx, target, attacker.hex, task.pushPath, value, kind)
        ? task.pushPath
        : autoForcedPath(ctx, target, attacker.hex, value, kind);
    forcedMove(ctx, target, path, kind);
  }
  schedule(ctx, { t: 'retaliate', attackerId: task.attackerId, targetId: task.targetId });
}

/** Retaliate of `targetId` against `attackerId` (after any push has moved them). */
export function runRetaliate(ctx: Ctx, attackerId: string, targetId: string): void {
  const attacker = ctx.s.figures[attackerId];
  const target = ctx.s.figures[targetId];
  if (!isPresent(attacker) || !isPresent(target)) return;
  let total = 0;
  for (const r of [...target.retaliates]) {
    if (distance(attacker.hex, target.hex) > r.range) continue;
    if (r.range > 1 ? !inRangeWithSight(ctx, target.hex, attacker.hex, r.range) : wallBetween(ctx.s, target.hex, attacker.hex)) continue;
    total += r.value;
    if (typeof r.until === 'object') {
      r.until.uses--;
      syncActiveUses(target, r.source, r.until.uses);
      if (r.until.uses <= 0) {
        target.retaliates = target.retaliates.filter((x) => x !== r);
        if (target.kind === 'hero' && r.source.startsWith('card:')) moveActiveOut(ctx, target, r.source.slice(5));
      }
    }
  }
  if (total <= 0) return;
  emit(ctx, { type: 'retaliated', figureId: target.id, targetId: attacker.id, damage: total });
  schedule(ctx, { t: 'damage', targetId: attacker.id, amount: total, source: target.id, avoidable: true });
}
