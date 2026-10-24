// Scenario objectives: the main goal, optional secondary goals and what the HUD shows about them.
// Pure checks over the state; the round decides when they are applied (docs/design/missions.md).

import type { Content, ScenarioDef, SecondaryGoalDef } from './content';
import { activeHeroes, heroes, isPresent, monsters, type Ctx } from './effects/context';
import { hexEquals } from './hex';
import type { GameState } from './state';

// ─── Main goal ─────────────────────────────────────────────────────────────

/** Checked at the end of every round. */
export function goalReached(ctx: Ctx): boolean {
  const s = ctx.s;
  const scenario = ctx.c.scenarios[s.scenarioId];
  if (!scenario) return false;
  const goal = scenario.goal;
  const living = activeHeroes(s);
  switch (goal.type) {
    case 'killAll':
      return s.board.revealedRooms.length === scenario.rooms.length && !monsters(s).some(isPresent);
    case 'killBoss':
      return (
        scenario.rooms.some((r) => s.board.revealedRooms.includes(r.id) && r.spawns?.some((sp) => sp.monster === goal.boss)) &&
        !monsters(s).some((m) => m.typeId === goal.boss && isPresent(m))
      );
    case 'reachExit':
      return living.length > 0 && living.every((h) => goal.hexes.some((x) => hexEquals(x, h.hex)));
    case 'carryItem':
      return living.some(
        (h) => ((h.questItems ?? []).includes(goal.item) || (h.chests ?? []).includes(goal.item)) && goal.to.some((x) => hexEquals(x, h.hex)),
      );
  }
}

// ─── Secondary goals ───────────────────────────────────────────────────────

/** Named checks for secondary goals; `params` are their thresholds (like battle goals).
 *  True = met so far; applied for the reward when the scenario is won. */
const SECONDARY_CHECKS: Record<string, (s: GameState, params: SecondaryGoalDef['params']) => boolean> = {
  /** «Відкрий скриню»: a hero has looted the chest `params.chest`. */
  chestOpened: (s, p) => heroes(s).some((h) => (h.chests ?? []).includes(String(p?.chest))),
  /** «Ніхто не виснажився». */
  noneExhausted: (s) => !heroes(s).some((h) => h.exhausted),
  /** «До N-го раунду»: the scenario ends no later than round `params.rounds`. */
  withinRounds: (s, p) => s.round <= Number(p?.rounds),
};

export function isSecondaryCheck(check: string): boolean {
  return check in SECONDARY_CHECKS;
}

export function secondaryMet(s: GameState, goal: SecondaryGoalDef): boolean {
  return SECONDARY_CHECKS[goal.check]?.(s, goal.params) ?? false;
}

/** Gold each hero gets for the secondary goals met (call on a won scenario). */
export function secondaryGold(content: Content, s: GameState): number {
  const goals = content.scenarios[s.scenarioId]?.secondary ?? [];
  return goals.filter((g) => secondaryMet(s, g)).reduce((sum, g) => sum + (g.reward.gold ?? 0), 0);
}

// ─── HUD ───────────────────────────────────────────────────────────────────

export interface ObjectiveStatus {
  /** The main goal's type; the HUD names it with `objective.<type>`. */
  goal: ScenarioDef['goal']['type'];
  /** Progress counter when the goal has one (heroes at the exit, monsters left). */
  done?: number;
  of?: number;
  secondary: { id: string; check: string; params?: SecondaryGoalDef['params']; met: boolean }[];
}

export function objectiveStatus(content: Content, s: GameState): ObjectiveStatus | null {
  const scenario = content.scenarios[s.scenarioId];
  if (!scenario) return null;
  const goal = scenario.goal;
  const living = activeHeroes(s);
  const status: ObjectiveStatus = {
    goal: goal.type,
    secondary: (scenario.secondary ?? []).map((g) => ({ id: g.id, check: g.check, params: g.params, met: secondaryMet(s, g) })),
  };
  if (goal.type === 'reachExit') {
    status.done = living.filter((h) => goal.hexes.some((x) => hexEquals(x, h.hex))).length;
    status.of = living.length;
  }
  if (goal.type === 'killAll') status.done = monsters(s).filter(isPresent).length;
  return status;
}
