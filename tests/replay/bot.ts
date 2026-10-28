// A simple greedy bot for replay tests: every choice comes from `legalActions`; a half is chosen
// by playing it out greedily and scoring the result. With the fork variants it also weighs a
// Порив («Наснага», played out the same way) and raising a downed ally («Підняти друга»).
// Scenario goals steer where the acting hero heads: monsters, exits, keys, chests, braziers.
// In the damage window it dodges (d12) or lets an ally cover by a fixed rule, never by peeking at
// the roll; carried items are weighed like a half. Used by the replay tests and the balance
// simulator (tests/balance/sim.test.ts).

import type { Content, ScenarioGoal } from '../../src/rules/content';
import { apply } from '../../src/rules/engine';
import { distance, parseHexKey, type Hex } from '../../src/rules/hex';
import { activeGoal, counterLeft, goalZone, inZone, npcId, objectState } from '../../src/rules/objectives';
import { mirrorBroken, turnsBetween } from '../../src/rules/mirrors';
import { NPC_LEAD } from '../../src/rules/scenarioRules';
import { isDoorLocked, legalActionResults, legalActions, scenarioObjects } from '../../src/rules/queries';
import { availableCards, recommendedHand } from '../../src/rules/setup';
import type { Action, GameState, HeroState } from '../../src/rules/state';
import { stepsFrom } from '../../tools/map-editor/checks';

/** The goal in force (an event may have switched it). */
function goalOf(s: GameState, content: Content | undefined): ScenarioGoal | undefined {
  const scenario = content?.scenarios[s.scenarioId];
  return scenario && activeGoal(s, scenario);
}

/** The goal's zone hexes. */
function zoneOf(s: GameState, content: Content): Hex[] {
  const scenario = content.scenarios[s.scenarioId]!;
  return goalZone(scenario, activeGoal(s, scenario));
}

/** Walking steps to the nearest of `targets` (walls and obstacles respected), cached per scenario and target set. */
const stepCache = new Map<string, Map<string, number>>();
function steps(s: GameState, content: Content, targets: Hex[]): Map<string, number> {
  const key = `${s.scenarioId}:${targets.map((h) => h.join(',')).sort().join(';')}`;
  let map = stepCache.get(key);
  if (!map) stepCache.set(key, (map = stepsFrom(content.scenarios[s.scenarioId]!, targets)));
  return map;
}
function pathDistance(s: GameState, content: Content, targets: Hex[], from: Hex): number {
  return steps(s, content, targets).get(from.join(',')) ?? 20 + Math.min(...targets.map((x) => distance(x, from)));
}

/** The closed doors on the way to the goal zone: those fewest steps from it, not the side rooms. */
function doorsTowards(s: GameState, content: Content, zone: Hex[]): Hex[] {
  const doors = closedDoors(s);
  if (doors.length < 2) return doors;
  const toZone = steps(s, content, zone);
  const d = (h: Hex) => toZone.get(h.join(',')) ?? Infinity;
  const best = Math.min(...doors.map(d));
  return doors.filter((h) => d(h) === best);
}

function hero(s: GameState, id: string): HeroState {
  return s.figures[id] as HeroState;
}

function closedDoors(s: GameState): Hex[] {
  return Object.entries(s.board.tiles)
    .filter(([, t]) => t.door && !t.door.open)
    .map(([k]) => parseHexKey(k))
    .filter((hex) => !isDoorLocked(s, hex));
}

function tilesWith(s: GameState, has: (t: GameState['board']['tiles'][string]) => boolean): Hex[] {
  return Object.entries(s.board.tiles)
    .filter(([, t]) => has(t))
    .map(([k]) => parseHexKey(k));
}

/** Where the acting hero should head, by the scenario goal; null = no goal-specific target. */
function goalTargets(s: GameState, content: Content, me: HeroState): Hex[] | null {
  const goal = goalOf(s, content);
  const monsters = Object.values(s.figures).filter((f) => f.kind === 'monster').map((f) => f.hex);
  const unlit = scenarioObjects(s).filter((o) => o.kind === 'brazier' && o.state === 'unlit').map((o) => o.hex);
  switch (goal?.type) {
    case 'reachExit': {
      // Clear the way first, then run for the exit (or the next door).
      if (monsters.length > 0) return null;
      const zone = zoneOf(s, content);
      const exits = zone.filter((x) => s.board.tiles[`${x[0]},${x[1]}`]);
      return exits.length > 0 ? exits : doorsTowards(s, content, zone);
    }
    case 'carryItem': {
      const carriers = Object.values(s.figures).filter(
        (f): f is HeroState => f.kind === 'hero' && !f.exhausted && !!f.questItems?.includes(goal.item),
      );
      if (carriers.some((c) => c.id === me.id)) return zoneOf(s, content);
      if (carriers.length > 0 || monsters.length > 0) return null;
      const items = tilesWith(s, (t) => !!t.chest || !!t.questItems?.length);
      return items.length > 0 ? items : null;
    }
    case 'escape':
    case 'race': {
      // The cave-in timer (or the rival) runs: run for the lift past the monsters, opening the doors on the way.
      const zone = zoneOf(s, content);
      return s.board.tiles[`${zone[0]?.join(',')}`] ? zone : doorsTowards(s, content, zone);
    }
    case 'destroy': {
      // Break the cages; their rooms open first.
      const cages = tilesWith(s, (t) => !!t.breakable && t.object?.kind === goal.kind);
      return cages.length > 0 ? cages : null;
    }
    case 'escort': {
      // Clear the way, then walk ahead of the escorted NPC towards the zone (score() keeps it on a leash).
      if (monsters.length > 0) return null;
      const zone = zoneOf(s, content);
      return s.board.tiles[`${zone[0]?.join(',')}`] ? zone : doorsTowards(s, content, zone);
    }
    case 'defend': {
      // The monsters inside the defended zone first (each one costs a light at the round's end).
      const zone = zoneOf(s, content);
      const inside = monsters.filter((m) => inZone(zone, m));
      return inside.length > 0 ? inside : null;
    }
    case 'objectStates': {
      // Turn the objects not yet in their state (an adjacent hero interacts), then walk into the zone.
      const scenario = content.scenarios[s.scenarioId]!;
      const wrong = goal.objects.filter((o) => objectState(s, scenario, o.id) !== o.state);
      const hexes = scenarioObjects(s).filter((o) => wrong.some((w) => w.id === o.id)).map((o) => o.hex);
      if (hexes.length > 0) return hexes;
      const zone = zoneOf(s, content);
      return zone.length > 0 && monsters.length === 0 ? zone : null;
    }
    default:
      // Light the braziers first (s5); otherwise the plain «nearest monster, then doors» pull.
      return unlit.length > 0 && monsters.length > 0 ? unlit : null;
  }
}

/** Higher is better for the party; `heroId` adds the acting hero's position. */
export function score(s: GameState, heroId?: string, content?: Content): number {
  if (s.phase === 'won') return 1e6;
  if (s.phase === 'lost') return -1e6;
  let v = 0;
  // A kill outweighs the jump of the distance pull from «nearest monster» to «nearest door or exit».
  v += 40 * s.log.filter((e) => e.type === 'figureDied' && e.figureId.startsWith('monster:')).length;
  const monsters = Object.values(s.figures).filter((f) => f.kind === 'monster');
  for (const m of monsters) v += 3 * (m.maxHp - m.hp);
  // An opened door is progress: without this the monsters it reveals make the step look worse.
  v += 30 * s.board.revealedRooms.length;
  for (const f of Object.values(s.figures)) {
    if (f.kind !== 'hero') continue;
    v += f.exhausted ? -200 : f.downed ? -120 : 2 * f.hp;
    v -= 2 * f.lost.length;
  }
  for (const o of scenarioObjects(s)) if ((o.kind === 'lever' && o.state === 'down') || (o.kind === 'brazier' && o.state === 'lit')) v += 20;
  const goal = goalOf(s, content);
  if (goal?.type === 'carryItem') {
    for (const f of Object.values(s.figures)) if (f.kind === 'hero' && !f.exhausted) v += 30 * (f.questItems?.length ?? 0);
  }
  if (goal?.type === 'destroy') v += 60 * (s.destroyedObjects?.length ?? 0);
  if (goal?.type === 'reachExit' || goal?.type === 'escape' || goal?.type === 'race' || goal?.type === 'objectStates') {
    for (const f of Object.values(s.figures)) {
      if (f.kind === 'hero' && !f.exhausted && inZone(zoneOf(s, content!), f.hex)) v += 25;
    }
  }
  if (goal?.type === 'defend' && goal.counter) v += 40 * counterLeft(s, goal);
  if (goal?.type === 'objectStates') {
    const scenario = content!.scenarios[s.scenarioId]!;
    v += 30 * goal.objects.filter((o) => objectState(s, scenario, o.id) === o.state).length;
    // s19's turning mirrors: every turn still needed counts against, so a mirror two turns off is
    // worth turning once.
    for (const o of goal.objects) {
      const turns = scenario.rooms.flatMap((r) => r.objects ?? []).find((x) => x.id === o.id)?.turns;
      if (turns) v -= 10 * Math.max(0, turnsBetween(turns, objectState(s, scenario, o.id), o.state));
    }
  }
  // s16: a broken mirror costs the secondary goal.
  if (mirrorBroken(s)) v -= 15;
  if (goal?.type === 'protect') {
    const tile = Object.values(s.board.tiles).find((t) => t.object?.id === goal.object);
    v += 10 * (tile?.breakable?.hp ?? 0);
  }
  const me = heroId ? hero(s, heroId) : undefined;
  if (goal?.type === 'escort' && me && !me.exhausted) {
    // The NPC walks only while a hero is within NPC_LEAD: the acting hero stays that close, or two
    // hexes further when an ally does; the party doesn't split up to open rooms alone.
    const npc = s.figures[npcId(goal.npc)];
    const near = (f: { hex: Hex }) => !!npc && distance(f.hex, npc.hex) <= NPC_LEAD;
    const ally = Object.values(s.figures).some((f) => f.kind === 'hero' && f.id !== me.id && !f.exhausted && near(f));
    if (npc) v -= 15 * Math.max(0, distance(me.hex, npc.hex) - NPC_LEAD - (ally ? 2 : 0));
  }
  const targets = me && content ? goalTargets(s, content, me) : null;
  if (me && content && !me.exhausted && targets && targets.length > 0) {
    // In the last rounds before the cave-in, any step towards the lift beats staying safe.
    const late = (goal?.type === 'escape' && s.round >= goal.rounds - 3) || goal?.type === 'race';
    v -= (late ? 60 : 3) * pathDistance(s, content, targets, me.hex);
  } else if (me && !me.exhausted) {
    if (monsters.length > 0) v -= Math.min(...monsters.map((m) => distance(m.hex, me.hex)));
    else {
      const doors = Object.entries(s.board.tiles)
        .filter(([, t]) => t.door && !t.door.open)
        .map(([k]) => distance(parseHexKey(k), me.hex));
      if (doors.length > 0) v -= 2 * Math.min(...doors);
    }
  }
  return v;
}

function after(s: GameState, a: Action, content: Content): GameState | null {
  const r = apply(s, a, content);
  return r.ok ? r.state : null;
}

function legal(s: GameState, a: Action, content?: Content): boolean {
  return !!content && apply(s, a, content).ok;
}

/** The card a hero parts with most easily (weakest attack and move). */
function spareCard(content: Content, h: HeroState, cards: string[]): string | undefined {
  return [...cards].sort((a, b) => attackValue(content, h, a) + moveValue(content, h, a) - attackValue(content, h, b) - moveValue(content, h, b))[0];
}

/** «Прикрий друга» or «Ухилитися» by a fixed rule (no look at the roll); null = neither. */
function defend(s: GameState, content: Content, h: HeroState, amount: number): Action | null {
  const lethal = amount >= h.hp;
  if (lethal || amount >= 3) {
    for (const f of Object.values(s.figures)) {
      if (f.kind !== 'hero' || f.id === h.id || f.exhausted || f.downed || f.hp <= amount + 2) continue;
      const a: Action = { type: 'coverAlly', heroId: f.id, targetId: h.id };
      if (legal(s, a, content)) return a;
    }
  }
  if (!lethal && amount < 2) return null;
  const tries: Action[] = [];
  if (h.momentum > 0 && (lethal || amount >= 3)) tries.push({ type: 'dodge', heroId: h.id, pay: { kind: 'momentum' } });
  const spare = spareCard(content, h, h.hand);
  if (spare && (lethal ? h.hand.length > 2 : h.hand.length >= 5 && amount >= 3)) tries.push({ type: 'dodge', heroId: h.id, pay: { kind: 'card', cardId: spare } });
  for (const it of h.items ?? []) {
    if (it.state !== 'ready' || !tries[0]) continue;
    const d = tries[0] as Extract<Action, { type: 'dodge' }>;
    const withItem: Action = { ...d, itemId: it.id };
    if (lethal && legal(s, withItem, content)) return withItem;
  }
  return tries.find((a) => legal(s, a, content)) ?? null;
}

function avoidOrTake(s: GameState, content?: Content): Action {
  const p = s.pending;
  if (p?.kind !== 'avoidDamage') throw new Error('no damage pending');
  const h = hero(s, p.heroId);
  const shield = (h.items ?? []).find((it) => it.state === 'ready' && legal(s, { type: 'useItem', heroId: h.id, itemId: it.id }, content) && /buckler|chainmail/.test(it.id));
  if (shield && p.amount >= 2) return { type: 'useItem', heroId: h.id, itemId: shield.id };
  const d = content ? defend(s, content, h, p.amount) : null;
  if (d) return d;
  if (p.amount >= h.hp) {
    const spare = h.hand[h.hand.length - 1];
    if (h.hand.length > 2 && spare) return { type: 'avoidDamage', heroId: h.id, choice: { kind: 'loseHand', cardId: spare } };
    // «Підняти друга»: going down once is cheaper than two cards while an ally stands to raise us.
    const raiser = Object.values(s.figures).some((f) => f.kind === 'hero' && f.id !== h.id && !f.exhausted && !f.downed);
    if (s.variants.reviveAlly && !h.revived && raiser) return { type: 'avoidDamage', heroId: h.id, choice: { kind: 'take' } };
    const [a, b] = h.discard;
    if (a && b) return { type: 'avoidDamage', heroId: h.id, choice: { kind: 'loseDiscard', cardIds: [a, b] } };
  }
  return { type: 'avoidDamage', heroId: h.id, choice: { kind: 'take' } };
}

/** Best immediate step choice (skipping included). */
function bestStep(s: GameState, content: Content, heroId: string): Action {
  let best: Action = { type: 'skipStep' };
  let bestScore = -Infinity;
  // On the escape's timer the party runs past the monsters instead of clearing every room.
  const running = goalOf(s, content)?.type;
  const fighting = running !== 'escape' && running !== 'race' && Object.values(s.figures).some((f) => f.kind === 'monster');
  for (const { action: a, state } of legalActionResults(s, content)) {
    if (a.type !== 'resolveStep' && a.type !== 'skipStep') continue;
    let t: GameState | null = state;
    while (t?.pending?.kind === 'avoidDamage') t = after(t, avoidOrTake(t, content), content);
    if (!t) continue;
    // No new room while monsters are still up (the door pull would rush the party into a second fight).
    if (fighting && t.board.revealedRooms.length > s.board.revealedRooms.length) continue;
    const v = score(t, heroId, content) + (a.type === 'skipStep' ? -0.5 : 0);
    if (v > bestScore) {
      bestScore = v;
      best = a;
    }
  }
  return best;
}

/** Plays a started half to its end with greedy choices. */
function finishHalf(s: GameState, content: Content, heroId: string): GameState {
  let t = s;
  for (let i = 0; i < 20; i++) {
    if (t.pending?.kind === 'avoidDamage') t = after(t, avoidOrTake(t, content), content) ?? t;
    else if (t.pending?.kind === 'stepChoice' && t.pending.heroId === heroId) t = after(t, bestStep(t, content, heroId), content) ?? t;
    else break;
  }
  return t;
}

function attackValue(c: Content, h: HeroState, cardId: string): number {
  const card = c.heroes[h.classId]?.cards.find((x) => x.id === cardId);
  const att = card?.top.steps.find((st) => st.type === 'attack');
  return (att && 'value' in att ? att.value + (att.targets ?? 1) - 1 + (att.area ? 1 : 0) : 1) - (card?.top.loss ? 3 : 0);
}

function moveValue(c: Content, h: HeroState, cardId: string): number {
  const card = c.heroes[h.classId]?.cards.find((x) => x.id === cardId);
  const mv = card?.bottom.steps.find((st) => st.type === 'move');
  return (mv && 'value' in mv ? mv.value : 1) - (card?.bottom.loss ? 3 : 0);
}

/** The best own-turn action. With `ahead`, the AHEAD best by their own half are valued again with
 *  the best follow-up of the same turn (so a move that brings an attack into reach beats an attack
 *  that cannot land yet); the rest keep their own value. */
const AHEAD = 3;
function bestTurnAction(s: GameState, content: Content, heroId: string, ahead: boolean): { action: Action; value: number } {
  const options: { action: Action; end: GameState; value: number; more: boolean }[] = [];
  for (const { action: a, state: t } of legalActionResults(s, content)) {
    if (a.type !== 'startHalf' && a.type !== 'surge' && a.type !== 'reviveAlly' && a.type !== 'interact' && a.type !== 'useItem') continue;
    const instant = a.type === 'reviveAlly' || a.type === 'interact' || a.type === 'useItem';
    const cost = a.type === 'useItem' ? 4 : a.type === 'startHalf' && a.basic ? 0.1 : 0;
    const end = instant ? t : finishHalf(t, content, heroId);
    const more = ahead && end.pending?.kind === 'heroTurn' && end.pending.heroId === heroId && a.type !== 'useItem';
    options.push({ action: a, end, value: score(end, heroId, content) - cost, more });
  }
  options.sort((x, y) => y.value - x.value);
  for (const o of options.slice(0, AHEAD)) {
    const cost = o.value - score(o.end, heroId, content);
    if (o.more) o.value = bestTurnAction(o.end, content, heroId, false).value + cost;
  }
  let best: Action = { type: 'endTurn', heroId };
  let bestScore = score(s, heroId, content) - 0.25;
  for (const o of options) {
    if (o.value > bestScore) {
      bestScore = o.value;
      best = o.action;
    }
  }
  return { action: best, value: bestScore };
}

export function chooseAction(s: GameState, content: Content): Action {
  const p = s.pending;
  if (!p) throw new Error('bot: nothing pending');
  switch (p.kind) {
    case 'avoidDamage':
      return avoidOrTake(s, content);
    case 'chooseHandBeforeScenario': {
      // The recommended hand; a levelled hero takes its new cards in place of the last recommended ones.
      const h = hero(s, p.heroIds[0] as string);
      const cls = content.heroes[h.classId]!;
      return { type: 'chooseHand', heroId: h.id, cards: recommendedHand(cls, availableCards(cls, h.level, h.cardPool)) };
    }
    case 'beforeAttacked': {
      const h = hero(s, p.heroId);
      const it = (h.items ?? []).find((x) => x.state === 'ready' && legal(s, { type: 'useItem', heroId: h.id, itemId: x.id }, content));
      return it ? { type: 'useItem', heroId: h.id, itemId: it.id } : { type: 'passReaction', heroId: h.id };
    }
    case 'initiativeItems':
      return { type: 'passReaction', heroId: p.heroIds[0] as string };
    case 'selectCards': {
      const h = hero(s, p.heroIds[0] as string);
      if (h.hand.length < 2) return { type: 'declareLongRest', heroId: h.id };
      const byAttack = [...h.hand].sort((a, b) => attackValue(content, h, b) - attackValue(content, h, a));
      const a = byAttack[0] as string;
      const byMove = h.hand.filter((x) => x !== a).sort((x, y) => moveValue(content, h, y) - moveValue(content, h, x));
      const b = byMove[0] as string;
      const ini = (id: string) => content.heroes[h.classId]?.cards.find((x) => x.id === id)?.initiative ?? 99;
      return { type: 'selectCards', heroId: h.id, cards: [a, b], leading: ini(a) <= ini(b) ? a : b };
    }
    case 'heroTurn':
      return bestTurnAction(s, content, p.heroId, true).action;
    case 'stepChoice':
      return bestStep(s, content, p.heroId);
    case 'endOfRound': {
      const h = hero(s, p.heroIds[0] as string);
      return { type: 'shortRest', heroId: h.id, rest: h.hand.length < 2 };
    }
    case 'shortRestReroll':
      return { type: 'shortRestReroll', heroId: p.heroId, reroll: false };
    case 'longRestLoss':
      return { type: 'longRestLoss', heroId: p.heroId, cardId: hero(s, p.heroId).discard[0] as string };
    case 'fadeOut': {
      const h = hero(s, p.heroId);
      return { type: 'fadeOut', heroId: h.id, choice: h.hp > p.damage + 3 ? 'damage' : 'loseCard' };
    }
    default: {
      const first = legalActions(s, content)[0];
      if (!first) throw new Error(`bot: no legal action for ${(p as { kind: string }).kind}`);
      return first;
    }
  }
}

/** Plays until the scenario ends (or the action limit); returns the final state and the log. */
export function playOut(start: GameState, content: Content, limit = 2000): { state: GameState; actions: Action[] } {
  let s = start;
  const actions: Action[] = [];
  while (s.phase !== 'won' && s.phase !== 'lost' && actions.length < limit) {
    const a = chooseAction(s, content);
    const r = apply(s, a, content);
    if (!r.ok) throw new Error(`bot chose an illegal action ${JSON.stringify(a)}: ${r.error}`);
    actions.push(a);
    s = r.state;
  }
  return { state: s, actions };
}
