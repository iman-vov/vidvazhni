// Scenario objectives: the main goal, optional secondary goals and what the HUD shows about them.
// Pure checks over the state; the round decides when they are applied (docs/design/missions.md).

import type { Content, ObjectDef, ScenarioDef, ScenarioGoal, SecondaryGoalDef } from './content';
import { activeHeroes, emit, heroes, isPresent, monsters, type Ctx } from './effects/context';
import { distance, hexEquals, type Hex } from './hex';
import { objectIntact } from './allies';
import { noAlarm } from './books';
import { mirrorBroken } from './mirrors';
import type { FigureId, GameState } from './state';

// ─── Zones ─────────────────────────────────────────────────────────────────

/** Hexes of the zone `id`; empty when the scenario has no such zone. */
export function zoneHexes(scenario: ScenarioDef, id: string): Hex[] {
  return scenario.zones?.find((z) => z.id === id)?.hexes ?? [];
}

/** The goal in force: the one an event switched to (`setGoal`), else the scenario's own. */
export function activeGoal(s: GameState, scenario: ScenarioDef): ScenarioGoal {
  return s.goal ?? scenario.goal;
}

/** Rounds played under the current goal: every round, unless an event switched it. */
export function goalRounds(s: GameState): number {
  return s.round - (s.goalSince ?? 0);
}

/** The goal's place: its `zone`, else its inline hexes (`hexes` / `to`); empty without a place.
 *  `goal` defaults to the scenario's own (the data checks); in play pass `activeGoal`. */
export function goalZone(scenario: ScenarioDef, goal: ScenarioGoal = scenario.goal): Hex[] {
  const g = goal;
  if ('zone' in g && g.zone) return zoneHexes(scenario, g.zone);
  if (g.type === 'reachExit' || g.type === 'escape' || g.type === 'objectStates') return g.hexes ?? [];
  if (g.type === 'carryItem' || g.type === 'collect' || g.type === 'escort' || g.type === 'race') return g.to ?? [];
  return [];
}

export function npcId(id: string): string {
  return `npc:${id}`;
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
  const goal = activeGoal(s, scenario);
  const living = activeHeroes(s);
  const zone = goalZone(scenario, goal);
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
    case 'collect':
      return (s.delivered ?? 0) >= goal.count;
    case 'escort': {
      const npc = s.figures[npcId(goal.npc)];
      return isPresent(npc) && inZone(zone, npc.hex);
    }
    case 'destroy': {
      const all = objectsOfKind(scenario, goal.kind);
      return all.length > 0 && all.every((o) => (s.destroyedObjects ?? []).includes(o.id));
    }
    case 'survive':
      return living.length > 0 && goalRounds(s) >= goal.rounds;
    case 'defend':
      return living.length > 0 && goalRounds(s) >= goal.rounds && (goal.counter ? counterLeft(s, goal) > 0 : !monsterInZone(s, zone));
    case 'race':
      return raceWinner(ctx) === 'heroes';
    case 'protect':
      return living.length > 0 && goalRounds(s) >= goal.rounds && objectStanding(s, goal.object);
    case 'objectStates':
      return (
        goal.objects.every((o) => objectState(s, scenario, o.id) === o.state) &&
        (zone.length === 0 || (living.length > 0 && living.every((h) => inZone(zone, h.hex))))
      );
  }
}

function objectsOfKind(scenario: ScenarioDef, kind: string): ObjectDef[] {
  return scenario.rooms.flatMap((r) => r.objects ?? []).filter((o) => o.kind === kind);
}

function monstersInZone(s: GameState, zone: Hex[]): number {
  return monsters(s).filter((m) => isPresent(m) && inZone(zone, m.hex)).length;
}

function monsterInZone(s: GameState, zone: Hex[]): boolean {
  return monstersInZone(s, zone) > 0;
}

/** `defend` with a counter: what is left of it. */
export function counterLeft(s: GameState, goal: Extract<ScenarioGoal, { type: 'defend' }>): number {
  return s.goalCounter ?? goal.counter ?? 0;
}

/** Not broken (an object in a room not yet revealed stands). */
export function objectStanding(s: GameState, id: string): boolean {
  return !(s.destroyedObjects ?? []).includes(id);
}

/** The object's state on the board, else its initial one from the data (a room not yet revealed). */
export function objectState(s: GameState, scenario: ScenarioDef, id: string): string | undefined {
  for (const t of Object.values(s.board.tiles)) if (t.object?.id === id) return t.object.state;
  if (!objectStanding(s, id)) return undefined;
  return scenario.rooms.flatMap((r) => r.objects ?? []).find((o) => o.id === id)?.state;
}

/** `race`: who is in the zone now: `heroes` (any hero on its feet, or with `all` every one),
 *  else the rival's figure id, else null. The heroes win a tie. */
export function raceWinner(ctx: Pick<Ctx, 's' | 'c'>): 'heroes' | FigureId | null {
  const s = ctx.s;
  const scenario = ctx.c.scenarios[s.scenarioId];
  const goal = scenario && activeGoal(s, scenario);
  if (goal?.type !== 'race') return null;
  const zone = goalZone(scenario!, goal);
  const living = activeHeroes(s);
  const there = living.filter((h) => inZone(zone, h.hex));
  if (there.length > 0 && (!goal.all || there.length === living.length)) return 'heroes';
  const rival = s.figures[npcId(goal.rival)];
  return isPresent(rival) && inZone(zone, rival.hex) ? rival.id : null;
}

/** End of a round, before the goal is checked: each monster in a counted `defend` zone takes 1. */
export function tickGoalCounter(ctx: Ctx): void {
  const s = ctx.s;
  const scenario = ctx.c.scenarios[s.scenarioId];
  const goal = scenario && activeGoal(s, scenario);
  if (goal?.type !== 'defend' || !goal.counter) return;
  const before = counterLeft(s, goal);
  const lost = Math.min(before, monstersInZone(s, goalZone(scenario!, goal)));
  if (lost === 0) return;
  s.goalCounter = before - lost;
  emit(ctx, { type: 'goalCounterChanged', lost, left: s.goalCounter });
}

/** Switches the scenario's goal (an event's `setGoal`, a boss phase). Its rounds count from the
 *  next round, or from this one while its cards are still being chosen (a round-start event). */
export function switchGoal(ctx: Ctx, goal: ScenarioGoal): void {
  const s = ctx.s;
  s.goal = goal;
  s.goalSince = s.phase === 'selectCards' ? s.round - 1 : s.round;
  delete s.goalCounter;
  emit(ctx, { type: 'goalChanged', goal: goal.type, since: s.goalSince });
}

// ─── Lose rules ────────────────────────────────────────────────────────────

/** Checked at the end of every round after the goal: a monster in the defended zone (or its
 *  counter run out), the escape's timer run out, the protected object broken, the race's rival
 *  there first, or the scenario's `lose` rules. (Every hero exhausted is checked as it happens,
 *  in damage.ts; a broken protected object and the race at every turn's end, in scenarioRules.) */
export function lostByRules(ctx: Ctx): boolean {
  const s = ctx.s;
  const scenario = ctx.c.scenarios[s.scenarioId];
  if (!scenario) return false;
  const goal = activeGoal(s, scenario);
  if (goal.type === 'defend' && (goal.counter ? counterLeft(s, goal) <= 0 : monsterInZone(s, goalZone(scenario, goal)))) return true;
  if (goal.type === 'escape' && goalRounds(s) >= goal.rounds) return true;
  if (goal.type === 'protect' && !objectStanding(s, goal.object)) return true;
  if (goal.type === 'race' && raceWinner(ctx) !== null) return true;
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
  /** «Опустити шлюз», «Увімкнути автомат»: the object `params.object` is in state `params.state`. */
  objectState: (s, p) => Object.values(s.board.tiles).some((t) => t.object?.id === String(p?.object) && t.object.state === String(p?.state)),
  /** «До N-го раунду»: the scenario ends no later than round `params.rounds`. */
  withinRounds: (s, p) => s.round <= Number(p?.rounds),
  /** «Не розбито жодного дзеркала» (s16, mirrors.ts). */
  noMirrorBroken: (s) => !mirrorBroken(s),
  /** «Серце без жодної подряпини» (s20): the object `params.object` stands at full health (allies.ts). */
  objectIntact: (s, p) => objectIntact(s, String(p?.object)),
  /** «Без тривоги» (s18): no living shelf woke (before the end of round `params.rounds`, books.ts). */
  /** «Жоден світлячок не згас» (s13): the counted defend lost nothing. */
  counterKept: (s) => s.goalCounter === undefined,
  /** «Розбити всі верстати до 2-ї фази» (s15, marsh.ts). */
  loomsBrokenBeforeHalf: (s) => s.loomsAtHalf === 0,
  noAlarm: (s, p) => noAlarm(s, p?.rounds === undefined ? undefined : Number(p.rounds)),
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
  /** The goal in force; the HUD names it with `objective.<type>`. */
  goal: ScenarioGoal['type'];
  /** Progress counter when the goal has one (heroes at the exit, monsters left). */
  done?: number;
  of?: number;
  /** A second line under the goal: its i18n key and numbers (the fireflies left, the rival's
   *  distance to the zone, the protected object's health). */
  extra?: { key: string; n: number; of?: number };
  /** Rounds left before `roundLimit` loses the scenario, this one included. */
  roundsLeft?: number;
  secondary: { id: string; check: string; params?: SecondaryGoalDef['params']; met: boolean }[];
}

function nearest(zone: Hex[], hex: Hex): number {
  return zone.length ? Math.min(...zone.map((x) => distance(x, hex))) : 0;
}

export function objectiveStatus(content: Content, s: GameState): ObjectiveStatus | null {
  const scenario = content.scenarios[s.scenarioId];
  if (!scenario) return null;
  const goal = activeGoal(s, scenario);
  const living = activeHeroes(s);
  const zone = goalZone(scenario, goal);
  const status: ObjectiveStatus = {
    goal: goal.type,
    secondary: (scenario.secondary ?? []).map((g) => ({ id: g.id, check: g.check, params: g.params, met: secondaryMet(s, g) })),
  };
  if (goal.type === 'reachExit' || goal.type === 'escape') {
    status.done = living.filter((h) => inZone(zone, h.hex)).length;
    status.of = living.length;
  }
  if (goal.type === 'collect') {
    status.done = s.delivered ?? 0;
    status.of = goal.count;
  }
  if (goal.type === 'escort') {
    const npc = s.figures[npcId(goal.npc)];
    if (npc) {
      status.done = npc.hp;
      status.of = npc.maxHp;
    }
  }
  if (goal.type === 'destroy') {
    const all = objectsOfKind(scenario, goal.kind);
    status.done = all.filter((o) => (s.destroyedObjects ?? []).includes(o.id)).length;
    status.of = all.length;
  }
  if (goal.type === 'killAll') status.done = monsters(s).filter(isPresent).length;
  if (goal.type === 'survive' || goal.type === 'defend' || goal.type === 'protect') {
    status.done = Math.min(Math.max(0, goalRounds(s)), goal.rounds);
    status.of = goal.rounds;
  }
  if (goal.type === 'defend' && goal.counter) status.extra = { key: goal.counterName ?? 'objective.counter', n: counterLeft(s, goal), of: goal.counter };
  if (goal.type === 'protect') {
    const tile = Object.values(s.board.tiles).find((t) => t.object?.id === goal.object);
    if (tile?.breakable) status.extra = { key: 'objective.objectHp', n: tile.breakable.hp, of: tile.breakable.maxHp };
  }
  if (goal.type === 'race') {
    // Steps as the crow flies: the nearest hero (the last one with `all`) and the rival.
    const d = living.map((h) => nearest(zone, h.hex));
    status.done = d.length ? (goal.all ? Math.max(...d) : Math.min(...d)) : 0;
    const rival = s.figures[npcId(goal.rival)];
    if (isPresent(rival)) status.extra = { key: 'objective.rival', n: nearest(zone, rival.hex) };
  }
  if (goal.type === 'objectStates') {
    status.done = goal.objects.filter((o) => objectState(s, scenario, o.id) === o.state).length;
    status.of = goal.objects.length;
  }
  const limits = (scenario.lose ?? []).filter((r) => r.type === 'roundLimit').map((r) => r.rounds);
  if (goal.type === 'escape') limits.push(goal.rounds + (s.goalSince ?? 0));
  if (limits.length) status.roundsLeft = Math.max(0, Math.min(...limits) - s.round + 1);
  return status;
}
