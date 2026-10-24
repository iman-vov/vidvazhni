// Scenario objectives: the main goal, optional secondary goals and what the HUD shows about them.
// Pure checks over the state; the round decides when they are applied (docs/design/missions.md).

import type { Content, ScenarioDef, SecondaryGoalDef } from './content';
import { activeHeroes, heroes, isPresent, monsters, type Ctx } from './effects/context';
import { hexEquals, type Hex } from './hex';
import type { GameState } from './state';

// ─── Zones ─────────────────────────────────────────────────────────────────

/** Hexes of the zone `id`; empty when the scenario has no such zone. */
export function zoneHexes(scenario: ScenarioDef, id: string): Hex[] {
  return scenario.zones?.find((z) => z.id === id)?.hexes ?? [];
}

/** The goal's place: its `zone`, else its inline hexes (`hexes` / `to`); empty without a place. */
export function goalZone(scenario: ScenarioDef): Hex[] {
  const g = scenario.goal;
  if ('zone' in g && g.zone) return zoneHexes(scenario, g.zone);
  if (g.type === 'reachExit' || g.type === 'escape') return g.hexes ?? [];
  if (g.type === 'carryItem') return g.to ?? [];
  return [];
}

export function inZone(zone: Hex[], hex: Hex): boolean {
  return zone.some((x) => hexEquals(x, hex));
}

// ─── Main goal ─────────────────────────────────────────────────────────────

/** Checked at the end of every round. */
export function goalReached(ctx: Ctx): boolean {
  const s = ctx.s;
  const scenario = ctx.c.scenarios[s.scenarioId];
  if (!scenario) return false;
  const goal = scenario.goal;
  const living = activeHeroes(s);
  const zone = goalZone(scenario);
  switch (goal.type) {
    case 'killAll':
      return s.board.revealedRooms.length === scenario.rooms.length && !monsters(s).some(isPresent);
    case 'killBoss':
      return (
        scenario.rooms.some((r) => s.board.revealedRooms.includes(r.id) && r.spawns?.some((sp) => sp.monster === goal.boss)) &&
        !monsters(s).some((m) => m.typeId === goal.boss && isPresent(m))
      );
    case 'reachExit':
    case 'escape':
      return living.length > 0 && living.every((h) => inZone(zone, h.hex));
    case 'carryItem':
      return living.some((h) => ((h.questItems ?? []).includes(goal.item) || (h.chests ?? []).includes(goal.item)) && inZone(zone, h.hex));
    case 'survive':
      return living.length > 0 && s.round >= goal.rounds;
    case 'defend':
      return living.length > 0 && s.round >= goal.rounds && !monsterInZone(s, zone);
  }
}

function monsterInZone(s: GameState, zone: Hex[]): boolean {
  return monsters(s).some((m) => isPresent(m) && inZone(zone, m.hex));
}

// ─── Lose rules ────────────────────────────────────────────────────────────

/** Checked at the end of every round after the goal: a monster in the defended zone, the escape's
 *  timer run out, or the scenario's `lose` rules. (Every hero exhausted is checked as it happens, in damage.ts.) */
export function lostByRules(ctx: Ctx): boolean {
  const s = ctx.s;
  const scenario = ctx.c.scenarios[s.scenarioId];
  if (!scenario) return false;
  if (scenario.goal.type === 'defend' && monsterInZone(s, goalZone(scenario))) return true;
  if (scenario.goal.type === 'escape' && s.round >= scenario.goal.rounds) return true;
  return (scenario.lose ?? []).some((rule) => rule.type === 'roundLimit' && s.round >= rule.rounds);
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
  /** Rounds left before `roundLimit` loses the scenario, this one included. */
  roundsLeft?: number;
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
  if (goal.type === 'reachExit' || goal.type === 'escape') {
    const zone = goalZone(scenario);
    status.done = living.filter((h) => inZone(zone, h.hex)).length;
    status.of = living.length;
  }
  if (goal.type === 'killAll') status.done = monsters(s).filter(isPresent).length;
  if (goal.type === 'survive' || goal.type === 'defend') {
    status.done = Math.min(s.round, goal.rounds);
    status.of = goal.rounds;
  }
  const limits = (scenario.lose ?? []).filter((r) => r.type === 'roundLimit').map((r) => r.rounds);
  if (goal.type === 'escape') limits.push(goal.rounds);
  if (limits.length) status.roundsLeft = Math.max(0, Math.min(...limits) - s.round + 1);
  return status;
}
