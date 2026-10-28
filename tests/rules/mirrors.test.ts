// Glass Town mirrors (mirrors.ts): s16's floor mirrors (`mirrorHexes`) and s19's turning mirrors
// with the beam (`beamMirrors`), on small fixtures of their own.

import { describe, expect, it } from 'vitest';
import type { Content, HeroCard, ObjectDef, ScenarioDef } from '../../src/rules/content';
import type { Hex } from '../../src/rules/hex';
import { beamPath, nextTurn, turnsBetween } from '../../src/rules/mirrors';
import { objectiveStatus } from '../../src/rules/objectives';
import type { GameState, MonsterState } from '../../src/rules/state';
import { mapIssues } from '../../tools/map-editor/checks';
import { checkScenario } from '../data/crossref';
import {
  act,
  card,
  eventsOf,
  fillerCards,
  finishRound,
  heroOf,
  makeContent,
  monsterType,
  newGame,
  rejects,
  selectAll,
  stackModifiers,
} from '../helpers/engineFixtures';

// ─── s16: floor mirrors ────────────────────────────────────────────────────

const CARDS: HeroCard[] = [
  card('m.ranged', 10, [{ type: 'attack', value: 2, range: 3 }], [{ type: 'move', value: 2 }]),
  card('m.light', 20, [{ type: 'attack', value: 2, range: 2, consume: { element: 'light', add: { value: 1 } } }], [{ type: 'move', value: 2 }]),
  card('m.tri', 30, [{ type: 'attack', value: 2, range: 3, area: { shape: 'triangle', size: 3 } }], [{ type: 'move', value: 2 }]),
  card('m.melee', 40, [{ type: 'attack', value: 2 }], [{ type: 'move', value: 2 }]),
];

const IDLE_DECK = { id: 'tmelee', cards: [{ id: 'idle.99', initiative: 99, steps: [] }] };

function mirror(id: string, hex: Hex): ObjectDef {
  return { hex, id, kind: 'mirror', hp: 1 };
}

function floorGame(mirrors: Hex[], rats: Hex[], specials = ['mirrorHexes']): { content: Content; s: GameState } {
  const content = makeContent({
    heroes: { alpha: CARDS, beta: fillerCards('beta') },
    monsters: [monsterType('rat', 'tmelee', { normal: { hp: 8, move: 2, attack: 2 } })],
    decks: [IDLE_DECK],
    spawns: rats.map((hex) => ({ monster: 'rat', hex })),
    room: { objects: mirrors.map((h, i) => mirror(`m${i + 1}`, h)) },
    scenario: { specials, secondary: [{ id: 'mirrors', check: 'noMirrorBroken', reward: { xp: 2 } }] },
  });
  return { content, s: newGame(content, ['alpha']) };
}

/** Alpha plays the top half of `cardId` (a filler as the other card). */
function attackWith(content: Content, s0: GameState, cardId: string, modifiers: string[], other = cardId === 'm.melee' ? 'm.ranged' : 'm.melee'): GameState {
  stackModifiers(s0, 'alpha', modifiers);
  const s = selectAll(s0, content, { alpha: [cardId, other] });
  return act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId, half: 'top' });
}

const rat = (s: GameState, n = 1) => s.figures[`monster:rat:${n}`] as MonsterState | undefined;
const mirrorState = (s: GameState, hex: Hex) => s.board.tiles[`${hex[0]},${hex[1]}`]?.object?.state;

describe('mirrorHexes (s16)', () => {
  it('a floor mirror with hp is stood on, not an obstacle', () => {
    const { s } = floorGame([[3, 2]], []);
    expect(s.board.tiles['3,2']).toMatchObject({ object: { id: 'm1', kind: 'mirror' } });
    expect(s.board.tiles['3,2']!.obstacle).toBeUndefined();
    expect(s.board.tiles['3,2']!.breakable).toBeUndefined();
  });

  it('a ranged attack on a figure standing on a mirror has disadvantage; off the rule, it has not', () => {
    let { content, s } = floorGame([[3, 2]], [[3, 2]]);
    s = attackWith(content, s, 'm.ranged', ['+2', '-1']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ modifiers: ['+2', '-1'], chosen: '-1', damage: 1 });
    ({ content, s } = floorGame([[3, 2]], [[3, 2]], []));
    s = attackWith(content, s, 'm.ranged', ['+2', '-1']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ modifiers: ['+2'], damage: 4 });
  });

  it('a melee attack on a figure on a mirror is a plain attack', () => {
    let { content, s } = floorGame([[1, 2]], [[1, 2]]);
    s = attackWith(content, s, 'm.melee', ['+2', '-1']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ modifiers: ['+2'], damage: 4 });
    expect(mirrorState(s, [1, 2])).toBeUndefined();
  });

  it('an attack with Light from a mirror reaches 1 hex further', () => {
    // Alpha starts on [0, 2]; the rat is 3 hexes away, the card reaches 2.
    let { content, s } = floorGame([[0, 2]], [[3, 2]]);
    s.elements.light = 'strong';
    s = attackWith(content, s, 'm.light', ['+0']);
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], consume: true } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 3, damage: 3 });
    expect(s.elements.light).toBe('inert');
    // Not on a mirror: Light alone gives no reach.
    ({ content, s } = floorGame([[1, 1]], [[3, 2]]));
    s.elements.light = 'strong';
    s = attackWith(content, s, 'm.light', ['+0']);
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], consume: true } });
  });

  it('an area attack breaks the mirrors it covers; a broken mirror does nothing more', () => {
    let { content, s } = floorGame([[3, 2], [4, 2], [5, 0]], [[3, 2]]);
    expect(objectiveStatus(content, s)!.secondary[0]).toMatchObject({ check: 'noMirrorBroken', met: true });
    // A ranged area: the rat still stood on its mirror when hit (disadvantage), then it broke.
    s = attackWith(content, s, 'm.tri', ['+0', '+0']);
    s = act(s, content, { type: 'resolveStep', choice: { hex: [3, 2], direction: 0 } });
    expect([mirrorState(s, [3, 2]), mirrorState(s, [4, 2]), mirrorState(s, [5, 0])]).toEqual(['broken', 'broken', undefined]);
    expect(eventsOf(s.log, 'objectChanged').map((e) => [e.objectId, e.state])).toEqual([
      ['m1', 'broken'],
      ['m2', 'broken'],
    ]);
    expect(rat(s)?.hp).toBe(6);
    expect(objectiveStatus(content, s)!.secondary[0]).toMatchObject({ met: false });
    // Next round: the rat on the broken mirror takes a ranged attack without disadvantage.
    s = finishRound(s, content);
    s = attackWith(content, s, 'm.ranged', ['+2', '-1'], 'm.light');
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked').at(-1)).toMatchObject({ modifiers: ['+2'], chosen: '+2' });
  });

  it('without the rule an area leaves mirrors whole', () => {
    let { content, s } = floorGame([[3, 2]], [[3, 2]], []);
    s = attackWith(content, s, 'm.tri', ['+0']);
    s = act(s, content, { type: 'resolveStep', choice: { hex: [3, 2], direction: 0 } });
    expect(mirrorState(s, [3, 2])).toBeUndefined();
  });
});

// ─── s19: turning mirrors and the beam ─────────────────────────────────────

// The window at [0, 0] shines on m1; m1 `b` → m2, m2 `b` → m3, m3 `c` → the crystal door [6, 2].
const TURNING: ObjectDef[] = [
  { hex: [2, 0], id: 'm1', kind: 'mirror', state: 'a', blocks: true, turns: [{ state: 'a' }, { state: 'b', aim: 'm2' }, { state: 'c', aim: 'm3' }] },
  { hex: [2, 4], id: 'm2', kind: 'mirror', state: 'a', blocks: true, turns: [{ state: 'a' }, { state: 'b', aim: 'm3' }, { state: 'c' }] },
  { hex: [5, 4], id: 'm3', kind: 'mirror', state: 'a', blocks: true, turns: [{ state: 'a' }, { state: 'b', aim: 'm1' }, { state: 'c', aim: 'target' }] },
];

function beamContent(patch: Partial<ScenarioDef> = {}): Content {
  return makeContent({
    room: { objects: TURNING },
    secondRoom: {},
    scenario: {
      specials: ['beamMirrors'],
      beam: { from: [0, 0], aim: 'm1', to: [6, 2], opens: [[6, 2]] },
      zones: [{ id: 'exit', hexes: [[8, 2]] }],
      ...patch,
    },
    goal: {
      type: 'objectStates',
      objects: [
        { id: 'm1', state: 'b' },
        { id: 'm2', state: 'b' },
        { id: 'm3', state: 'c' },
      ],
      zone: 'exit',
    },
  });
}

function setState(s: GameState, id: string, state: string): void {
  Object.values(s.board.tiles).find((t) => t.object?.id === id)!.object!.state = state;
}

/** Alpha on `hex`, cards chosen; then it turns `id` with its top half. */
function turn(c: Content, s0: GameState, hex: Hex, id: string, half: 'top' | 'bottom' = 'top'): GameState {
  s0.figures['hero:alpha']!.hex = hex;
  const s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c1', 'beta.c2'] });
  return act(s, c, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half, objectId: id });
}

describe('beamMirrors (s19)', () => {
  it('the beam goes from the window to the first mirror and stops where a mirror sends it nowhere', () => {
    const c = beamContent();
    const s = newGame(c);
    expect(beamPath(s, c.scenarios['test'])).toEqual({ hexes: [[0, 0], [2, 0]], lit: ['m1'], reached: false });
    setState(s, 'm1', 'c');
    setState(s, 'm3', 'b');
    // m3 sends it back to m1, which is lit already: it stops there.
    expect(beamPath(s, c.scenarios['test'])).toMatchObject({ lit: ['m1', 'm3'], reached: false });
  });

  it('a hero next to a mirror turns it to its next state with a top action, and round again', () => {
    const c = beamContent();
    let s = turn(c, newGame(c), [1, 0], 'm1');
    expect(eventsOf(s.log, 'objectChanged').at(-1)).toMatchObject({ objectId: 'm1', state: 'b', byId: 'hero:alpha' });
    expect(beamPath(s, c.scenarios['test'])!.lit).toEqual(['m1', 'm2']);
    const s1 = newGame(c);
    setState(s1, 'm1', 'c');
    s = turn(c, s1, [1, 0], 'm1');
    expect(eventsOf(s.log, 'objectChanged').at(-1)).toMatchObject({ objectId: 'm1', state: 'a' });
  });

  it('a bottom action or a hero not next to it does not turn it', () => {
    const c = beamContent();
    const s0 = newGame(c);
    s0.figures['hero:alpha']!.hex = [0, 4];
    const s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c1', 'beta.c2'] });
    expect(rejects(s, c, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'top', objectId: 'm1' })).toMatch(/adjacent/);
    s.figures['hero:alpha']!.hex = [1, 0];
    expect(rejects(s, c, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'bottom', objectId: 'm1' })).toMatch(/top/);
  });

  it('all three mirrors right: the beam reaches the crystal door and it opens', () => {
    const c = beamContent();
    const s0 = newGame(c);
    setState(s0, 'm1', 'b');
    setState(s0, 'm2', 'b');
    setState(s0, 'm3', 'b');
    expect(s0.board.revealedRooms).toEqual(['r1']);
    const s = turn(c, s0, [4, 4], 'm3');
    expect(beamPath(s, c.scenarios['test'])).toEqual({ hexes: [[0, 0], [2, 0], [2, 4], [5, 4], [6, 2]], lit: ['m1', 'm2', 'm3'], reached: true });
    expect(s.board.tiles['6,2']!.door!.open).toBe(true);
    expect(s.board.revealedRooms).toContain('r2');
    expect(objectiveStatus(c, s)).toMatchObject({ goal: 'objectStates', done: 3, of: 3 });
  });

  it('the beam needs sight on every leg: a wall stops it', () => {
    const c = beamContent();
    c.scenarios['test']!.rooms[0]!.walls = [[[2, 1], [2, 2]], [[2, 1], [3, 1]], [[1, 2], [2, 2]], [[2, 2], [3, 1]], [[1, 3], [2, 2]], [[2, 2], [2, 3]], [[1, 2], [1, 3]], [[2, 1], [1, 2]], [[3, 1], [3, 2]], [[2, 2], [3, 2]]];
    const s = newGame(c);
    setState(s, 'm1', 'b');
    const beam = beamPath(s, c.scenarios['test'])!;
    expect(beam.lit).toEqual(['m1']);
  });

  it('turn counting for the bot', () => {
    const turns = TURNING[2]!.turns!;
    expect([nextTurn(turns, 'a'), nextTurn(turns, 'c'), nextTurn(turns, undefined)]).toEqual(['b', 'a', 'a']);
    expect([turnsBetween(turns, 'a', 'c'), turnsBetween(turns, 'c', 'b'), turnsBetween(turns, 'b', 'b'), turnsBetween(turns, 'a', 'x')]).toEqual([2, 2, 0, -1]);
  });

  it('crossref: the fixture passes; a mirror aiming at nothing or a goal state it never turns to does not', () => {
    const c = beamContent();
    // The bare fixture has room-shape complaints of its own; none about mirrors or the beam.
    const own = (errors: string[]) => errors.filter((e) => /beam|mirror|turns/.test(e));
    expect(own(checkScenario(c.scenarios['test']!, c))).toEqual([]);
    const bad = beamContent({ beam: { from: [0, 0], aim: 'nope', to: [6, 2] } });
    expect(checkScenario(bad.scenarios['test']!, bad)).toContain('test: beam aims at missing object nope');
    const goal = { ...c.scenarios['test']!, goal: { type: 'objectStates' as const, objects: [{ id: 'm1', state: 'z' }] } };
    expect(checkScenario(goal, c)).toContain('test: goal object m1 never turns to state z');
  });

  it('map checks: a door the beam opens may need a key nobody has; any other such door may not', () => {
    const c = beamContent();
    const sc = c.scenarios['test']!;
    const locked = (hex: Hex): ScenarioDef => ({ ...sc, rooms: sc.rooms.map((r, i) => (i === 0 ? { ...r, doors: [{ hex, to: sc.rooms[1]!.id, key: 'nobody' }] } : r)) });
    const keyErrors = (s: ScenarioDef) => mapIssues(s, c).filter((i) => i.msg.includes('needs key'));
    expect(keyErrors(locked([6, 2]))).toEqual([]);
    expect(keyErrors(locked([6, 3]))).toHaveLength(1);
  });
});
