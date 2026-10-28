// Scenario events (docs/design/missions.md «Події й підкріплення»): `ScenarioDef.events` — a
// trigger runs actions. Ambushes from a barrel (`heroEnters` → `spawn` with `burst`), a horn-blower
// who calls help unless stopped in time (`monsterTurnsAlive`), a bell runner (`objectReached`, the
// runner heads there instead of fighting), round waves (`round`), rooms that wake up when opened
// (`doorOpened`). Deterministic: no dice, spawn hexes in data order. `eventWarnings` tells the
// players in advance (intents, round forecast) about everything that is not a surprise.

import type { EventAction, EventTrigger, ScenarioDef, ScenarioEventDef } from './content';
import { emit, isFreeHex, isPresent, monsters, tileAt, wallBetween, type Ctx } from './effects/context';
import { openDoor } from './effects/move';
import { areAdjacent, distance, hexEquals, hexKey, neighbors, parseHexKey, type Hex } from './hex';
import { switchGoal } from './objectives';
import { addNewGroupsToOrder } from './round';
import { spawnKey, spawnMonster } from './setup';
import type { FigureId, GameState, HeroState, MonsterState } from './state';

function eventsOf(ctx: Pick<Ctx, 's' | 'c'>): ScenarioEventDef[] {
  return ctx.c.scenarios[ctx.s.scenarioId]?.events ?? [];
}

function done(s: GameState, ev: ScenarioEventDef): boolean {
  return s.firedEvents?.[ev.id] !== undefined && !(ev.trigger.type === 'round' && ev.trigger.every);
}

/** Whether the event can still fire (not fired, not prevented). */
export function eventPending(s: GameState, ev: ScenarioEventDef): boolean {
  return !done(s, ev);
}

function heroCountOf(s: GameState): number {
  return Object.values(s.figures).filter((f) => f.kind === 'hero').length;
}

/** Runs the event's actions; `origin` = where its figure stood (a stopped runner's coins). */
function fire(ctx: Ctx, ev: ScenarioEventDef, actions: EventAction[], origin?: Hex, prevented?: true): void {
  (ctx.s.firedEvents ??= {})[ev.id] = prevented ? 0 : ctx.s.round;
  emit(ctx, { type: 'scenarioEvent', eventId: ev.id, ...(prevented ? { prevented } : {}) });
  for (const a of actions) runAction(ctx, ev, a, origin);
  addNewGroupsToOrder(ctx);
}

function runAction(ctx: Ctx, ev: ScenarioEventDef, a: EventAction, origin?: Hex): void {
  const s = ctx.s;
  if (a.type === 'story') {
    emit(ctx, { type: 'story', text: a.text, eventId: ev.id });
  } else if (a.type === 'openDoor') {
    openDoor(ctx, a.hex);
  } else if (a.type === 'setGoal') {
    switchGoal(ctx, a.goal);
  } else if (a.type === 'coins') {
    const tile = origin && tileAt(s, origin);
    if (!origin || !tile) return;
    tile.coins = (tile.coins ?? 0) + a.coins;
    emit(ctx, { type: 'coinsDropped', byId: `event:${ev.id}`, hex: [origin[0], origin[1]], coins: a.coins });
  } else {
    const rank = a.by[spawnKey(heroCountOf(s))];
    if (!rank) return;
    const first = a.hexes[0];
    if (a.burst && first) burst(ctx, ev, first);
    for (let i = 0; i < (a.count ?? 1); i++) {
      const hex = spawnHex(s, a.hexes);
      if (!hex) return;
      const m = spawnMonster(ctx, a.monster, rank, hex);
      if (a.tag) m.tag = a.tag;
    }
  }
}

/** The barrel or cupboard on the hex breaks open: the obstacle is gone. */
function burst(ctx: Ctx, ev: ScenarioEventDef, hex: Hex): void {
  const tile = tileAt(ctx.s, hex);
  if (!tile?.obstacle || tile.door) return;
  delete tile.obstacle;
  delete tile.breakable;
  delete tile.movable;
  emit(ctx, { type: 'obstacleDestroyed', hex: [hex[0], hex[1]], byId: `event:${ev.id}` });
}

function spawnable(s: GameState, hex: Hex): boolean {
  const tile = tileAt(s, hex);
  return !!tile && isFreeHex(s, hex) && !(tile.door && !tile.door.open);
}

/** The first free listed hex, else the free revealed hex nearest to the first listed one (lowest
 *  q, r on ties). Null when the board is full. */
export function spawnHex(s: GameState, hexes: Hex[]): Hex | null {
  for (const h of hexes) if (spawnable(s, h)) return h;
  const anchor = hexes[0];
  if (!anchor) return null;
  let best: Hex | null = null;
  for (const key of Object.keys(s.board.tiles)) {
    const h = parseHexKey(key);
    if (!spawnable(s, h)) continue;
    const diff = best ? distance(h, anchor) - distance(best, anchor) || h[0] - best[0] || h[1] - best[1] : -1;
    if (diff < 0) best = h;
  }
  return best;
}

// ─── Triggers ──────────────────────────────────────────────────────────────

function pendingOf<T extends EventTrigger['type']>(ctx: Pick<Ctx, 's' | 'c'>, type: T): (ScenarioEventDef & { trigger: Extract<EventTrigger, { type: T }> })[] {
  return eventsOf(ctx).filter((ev) => ev.trigger.type === type && !done(ctx.s, ev)) as never;
}

/** `doorOpened`: the room was just revealed. */
export function onRoomRevealed(ctx: Ctx, roomId: string): void {
  for (const ev of pendingOf(ctx, 'doorOpened')) if (ev.trigger.room === roomId) fire(ctx, ev, ev.actions);
}

/** `round`: the round has just started (before card selection and the intents). */
export function onRoundStart(ctx: Ctx): void {
  const round = ctx.s.round;
  for (const ev of eventsOf(ctx)) {
    if (ev.trigger.type !== 'round' || !roundDue(ev.trigger, round)) continue;
    if (ctx.s.firedEvents?.[ev.id] === round) continue;
    fire(ctx, ev, ev.actions);
  }
}

function roundDue(t: Extract<EventTrigger, { type: 'round' }>, round: number): boolean {
  if (round < t.round) return false;
  return t.every ? (round - t.round) % t.every === 0 : round === t.round;
}

function enteredHexes(t: Extract<EventTrigger, { type: 'heroEnters' }>): Hex[] {
  return [...(t.hexes ?? []), ...(t.adjacent ? neighbors(t.adjacent) : [])];
}

/** `heroEnters`: the hero stepped on a hex; true when an event fired (the move stops there). */
export function onHeroEnters(ctx: Ctx, h: HeroState): boolean {
  let fired = false;
  for (const ev of pendingOf(ctx, 'heroEnters')) {
    const t = ev.trigger;
    if (!enteredHexes(t).some((x) => hexEquals(x, h.hex))) continue;
    if (t.adjacent && !t.hexes?.some((x) => hexEquals(x, h.hex)) && wallBetween(ctx.s, t.adjacent, h.hex)) continue;
    if (ctx.s.half) ctx.s.half.committed = true;
    ctx.s.undoPoint = null;
    fire(ctx, ev, ev.actions, h.hex);
    fired = true;
  }
  return fired;
}

function reached(s: GameState, m: MonsterState, hex: Hex): boolean {
  return hexEquals(m.hex, hex) || (areAdjacent(m.hex, hex) && !wallBetween(s, m.hex, hex));
}

/** End of a monster's turn: its call for help (`monsterTurnsAlive`) or its run (`objectReached`). */
export function onMonsterTurnEnd(ctx: Ctx, m: MonsterState): void {
  if (!m.tag) return;
  for (const ev of eventsOf(ctx)) {
    if (done(ctx.s, ev)) continue;
    const t = ev.trigger;
    if (t.type === 'monsterTurnsAlive' && t.tag === m.tag && m.turnCount >= t.turns) fire(ctx, ev, ev.actions, m.hex);
    else if (t.type === 'objectReached' && t.tag === m.tag && reached(ctx.s, m, t.hex)) fire(ctx, ev, ev.actions, m.hex);
  }
}

/** `bossHalfHp`: a boss's health just fell to half or below (s20's second phase). */
export function onBossHalfHp(ctx: Ctx, m: MonsterState): void {
  for (const ev of pendingOf(ctx, 'bossHalfHp')) if (!ev.trigger.boss || ev.trigger.boss === m.typeId) fire(ctx, ev, ev.actions, m.hex);
}

/** A tagged monster died: when it was the last with its tag, its pending events are prevented. */
export function onTaggedMonsterDied(ctx: Ctx, m: MonsterState): void {
  if (!m.tag) return;
  if (monsters(ctx.s).some((o) => o.id !== m.id && o.tag === m.tag && isPresent(o))) return;
  for (const ev of eventsOf(ctx)) {
    const t = ev.trigger;
    if (done(ctx.s, ev) || (t.type !== 'monsterTurnsAlive' && t.type !== 'objectReached') || t.tag !== m.tag) continue;
    fire(ctx, ev, ev.prevented ?? [], m.hex, true);
  }
}

/** Where a bell runner heads (its `objectReached` events still pending): the target and the free
 *  hexes next to it; null for every other monster. */
export function runnerGoal(ctx: Pick<Ctx, 's' | 'c'>, m: MonsterState): Hex[] | null {
  if (!m.tag) return null;
  const ev = pendingOf(ctx, 'objectReached').find((e) => e.trigger.tag === m.tag);
  if (!ev) return null;
  const target = ev.trigger.hex;
  return [target, ...neighbors(target).filter((n) => tileAt(ctx.s, n) && !wallBetween(ctx.s, n, target))];
}

// ─── Warnings (intents, round forecast) ────────────────────────────────────

export type EventWarning =
  /** A wave at the start of `round`. */
  | { eventId: string; kind: 'wave'; round: number; spawns: { monster: string; count: number }[] }
  /** A monster calls for help at the end of its turn in `round`, `turnsLeft` turns from now. */
  | { eventId: string; kind: 'call'; figureId: FigureId; turnsLeft: number; round: number; spawns: { monster: string; count: number }[] }
  /** A runner `steps` hexes from its goal (`hex`). */
  | { eventId: string; kind: 'alarm'; figureId: FigureId; hex: Hex; steps: number };

function spawnsOf(s: GameState, actions: EventAction[]): { monster: string; count: number }[] {
  const key = spawnKey(heroCountOf(s));
  const out: { monster: string; count: number }[] = [];
  for (const a of actions) {
    if (a.type !== 'spawn' || !a.by[key]) continue;
    const same = out.find((x) => x.monster === a.monster);
    if (same) same.count += a.count ?? 1;
    else out.push({ monster: a.monster, count: a.count ?? 1 });
  }
  return out;
}

function hidden(ev: ScenarioEventDef): boolean {
  return ev.hidden ?? (ev.trigger.type === 'doorOpened' || ev.trigger.type === 'heroEnters');
}

/** Whether the monster has had its turn this round already. */
function actedThisRound(s: GameState, m: MonsterState): boolean {
  if (s.phase === 'endOfRound') return true;
  if (s.phase !== 'turns') return false;
  const at = s.turnOrder.findIndex((e) => e.kind === 'monsterGroup' && e.typeId === m.typeId);
  if (at < 0 || at > s.turnIndex) return false;
  if (at < s.turnIndex) return true;
  return !(s.queue ?? []).some((t) => t.t === 'figureTurn' && t.figureId === m.id);
}

/** Every event the players should see coming, soonest first: waves by round, calls for help with
 *  their countdown, runners with the hexes they still have to go. Surprises are left out. */
export function eventWarnings(s: GameState, scenario: ScenarioDef | undefined): EventWarning[] {
  const out: EventWarning[] = [];
  if (!scenario || s.phase === 'won' || s.phase === 'lost') return out;
  for (const ev of scenario.events ?? []) {
    if (hidden(ev) || done(s, ev)) continue;
    const t = ev.trigger;
    if (t.type === 'round') {
      let round = Math.max(t.round, s.round + 1);
      if (t.every && round > t.round) round = t.round + Math.ceil((round - t.round) / t.every) * t.every;
      if (!t.every && t.round <= s.round) continue;
      out.push({ eventId: ev.id, kind: 'wave', round, spawns: spawnsOf(s, ev.actions) });
    } else if (t.type === 'monsterTurnsAlive') {
      let best: Extract<EventWarning, { kind: 'call' }> | null = null;
      for (const m of monsters(s)) {
        if (m.tag !== t.tag || !isPresent(m)) continue;
        const turnsLeft = Math.max(1, t.turns - m.turnCount);
        const round = s.round + turnsLeft - (actedThisRound(s, m) ? 0 : 1);
        if (!best || round < best.round) best = { eventId: ev.id, kind: 'call', figureId: m.id, turnsLeft, round, spawns: spawnsOf(s, ev.actions) };
      }
      if (best) out.push(best);
    } else if (t.type === 'objectReached') {
      for (const m of monsters(s)) {
        if (m.tag !== t.tag || !isPresent(m)) continue;
        out.push({ eventId: ev.id, kind: 'alarm', figureId: m.id, hex: t.hex, steps: Math.max(0, distance(m.hex, t.hex) - 1) });
      }
    }
  }
  const when = (w: EventWarning) => (w.kind === 'alarm' ? s.round : w.round);
  return out.sort((a, b) => when(a) - when(b));
}

/** Every hex an event names (trigger and actions), for the data checks. */
export function eventHexes(ev: ScenarioEventDef): string[] {
  const t = ev.trigger;
  const hexes: Hex[] = [];
  if (t.type === 'heroEnters') hexes.push(...(t.hexes ?? []), ...(t.adjacent ? [t.adjacent] : []));
  if (t.type === 'objectReached') hexes.push(t.hex);
  for (const a of [...ev.actions, ...(ev.prevented ?? [])]) {
    if (a.type === 'spawn') hexes.push(...a.hexes);
    if (a.type === 'openDoor') hexes.push(a.hex);
  }
  return hexes.map(hexKey);
}
