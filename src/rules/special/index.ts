// Registry of effects that are not data-describable. Card JSON refers to them by name:
// `{ "type": "special", "name": "recoverLost" }`.

import type { Step } from '../content';
import type { Ctx } from '../effects/context';
import type { EffectSource, StepResult } from '../effects/support';
import type { Figure, StepChoice } from '../state';
import { elementalSphere } from './elementalSphere';
import { fadeOut } from './fadeOut';
import { flood } from './flood';
import { retreat } from './retreat';
import { transmuteOrb } from './transmuteOrb';

type SpecialStep = Extract<Step, { type: 'special' }>;
export type SpecialFn = (ctx: Ctx, f: Figure, step: SpecialStep, choice: StepChoice, src: EffectSource) => StepResult;

export const SPECIALS: Record<string, SpecialFn> = {
  recoverLost: elementalSphere,
  elementalSphere,
  transmuteOrb,
  retreat,
  flood,
  fadeOut,
};

/** Specials whose card always goes to the lost pile, whatever the half says. */
export const LOSS_SPECIALS: readonly string[] = ['recoverLost', 'elementalSphere'];

export function runSpecial(ctx: Ctx, f: Figure, step: SpecialStep, choice: StepChoice, src: EffectSource): StepResult {
  const fn = SPECIALS[step.name];
  if (!fn) return `unknown special ${step.name}`;
  return fn(ctx, f, step, choice, src);
}
