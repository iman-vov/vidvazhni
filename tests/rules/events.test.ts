import { describe, expect, it } from 'vitest';
import type { Content, ScenarioEventDef } from '../../src/rules/content';
import { eventWarnings, spawnHex } from '../../src/rules/events';
import { eventsSoon, forecastInitiative } from '../../src/rules/queries';
import { revealRoom } from '../../src/rules/setup';
import type { GameState, MonsterState } from '../../src/rules/state';
import {
  act,
  actEvents,
  eventsOf,
  finishRound,
  makeContent,
  newGame,
  playHalf,
  selectAll,
  stackModifiers,
} from '../helpers/engineFixtures';

function withEvents(c: Content, events: ScenarioEventDef[]): Content {
  c.scenarios.test!.events = events;
  return c;
}

function rats(s: GameState): MonsterState[] {
  return Object.values(s.figures).filter((f): f is MonsterState => f.kind === 'monster' && f.hp > 0);
}

const ALL = { '2': 'normal', '3': 'normal', '4': 'normal' } as const;
const PICKS = { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c3', 'beta.c4'] } as Record<string, [string, string]>;
const PICKS2 = { alpha: ['alpha.c5', 'alpha.c6'], beta: ['beta.c7', 'beta.c8'] } as Record<string, [string, string]>;

describe('scenario events', () => {
  it('a round wave spawns at the start of its round and is warned one round ahead', () => {
    const c = withEvents(makeContent({ spawns: [{ monster: 'rat', hex: [5, 4] }] }), [
      { id: 'wave', trigger: { type: 'round', round: 2, every: 2 }, actions: [{ type: 'spawn', monster: 'rat', by: ALL, count: 2, hexes: [[5, 0]] }] },
    ]);
    let s = newGame(c);
    expect(rats(s)).toHaveLength(1);
    expect(eventWarnings(s, c.scenarios.test)).toEqual([{ eventId: 'wave', kind: 'wave', round: 2, spawns: [{ monster: 'rat', count: 2 }] }]);
    s = finishRound(selectAll(s, c, PICKS), c);
    expect(s.round).toBe(2);
    // The listed hex first, then the free hex nearest to it.
    expect(rats(s).slice(1).map((m) => m.hex)).toEqual([[5, 0], [4, 0]]);
    expect(s.firedEvents).toEqual({ wave: 2 });
    // Repeats every 2 rounds: the next one is round 4.
    expect(eventWarnings(s, c.scenarios.test)[0]).toMatchObject({ kind: 'wave', round: 4 });
  });

  it('an ambush: a barrel next to the hero bursts, the rat jumps out and the move stops', () => {
    const c = withEvents(
      makeContent({ spawns: [{ monster: 'rat', hex: [5, 4] }], room: { obstacles: [{ hex: [2, 1], model: 'barrel' }] } }),
      [
        {
          id: 'barrel',
          trigger: { type: 'heroEnters', adjacent: [2, 1] },
          actions: [
            { type: 'spawn', monster: 'rat', by: ALL, hexes: [[2, 1]], burst: true },
            { type: 'story', text: 'event.test.barrel' },
          ],
        },
      ],
    );
    let s = selectAll(newGame(c), c, PICKS);
    expect(eventWarnings(s, c.scenarios.test)).toEqual([]); // a surprise
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:alpha' });
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'bottom' });
    const r = actEvents(s, c, { type: 'resolveStep', choice: { path: [[1, 2], [1, 3]] } });
    s = r.state;
    expect(s.figures['hero:alpha']?.hex).toEqual([1, 2]);
    expect(s.board.tiles['2,1']?.obstacle).toBeUndefined();
    expect(rats(s).map((m) => m.hex)).toContainEqual([2, 1]);
    expect(eventsOf(r.events, 'story')).toEqual([{ type: 'story', text: 'event.test.barrel', eventId: 'barrel' }]);
    expect(eventsOf(r.events, 'obstacleDestroyed')).toHaveLength(1);
    expect(s.undoPoint).toBeNull();
    expect(s.firedEvents).toEqual({ barrel: 1 });
  });

  it('a horn-blower calls help at the end of its 2nd turn, with a countdown in the warnings', () => {
    const c = withEvents(
      makeContent({ room: { spawns: [{ monster: 'rat', hex: [5, 0], by: ALL, tag: 'horn' }] } }),
      [
        {
          id: 'call',
          trigger: { type: 'monsterTurnsAlive', tag: 'horn', turns: 2 },
          actions: [{ type: 'spawn', monster: 'rat', by: ALL, count: 2, hexes: [[5, 4], [4, 4]] }],
        },
      ],
    );
    let s = newGame(c);
    const horn = rats(s)[0]!;
    expect(horn.tag).toBe('horn');
    expect(eventWarnings(s, c.scenarios.test)).toEqual([
      { eventId: 'call', kind: 'call', figureId: horn.id, turnsLeft: 2, round: 2, spawns: [{ monster: 'rat', count: 2 }] },
    ]);
    s = finishRound(selectAll(s, c, PICKS), c);
    expect(rats(s)).toHaveLength(1);
    expect(eventWarnings(s, c.scenarios.test)[0]).toMatchObject({ kind: 'call', turnsLeft: 1, round: 2 });
    s = finishRound(selectAll(s, c, PICKS2), c);
    expect(rats(s)).toHaveLength(3);
    expect(s.firedEvents).toEqual({ call: 2 });
    expect(eventWarnings(s, c.scenarios.test)).toEqual([]);
  });

  it('killing the horn-blower first prevents the call and pays the reward on its hex', () => {
    const c = withEvents(
      makeContent({ room: { spawns: [{ monster: 'rat', hex: [1, 2], by: ALL, tag: 'horn' }, { monster: 'rat', hex: [5, 4], by: ALL }] } }),
      [
        {
          id: 'call',
          trigger: { type: 'monsterTurnsAlive', tag: 'horn', turns: 2 },
          actions: [{ type: 'spawn', monster: 'rat', by: ALL, hexes: [[5, 0]] }],
          prevented: [{ type: 'coins', coins: 2 }],
        },
      ],
    );
    let s = selectAll(newGame(c), c, PICKS);
    const horn = rats(s).find((m) => m.tag === 'horn')!;
    s.figures[horn.id]!.hp = 1;
    stackModifiers(s, 'alpha', ['+0']);
    s = playHalf(s, c, 'alpha', 'alpha.c1', 'top', [{ targets: [horn.id] }]);
    expect(s.figures[horn.id]?.hp ?? 0).toBeLessThanOrEqual(0);
    expect(s.firedEvents).toEqual({ call: 0 });
    expect(s.board.tiles['1,2']?.coins).toBe(2);
    s = finishRound(s, c);
    s = finishRound(selectAll(s, c, PICKS2), c);
    expect(rats(s)).toHaveLength(1);
  });

  it('a bell runner runs for the bell instead of fighting; reaching it opens the door', () => {
    const c = withEvents(
      makeContent({
        room: { spawns: [{ monster: 'rat', hex: [4, 0], by: ALL, tag: 'runner' }] },
        secondRoom: { spawns: [{ monster: 'rat', hex: [8, 2], by: ALL }] },
      }),
      [
        {
          id: 'bell',
          trigger: { type: 'objectReached', tag: 'runner', hex: [5, 2] },
          actions: [{ type: 'openDoor', hex: [6, 2] }, { type: 'story', text: 'event.test.bell' }],
          prevented: [{ type: 'coins', coins: 3 }],
        },
      ],
    );
    let s = newGame(c);
    const runner = rats(s)[0]!;
    expect(eventWarnings(s, c.scenarios.test)).toEqual([{ eventId: 'bell', kind: 'alarm', figureId: runner.id, hex: [5, 2], steps: 2 }]);
    s = finishRound(selectAll(s, c, PICKS), c);
    const moved = s.figures[runner.id]!;
    // Two steps towards the bell, no attack: it now stands next to it.
    expect([[4, 2], [5, 1], [6, 1], [4, 3], [5, 3], [6, 2]].map(String)).toContain(String(moved.hex));
    expect(s.firedEvents).toEqual({ bell: 1 });
    expect(s.board.revealedRooms).toContain('r2');
    expect(s.board.tiles['6,2']?.door?.open).toBe(true);
    expect(rats(s)).toHaveLength(2);
    expect(s.log.some((e) => e.type === 'attacked')).toBe(false);
  });

  it('doorOpened fires when the room is revealed', () => {
    const c = withEvents(makeContent({ spawns: [{ monster: 'rat', hex: [5, 4] }] }), [
      { id: 'hall', trigger: { type: 'doorOpened', room: 'r2' }, actions: [{ type: 'spawn', monster: 'rat', by: { '3': 'elite' }, hexes: [[9, 0]] }, { type: 'story', text: 'event.test.hall' }] },
    ]);
    const s = newGame(c);
    const ctx = { s, c, ev: [], out: [] };
    revealRoom(ctx, c.scenarios.test!, 'r2');
    expect(s.firedEvents).toEqual({ hall: 1 });
    // No rank for two heroes: nobody comes.
    expect(rats(s)).toHaveLength(1);
    expect(eventsOf(ctx.ev, 'story')).toHaveLength(1);
  });

  it('spawnHex: the first free listed hex, else the nearest free one, lowest q, r on ties', () => {
    const c = makeContent({ spawns: [{ monster: 'rat', hex: [3, 2] }] });
    const s = newGame(c);
    expect(spawnHex(s, [[3, 2], [4, 4]])).toEqual([4, 4]);
    expect(spawnHex(s, [[3, 2]])).toEqual([2, 2]);
    expect(spawnHex(s, [[20, 20]])).not.toBeNull();
  });

  it('the round forecast and the intents warn about what comes this round or the next', () => {
    const c = withEvents(makeContent({ room: { spawns: [{ monster: 'rat', hex: [5, 0], by: ALL, tag: 'horn' }] } }), [
      { id: 'late', trigger: { type: 'round', round: 3 }, actions: [{ type: 'spawn', monster: 'rat', by: ALL, hexes: [[5, 4]] }] },
      { id: 'soon', trigger: { type: 'round', round: 2 }, actions: [{ type: 'spawn', monster: 'rat', by: ALL, hexes: [[5, 4]] }] },
      { id: 'call', trigger: { type: 'monsterTurnsAlive', tag: 'horn', turns: 3 }, actions: [{ type: 'spawn', monster: 'rat', by: ALL, hexes: [[4, 4]] }] },
    ]);
    const s = newGame(c);
    s.variants.roundForecast = true;
    expect(eventsSoon(s, c).map((w) => w.eventId)).toEqual(['soon']);
    expect(forecastInitiative(s, c, 'hero:alpha', 'alpha.c1')?.events.map((w) => w.eventId)).toEqual(['soon']);
    expect(eventWarnings(s, c.scenarios.test).map((w) => w.eventId)).toEqual(['soon', 'late', 'call']);
  });

  it('is deterministic: the same game replays the same events', () => {
    const c = withEvents(makeContent({ spawns: [{ monster: 'rat', hex: [5, 4] }] }), [
      { id: 'wave', trigger: { type: 'round', round: 2 }, actions: [{ type: 'spawn', monster: 'rat', by: ALL, hexes: [[5, 0]] }] },
    ]);
    const run = () => finishRound(selectAll(finishRound(selectAll(newGame(c), c, PICKS), c), c, PICKS2), c);
    expect(run()).toEqual(run());
  });
});
