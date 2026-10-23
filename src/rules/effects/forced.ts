// Stand-alone push and pull steps («Штовхання 2 усім сусіднім ворогам», «Притягнути 1 союзника на 1»).

import type { Step } from '../content';
import type { Figure, StepChoice } from '../state';
import type { Ctx } from './context';
import { autoForcedPath, forcedMove, validForcedPath } from './move';
import { resolveTargets, type EffectSource, type StepResult } from './support';

type ForcedStep = Extract<Step, { type: 'push' | 'pull' }>;

export function performForced(ctx: Ctx, f: Figure, step: ForcedStep, choice: StepChoice, src: EffectSource): StepResult {
  const range = step.type === 'pull' ? step.range : undefined;
  const targets = resolveTargets(ctx, f, step.target, choice, { range, extraTargets: src.extraTargets });
  if (typeof targets === 'string') return targets;
  if (targets.length === 0) return 'no targets';
  const paths = new Map<string, ReturnType<typeof autoForcedPath>>();
  for (const t of targets) {
    if (t.id === f.id) return 'cannot push yourself';
    const chosen = choice.pushPaths?.[t.id];
    if (chosen && !validForcedPath(ctx, t, f.hex, chosen, step.value, step.type)) return `illegal ${step.type} path for ${t.id}`;
    paths.set(t.id, chosen ?? autoForcedPath(ctx, t, f.hex, step.value, step.type));
  }
  return () => {
    for (const t of targets) forcedMove(ctx, t, paths.get(t.id) ?? [], step.type);
  };
}
