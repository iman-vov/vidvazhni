// What the board shows while the round's cards are chosen: where a monster can go this round, the
// hexes it could hit from there and the heroes it sees, and how far a hero walks with a card half.
// Built from the engine's own helpers (the AI's move model, maxReach, line of sight), so it shows
// what the AI will really use. Pure: tested in tests/app/threat.test.ts.

import { maxReach, type AttackStep, type MoveStep } from '../rules/ai/attack';
import type { Step } from '../rules/content';
import { monsterStats } from '../rules/effects/context';
import { hexKey, hexesInRadius, parseHexKey, type Hex, type HexKey } from '../rules/hex';
import type { LoadedContent } from '../rules/load';
import { hasLineOfSight, lineOfSight } from '../rules/los';
import { buildMoveModel, isOnBoard, reachableHexes, searchWithin } from '../rules/path';
import type { FigureId, GameState, HeroState, MonsterState } from '../rules/state';
import { resolvedSteps } from '../ui/game/figureCard';
import { playedCard } from '../ui/game/text';

export interface MonsterThreat {
  figureId: FigureId;
  /** True when this round's monster card is revealed; else the base stats (Рух / Атака / дальність). */
  known: boolean;
  steps: Step[];
  move: number;
  /** Hexes it can end its move on, with the cost (its own hex at 0). */
  reach: { hex: Hex; cost: number }[];
  /** The attack it plans with (null: no attack this round, or disarmed). */
  attack: AttackStep | null;
  /** How far the attack reaches from where it stands (melee 1). */
  range: number;
  /** Hexes it could attack from some hex of `reach` (in range and in sight). */
  threatened: Hex[];
  /** Heroes on the board: in sight from where it stands now, and in reach of an attack this round. */
  heroes: { figureId: FigureId; hex: Hex; sight: boolean; hit: boolean }[];
}

/** The steps the monster will take: the revealed card's, else its base move and attack. */
function threatSteps(s: GameState, content: LoadedContent, m: MonsterState): { steps: Step[]; known: boolean } {
  const current = s.behaviourDecks[m.typeId]?.current;
  if (current) return { steps: resolvedSteps(s, content, m, current), known: true };
  const st = monsterStats({ s, c: content }, m);
  const steps: Step[] = [];
  if (!m.conditions.immobilize) steps.push({ type: 'move', value: st.move, ...(st.flying ? { fly: true } : {}) });
  if (!m.conditions.disarm) steps.push({ type: 'attack', value: st.attack, ...(st.range !== undefined ? { range: st.range } : {}) });
  return { steps, known: false };
}

export function monsterThreat(s: GameState, content: LoadedContent, m: MonsterState): MonsterThreat {
  const { steps, known } = threatSteps(s, content, m);
  const moveIdx = steps.findIndex((st) => st.type === 'move');
  const moveStep = moveIdx >= 0 ? (steps[moveIdx] as MoveStep) : undefined;
  // The attack the AI plans the move for (planTurn): the first one after the move, else the first.
  const attacks = steps.map((st, i) => [st, i] as const).filter(([st]) => st.type === 'attack');
  const attack = ((attacks.find(([, i]) => i > moveIdx) ?? attacks[0])?.[0] as AttackStep | undefined) ?? null;
  const move = moveStep && !m.conditions.immobilize && !m.conditions.stun ? moveStep.value : 0;
  const model = buildMoveModel(s, { figureId: m.id, jump: moveStep?.jump, fly: moveStep?.fly, avoidNegativeHexes: true });
  const routes = move > 0 ? searchWithin(model, move) : new Map();
  const reach: { hex: Hex; cost: number }[] = [{ hex: [m.hex[0], m.hex[1]], cost: 0 }];
  for (const [key, route] of routes) if (key !== hexKey(m.hex)) reach.push({ hex: parseHexKey(key), cost: route.cost });
  const live = attack && !m.conditions.stun && !m.conditions.disarm ? attack : null;
  const range = live ? maxReach(live) : 0;
  const threatened = new Map<HexKey, Hex>();
  if (live) {
    for (const { hex: from } of reach) {
      for (const to of hexesInRadius(from, range)) {
        const key = hexKey(to);
        if (threatened.has(key) || (to[0] === from[0] && to[1] === from[1]) || !model.walls.exists(to)) continue;
        if (lineOfSight(model.walls, from, to)) threatened.set(key, to);
      }
    }
  }
  const heroes = Object.values(s.figures)
    .filter((f): f is HeroState => f.kind === 'hero' && isOnBoard(f))
    .map((f) => ({ figureId: f.id, hex: f.hex, sight: hasLineOfSight(s, m.hex, f.hex), hit: threatened.has(hexKey(f.hex)) }));
  return { figureId: m.id, known, steps, move, reach, attack: live, range, threatened: [...threatened.values()], heroes };
}

/** Every hex any monster on the board could attack this round. */
export function allThreats(s: GameState, content: LoadedContent): Hex[] {
  const out = new Map<HexKey, Hex>();
  for (const f of Object.values(s.figures)) {
    if (f.kind !== 'monster' || !isOnBoard(f)) continue;
    for (const hex of monsterThreat(s, content, f).threatened) out.set(hexKey(hex), hex);
  }
  return [...out.values()];
}

export interface HeroMove {
  /** Move points of that half: its own move, or the default «Рух 2» of a bottom half without one. */
  move: number;
  /** True when the half has no move of its own and the default bottom action is used. */
  fallback: boolean;
  jump: boolean;
  reach: { hex: Hex; cost: number }[];
}

/** Where the hero can walk with one half of a card (the engine's path search, as the turn uses). */
export function heroMove(s: GameState, content: LoadedContent, heroId: FigureId, cardId: string, half: 'top' | 'bottom'): HeroMove | null {
  const hero = s.figures[heroId];
  if (hero?.kind !== 'hero') return null;
  const card = playedCard(content, hero.classId, cardId, s.variants);
  if (!card) return null;
  const own = card[half].steps.find((st): st is MoveStep => st.type === 'move');
  const fallback = !own && half === 'bottom';
  const move = hero.conditions.immobilize || hero.conditions.stun ? 0 : (own?.value ?? (fallback ? 2 : 0));
  const jump = !!own?.jump;
  const routes = move > 0 ? reachableHexes(s, move, { figureId: heroId, jump, fly: !!own?.fly }) : new Map();
  return { move, fallback, jump, reach: [...routes].filter(([key]) => key !== hexKey(hero.hex)).map(([key, r]) => ({ hex: parseHexKey(key), cost: r.cost })) };
}
