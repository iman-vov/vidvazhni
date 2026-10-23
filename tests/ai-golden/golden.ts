// Runner for golden AI positions: «monster, heroes, obstacles → expected hex and target».

import { expect, it } from 'vitest';
import { planTurn } from '../../src/rules/ai';
import type { AreaShape, Step } from '../../src/rules/content';
import { validatePath } from '../../src/rules/geometry';
import { hexKey, type Hex } from '../../src/rules/hex';
import { makeState, type BoardSpec, type FigureSpec } from '../helpers/geometryFixtures';

export interface Golden {
  name: string;
  board?: BoardSpec;
  /** The acting figure. */
  me: FigureSpec;
  others?: FigureSpec[];
  steps: Step[];
  /** Expected end hex (the start hex when it stays). */
  at: Hex;
  focus: string | null;
  /** Expected targets per attack step; default: one attack step hitting only the focus. */
  targets?: string[][];
  /** Hexes the path must not enter. */
  avoids?: Hex[];
}

// Compact builders.
export const hero = (name: string, at: Hex, initiative?: number, extra: Partial<FigureSpec> = {}): FigureSpec => ({
  id: `hero:${name}`,
  at,
  initiative,
  ...extra,
});
export const mon = (id: string, at: Hex, extra: Partial<FigureSpec> = {}): FigureSpec => ({ id: `monster:${id}`, at, ...extra });
export const move = (value: number, extra: { jump?: boolean; fly?: boolean } = {}): Step => ({ type: 'move', value, ...extra });
export const attack = (
  value: number,
  extra: { range?: number; targets?: number; area?: AreaShape; targetAll?: 'adjacentEnemies' } = {},
): Step => ({ type: 'attack', value, ...extra });
export const shield = (value: number): Step => ({ type: 'shield', value, target: 'self', duration: 'round' });

export function runGolden(cases: Golden[]): void {
  for (const g of cases) {
    it(g.name, () => {
      const state = makeState(g.board ?? {}, [g.me, ...(g.others ?? [])]);
      const plan = planTurn(state, g.me.id, g.steps);
      const end = plan.path.length > 0 ? plan.path[plan.path.length - 1]! : g.me.at;
      expect({ at: hexKey(end), focus: plan.focusId }).toEqual({ at: hexKey(g.at), focus: g.focus });
      const attacks = g.steps.filter((s) => s.type === 'attack').length;
      const targets = g.targets ?? (attacks === 0 ? [] : [g.focus ? [g.focus] : []]);
      expect(plan.attackTargets).toEqual(targets);
      for (const h of g.avoids ?? []) expect(plan.path.map(hexKey)).not.toContain(hexKey(h));
      // The path itself must be a legal move.
      const m = g.steps.find((s) => s.type === 'move');
      if (plan.path.length > 0) {
        expect(m, 'moved without a move step').toBeDefined();
        if (m?.type === 'move') {
          expect(validatePath(state, plan.path, m.value, { figureId: g.me.id, jump: m.jump, fly: m.fly })).not.toBeNull();
        }
      }
      // Determinism: the same input gives the same plan.
      expect(planTurn(state, g.me.id, g.steps)).toEqual(plan);
    });
  }
}
