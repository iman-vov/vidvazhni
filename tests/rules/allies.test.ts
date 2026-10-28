// allyPhase (s20, allies.ts): the boss at half health turns into an ally in place, and while the
// heroes protect the heart every monster goes for the heart.

import { describe, expect, it } from 'vitest';
import { objectIntact } from '../../src/rules/allies';
import type { BossType, Content, ScenarioEventDef, ScenarioGoal } from '../../src/rules/content';
import { takeDamage } from '../../src/rules/damage';
import { objectiveStatus } from '../../src/rules/objectives';
import { obstacleTargetError } from '../../src/rules/obstacles';
import type { GameState, SummonState } from '../../src/rules/state';
import { eventsOf, finishRound, makeContent, monsterType, newGame, selectAll } from '../helpers/engineFixtures';

const PROTECT: ScenarioGoal = { type: 'protect', object: 'heart', rounds: 3 };
const HALF: ScenarioEventDef = { id: 'phase2', trigger: { type: 'bossHalfHp', boss: 'guardian' }, actions: [{ type: 'setGoal', goal: PROTECT }] };
const GUARDIAN: BossType = { id: 'guardian', hpPerHero: 8, hpPerHeroPerLevel: 0, move: 0, attack: 3, deck: 'tboss', immune: [] };
const GUARDIAN_ID = 'monster:guardian:1';
const HEART: [number, number] = [6, 4];

/** The heart in the far corner, the boss next to the heroes' side of the room, rats as given. */
function fixture(rats: [number, number][], specials = ['allyPhase']): Content {
  const base = makeContent({
    secondRoom: false,
    monsters: [monsterType('rat', 'trat', { normal: { hp: 3, move: 3, attack: 2 } })],
    decks: [{ id: 'trat', cards: [{ id: 'rat.50', initiative: 50, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }] }],
    spawns: rats.map((hex) => ({ monster: 'rat', hex })),
    room: { objects: [{ hex: HEART, id: 'heart', kind: 'crystal-heart', hp: 4, blocks: true }] },
    goal: { type: 'killBoss', boss: 'guardian' },
    scenario: { specials, events: [HALF], secondary: [{ id: 'scratch', check: 'objectIntact', params: { object: 'heart' }, reward: { xp: 3 } }] },
  });
  base.scenarios.test!.rooms[0]!.spawns!.push({ monster: 'guardian', hex: [2, 0], by: { '2': 'normal' } });
  return { ...base, bosses: { guardian: GUARDIAN }, decks: { ...base.decks, tboss: { id: 'tboss', cards: [{ id: 'b.10', initiative: 10, steps: [{ type: 'attack', value: 0 }] }] } } };
}

/** Two fresh cards per round, both heroes. */
function select(s: GameState, c: Content): GameState {
  const n = 2 * s.round;
  return selectAll(s, c, { alpha: [`alpha.c${n - 1}`, `alpha.c${n}`], beta: [`beta.c${n - 1}`, `beta.c${n}`] });
}

/** Brings the boss to half health with the round's cards picked. */
function toHalf(c: Content): { s: GameState; ev: ReturnType<typeof eventsOf> } {
  const s = select(newGame(c), c);
  const ctx = { s, c, ev: [], out: [] };
  takeDamage(ctx, s.figures[GUARDIAN_ID]!, 8, 'test');
  return { s, ev: ctx.ev };
}

const heartHp = (s: GameState) => s.board.tiles[`${HEART[0]},${HEART[1]}`]?.breakable?.hp;

describe('allyPhase', () => {
  it('at half health the boss becomes an allied NPC in place; its deck leaves the turn order', () => {
    const c = fixture([]);
    const { s, ev } = toHalf(c);
    const g = s.figures[GUARDIAN_ID] as SummonState;
    expect(g).toMatchObject({ kind: 'summon', monsterType: 'guardian', npc: { fights: true }, move: 0, attack: 3, hp: 8, hex: [2, 0] });
    expect(eventsOf(ev as never[], 'allyJoined')).toHaveLength(1);
    expect(objectiveStatus(c, s)).toMatchObject({ goal: 'protect' });
    const next = select(finishRound(s, c), c);
    expect(next.turnOrder.some((e) => e.kind === 'monsterGroup' && e.typeId === 'guardian')).toBe(false);
    expect(next.turnOrder.some((e) => e.kind === 'summon' && e.figureId === GUARDIAN_ID)).toBe(true);
  });

  it('heroes never hit the heart, which a later switch protects', () => {
    const c = fixture([]);
    const s = select(newGame(c), c);
    expect(obstacleTargetError({ s, c, ev: [], out: [] }, s.figures['hero:alpha']!, HEART, 99)).toMatch(/keep/);
  });

  it('without the special the boss stays an enemy', () => {
    const c = fixture([], []);
    const { s } = toHalf(c);
    expect(s.figures[GUARDIAN_ID]?.kind).toBe('monster');
  });

  it('after the switch monsters go for the heart instead of the heroes, and the scratch fails', () => {
    const c = fixture([[3, 4]]);
    let { s } = toHalf(c);
    expect(objectIntact(s, 'heart')).toBe(true);
    s = finishRound(s, c);
    // The rat walked next to the heart and chipped 1 off it; the heroes were left alone.
    expect(heartHp(s)).toBe(3);
    expect(s.figures['hero:alpha']!.hp).toBe(s.figures['hero:alpha']!.maxHp);
    expect(objectIntact(s, 'heart')).toBe(false);
    // Three rounds later the heart breaks: protect is lost at once.
    for (let i = 0; i < 3; i++) s = finishRound(select(s, c), c);
    expect(heartHp(s)).toBeUndefined();
    expect(s.phase).toBe('lost');
  });

  it('the ally hits a monster next to it on its own turn, and its death does not lose', () => {
    const c = fixture([[3, 0]]);
    let { s } = toHalf(c);
    s = finishRound(s, c); // the ally is not in this round's order yet; the rat walks off to the heart
    const ratAt = s.figures['monster:rat:1']!.hex;
    // Put the rat back next to the ally for round 2, then check it gets hit.
    s.figures['monster:rat:1']!.hex = [3, 0];
    expect(ratAt).not.toEqual([3, 0]);
    s = finishRound(select(s, c), c);
    expect(s.figures['monster:rat:1']).toBeUndefined();

    const ctx = { s, c, ev: [], out: [] };
    takeDamage(ctx, s.figures[GUARDIAN_ID]!, 99, 'test');
    expect(s.figures[GUARDIAN_ID]).toBeUndefined();
    expect(s.phase).not.toBe('lost');
  });
});
