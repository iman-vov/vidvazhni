// `race {zone, rival}` (s11): a fixture with the rival NPC on its own path to a two-hex zone.

import { describe, expect, it } from 'vitest';
import { eventsOf, finishRound, makeContent, newGame, selectAll } from '../../helpers/engineFixtures';
import type { Content, NpcDef } from '../../../src/rules/content';
import type { Hex } from '../../../src/rules/hex';
import { killFigure } from '../../../src/rules/damage';
import { objectiveStatus } from '../../../src/rules/objectives';
import type { GameState, SummonState } from '../../../src/rules/state';
import { checkScenario } from '../../data/crossref';

const ZONE: Hex[] = [
  [6, 0],
  [6, 1],
];

function race(opts: { rival?: Partial<NpcDef>; start?: Hex[]; all?: boolean } = {}): Content {
  return makeContent({
    secondRoom: false,
    startHexes: opts.start,
    scenario: { zones: [{ id: 'ferry', hexes: ZONE }], npcs: [{ id: 'frog', hex: [3, 0], hp: 6, move: 2, ...opts.rival }] },
    goal: { type: 'race', rival: 'frog', zone: 'ferry', ...(opts.all ? { all: true } : {}) },
  });
}

function select(s: GameState, c: Content): GameState {
  return selectAll(s, c, pair(s));
}

function round(s: GameState, c: Content): GameState {
  return finishRound(select(s, c), c);
}

const frog = (s: GameState) => s.figures['npc:frog'] as SummonState | undefined;

/** Two fresh cards per round (the fixture's hand holds ten). */
function pair(s: GameState): Record<string, [string, string]> {
  const n = 2 * s.round;
  return { alpha: [`alpha.c${n - 1}`, `alpha.c${n}`], beta: [`beta.c${n - 1}`, `beta.c${n}`] };
}

describe('race', () => {
  it('the rival runs for the zone on its own turns, with no hero near', () => {
    const c = race({ rival: { hex: [4, 0] } });
    const s = round(newGame(c), c);
    // Heroes at [0, 2] / [0, 3]: 4 hexes away, an escorted NPC would wait.
    expect(frog(s)!.hex).toEqual([6, 0]);
    expect(s.phase).toBe('lost');
    expect(eventsOf(s.log, 'raceFinished')).toEqual([{ type: 'raceFinished', winner: 'npc:frog' }]);
  });

  it('the rival there first loses at the end of its turn, mid-round', () => {
    const c = race();
    let s = round(newGame(c), c);
    expect(s.phase).toBe('selectCards');
    expect(frog(s)!.hex).not.toEqual([3, 0]);
    s = round(s, c);
    expect(s.phase).toBe('lost');
    expect(s.round).toBe(2);
  });

  it('a hero there first wins at the end of a turn', () => {
    const c = race({ start: [[6, 1], [0, 3]] });
    const s = round(newGame(c), c);
    expect(s.phase).toBe('won');
    expect(eventsOf(s.log, 'raceFinished')).toEqual([{ type: 'raceFinished', winner: 'heroes' }]);
    // The rival never got its turn.
    expect(frog(s)!.hex).toEqual([3, 0]);
  });

  it('a tie (a hero and the rival both there at a turn end) goes to the heroes', () => {
    const c = race({ start: [[6, 1], [0, 3]], rival: { hex: [6, 0] } });
    expect(round(newGame(c), c).phase).toBe('won');
  });

  it('with `all`, one hero there is not enough and the rival can still win', () => {
    const c = race({ start: [[6, 1], [0, 3]], all: true });
    let s = round(newGame(c), c);
    expect(s.phase).toBe('selectCards');
    s = round(s, c);
    expect(s.phase).toBe('lost');
  });

  it("the rival's death does not lose (an escorted NPC's would)", () => {
    const c = race();
    const s = newGame(c);
    killFigure({ s, c, ev: [], out: [] }, frog(s)!);
    expect(s.phase).not.toBe('lost');
    expect(round(s, c).phase).toBe('selectCards');
  });

  it("the goal line shows the nearest hero's distance and the rival's", () => {
    const c = race();
    const s = newGame(c);
    expect(objectiveStatus(c, s)).toMatchObject({ goal: 'race', done: 6, extra: { key: 'objective.rival', n: 3 } });
    killFigure({ s, c, ev: [], out: [] }, frog(s)!);
    expect(objectiveStatus(c, s)?.extra).toBeUndefined();
  });

  it('the data checks want the rival among the NPCs', () => {
    const c = race();
    const errors = checkScenario({ ...c.scenarios['test']!, goal: { type: 'race', rival: 'toad', zone: 'ferry' } }, c);
    expect(errors).toContain('test: goal rival toad missing');
  });
});
