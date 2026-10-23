// Turns and the task runner. Everything the engine does between player decisions is a task in
// `state.queue`; a task that needs a player's answer (avoid damage, short rest) stays at the front
// and sets `pending`. Tasks scheduled by a task run before the rest of the queue (depth first).

import { planTurn } from './ai';
import { expireConditions } from './conditions';
import type { MonsterCard, Step } from './content';
import { findCard, runDamage } from './damage';
import { attackSpecFor, canTarget, runAfterHit, runAttackTarget, runRetaliate } from './effects/attack';
import { emit, hero, isPresent, monsterStats, schedule, type Ctx } from './effects/context';
import { performStep, withConsumeBonus } from './effects/index';
import { runMove } from './effects/move';
import { lootHex } from './effects/support';
import { canConsume, consume, endTurnInfusions } from './elements';
import { runShortRests } from './rest';
import { behaviourCard, endRound, finishRound, nextTurn } from './round';
import { monstersOfType } from './setup';
import { LOSS_SPECIALS } from './special';
import { distance } from './hex';
import type { CardId, EngineTask, Figure, GameState, HeroState, MonsterState, StepChoice } from './state';

function isOver(s: GameState): boolean {
  return s.phase === 'won' || s.phase === 'lost';
}

/** Runs queued tasks until the queue is empty or a player decision is needed. */
export function run(ctx: Ctx): void {
  const s = ctx.s;
  s.queue ??= [];
  for (let guard = 0; guard < 100000; guard++) {
    if (s.phase === 'won' || s.phase === 'lost') {
      s.queue = [];
      return;
    }
    const task = s.queue[0];
    if (!task) return;
    ctx.out = [];
    const done = runTask(ctx, task);
    if (isOver(s)) continue;
    if (done) s.queue.shift();
    s.queue.unshift(...ctx.out);
    ctx.out = [];
    if (!done) return;
  }
  throw new Error('engine: task loop did not settle');
}

function runTask(ctx: Ctx, task: EngineTask): boolean {
  switch (task.t) {
    case 'nextTurn':
      nextTurn(ctx);
      return true;
    case 'startHeroTurn':
      startHeroTurn(ctx, task.heroId);
      return true;
    case 'heroReady':
      heroReady(ctx, task.heroId);
      return true;
    case 'monsterGroup':
      monsterGroup(ctx, task.typeId);
      return true;
    case 'figureTurn':
      figureTurn(ctx, task.figureId);
      return true;
    case 'figureAct':
      figureAct(ctx, task.figureId);
      return true;
    case 'figureStep': {
      const f = ctx.s.figures[task.figureId];
      if (!isPresent(f)) return true;
      if (task.step.type === 'attack') figureAttack(ctx, f, task.step, task.targets);
      else performStep(ctx, f, task.step, {});
      return true;
    }
    case 'endFigureTurn':
      endFigureTurn(ctx, task.figureId);
      return true;
    case 'move':
      runMove(ctx, task);
      return true;
    case 'attackTarget':
      runAttackTarget(ctx, task);
      return true;
    case 'afterHit':
      runAfterHit(ctx, task);
      return true;
    case 'retaliate':
      runRetaliate(ctx, task.attackerId, task.targetId);
      return true;
    case 'damage':
      return runDamage(ctx, task);
    case 'stepDone':
      stepDone(ctx);
      return true;
    case 'endRound':
      endRound(ctx);
      return true;
    case 'shortRests':
      return runShortRests(ctx, task);
    case 'finishRound':
      finishRound(ctx);
      return true;
  }
}

// ─── Hero turn ─────────────────────────────────────────────────────────────

function startHeroTurn(ctx: Ctx, heroId: string): void {
  const h = hero(ctx.s, heroId);
  h.turnCount++;
  h.playedThisTurn = [];
  emit(ctx, { type: 'turnStarted', figureId: h.id });
  if (h.conditions.wound) schedule(ctx, { t: 'damage', targetId: h.id, amount: 1, source: 'condition', avoidable: true });
  schedule(ctx, { t: 'heroReady', heroId });
}

function heroReady(ctx: Ctx, heroId: string): void {
  const h = hero(ctx.s, heroId);
  if (h.exhausted) {
    schedule(ctx, { t: 'nextTurn' });
    return;
  }
  ctx.s.pending = h.selection?.kind === 'longRest' ? { kind: 'longRestLoss', heroId } : { kind: 'heroTurn', heroId };
}

export const BASIC_TOP: Step[] = [{ type: 'attack', value: 2 }];
export const BASIC_BOTTOM: Step[] = [{ type: 'move', value: 2 }];

/** Starts the top or bottom half of one of the two selected cards (or the basic action instead). */
export function startHalf(ctx: Ctx, heroId: string, cardId: CardId, half: 'top' | 'bottom', basic: boolean): string | null {
  const s = ctx.s;
  if (s.pending?.kind !== 'heroTurn' || s.pending.heroId !== heroId || s.half) return 'not this hero’s turn';
  const h = hero(s, heroId);
  if (h.conditions.stun) return 'stunned: end the turn';
  if (h.selection?.kind !== 'cards' || !h.selection.cards.includes(cardId)) return 'card not selected';
  if (h.playedThisTurn.some((p) => p.cardId === cardId)) return 'card already played';
  if (h.playedThisTurn.some((p) => p.half === half)) return `${half} action already played`;
  const snapshot = structuredClone({ ...s, log: [], undoPoint: null }) as GameState;
  const steps = basic ? (half === 'top' ? BASIC_TOP : BASIC_BOTTOM) : findCard(ctx, h, cardId)[half].steps;
  // Hook for fork «Наснага» (variants.momentum): a lightning-marked card would add a charge here.
  h.playedThisTurn.push({ cardId, half });
  s.half = { heroId, cardId, half, steps: structuredClone(steps), stepIndex: 0, committed: false, ...(basic ? { basic: true } : {}) };
  s.undoPoint = snapshot;
  enterStep(ctx);
  return null;
}

function enterStep(ctx: Ctx): void {
  const half = ctx.s.half;
  if (!half) return;
  const step = half.steps[half.stepIndex];
  if (!step) return finishHalf(ctx);
  ctx.s.pending = { kind: 'stepChoice', heroId: half.heroId, step, stepIndex: half.stepIndex };
}

/** Performs the pending step with the player's choice. Steps can be skipped, never reordered. */
export function resolveStep(ctx: Ctx, choice: StepChoice): string | null {
  const s = ctx.s;
  const half = s.half;
  if (s.pending?.kind !== 'stepChoice' || !half) return 'no step to resolve';
  const h = hero(s, half.heroId);
  const step = half.steps[half.stepIndex];
  if (!step) return 'no step';
  const err = performStep(ctx, h, step, choice, half.basic ? {} : { cardId: half.cardId });
  if (err) return err;
  if (step.xp) {
    h.xp += step.xp;
    emit(ctx, { type: 'xpGained', heroId: h.id, amount: step.xp });
  }
  s.pending = null;
  schedule(ctx, { t: 'stepDone' });
  return null;
}

export function skipStep(ctx: Ctx): string | null {
  if (ctx.s.pending?.kind !== 'stepChoice' || !ctx.s.half) return 'no step to skip';
  ctx.s.pending = null;
  schedule(ctx, { t: 'stepDone' });
  return null;
}

function stepDone(ctx: Ctx): void {
  const half = ctx.s.half;
  if (!half) return;
  const h = hero(ctx.s, half.heroId);
  if (h.exhausted) {
    ctx.s.half = null;
    schedule(ctx, { t: 'endFigureTurn', figureId: h.id }, { t: 'nextTurn' });
    return;
  }
  half.stepIndex++;
  enterStep(ctx);
}

/** The played card goes to the lost pile, the active area or the discard. */
function finishHalf(ctx: Ctx): void {
  const half = ctx.s.half;
  if (!half) return;
  const h = hero(ctx.s, half.heroId);
  ctx.s.half = null;
  ctx.s.pending = { kind: 'heroTurn', heroId: h.id };
  if (half.basic) return placeCard(ctx, h, half.cardId, 'discard');
  const cardHalf = findCard(ctx, h, half.cardId)[half.half];
  const loss = !!cardHalf.loss || cardHalf.steps.some((st) => st.type === 'special' && LOSS_SPECIALS.includes(st.name));
  if (cardHalf.active) {
    let usesLeft: number | undefined;
    for (const st of cardHalf.steps) {
      if (st.type === 'active') usesLeft = st.uses;
      else if ('duration' in st && typeof st.duration === 'object') usesLeft = st.duration.uses;
    }
    h.active.push({ cardId: half.cardId, half: half.half, lossOnEnd: loss, ...(usesLeft !== undefined ? { usesLeft } : {}) });
    emit(ctx, { type: 'cardMoved', heroId: h.id, cardId: half.cardId, to: 'active' });
    return;
  }
  placeCard(ctx, h, half.cardId, loss ? 'lost' : 'discard');
}

function placeCard(ctx: Ctx, h: HeroState, cardId: CardId, to: 'discard' | 'lost'): void {
  h[to].push(cardId);
  emit(ctx, { type: 'cardMoved', heroId: h.id, cardId, to });
}

export function endTurn(ctx: Ctx, heroId: string): string | null {
  const s = ctx.s;
  if (s.pending?.kind !== 'heroTurn' || s.pending.heroId !== heroId || s.half) return 'cannot end the turn now';
  const h = hero(s, heroId);
  if (h.selection?.kind === 'cards') {
    for (const cardId of h.selection.cards) {
      if (!h.playedThisTurn.some((p) => p.cardId === cardId)) placeCard(ctx, h, cardId, 'discard');
    }
  }
  s.pending = null;
  s.undoPoint = null;
  schedule(ctx, { t: 'endFigureTurn', figureId: heroId }, { t: 'nextTurn' });
  return null;
}

/** End of any figure's turn: heroes loot their hex, timed conditions end, infusions become strong. */
function endFigureTurn(ctx: Ctx, figureId: string): void {
  const f = ctx.s.figures[figureId];
  if (f && isPresent(f)) {
    if (f.kind === 'hero') lootHex(ctx, f, f.hex);
    expireConditions(ctx, f);
  }
  endTurnInfusions(ctx);
  emit(ctx, { type: 'turnEnded', figureId });
}

// ─── Monster and summon turns ──────────────────────────────────────────────

/** Elite (and boss) first, then normal, each by standee number; summoned-this-round skip. */
function monsterGroup(ctx: Ctx, typeId: string): void {
  const rank = (m: MonsterState) => (m.rank === 'normal' ? 1 : 0);
  const list = monstersOfType(ctx.s, typeId)
    .filter((m) => m.summonedRound !== ctx.s.round)
    .sort((a, b) => rank(a) - rank(b) || a.number - b.number);
  for (const m of list) schedule(ctx, { t: 'figureTurn', figureId: m.id });
}

function figureTurn(ctx: Ctx, figureId: string): void {
  const f = ctx.s.figures[figureId];
  if (!isPresent(f)) return;
  f.turnCount++;
  emit(ctx, { type: 'turnStarted', figureId });
  if (f.conditions.wound) schedule(ctx, { t: 'damage', targetId: f.id, amount: 1, source: 'condition', avoidable: false });
  schedule(ctx, { t: 'figureAct', figureId }, { t: 'endFigureTurn', figureId });
}

/** Absolute steps for this turn: card deltas on top of the monster's stats; consume bonuses taken
 *  when the element is available; immobilize drops moves, disarm drops attacks. */
export function figureSteps(ctx: Ctx, f: Figure): Step[] {
  let steps: Step[];
  if (f.kind === 'summon') {
    steps = [
      { type: 'move', value: f.move },
      { type: 'attack', value: f.attack, ...(f.range !== undefined ? { range: f.range } : {}) },
    ];
  } else if (f.kind === 'monster') {
    const current = ctx.s.behaviourDecks[f.typeId]?.current;
    if (!current) return [];
    steps = absoluteSteps(ctx, f, cardSteps(ctx, f, behaviourCard(ctx, f.typeId, current)));
  } else {
    return [];
  }
  steps = steps.map((st) => {
    if (!st.consume || st.consume.element === 'any' || !canConsume(ctx, st.consume.element)) return st;
    return withConsumeBonus(st, st.consume).step;
  });
  return steps.filter((st) => !(st.type === 'move' && f.conditions.immobilize) && !(st.type === 'attack' && f.conditions.disarm));
}

function cardSteps(ctx: Ctx, m: MonsterState, card: MonsterCard): Step[] {
  if (!card.if) return card.steps;
  const holds =
    card.if === 'selfHpAtMostHalf'
      ? m.hp * 2 <= m.maxHp
      : Object.values(ctx.s.figures).filter((f) => f.kind === 'hero' && isPresent(f) && distance(f.hex, m.hex) === 1).length >= 2;
  return holds ? card.steps : (card.otherwise ?? []);
}

function absoluteSteps(ctx: Ctx, m: MonsterState, steps: Step[]): Step[] {
  const stats = monsterStats(ctx, m);
  return steps.map((st): Step => {
    if (st.type === 'move') return { ...st, value: Math.max(0, stats.move + st.value), ...(stats.flying ? { fly: true } : {}) };
    if (st.type === 'attack') {
      const range = stats.range !== undefined ? stats.range + (st.range ?? 0) : st.range;
      const conditions = [...new Set([...(st.conditions ?? []), ...(stats.onAttack ?? [])])];
      const out: Step = { ...st, value: Math.max(0, stats.attack + st.value) };
      if (range !== undefined) out.range = Math.max(1, range);
      else delete out.range;
      if (conditions.length) out.conditions = conditions;
      return out;
    }
    return st;
  });
}

/** Plans with the AI, then queues the steps in card order. */
function figureAct(ctx: Ctx, figureId: string): void {
  const f = ctx.s.figures[figureId];
  if (!isPresent(f) || f.conditions.stun) return;
  const steps = figureSteps(ctx, f);
  // Consume the elements whose bonuses were folded in.
  for (const st of steps) if (st.consume && st.consume.element !== 'any' && canConsume(ctx, st.consume.element)) consume(ctx, st.consume.element);
  const plan = planTurn(ctx.s, figureId, steps);
  let attackIndex = 0;
  let moved = false;
  for (const st of steps) {
    if (st.type === 'move') {
      if (!moved && plan.path.length > 0) {
        schedule(ctx, { t: 'move', figureId, path: plan.path, ...(st.fly ? { fly: true } : {}), ...(st.jump ? { jump: true } : {}) });
      }
      moved = true;
    } else if (st.type === 'attack') {
      const targets = plan.attackTargets[attackIndex++] ?? [];
      if (plan.focusId === null) continue;
      if (targets.length > 0) schedule(ctx, { t: 'figureStep', figureId, step: st, targets });
    } else {
      schedule(ctx, { t: 'figureStep', figureId, step: st, targets: [] });
    }
  }
}

/** A monster's or summon's attack on the targets the AI planned (area shapes included); targets
 *  that died or became untargetable since planning are dropped. */
function figureAttack(ctx: Ctx, f: Figure, step: Extract<Step, { type: 'attack' }>, targetIds: string[]): void {
  if (f.conditions.disarm) return;
  const planned = !!step.area || !!step.targetAll;
  for (const id of targetIds) {
    const t = ctx.s.figures[id];
    if (!t || !isPresent(t) || t.conditions.invisible) continue;
    if (!planned && !canTarget(ctx, f, t, step)) continue;
    schedule(ctx, { t: 'attackTarget', attackerId: f.id, targetId: t.id, spec: attackSpecFor(ctx, f, t, step) });
  }
}
