// Switching the goal on the fly (s20: the Guardian at half health → protect its heart): the
// `setGoal` event action, the `bossHalfHp` trigger, and rounds counted from the switch.

import { describe, expect, it } from 'vitest';
import { eventsOf, finishRound, makeContent, newGame, selectAll } from '../../helpers/engineFixtures';
import type { BossType, Content, ScenarioEventDef, ScenarioGoal } from '../../../src/rules/content';
import { takeDamage } from '../../../src/rules/damage';
import { activeGoal, objectiveStatus, switchGoal } from '../../../src/rules/objectives';
import type { GameState, MonsterState } from '../../../src/rules/state';
import { checkScenario } from '../../data/crossref';

const PROTECT: ScenarioGoal = { type: 'protect', object: 'heart', rounds: 2 };

const GUARDIAN: BossType = { id: 'guardian', hpPerHero: 8, hpPerHeroPerLevel: 0, move: 0, attack: 0, deck: 'tboss', immune: [] };

/** The heart stands in the corner; the boss (16 hp for 2 heroes at level 1) far from the heroes. */
function fixture(events: ScenarioEventDef[], goal: ScenarioGoal = { type: 'killBoss', boss: 'guardian' }): Content {
  const base = makeContent({
    secondRoom: false,
    room: { objects: [{ hex: [6, 4], id: 'heart', kind: 'crystal-heart', hp: 4 }] },
    goal,
    scenario: { events },
  });
  base.scenarios.test!.rooms[0]!.spawns = [{ monster: 'guardian', hex: [5, 0], by: { '2': 'normal' } }];
  return { ...base, bosses: { guardian: GUARDIAN }, decks: { ...base.decks, tboss: { id: 'tboss', cards: [{ id: 'b.99', initiative: 99, steps: [] }] } } };
}

const HALF: ScenarioEventDef = { id: 'phase2', trigger: { type: 'bossHalfHp', boss: 'guardian' }, actions: [{ type: 'setGoal', goal: PROTECT }] };

function select(s: GameState, c: Content): GameState {
  return selectAll(s, c, pair(s));
}

const boss = (s: GameState) => s.figures['monster:guardian:1'] as MonsterState;

/** Two fresh cards per round (the fixture's hand holds ten). */
function pair(s: GameState): Record<string, [string, string]> {
  const n = 2 * s.round;
  return { alpha: [`alpha.c${n - 1}`, `alpha.c${n}`], beta: [`beta.c${n - 1}`, `beta.c${n}`] };
}

describe('goal switch', () => {
  it('the boss at half health switches the goal mid-round; its rounds count from the next round', () => {
    const c = fixture([HALF]);
    let s = select(newGame(c), c);
    const ctx = { s, c, ev: [], out: [] };
    takeDamage(ctx, boss(s), 7, 'test');
    expect(s.goal).toBeUndefined();
    takeDamage(ctx, boss(s), 1, 'test');
    expect(eventsOf(ctx.ev, 'goalChanged')).toEqual([{ type: 'goalChanged', goal: 'protect', since: 1 }]);
    expect(activeGoal(s, c.scenarios.test!)).toEqual(PROTECT);
    // Round 1 is not one of its rounds yet.
    expect(objectiveStatus(c, s)).toMatchObject({ goal: 'protect', done: 0, of: 2 });
    s = finishRound(s, c);
    expect(s.phase).toBe('selectCards');
    s = finishRound(select(s, c), c);
    expect(s.phase).toBe('selectCards');
    s = finishRound(select(s, c), c);
    expect(s.phase).toBe('won');
    expect(s.round).toBe(3);
  });

  it('after the switch the old goal no longer wins: the boss dying mid-round does nothing', () => {
    const c = fixture([HALF]);
    let s = select(newGame(c), c);
    const ctx = { s, c, ev: [], out: [] };
    takeDamage(ctx, boss(s), 8, 'test');
    takeDamage(ctx, boss(s), 8, 'test');
    expect(boss(s)).toBeUndefined();
    s = finishRound(s, c);
    expect(s.phase).toBe('selectCards');
  });

  it('the event fires once, even when the boss is healed and drops to half again', () => {
    const c = fixture([HALF]);
    const s = select(newGame(c), c);
    const ctx = { s, c, ev: [], out: [] };
    takeDamage(ctx, boss(s), 8, 'test');
    boss(s).hp = boss(s).maxHp;
    takeDamage(ctx, boss(s), 8, 'test');
    expect(eventsOf(ctx.ev, 'goalChanged')).toHaveLength(1);
  });

  it('a switch at the start of a round (a round event) counts that round', () => {
    const c = fixture([{ id: 'wave', trigger: { type: 'round', round: 2 }, actions: [{ type: 'setGoal', goal: { type: 'survive', rounds: 2 } }] }]);
    let s = finishRound(select(newGame(c), c), c);
    expect(s).toMatchObject({ round: 2, goalSince: 1, goal: { type: 'survive' } });
    s = finishRound(select(s, c), c);
    expect(s.phase).toBe('selectCards');
    s = finishRound(select(s, c), c);
    expect(s.phase).toBe('won');
    expect(s.round).toBe(3);
  });

  it('a switch resets the counter of a counted defence', () => {
    const c = fixture([]);
    const s = newGame(c);
    s.goalCounter = 1;
    switchGoal({ s, c, ev: [], out: [] }, { type: 'defend', zone: 'pond', rounds: 3, counter: 8 });
    expect(s.goalCounter).toBeUndefined();
  });

  it('the data checks look into the switched goals too', () => {
    const c = fixture([{ ...HALF, actions: [{ type: 'setGoal', goal: { type: 'protect', object: 'lamp', rounds: 3 } }] }]);
    expect(checkScenario(c.scenarios.test!, c)).toContain('test: goal protects lamp, the map has no such object with hp');
    const bad = fixture([{ ...HALF, trigger: { type: 'bossHalfHp', boss: 'queen' } }]);
    expect(checkScenario(bad.scenarios.test!, bad)).toContain('test: event phase2 waits for missing boss queen');
  });
});
