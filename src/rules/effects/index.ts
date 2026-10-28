// Step dispatcher: applies a consume bonus when chosen, validates the step, pays the elements,
// applies it and runs the bonus's follow-up steps.

import type { ConsumeBonus, ElementId, Step } from '../content';
import { canConsume, consume } from '../elements';
import { runSpecial } from '../special';
import type { Figure, StepChoice } from '../state';
import { performAttack } from './attack';
import type { Ctx } from './context';
import { performMove } from './move';
import {
  performActive,
  performBless,
  performCondition,
  performHeal,
  performInfuse,
  performLoot,
  performProvoke,
  performRetaliate,
  performShield,
  performSummon,
  performTeleport,
  performTrap,
  type EffectSource,
  type StepResult,
} from './support';
import { performForced } from './forced';
import { rerollStepX } from '../dice';
import { withMirrorLight } from '../mirrors';

/** The step with a consume bonus folded in. */
export function withConsumeBonus(step: Step, bonus: ConsumeBonus): { step: Step; extraTargets: number } {
  const s = structuredClone(step) as Step & Record<string, unknown>;
  const add = bonus.add ?? {};
  if (s.type === 'move') s.value += (add.move ?? 0) + (add.value ?? 0);
  else if ('value' in s && typeof s.value === 'number') s.value += add.value ?? 0;
  if (s.type === 'attack') {
    if (add.range) s.range = (s.range ?? 0) + add.range;
    if (add.targets) s.targets = (s.targets ?? 1) + add.targets;
    if (add.push) s.push = (s.push ?? 0) + add.push;
    if (add.pierce) s.pierce = (s.pierce ?? 0) + add.pierce;
    if (bonus.replaceConditions) s.conditions = [...bonus.replaceConditions];
    if (bonus.conditions) s.conditions = [...new Set([...(s.conditions ?? []), ...bonus.conditions])];
    if (bonus.area) s.area = bonus.area;
    if (bonus.curse) s.curse = true;
  }
  if (s.type === 'push' && add.push) s.value += add.push;
  return { step: s, extraTargets: bonus.extraTarget ? 1 : 0 };
}

/** Elements a consume bonus would take for this choice, or an error. */
function elementsToConsume(ctx: Ctx, bonus: ConsumeBonus, choice: StepChoice): ElementId[] | string {
  const count = bonus.count ?? 1;
  let list: ElementId[];
  if (bonus.element === 'any') {
    list = choice.elements ?? (choice.element ? [choice.element] : []);
    if (list.length !== count || new Set(list).size !== count) return `choose ${count} element(s) to consume`;
  } else {
    list = [bonus.element];
  }
  if (list.some((e) => !canConsume(ctx, e))) return 'element not available';
  return list;
}

export function performStep(ctx: Ctx, f: Figure, step: Step, choice: StepChoice, src: EffectSource = {}): string | null {
  let actual = step;
  let paid: ElementId[] = [];
  const bonus = step.consume;
  if (choice.consume && bonus) {
    const els = elementsToConsume(ctx, bonus, choice);
    if (typeof els === 'string') return els;
    paid = els;
    // «Карти з X»: a rolled X is rolled again (better kept) instead of the bonus's `add.value`.
    const xBest = !!bonus.xBest && step.xRoll !== undefined;
    const folded = withConsumeBonus(step, xBest ? { ...bonus, add: { ...bonus.add, value: 0 } } : bonus);
    actual = folded.step;
    if (xBest) rerollStepX(ctx, f, actual);
    // s16: an attack with Light from a mirror reaches further.
    if (actual.type === 'attack' && paid.includes('light')) actual = withMirrorLight(ctx, f, actual);
    src = { ...src, extraTargets: (src.extraTargets ?? 0) + folded.extraTargets };
  }
  // Infusing with an `any` element uses `choice.element`; a consume of `any` must not reuse it.
  const result = dispatch(ctx, f, actual, choice, src);
  if (typeof result === 'string') return result;
  for (const e of paid) consume(ctx, e, f.id);
  result();
  if (paid.length > 0 && bonus?.then) {
    for (const extra of bonus.then) {
      const r = dispatch(ctx, f, extra, {}, src);
      if (typeof r !== 'string') r();
    }
  }
  return null;
}

function dispatch(ctx: Ctx, f: Figure, step: Step, choice: StepChoice, src: EffectSource): StepResult {
  switch (step.type) {
    case 'move':
      return performMove(ctx, f, step, choice);
    case 'attack':
      return performAttack(ctx, f, step, choice);
    case 'heal':
      return performHeal(ctx, f, step, choice, src);
    case 'shield':
      return performShield(ctx, f, step, choice, src);
    case 'retaliate':
      return performRetaliate(ctx, f, step, src);
    case 'provoke':
      return performProvoke(ctx, f, step);
    case 'condition':
      return performCondition(ctx, f, step, choice, src);
    case 'bless':
      return performBless(ctx, f, step, choice, src);
    case 'push':
    case 'pull':
      return performForced(ctx, f, step, choice, src);
    case 'infuse':
      return performInfuse(ctx, f, step, choice);
    case 'loot':
      return performLoot(ctx, f, step);
    case 'summon':
      return performSummon(ctx, f, step, choice);
    case 'trap':
      return performTrap(ctx, f, step, choice);
    case 'active':
      return performActive(ctx, f, step, src);
    case 'teleport':
      return performTeleport(ctx, f, step, choice);
    case 'special':
      return runSpecial(ctx, f, step, choice, src);
  }
}
