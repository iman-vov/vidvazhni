import { describe, expect, it } from 'vitest';
import { act, actEvents, eventsOf, makeContent, newGame, rejects, selectAll } from '../../helpers/engineFixtures';
import { secondaryMet } from '../../../src/rules/objectives';
import type { GameState } from '../../../src/rules/state';
import { checkScenario } from '../../data/crossref';

// A floor lever in r1 opens the locked door to r2 (nobody carries its key).
const content = makeContent({
  room: {
    doors: [{ hex: [6, 2], to: 'r2', key: 'gate-key' }],
    objects: [{ hex: [3, 0], id: 'lever', kind: 'lever', state: 'up', blocks: true, interact: { half: 'top', to: 'down', opens: [[6, 2]] } }],
  },
});

function alphaNextToLever(): GameState {
  const s = newGame(content);
  s.figures['hero:alpha']!.hex = [3, 1];
  return selectAll(s, content, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c3', 'beta.c4'] });
}

describe('levers', () => {
  it('an adjacent hero spends the named half: the lever turns and opens the locked door', () => {
    const s = alphaNextToLever();
    expect(s.board.revealedRooms).toEqual(['r1']);
    const { state, events } = actEvents(s, content, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'top', objectId: 'lever' });
    expect(eventsOf(events, 'objectChanged')).toMatchObject([{ objectId: 'lever', state: 'down' }]);
    expect(state.board.revealedRooms).toContain('r2');
    expect(state.board.tiles['6,2']?.door?.open).toBe(true);
    expect(secondaryMet(state, { id: 'sluice', check: 'objectState', params: { object: 'lever', state: 'down' }, reward: {} })).toBe(true);
  });

  it('the wrong half, a lever already pulled, or a hero too far is refused', () => {
    const s = alphaNextToLever();
    expect(rejects(s, content, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'bottom', objectId: 'lever' })).toBe('this needs a top action');
    const done = act(s, content, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'top', objectId: 'lever' });
    expect(rejects(done, content, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c2', half: 'bottom', objectId: 'lever' })).toBe('this needs a top action');
    const far = alphaNextToLever();
    far.figures['hero:alpha']!.hex = [0, 4];
    expect(rejects(far, content, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'top', objectId: 'lever' })).toBe('the object must be adjacent');
  });

  it('the data checks want a door on every hex a lever opens', () => {
    const bad = structuredClone(content.scenarios['test']!);
    bad.rooms[0]!.objects![0]!.interact!.opens = [[2, 2]];
    expect(checkScenario(bad, content)).toContain('test: object lever opens 2,2, which is no door');
  });
});
