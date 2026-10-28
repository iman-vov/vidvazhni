// `objectStates` (s19's mirrors): a fixture with two levers and an exit zone.

import { describe, expect, it } from 'vitest';
import { act, finishRound, makeContent, newGame, selectAll } from '../../helpers/engineFixtures';
import type { Content, ScenarioGoal } from '../../../src/rules/content';
import { openDoor } from '../../../src/rules/effects/move';
import { objectiveStatus } from '../../../src/rules/objectives';
import type { GameState } from '../../../src/rules/state';
import { checkScenario } from '../../data/crossref';

const GOAL: ScenarioGoal = {
  type: 'objectStates',
  objects: [
    { id: 'west', state: 'lit' },
    { id: 'east', state: 'lit' },
  ],
};

function mirrors(goal: ScenarioGoal = GOAL): Content {
  return makeContent({
    secondRoom: { objects: [{ hex: [8, 2], id: 'east', kind: 'mirror', state: 'dark', blocks: true, interact: { half: 'top', to: 'lit' } }] },
    room: {
      objects: [{ hex: [1, 1], id: 'west', kind: 'mirror', state: 'dark', blocks: true, interact: { half: 'top', to: 'lit' } }],
    },
    scenario: { zones: [{ id: 'exit', hexes: [[5, 4], [6, 4]] }] },
    goal,
  });
}

function select(s: GameState, c: Content): GameState {
  return selectAll(s, c, pair(s));
}

/** Alpha (next to the west mirror) turns it with its top action. */
function turnWest(c: Content): GameState {
  const s = newGame(c);
  s.figures['hero:alpha']!.hex = [1, 2];
  return act(select(s, c), c, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'top', objectId: 'west' });
}

function setState(s: GameState, id: string, state: string): void {
  const tile = Object.values(s.board.tiles).find((t) => t.object?.id === id);
  tile!.object!.state = state;
}

/** Two fresh cards per round (the fixture's hand holds ten). */
function pair(s: GameState): Record<string, [string, string]> {
  const n = 2 * s.round;
  return { alpha: [`alpha.c${n - 1}`, `alpha.c${n}`], beta: [`beta.c${n - 1}`, `beta.c${n}`] };
}

describe('objectStates', () => {
  it('counts the objects in their states, the ones in rooms not yet revealed by their data', () => {
    const c = mirrors();
    const s = turnWest(c);
    expect(s.board.revealedRooms).toEqual(['r1']);
    expect(objectiveStatus(c, s)).toMatchObject({ goal: 'objectStates', done: 1, of: 2 });
    expect(finishRound(s, c).phase).toBe('selectCards');
  });

  it('every object in its state at the end of a round wins', () => {
    const c = mirrors();
    const s = turnWest(c);
    openDoor({ s, c, ev: [], out: [] }, [6, 2]);
    expect(objectiveStatus(c, s)).toMatchObject({ done: 1, of: 2 });
    setState(s, 'east', 'lit');
    expect(finishRound(s, c).phase).toBe('won');
  });

  it('turned back before the round ends, it does not count', () => {
    const c = mirrors({ ...GOAL, objects: [{ id: 'west', state: 'lit' }] });
    const s = turnWest(c);
    setState(s, 'west', 'dark');
    expect(finishRound(s, c).phase).toBe('selectCards');
  });

  it('with a zone, every hero on its feet must stand in it too', () => {
    const c = mirrors({ ...GOAL, objects: [{ id: 'west', state: 'lit' }], zone: 'exit' });
    let s = turnWest(c);
    s = finishRound(s, c);
    expect(s.phase).toBe('selectCards');
    s.figures['hero:alpha']!.hex = [5, 4];
    s.figures['hero:beta']!.hex = [6, 4];
    expect(finishRound(select(s, c), c).phase).toBe('won');
  });

  it('the data checks want the objects, and a state their lever can reach', () => {
    const c = mirrors();
    const errors = checkScenario({ ...c.scenarios['test']!, goal: { type: 'objectStates', objects: [{ id: 'north', state: 'lit' }, { id: 'west', state: 'cracked' }] } }, c);
    expect(errors).toContain('test: goal object north missing');
    expect(errors).toContain('test: goal object west never gets to state cracked');
  });
});
