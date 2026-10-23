// A simple greedy bot for replay tests: every choice comes from `legalActions`; a half is chosen
// by playing it out greedily and scoring the result. With the fork variants it also weighs a
// Порив («Наснага», played out the same way) and raising a downed ally («Підняти друга»).

import type { Content } from '../../src/rules/content';
import { apply } from '../../src/rules/engine';
import { distance, parseHexKey } from '../../src/rules/hex';
import { legalActionResults, legalActions } from '../../src/rules/queries';
import type { Action, GameState, HeroState } from '../../src/rules/state';

function hero(s: GameState, id: string): HeroState {
  return s.figures[id] as HeroState;
}

/** Higher is better for the party; `heroId` adds the acting hero's position. */
export function score(s: GameState, heroId?: string): number {
  if (s.phase === 'won') return 1e6;
  if (s.phase === 'lost') return -1e6;
  let v = 0;
  v += 12 * s.log.filter((e) => e.type === 'figureDied' && e.figureId.startsWith('monster:')).length;
  const monsters = Object.values(s.figures).filter((f) => f.kind === 'monster');
  for (const m of monsters) v += 3 * (m.maxHp - m.hp);
  for (const f of Object.values(s.figures)) {
    if (f.kind !== 'hero') continue;
    v += f.exhausted ? -200 : f.downed ? -120 : 2 * f.hp;
    v -= 2 * f.lost.length;
  }
  const me = heroId ? hero(s, heroId) : undefined;
  if (me && !me.exhausted) {
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

function avoidOrTake(s: GameState): Action {
  const p = s.pending;
  if (p?.kind !== 'avoidDamage') throw new Error('no damage pending');
  const h = hero(s, p.heroId);
  if (p.amount >= h.hp) {
    const spare = h.hand[h.hand.length - 1];
    if (h.hand.length > 2 && spare) return { type: 'avoidDamage', heroId: h.id, choice: { kind: 'loseHand', cardId: spare } };
    const [a, b] = h.discard;
    if (a && b) return { type: 'avoidDamage', heroId: h.id, choice: { kind: 'loseDiscard', cardIds: [a, b] } };
  }
  return { type: 'avoidDamage', heroId: h.id, choice: { kind: 'take' } };
}

/** Best immediate step choice (skipping included). */
function bestStep(s: GameState, content: Content, heroId: string): Action {
  let best: Action = { type: 'skipStep' };
  let bestScore = -Infinity;
  for (const { action: a, state } of legalActionResults(s, content)) {
    if (a.type !== 'resolveStep' && a.type !== 'skipStep') continue;
    let t: GameState | null = state;
    while (t?.pending?.kind === 'avoidDamage') t = after(t, avoidOrTake(t), content);
    if (!t) continue;
    const v = score(t, heroId) + (a.type === 'skipStep' ? -0.5 : 0);
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
    if (t.pending?.kind === 'avoidDamage') t = after(t, avoidOrTake(t), content) ?? t;
    else if (t.pending?.kind === 'stepChoice' && t.pending.heroId === heroId) t = after(t, bestStep(t, content, heroId), content) ?? t;
    else break;
  }
  return t;
}

function attackValue(c: Content, h: HeroState, cardId: string): number {
  const card = c.heroes[h.classId]?.cards.find((x) => x.id === cardId);
  const att = card?.top.steps.find((st) => st.type === 'attack');
  return (att && 'value' in att ? att.value + (att.targets ?? 1) - 1 + (att.area ? 1 : 0) : 1) - (card?.top.loss ? 1.5 : 0);
}

function moveValue(c: Content, h: HeroState, cardId: string): number {
  const card = c.heroes[h.classId]?.cards.find((x) => x.id === cardId);
  const mv = card?.bottom.steps.find((st) => st.type === 'move');
  return (mv && 'value' in mv ? mv.value : 1) - (card?.bottom.loss ? 1.5 : 0);
}

export function chooseAction(s: GameState, content: Content): Action {
  const p = s.pending;
  if (!p) throw new Error('bot: nothing pending');
  switch (p.kind) {
    case 'avoidDamage':
      return avoidOrTake(s);
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
    case 'heroTurn': {
      let best: Action = { type: 'endTurn', heroId: p.heroId };
      let bestScore = score(s, p.heroId) - 0.25;
      for (const { action: a, state: t } of legalActionResults(s, content)) {
        if (a.type !== 'startHalf' && a.type !== 'surge' && a.type !== 'reviveAlly') continue;
        const v = score(a.type === 'reviveAlly' ? t : finishHalf(t, content, p.heroId), p.heroId) - (a.type === 'startHalf' && a.basic ? 0.1 : 0);
        if (v > bestScore) {
          bestScore = v;
          best = a;
        }
      }
      return best;
    }
    case 'stepChoice':
      return bestStep(s, content, p.heroId);
    case 'endOfRound': {
      const h = hero(s, p.heroIds[0] as string);
      return { type: 'shortRest', heroId: h.id, rest: h.hand.length <= 3 };
    }
    case 'shortRestReroll':
      return { type: 'shortRestReroll', heroId: p.heroId, reroll: false };
    case 'longRestLoss':
      return { type: 'longRestLoss', heroId: p.heroId, cardId: hero(s, p.heroId).discard[0] as string };
    default: {
      const first = legalActions(s, content)[0];
      if (!first) throw new Error(`bot: no legal action for ${p.kind}`);
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
